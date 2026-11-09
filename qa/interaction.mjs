// Interaction QA: click-to-select, tree/inspector sync, overlays, timeline controls, hidden parts not blocking picks.
import { chromium } from "playwright";
import fs from "node:fs";
const mode = process.argv[2] ?? "webgl2";
const outDir = `qa/out/${mode}`;
fs.mkdirSync(outDir, { recursive: true });
const args = ["--ignore-gpu-blocklist", "--window-size=1920,1080", "--force-device-scale-factor=1"];
if (mode === "webgpu") args.push("--enable-unsafe-webgpu", "--enable-features=Vulkan");
const browser = await chromium.launch({ channel: "chrome", headless: false, args });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:5173/${mode === "webgl2" ? "?renderer=webgl2" : "?"}`);
await page.waitForFunction(() => window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90000 });
await page.waitForTimeout(600);
const results = [];
const check = (name, ok, extra = "") => { const line = `${ok ? "PASS" : "FAIL"} ${name} ${extra}`; results.push(line); console.log(line); };

// 1) click on the lid center -> selection lid
await page.evaluate(() => { const api = window.__pecvdTwin; api.freezeTime(8); api.setCamera(240, 50, 1.6, [0, 0.12, 0]); api.store.getState().setViewMode("assembled"); });
await page.waitForTimeout(500);
const canvas = page.locator("#pecvd-canvas");
const box = await canvas.boundingBox();
// project the lid top center to screen using the engine camera
const pt = await page.evaluate(() => {
  const host = window.__pecvdTwin.host; const w = host.world;
  const inst = w.instances.values().next().value;
  const b = inst.worldBounds("lid");
  const cam = w.camera; const engine = w.created.engine;
  const BJ = host.constructor; void BJ;
  const p = b.center.clone(); p.y = b.max.y; p.x -= 0.2; p.z += 0.12;
  const viewport = { x: 0, y: 0, width: engine.getRenderWidth(), height: engine.getRenderHeight() };
  // use Vector3.Project via scene utility available on camera
  const m = cam.getTransformationMatrix();
  const v = p.clone();
  const x = v.x * m.m[0] + v.y * m.m[4] + v.z * m.m[8] + m.m[12];
  const y = v.x * m.m[1] + v.y * m.m[5] + v.z * m.m[9] + m.m[13];
  const wv = v.x * m.m[3] + v.y * m.m[7] + v.z * m.m[11] + m.m[15];
  return { sx: ((x / wv) * 0.5 + 0.5) * viewport.width, sy: (1 - ((y / wv) * 0.5 + 0.5)) * viewport.height, rw: viewport.width, rh: viewport.height };
});
const cx = box.x + (pt.sx / pt.rw) * box.width;
const cy = box.y + (pt.sy / pt.rh) * box.height;
await page.mouse.click(cx, cy);
await page.waitForTimeout(300);
let sel = await page.evaluate(() => window.__pecvdTwin.store.getState().selectedAssetId);
check("click lid selects lid", sel === "lid", `(got ${sel})`);
const inspectorName = await page.locator('[data-testid="inspector-name"]').textContent().catch(() => null);
check("inspector shows lid", inspectorName?.includes("lid") || inspectorName?.includes("Lid"), `(got ${inspectorName})`);
const treeSel = await page.locator('[data-testid="tree-item-lid"]').getAttribute("data-selected");
check("tree highlights lid", treeSel === "true");
await page.screenshot({ path: `${outDir}/11_selection_lid.png` });

// 2) hide the lid, click the same point -> should select something else (not lid), i.e. hidden mesh is no pick barrier
await page.evaluate(() => window.__pecvdTwin.store.getState().setHidden("lid", true));
await page.waitForTimeout(300);
await page.mouse.click(cx, cy);
await page.waitForTimeout(300);
sel = await page.evaluate(() => window.__pecvdTwin.store.getState().selectedAssetId);
check("hidden lid does not block picking", sel !== "lid", `(got ${sel})`);
await page.evaluate(() => window.__pecvdTwin.store.getState().showAll());

// 3) tree click -> selection + highlight; focus
await page.locator('[data-testid="tree-item-showerhead_faceplate"] button').first().click();
await page.waitForTimeout(200);
sel = await page.evaluate(() => window.__pecvdTwin.store.getState().selectedAssetId);
check("tree click selects faceplate", sel === "showerhead_faceplate");
await page.locator('[data-testid="viewmode-cutaway"]').click();
await page.locator('[data-testid="focus-selected"]').click();
await page.waitForTimeout(900);
await page.evaluate(() => window.__pecvdTwin.freezeTime(8));
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/12_focus_faceplate_cutaway.png` });

