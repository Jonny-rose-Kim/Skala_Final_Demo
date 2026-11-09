import { test, expect } from "@playwright/test";
import fs from "node:fs";

/** @screenshots Deterministic review captures (fixed camera, frozen visual time, seed 7, quality high). */
const VIEWS = [
  { id: "01_assembled_plasma_off", mode: "assembled", time: 0.8, cam: [240, 66, 1.75, [0, 0.12, 0]] as const, full: true },
  { id: "02_side_cutaway_plasma_on", mode: "cutaway", time: 8.0, cam: [265, 78, 1.05, [0, 0.14, 0]] as const },
  { id: "03_oblique_wafer_showerhead_closeup", mode: "cutaway", time: 8.0, cam: [250, 80, 0.42, [0.02, 0.16, 0]] as const },
  { id: "04_showerhead_detail", mode: "exploded", time: 8.0, cam: [262, 140, 0.12, [0.0, 0.3708, 0]] as const },
  { id: "05_exploded_plasma_hidden", mode: "exploded", time: 8.0, cam: [235, 64, 2.6, [0, 0.25, 0]] as const },
  { id: "06_cutaway_overview", mode: "cutaway", time: 8.0, cam: [255, 70, 1.5, [0, 0.12, 0]] as const, full: true },
];

test("@screenshots capture review views", async ({ page }, info) => {
  const webgpu = info.project.name.includes("webgpu");
  await page.goto(webgpu ? "/?" : "/?renderer=webgl2");
  await page.waitForFunction(() => !!window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90_000 });
  await page.waitForTimeout(600);
  const backend = await page.evaluate(() => window.__pecvdTwin!.backend());
  const dir = `qa/out/e2e-${backend}`;
  fs.mkdirSync(dir, { recursive: true });
  for (const v of VIEWS) {
    await page.evaluate(({ v }) => {
      const api = window.__pecvdTwin!;
      const st = api.store.getState();
      st.setQualityPreset("high");
      st.setVisual({ visualSeed: 7, plasmaVisible: true });
      st.setViewMode(v.mode);
      if (v.mode === "cutaway") st.setCutaway({ azimuthDeg: 265, sweepDeg: 95 });
      st.select(null);
      api.freezeTime(v.time);
      api.setCamera(v.cam[0], v.cam[1], v.cam[2], [v.cam[3][0], v.cam[3][1], v.cam[3][2]]);
    }, { v });
    await page.waitForTimeout(600);
    await page.evaluate(({ v }) => window.__pecvdTwin!.setCamera(v.cam[0], v.cam[1], v.cam[2], [v.cam[3][0], v.cam[3][1], v.cam[3][2]]), { v });
    await page.waitForTimeout(300);
    const path = `${dir}/${v.id}.png`;
    if (v.full) await page.screenshot({ path });
    else await page.locator("#pecvd-canvas").screenshot({ path });
    expect(fs.existsSync(path)).toBe(true);
  }
});
