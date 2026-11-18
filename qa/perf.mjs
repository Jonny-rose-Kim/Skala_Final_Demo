// Performance measurement with vsync disabled (real GPU, headed Chrome). Reports fps/frame time for representative states.
// Usage: node qa/perf.mjs [webgl2|webgpu]
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
const prep = `const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); st0.setCoverMode("auto"); st0.setEnvironment({ visible: true, ceiling: true, walls: true });`;
void prep;
await measure("CCP cutaway, plasma on, high (regression)", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setScenario("ccp-illustrative-cycle-v1"); st.setActiveInstance("PECVD-01.CH-A"); st.setViewMode("cutaway"); st.setCutaway({ azimuthDeg: 265, sweepDeg: 95 }); a.freezeTime(8); a.setCamera(255, 70, 1.5, [0, 0.12, 0]); });
await measure("CCP cutaway close-up, plasma fills screen, high", () => { const a = window.__pecvdTwin; a.freezeTime(8); a.setCamera(250, 80, 0.42, [0.02, 0.16, 0]); });
await measure("Bay overview (4 tools + rail), high", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setScenario("route-a-linked-v2"); st.setOverview(true); a.freezeTime(90); a.setCamera(205, 60, 10, [-0.3, 0.8, 0.2]); });
await measure("Remote source cutaway (glow + afterglow + traces), high", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setScenario("remote-icp-cycle-v1"); st.setActiveInstance("REMOTE-01"); st.setViewMode("cutaway"); st.setCutaway({ azimuthDeg: 250, sweepDeg: 110 }); a.freezeTime(20); a.setCameraLocal("REMOTE-01", 255, 76, 0.75, [0, 0.56, 0]); });
await measure("CMP contact cutaway (grooved pad, slurry, optical), high", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setScenario("sti-cmp-cycle-v2"); st.setActiveInstance("CMP-01"); st.setViewMode("cutaway"); st.setCutaway({ azimuthDeg: 270, sweepDeg: 100 }); a.freezeTime(40.32); a.setCameraLocal("CMP-01", 268, 76, 0.75, [-0.19, 0.98, 0]); });
await measure("CMP assembled, platen spinning (playing)", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setViewMode("assembled"); a.freezeTime(null); a.host.clock.scrub(38); a.host.clock.play(); a.setCameraLocal("CMP-01", 230, 62, 3.0, [-0.3, 0.95, 0.1]); });
await measure("OHT loaded travel (playing), high", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setScenario("oht-transfer-v1"); st.setActiveInstance("OHT-01"); st.setViewMode("assembled"); a.freezeTime(null); a.host.clock.scrub(18); a.host.clock.play(); a.setCameraLocal("OHT-01", 200, 64, 4.5, [0, 1.8, 1.8]); });
await measure("CCP handling, covers removed, robot + load lock (playing)", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setScenario("ccp-handling-cycle-v1"); st.setActiveInstance("PECVD-01.CH-A"); st.setViewMode("assembled"); st.setCoverMode("removed"); a.freezeTime(null); a.host.clock.scrub(8); a.host.clock.play(); a.setCameraLocal("PECVD-01.CH-A", 120, 62, 2.4, [-1.2, 0.2, 0.0]); });
await measure("CMP front end, covers removed, wet robot (playing)", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); st0.setOverview(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setScenario("sti-cmp-cycle-v2"); st.setActiveInstance("CMP-01"); st.setViewMode("assembled"); st.setCoverMode("removed"); a.freezeTime(null); a.host.clock.scrub(64); a.host.clock.play(); a.setCameraLocal("CMP-01", 40, 62, 2.6, [-0.8, 1.05, 0.6]); });
await measure("Bay inside, environment with ceiling and walls, high", () => { const st0 = window.__pecvdTwin.store.getState(); st0.setFollowPhase(false); st0.setQualityPreset("high"); const a = window.__pecvdTwin; const st = a.store.getState(); st.setCoverMode("auto"); st.setScenario("route-a-linked-v2"); st.setOverview(true); a.freezeTime(90); a.setCamera(165, 80, 5.5, [-2.6, 0.6, 0.0]); });
await measure("FOUP at the CCP load port, closed (reference)", () => { const a = window.__pecvdTwin; const st = a.store.getState(); st.setFollowPhase(false); st.setQualityPreset("high"); st.setOverview(false); st.setCoverMode("auto"); st.setScenario("ccp-handling-cycle-v1"); st.setActiveInstance("PECVD-01.CH-A"); st.setViewMode("assembled"); st.setCarrierSection(false); a.freezeTime(0.5); setTimeout(() => a.setCameraLocal("FOUP-01", 196, 76, 0.85, [0, 0.19, 0]), 300); });
await measure("FOUP section on, same view", () => { const a = window.__pecvdTwin; a.store.getState().setCarrierSection(true); a.freezeTime(0.5); setTimeout(() => a.setCameraLocal("FOUP-01", 196, 76, 0.85, [0, 0.19, 0]), 300); });
await measure("Bay overview, balanced", () => { const a0 = window.__pecvdTwin; a0.store.getState().setCarrierSection(false); const a = window.__pecvdTwin; const st = a.store.getState(); st.setQualityPreset("balanced"); st.setScenario("route-a-linked-v2"); st.setOverview(true); a.freezeTime(90); a.setCamera(205, 60, 10, [-0.3, 0.8, 0.2]); });
const gpu = await page.evaluate(() => window.__pecvdTwin.stats().gpu);
console.log("gpu:", gpu);
await browser.close();
