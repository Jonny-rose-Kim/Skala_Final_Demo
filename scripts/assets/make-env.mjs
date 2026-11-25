// Builds the prefiltered indoor environment used for IBL:
//   node scripts/assets/make-env.mjs  (needs `npm run dev` on 5173 and a display for headed Chrome)
// Source: assets/source/hdri/white_studio_05_2k.hdr (Poly Haven, CC0) -> public/env/white_studio_05.env
import { chromium } from "playwright";
import fs from "node:fs";
const src = "/assets/source/hdri/white_studio_05_2k.hdr";
const out = "public/env/white_studio_05.env";
const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--ignore-gpu-blocklist"] });
const page = await browser.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
await page.goto(`http://localhost:5173/scripts/assets/env/make-env.html?src=${encodeURIComponent(src)}&size=256`);
await page.waitForFunction(() => window.__env || window.__envError, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__envError);
if (err) {
  console.error(err);
  process.exit(1);
}
const b64 = await page.evaluate(() => window.__env);
fs.mkdirSync("public/env", { recursive: true });
fs.writeFileSync(out, Buffer.from(b64, "base64"));
console.log("wrote", out, fs.statSync(out).size, "bytes");
await browser.close();
