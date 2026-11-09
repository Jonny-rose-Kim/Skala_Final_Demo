// Performance measurement with vsync disabled (real GPU, headed Chrome). Reports fps/frame time for representative states.
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
  await page.waitForTimeout(800);
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
    return { frames: frames.length, avgMs: avg, p95Ms: frames[Math.floor(frames.length * 0.95)], fps: 1000 / avg, w: engine.getRenderWidth(), h: engine.getRenderHeight() };
  });
  console.log(`${mode} | ${label} | ${r.w}x${r.h} | ${r.fps.toFixed(0)} fps avg | ${r.avgMs.toFixed(2)} ms avg | p95 ${r.p95Ms.toFixed(2)} ms`);
};
await measure("assembled, plasma off, high", () => { const a = window.__pecvdTwin; a.store.getState().setQualityPreset("high"); a.store.getState().setViewMode("assembled"); a.freezeTime(0.5); a.setCamera(240, 66, 1.75, [0, 0.12, 0]); });
await measure("cutaway, plasma on, high (overview)", () => { const a = window.__pecvdTwin; a.store.getState().setViewMode("cutaway"); a.freezeTime(8); a.setCamera(255, 70, 1.5, [0, 0.12, 0]); });
await measure("cutaway, plasma on, high (close-up, plasma fills screen)", () => { const a = window.__pecvdTwin; a.freezeTime(8); a.setCamera(250, 80, 0.42, [0.02, 0.16, 0]); });
await measure("cutaway, plasma on, balanced (close-up)", () => { const a = window.__pecvdTwin; a.store.getState().setQualityPreset("balanced"); a.freezeTime(8); a.setCamera(250, 80, 0.42, [0.02, 0.16, 0]); });
await measure("x-ray, plasma on, high", () => { const a = window.__pecvdTwin; a.store.getState().setQualityPreset("high"); a.store.getState().setViewMode("xray"); a.freezeTime(8); a.setCamera(250, 72, 1.2, [0, 0.14, 0]); });
const gpu = await page.evaluate(() => window.__pecvdTwin.stats().gpu);
console.log("gpu:", gpu);
await browser.close();
