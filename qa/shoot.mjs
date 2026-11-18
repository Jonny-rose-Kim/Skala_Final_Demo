// Flexible QA capture: node qa/shoot.mjs <webgl2|webgpu> <outDir> <json-views-file>
// Each view: { id, instance?, overview?, mode, time, cam:[alpha,beta,radius,[x,y,z]], local?:true, camInstance?, cutaway?:{azimuthDeg,sweepDeg}, scenario?, select?, overlays?:{}, ui?:true, plasmaOff?:true, covers?:"auto"|"closed"|"removed", env?:{visible,ceiling,walls}, carrierSection?:true }
// camInstance: camera given in that instance's frame without making it the active instance (e.g. the FOUP while a tool is active).
import { chromium } from "playwright";
import fs from "node:fs";
const mode = process.argv[2] ?? "webgl2";
const outDir = process.argv[3] ?? `qa/out/${mode}`;
const viewsFile = process.argv[4];
const fixture = process.argv[5] ?? "";
fs.mkdirSync(outDir, { recursive: true });
const VIEWS = JSON.parse(fs.readFileSync(viewsFile, "utf8"));
const args = ["--ignore-gpu-blocklist", "--window-size=1920,1080", "--force-device-scale-factor=1"];
if (mode === "webgpu") args.push("--enable-unsafe-webgpu", "--enable-features=Vulkan");
const browser = await chromium.launch({ channel: "chrome", headless: false, args });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5173/${mode === "webgl2" ? "?renderer=webgl2" : "?"}${fixture ? `&fixture=${fixture}` : ""}`);
await page.waitForFunction(() => window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90000 });
await page.waitForTimeout(800);
console.log("backend:", await page.evaluate(() => window.__pecvdTwin.backend()));
for (const v of VIEWS) {
  await page.evaluate(({ v }) => {
    const api = window.__pecvdTwin;
    const st = api.store.getState();
    st.setQualityPreset("high");
    st.setFollowPhase(false);
    st.setVisual({ visualSeed: 7, plasmaVisible: !v.plasmaOff });
    if (v.scenario) st.setScenario(v.scenario);
    if (v.instance) st.setActiveInstance(v.instance);
    if (v.overlays) for (const [k, val] of Object.entries(v.overlays)) st.setOverlay(k, val);
    if (st.setCoverMode) st.setCoverMode(v.covers ?? "auto");
    if (st.setEnvironment) st.setEnvironment({ visible: true, ceiling: true, walls: true, ...(v.env ?? {}) });
    if (st.setCarrierSection) st.setCarrierSection(!!v.carrierSection);
    st.setOverview(!!v.overview);
    if (!v.overview) st.setViewMode(v.mode ?? "assembled");
    if (v.cutaway) st.setCutaway(v.cutaway);
    st.select(v.select ?? null);
    if (v.measurement) st.selectMeasurement(v.measurement);
  }, { v });
  await page.waitForTimeout(250);
  await page.evaluate(({ v }) => {
    const api = window.__pecvdTwin;
    api.freezeTime(v.time ?? 0);
    const st = api.store.getState();
    if (v.camInstance) api.setCameraLocal(v.camInstance, v.cam[0], v.cam[1], v.cam[2], v.cam[3]);
    else if (v.local && v.instance) api.setCameraLocal(v.instance, v.cam[0], v.cam[1], v.cam[2], v.cam[3]);
    else api.setCamera(v.cam[0], v.cam[1], v.cam[2], v.cam[3]);
    void st;
  }, { v });
  await page.waitForTimeout(700);
  await page.evaluate(({ v }) => {
    const api = window.__pecvdTwin;
    if (v.camInstance) api.setCameraLocal(v.camInstance, v.cam[0], v.cam[1], v.cam[2], v.cam[3]);
    else if (v.local && v.instance) api.setCameraLocal(v.instance, v.cam[0], v.cam[1], v.cam[2], v.cam[3]);
    else api.setCamera(v.cam[0], v.cam[1], v.cam[2], v.cam[3]);
  }, { v });
  await page.waitForTimeout(400);
  const stats = await page.evaluate(() => window.__pecvdTwin.stats());
  if (v.ui) await page.screenshot({ path: `${outDir}/${v.id}.png` });
  else await page.locator("#pecvd-canvas").screenshot({ path: `${outDir}/${v.id}.png` });
  console.log(v.id, `fps=${stats.fps.toFixed(0)} frameMs=${stats.frameMsEma.toFixed(1)} active=${stats.activeMeshes} scenario=${stats.scenario}`);
}
console.log("console errors/warnings:", errors.length);
for (const e of errors.slice(0, 15)) console.log("  ", e);
const logs = await page.evaluate(() => window.__pecvdTwin.logs());
console.log(logs.slice(-6).join("\n"));
await browser.close();
