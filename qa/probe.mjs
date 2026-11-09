// Quick runtime probe: loads the app in system Chrome (real GPU), waits for readiness, dumps
// console errors + renderer stats, takes a screenshot. Usage: node qa/probe.mjs [webgl2|webgpu] [url-suffix]
import { chromium } from "playwright";
import fs from "node:fs";
const mode = process.argv[2] ?? "webgl2";
const suffix = process.argv[3] ?? "";
const outDir = process.argv[4] ?? "qa/out";
fs.mkdirSync(outDir, { recursive: true });
const args = ["--ignore-gpu-blocklist", "--window-size=1600,1000"];
if (mode === "webgpu") args.push("--enable-unsafe-webgpu", "--enable-features=Vulkan");
const browser = await chromium.launch({ channel: "chrome", headless: false, args });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text().slice(0, 500)}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
const url = `http://localhost:5173/${mode === "webgl2" ? "?renderer=webgl2" : "?"}${suffix}`;
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 60000 });
} catch (e) {
  console.log("NOT READY:", e.message.split("\n")[0]);
  const st = await page.evaluate(() => (window.__pecvdTwin ? "api present" : "no api"));
  console.log(st);
}
console.log("ready in", Date.now() - t0, "ms");
await page.waitForTimeout(1500);
const stats = await page.evaluate(() => window.__pecvdTwin?.stats());
console.log("stats:", JSON.stringify(stats));
const logs = await page.evaluate(() => window.__pecvdTwin?.logs() ?? []);
console.log("logs:\n" + logs.join("\n"));
console.log("console errors/warnings:", errors.length);
for (const e of errors.slice(0, 20)) console.log("  ", e);
await page.screenshot({ path: `${outDir}/probe_${mode}.png` });
await browser.close();
