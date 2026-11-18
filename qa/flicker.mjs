// Resize flicker probe: drags the component tree edge at a steady speed while recording the frames the browser puts
// on screen (CDP screencast) and the order of resize and render inside each animation frame.
// node qa/flicker.mjs <webgl2|webgpu> [variant] [high|balanced]
//   current   the app as built
//   frame     resize at the start of every rendered frame instead of in the ResizeObserver
//   throttle  like frame, but at most every 120 ms or 64 px; the browser stretches the old buffer in between
//   release   no resize while dragging, one resize after the pointer is released
//   none      never resize (control: cost of the drag without any buffer change)
// Output: qa/out/flicker/<backend>-<variant>-<quality>/summary.json and up to 8 blank frames as JPEG.
// The browser is a real window: keep the mouse off it during the run, and compare frame times only when no other
// program is using the GPU (gpuBusyBefore in the summary).
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";

const mode = process.argv[2] ?? "webgl2";
const variant = process.argv[3] ?? "current";
const quality = process.argv[4] ?? "high";
const outDir = `qa/out/flicker/${mode}-${variant}-${quality}`;
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let gpuBusyBefore = null;
try {
  gpuBusyBefore = execSync("nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader", { encoding: "utf8" }).trim();
} catch {
  /* no nvidia-smi */
}

const args = ["--ignore-gpu-blocklist", "--window-size=1920,1080", "--force-device-scale-factor=1"];
if (mode === "webgpu") args.push("--enable-unsafe-webgpu", "--enable-features=Vulkan");
const browser = await chromium.launch({ channel: "chrome", headless: false, args });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5173/${mode === "webgl2" ? "?renderer=webgl2" : "?"}`);
await page.waitForFunction(() => window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90000 });
const backend = await page.evaluate(() => window.__pecvdTwin.backend());
await page.evaluate((q) => window.__pecvdTwin.store.getState().setQualityPreset(q), quality);
await page.waitForTimeout(2000);

await page.evaluate((variant) => {
  const w = window.__pecvdTwin.host.world;
  const engine = w.created.engine;
  const canvas = engine.getRenderingCanvas();
  if (variant !== "current") w.resizeObserver?.disconnect();
  if (variant === "frame") engine.onBeginFrameObservable.add(() => engine.resize());
  if (variant === "throttle") {
    let last = 0;
    let aw = canvas.clientWidth;
    let ah = canvas.clientHeight;
    engine.onBeginFrameObservable.add(() => {
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const now = performance.now();
      if ((cw !== aw || ch !== ah) && (now - last >= 120 || Math.abs(cw - aw) >= 64)) {
        engine.resize();
        last = now;
        aw = cw;
        ah = ch;
      }
    });
  }
  if (variant === "release") engine.onBeginFrameObservable.add(() => { if (window.__released) engine.resize(); });
  // every resize and every finished render, with the animation-frame time it belongs to
  const log = (window.__flicker = { events: [], frames: [] });
  const frameTime = () => document.timeline.currentTime;
  engine.onResizeObservable.add(() => log.events.push({ e: "resize", ft: frameTime() }));
  w.scene.onAfterRenderObservable.add(() => log.events.push({ e: "render", ft: frameTime() }));
  let last = 0;
  const tick = (t) => {
    if (last) log.frames.push({ t, d: t - last });
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, variant);

const cdp = await page.context().newCDPSession(page);
const shots = [];
cdp.on("Page.screencastFrame", (f) => {
  shots.push(f.data);
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 50, everyNthFrame: 1 });
await page.waitForTimeout(500);

// steady drag like a slow hand: 70 px left in 0.6 s, then 240 px right in 2 s (about 120 px/s)
const edge = await page.getByTestId("tree-resizer").boundingBox();
const y = 520;
const x0 = edge.x + edge.width / 2;
const path = (ms) => (ms < 600 ? x0 - (70 * ms) / 600 : x0 - 70 + (240 * Math.min(ms - 600, 2000)) / 2000);
await page.mouse.move(x0, y);
await page.mouse.down();
const tStart = await page.evaluate(() => performance.now());
const wall0 = Date.now();
for (let ms = 0; ms < 2600; ms = Date.now() - wall0) {
  await page.mouse.move(path(ms), y);
  await page.waitForTimeout(8);
}
await page.mouse.move(path(2600), y);
await page.mouse.up();
const tEnd = await page.evaluate(() => performance.now());
await page.evaluate(() => { window.__released = true; });
await page.waitForTimeout(700);
await cdp.send("Page.stopScreencast");
await page.waitForTimeout(200);

const { events, frames } = await page.evaluate(() => window.__flicker);
// a resize whose next render belongs to a later animation frame left the cleared buffer on screen for one paint
let resizes = 0;
let unrendered = 0;
for (let i = 0; i < events.length; i++) {
  if (events[i].e !== "resize") continue;
  resizes++;
  const next = events.slice(i + 1).find((x) => x.e === "render");
  if (!next || next.ft !== events[i].ft) unrendered++;
}

// share of near-background pixels in the 3D area (right of the widest tree in the drag); a cleared canvas is almost all dark
const darkFraction = (b64) =>
  page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
    const sx = bmp.width / 1920;
    const sy = bmp.height / 1080;
    const c = new OffscreenCanvas(230, 166);
    const g = c.getContext("2d");
    g.drawImage(bmp, 700 * sx, 120 * sy, 1150 * sx, 830 * sy, 0, 0, 230, 166);
    const d = g.getImageData(0, 0, 230, 166).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 28) dark++;
    return dark / (d.length / 4);
  }, b64);
const blank = [];
for (let i = 0; i < shots.length; i++) if ((await darkFraction(shots[i])) > 0.6) blank.push(i);
for (const i of blank.slice(0, 8)) fs.writeFileSync(`${outDir}/blank-${String(i).padStart(4, "0")}.jpg`, Buffer.from(shots[i], "base64"));

const sorted = (list) => list.map((f) => f.d).sort((a, b) => a - b);
const drag = sorted(frames.filter((f) => f.t >= tStart && f.t <= tEnd));
const idle = sorted(frames.filter((f) => f.t < tStart));
const pct = (a, p) => (a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1) : null);
const summary = {
  backend,
  variant,
  quality,
  gpuBusyBefore,
  resizes,
  resizeWithoutRenderInSameFrame: unrendered,
  screencastFrames: shots.length,
  blankFrames: blank.length,
  dragSec: +((tEnd - tStart) / 1000).toFixed(2),
  dragFps: +(drag.length / ((tEnd - tStart) / 1000)).toFixed(1),
  dragFrameMs: { frames: drag.length, p50: pct(drag, 0.5), p95: pct(drag, 0.95), max: drag.length ? +drag[drag.length - 1].toFixed(1) : null, over25ms: drag.filter((d) => d > 25).length },
  idleFrameMs: { frames: idle.length, p50: pct(idle, 0.5), p95: pct(idle, 0.95) },
  errors,
};
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
await browser.close();