// 4) overlays
await page.evaluate(() => { const st = window.__pecvdTwin.store.getState(); st.setOverlay("labels", true); st.setOverlay("gasPath", true); st.setOverlay("sheath", true); st.select(null); window.__pecvdTwin.setCamera(258, 72, 1.1, [0, 0.14, 0]); });
await page.waitForTimeout(700);
const labelCount = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="labels-layer"] div')).filter((d) => d.style.display !== "none").length);
check("labels visible", labelCount > 2, `(count ${labelCount})`);
await page.screenshot({ path: `${outDir}/13_overlays_gas_labels_sheath.png` });
await page.evaluate(() => { const st = window.__pecvdTwin.store.getState(); st.setOverlay("labels", false); st.setOverlay("gasPath", false); st.setOverlay("sheath", false); });

// 5) timeline: pause keeps time, scrub moves, restart resets
await page.evaluate(() => { window.__pecvdTwin.freezeTime(null); window.__pecvdTwin.host.clock.play(); });
await page.waitForTimeout(300);
await page.locator('[data-testid="timeline-play"]').click(); // pause (was playing)
await page.waitForTimeout(300);
const t1 = await page.evaluate(() => window.__pecvdTwin.host.clock.playheadSec);
await page.waitForTimeout(500);
const t2 = await page.evaluate(() => window.__pecvdTwin.host.clock.playheadSec);
check("pause freezes playhead", Math.abs(t1 - t2) < 1e-6, `(${t1.toFixed(3)} -> ${t2.toFixed(3)})`);
await page.evaluate(() => window.__pecvdTwin.host.clock.scrub(5.5));
await page.waitForTimeout(200);
const t3 = await page.evaluate(() => window.__pecvdTwin.host.clock.playheadSec);
check("scrub sets playhead", Math.abs(t3 - 5.5) < 1e-6, `(${t3})`);
await page.locator('[data-testid="timeline-restart"]').click();
await page.waitForTimeout(250);
const t4 = await page.evaluate(() => window.__pecvdTwin.host.clock.playheadSec);
check("restart resets and plays", t4 < 0.6 && t4 >= 0, `(${t4.toFixed(3)})`);

// 6) camera orbit while paused (pointer drag)
await page.evaluate(() => window.__pecvdTwin.host.clock.pause());
const a0 = await page.evaluate(() => window.__pecvdTwin.host.world.camera.alpha);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const a1 = await page.evaluate(() => window.__pecvdTwin.host.world.camera.alpha);
check("camera orbits while paused", Math.abs(a1 - a0) > 0.05, `(${a0.toFixed(2)} -> ${a1.toFixed(2)})`);

// 7) exploded -> assembled returns transforms to zero
await page.evaluate(() => window.__pecvdTwin.store.getState().setViewMode("exploded"));
await page.waitForTimeout(200);
const moved = await page.evaluate(() => { const inst = window.__pecvdTwin.host.world.instances.values().next().value; return inst.assetNodes.get("lid").position.y; });
await page.evaluate(() => window.__pecvdTwin.store.getState().setViewMode("assembled"));
await page.waitForTimeout(200);
const back = await page.evaluate(() => { const inst = window.__pecvdTwin.host.world.instances.values().next().value; return inst.assetNodes.get("lid").position.length(); });
check("explode moves lid and assembled restores", moved > 0.3 && back === 0, `(moved ${moved.toFixed(2)}, back ${back})`);

// 8) repeated mode switching does not leak meshes/materials
const snapshot = () => page.evaluate(() => { const s = window.__pecvdTwin.host.world.scene; return [s.meshes.length, s.materials.length, s.textures.length]; });
const cycle = async () => { for (let i = 0; i < 6; i++) {
  await page.evaluate(() => { const st = window.__pecvdTwin.store.getState(); st.setViewMode("cutaway"); st.setCutaway({ azimuthDeg: 200 + Math.random() * 100, sweepDeg: 60 + Math.random() * 60 }); });
  await page.waitForTimeout(250);
  await page.evaluate(() => { const st = window.__pecvdTwin.store.getState(); st.setViewMode("xray"); });
  await page.waitForTimeout(120);
  await page.evaluate((i) => { const st = window.__pecvdTwin.store.getState(); st.setViewMode("exploded"); st.setQualityPreset(i % 2 ? "balanced" : "high"); }, i);
  await page.waitForTimeout(120);
  await page.evaluate(() => { const st = window.__pecvdTwin.store.getState(); st.setViewMode("assembled"); st.requestResetCamera(); st.resetVisual(); });
  await page.waitForTimeout(120);
} };
const before = await snapshot();
await cycle();
const mid = await snapshot(); // lazily created, bounded variants (x-ray materials, SSAO targets) appear once
await cycle();
const after = await snapshot();
check("no accumulation on repeated switching (second cycle adds nothing)", mid[0] === after[0] && mid[1] === after[1] && mid[2] === after[2], `(before ${before} first ${mid} second ${after})`);

console.log("console errors/warnings:", errors.length);
for (const e of errors.slice(0, 10)) console.log("  ", e);
await browser.close();
