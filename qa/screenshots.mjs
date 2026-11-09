// Deterministic QA screenshots: fixed camera, frozen presentation time, fixed seed, fixed DPR/quality.
// Usage: node qa/screenshots.mjs [webgl2|webgpu] [outDir] [viewFilter]
import { chromium } from "playwright";
import fs from "node:fs";
const mode = process.argv[2] ?? "webgl2";
const outDir = process.argv[3] ?? `qa/out/${mode}`;
const filter = process.argv[4] ?? "";
fs.mkdirSync(outDir, { recursive: true });
const args = ["--ignore-gpu-blocklist", "--window-size=1920,1080", "--force-device-scale-factor=1"];
if (mode === "webgpu") args.push("--enable-unsafe-webgpu", "--enable-features=Vulkan");
const browser = await chromium.launch({ channel: "chrome", headless: false, args });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5173/${mode === "webgl2" ? "?renderer=webgl2" : "?"}`);
await page.waitForFunction(() => window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90000 });
await page.waitForTimeout(800);
const backend = await page.evaluate(() => window.__pecvdTwin.backend());
console.log("backend:", backend);

const VIEWS = [
  { id: "01_assembled_plasma_off", mode: "assembled", time: 0.8, cam: [240, 66, 1.75, [0, 0.12, 0]], ui: true },
  { id: "02_side_cutaway_plasma_on", mode: "cutaway", time: 8.0, cam: [265, 78, 1.05, [0, 0.14, 0]] },
  { id: "03_oblique_wafer_showerhead_closeup", mode: "cutaway", time: 8.0, cam: [250, 80, 0.42, [0.02, 0.16, 0]] },
  { id: "04_showerhead_detail", mode: "exploded", time: 8.0, cam: [262, 140, 0.12, [0.0, 0.3708, 0]] },
  { id: "05_exploded_plasma_hidden", mode: "exploded", time: 8.0, cam: [235, 64, 2.6, [0, 0.25, 0]] },
  { id: "06_cutaway_overview", mode: "cutaway", time: 8.0, cam: [255, 70, 1.5, [0, 0.12, 0]], ui: true },
  { id: "07_xray_plasma_on", mode: "xray", time: 8.0, cam: [250, 72, 1.2, [0, 0.14, 0]] },
  { id: "08_assembled_viewport_window", mode: "assembled", time: 8.0, cam: [45, 86, 0.45, [0.26, 0.161, 0.26]] },
  { id: "09_exhaust_baffle_underside", mode: "cutaway", time: 8.0, cam: [300, 100, 0.7, [0, 0.06, 0]], plasmaOff: true },
  { id: "10_lid_feedthrough_closeup", mode: "cutaway", time: 8.0, cam: [250, 60, 0.5, [0, 0.27, 0]], plasmaOff: true },
];
for (const v of VIEWS) {
  if (filter && !v.id.includes(filter)) continue;
  await page.evaluate(({ v }) => {
    const api = window.__pecvdTwin;
    const st = api.store.getState();
    st.setQualityPreset("high");
    st.setVisual({ visualSeed: 7, plasmaVisible: !v.plasmaOff });
    st.setViewMode(v.mode);
    if (v.mode === "cutaway") st.setCutaway({ azimuthDeg: 265, sweepDeg: 95 });
    st.select(null);
    api.freezeTime(v.time);
    api.setCamera(v.cam[0], v.cam[1], v.cam[2], v.cam[3]);
  }, { v });
  await page.waitForTimeout(700);
  await page.evaluate(({ v }) => window.__pecvdTwin.setCamera(v.cam[0], v.cam[1], v.cam[2], v.cam[3]), { v });
  await page.waitForTimeout(400);
  const stats = await page.evaluate(() => window.__pecvdTwin.stats());
  if (v.ui) await page.screenshot({ path: `${outDir}/${v.id}.png` });
  else await page.locator("#pecvd-canvas").screenshot({ path: `${outDir}/${v.id}.png` });
  console.log(v.id, `fps=${stats.fps.toFixed(0)} frameMs=${stats.frameMsEma.toFixed(1)} ${stats.renderWidth}x${stats.renderHeight} active=${stats.activeMeshes} plasma=${stats.plasmaEnabled}`);
}
console.log("console errors/warnings:", errors.length);
for (const e of errors.slice(0, 15)) console.log("  ", e);
const logs = await page.evaluate(() => window.__pecvdTwin.logs());
console.log(logs.filter((l) => l.includes("cutaway")).slice(-3).join("\n"));
await browser.close();
