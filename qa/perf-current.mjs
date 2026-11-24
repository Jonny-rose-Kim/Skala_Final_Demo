// Performance measurement with vsync disabled (real GPU, headed Chrome). Reports fps/frame time for representative states.
// Usage: node qa/perf-current.mjs [webgl2|webgpu]  (current bay: Producer SE / Tactras / CELLESTA-i MD / CLW-08v2)
import { chromium } from "playwright";
const mode = process.argv[2] ?? "webgl2";
const args = ["--ignore-gpu-blocklist", "--window-size=1920,1080", "--force-device-scale-factor=1", "--disable-frame-rate-limit", "--disable-gpu-vsync"];
if (mode === "webgpu") args.push("--enable-unsafe-webgpu", "--enable-features=Vulkan");
const browser = await chromium.launch({ channel: "chrome", headless: false, args });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:5173/${mode === "webgl2" ? "?renderer=webgl2" : "?"}`);
await page.waitForFunction(() => window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90000 });
await page.waitForTimeout(800);
const measure = async (label, setup) => {
  await page.evaluate(setup);
  await page.waitForTimeout(900);
  const r = await page.evaluate(async () => {
    const engine = window.__pecvdTwin.host.world.scene.getEngine();
    const frames = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const obs = window.__pecvdTwin.host.world.scene.onAfterRenderObservable.add(() => {
        frames.push(engine.getDeltaTime());
        if (performance.now() - t0 > 3000) { window.__pecvdTwin.host.world.scene.onAfterRenderObservable.remove(obs); resolve(); }
      });
    });
    frames.sort((a, b) => a - b);
    const avg = frames.reduce((s, x) => s + x, 0) / frames.length;
    const st = window.__pecvdTwin.stats();
    return { frames: frames.length, avgMs: avg, p95Ms: frames[Math.floor(frames.length * 0.95)], fps: 1000 / avg, w: engine.getRenderWidth(), h: engine.getRenderHeight(), active: window.__pecvdTwin.host.world.scene.getActiveMeshes().length, draws: st.drawCalls, tris: st.activeTriangles };
  });
  console.log(`${mode} | ${label} | ${r.w}x${r.h} | active ${r.active} | draws ${r.draws} | tris ${r.tris} | ${r.fps.toFixed(0)} fps avg | ${r.avgMs.toFixed(2)} ms avg | p95 ${r.p95Ms.toFixed(2)} ms`);
};
const base = (a) => { const st = a.store.getState(); st.setFollowPhase(false); st.setQualityPreset("high"); st.setCoverMode("auto"); st.setCarrierSection(false); st.setScenario("route-dep-etch-clean-v1"); };
await page.evaluate(`window.__base = ${base.toString()};`);
await measure("Bay overview (3 tools + OHT, GLB exteriors), high", () => { const a = window.__pecvdTwin; window.__base(a); a.store.getState().setOverview(true); a.freezeTime(100); a.setCamera(205, 56, 15.5, [-0.2, 0.2, -0.4]); });
await measure("Bay inside at the rail, high", () => { const a = window.__pecvdTwin; window.__base(a); a.store.getState().setOverview(true); a.freezeTime(100); a.setCamera(165, 80, 5.5, [-2.6, 0.6, 0.0]); });
await measure("Producer exterior, assembled", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setOverview(false); st.setActiveInstance("PRODUCER-01"); st.setViewMode("assembled"); a.freezeTime(30); a.setCameraLocal("PRODUCER-01", 200, 66, 6.0, [-1.1, 0.2, 0.3]); });
await measure("Producer twin cutaway, plasma on", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setOverview(false); st.setActiveInstance("PRODUCER-01"); st.setViewMode("cutaway"); st.setCutaway({ azimuthDeg: 265, sweepDeg: 95 }); a.freezeTime(37); a.setCameraLocal("PRODUCER-01", 300, 55, 2.9, [0.05, 0.05, 0.5]); });
await measure("Tactras PM-01 cutaway, main etch, plasma fills view", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setOverview(false); st.setActiveInstance("ETCH-01"); st.setViewMode("cutaway"); st.setCutaway({ azimuthDeg: 255, sweepDeg: 110 }); a.freezeTime(152); a.setCameraLocal("ETCH-01", 262, 76, 1.15, [0, -0.05, 0]); });
await measure("CELLESTA PM-01 cutaway, chemical dispense", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setOverview(false); st.setActiveInstance("CLEAN-01"); st.setViewMode("cutaway"); st.setCutaway({ azimuthDeg: 200, sweepDeg: 110 }); a.freezeTime(263); a.setCameraLocal("CLEAN-01", 190, 52, 1.25, [0.05, 0, 0]); });
await measure("CELLESTA spin + dispense (playing)", () => { const a = window.__pecvdTwin; a.freezeTime(null); a.host.clock.scrub(259); a.host.clock.play(); });
await measure("OHT loaded travel, leg 1 (playing)", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setOverview(false); st.setActiveInstance("OHT-01"); st.setViewMode("assembled"); a.freezeTime(null); a.host.clock.scrub(92); a.host.clock.play(); a.setCamera(235, 66, 6, [-1.974, 1.2, -2.2]); });
await measure("Producer handling, covers removed (playing)", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setOverview(false); st.setActiveInstance("PRODUCER-01"); st.setViewMode("assembled"); st.setCoverMode("removed"); a.freezeTime(null); a.host.clock.scrub(14); a.host.clock.play(); a.setCameraLocal("PRODUCER-01", 215, 58, 5.2, [-0.9, 0.2, 0.3]); });
await measure("CELLESTA exploded", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setOverview(false); st.setActiveInstance("CLEAN-01"); st.setViewMode("exploded"); a.freezeTime(263); a.setCameraLocal("CLEAN-01", 215, 60, 2.6, [0, 0, 0]); });
await measure("FOUP section at LP.PRODUCER-01", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setOverview(false); st.setActiveInstance("PRODUCER-01"); st.setViewMode("assembled"); st.setCarrierSection(true); a.freezeTime(5); a.setCamera(230, 70, 1.3, [-1.974, 0.3, -4.3]); });
await measure("Bay overview, balanced", () => { const a = window.__pecvdTwin; window.__base(a); const st = a.store.getState(); st.setQualityPreset("balanced"); st.setOverview(true); a.freezeTime(100); a.setCamera(205, 56, 15.5, [-0.2, 0.2, -0.4]); });
const gpu = await page.evaluate(() => window.__pecvdTwin.stats().gpu);
console.log("gpu:", gpu);
await browser.close();
