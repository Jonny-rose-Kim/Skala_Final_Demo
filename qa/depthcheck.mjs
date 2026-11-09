import { chromium } from "playwright";
const mode = process.argv[2] ?? "webgl2";
const flip = process.argv[3] ?? "0";
const args = ["--ignore-gpu-blocklist", "--window-size=1600,1000", "--force-device-scale-factor=1"];
if (mode === "webgpu") args.push("--enable-unsafe-webgpu", "--enable-features=Vulkan");
const browser = await chromium.launch({ channel: "chrome", headless: false, args });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`http://localhost:5173/${mode === "webgl2" ? "?renderer=webgl2" : "?"}&plasmaDebug=depth&flipDepth=${flip}`);
await page.waitForFunction(() => window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90000 });
await page.waitForTimeout(500);
// view A: assembled, looking down at the lid (plasma must be occluded by the lid; debug shows depth values at the proxy)
await page.evaluate(() => { const api = window.__pecvdTwin; api.store.getState().setViewMode("cutaway"); api.store.getState().setCutaway({ azimuthDeg: 265, sweepDeg: 95 }); api.freezeTime(8); api.setCamera(250, 80, 0.5, [0.02, 0.16, 0]); });
await page.waitForTimeout(800);
await page.locator("#pecvd-canvas").screenshot({ path: `qa/out/depth_${mode}_flip${flip}.png` });
// also sample the clear color pixel at top-left of the canvas
const px = await page.evaluate(async () => {
  const c = document.getElementById("pecvd-canvas");
  const host = window.__pecvdTwin.host; const engine = host.world.created.engine;
  // read back via engine.readPixels
  const w = engine.getRenderWidth(), h = engine.getRenderHeight();
  const data = await engine.readPixels(5, h - 5, 1, 1);
  return Array.from(data);
});
console.log(mode, "top-left pixel:", px);
await browser.close();
