import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __pecvdTwin?: {
      isReady(): boolean;
      backend(): "webgpu" | "webgl2" | null;
      setCamera(a: number, b: number, r: number, t: [number, number, number]): void;
      freezeTime(t: number | null): void;
      stats(): Record<string, unknown> | null;
      logs(): string[];
      store: { getState(): Record<string, any> };
      host: any;
    };
  }
}

const isWebGPUProject = (name: string) => name.includes("webgpu");

async function openApp(page: Page, projectName: string, suffix = "") {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const q = isWebGPUProject(projectName) ? "?" : "?renderer=webgl2";
  await page.goto(`/${q}${suffix}`);
  await page.waitForFunction(() => !!window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90_000 });
  await page.waitForTimeout(500);
  return errors;
}

test.describe("Visual Inspection V1", () => {
  test("loads the chamber without a backend and reports the renderer", async ({ page }, info) => {
    const errors = await openApp(page, info.project.name);
    const backend = await page.evaluate(() => window.__pecvdTwin!.backend());
    expect(backend === "webgl2" || backend === "webgpu").toBeTruthy();
    if (!isWebGPUProject(info.project.name)) expect(backend).toBe("webgl2");
    const stats = (await page.evaluate(() => window.__pecvdTwin!.stats())) as { meshes: number; activeMeshes: number };
    expect(stats.meshes).toBeGreaterThan(80);
    expect(stats.activeMeshes).toBeGreaterThan(30);
    await expect(page.getByTestId("topbar")).toContainText("Visual Inspection");
    // no fabricated live data: inspector empty state shows illustrative/assumed sources
    await expect(page.getByTestId("inspector-empty")).toContainText("illustrative");
    expect(errors.filter((e) => !e.includes("Outdated Optimize Dep"))).toEqual([]);
  });

  test("3D pick, tree and inspector point to the same asset; hidden parts do not block picks", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => {
      const api = window.__pecvdTwin!;
      api.freezeTime(8);
      api.store.getState().setViewMode("assembled");
      api.setCamera(240, 50, 1.6, [0, 0.12, 0]);
    });
    await page.waitForTimeout(400);
    const canvas = page.locator("#pecvd-canvas");
    const box = (await canvas.boundingBox())!;
    const pt = await page.evaluate(() => {
      const host = window.__pecvdTwin!.host;
      const w = host.world;
      const inst = w.instances.values().next().value;
      const b = inst.worldBounds("lid");
      const p = b.center.clone();
      p.y = b.max.y;
      p.x -= 0.2;
      p.z += 0.12;
      const m = w.camera.getTransformationMatrix().m;
      const x = p.x * m[0] + p.y * m[4] + p.z * m[8] + m[12];
      const y = p.x * m[1] + p.y * m[5] + p.z * m[9] + m[13];
      const wv = p.x * m[3] + p.y * m[7] + p.z * m[11] + m[15];
      return { u: (x / wv) * 0.5 + 0.5, v: 1 - ((y / wv) * 0.5 + 0.5) };
    });
    const cx = box.x + pt.u * box.width;
    const cy = box.y + pt.v * box.height;
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().selectedAssetId)).toBe("lid");
    await expect(page.getByTestId("inspector-name")).toHaveText("Chamber lid");
    await expect(page.getByTestId("tree-item-lid")).toHaveAttribute("data-selected", "true");
    // hide the lid: the same click must now hit something else (hidden mesh is not a pick barrier)
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setHidden("lid", true));
    await page.waitForTimeout(300);
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(300);
    const sel = await page.evaluate(() => window.__pecvdTwin!.store.getState().selectedAssetId);
    expect(sel).not.toBe("lid");
    // tree click selects
    await page.evaluate(() => window.__pecvdTwin!.store.getState().showAll());
    await page.getByTestId("tree-item-showerhead_faceplate").locator("button").first().click();
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().selectedAssetId)).toBe("showerhead_faceplate");
    await expect(page.getByTestId("inspector")).toContainText("Electrode gap");
    await expect(page.getByTestId("inspector")).toContainText("assumed");
  });

  test("view modes switch and restore; plasma is hidden in exploded view", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => window.__pecvdTwin!.freezeTime(8));
    const lidY = async () => page.evaluate(() => window.__pecvdTwin!.host.world.instances.values().next().value.assetNodes.get("lid").position.y as number);
    const plasmaOn = async () => page.evaluate(() => (window.__pecvdTwin!.stats() as { plasmaEnabled: boolean[] }).plasmaEnabled[0]);
    await page.getByTestId("viewmode-cutaway").click();
    await page.waitForTimeout(400);
    const cut = await page.evaluate(() => (window.__pecvdTwin!.stats() as { cutaway: { enabled: boolean; effectiveSweepDeg: number } }).cutaway);
    expect(cut.enabled).toBe(true);
    expect(cut.effectiveSweepDeg).toBeGreaterThan(30);
    await expect(page.getByTestId("cutaway-effective")).toContainText("적용");
    expect(await plasmaOn()).toBe(true);
    await page.getByTestId("viewmode-exploded").click();
    await page.waitForTimeout(300);
    expect(await lidY()).toBeGreaterThan(0.3);
    expect(await plasmaOn()).toBe(false);
    await page.getByTestId("viewmode-xray").click();
    await page.waitForTimeout(300);
    expect(await lidY()).toBe(0);
    const xrayMat = await page.evaluate(() => window.__pecvdTwin!.host.world.instances.values().next().value.meshesByAsset.get("chamber_body")[0].material.name as string);
    expect(xrayMat).toContain("xray");
    await page.getByTestId("viewmode-assembled").click();
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => (window.__pecvdTwin!.stats() as { cutaway: { enabled: boolean } }).cutaway.enabled);
    expect(back).toBe(false);
    const mat = await page.evaluate(() => window.__pecvdTwin!.host.world.instances.values().next().value.meshesByAsset.get("chamber_body")[0].material.name as string);
    expect(mat).not.toContain("xray");
    expect(await plasmaOn()).toBe(true);
  });

  test("timeline: play/pause/scrub/restart are deterministic and the camera stays interactive while paused", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => {
      window.__pecvdTwin!.freezeTime(null);
      window.__pecvdTwin!.host.clock.play();
    });
    await page.waitForTimeout(400);
    await page.getByTestId("timeline-play").click(); // pause
    await page.waitForTimeout(200);
    const t1 = await page.evaluate(() => window.__pecvdTwin!.host.clock.playheadSec as number);
    await page.waitForTimeout(500);
    const t2 = await page.evaluate(() => window.__pecvdTwin!.host.clock.playheadSec as number);
    expect(t2).toBe(t1);
    await page.evaluate(() => window.__pecvdTwin!.host.clock.scrub(5.5));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__pecvdTwin!.host.clock.playheadSec as number)).toBeCloseTo(5.5, 6);
    const phase = await page.evaluate(() => window.__pecvdTwin!.store.getState().timeline.phase as string);
    expect(phase).toBe("stable");
    // orbit while paused
    const canvas = page.locator("#pecvd-canvas");
    const box = (await canvas.boundingBox())!;
    const a0 = await page.evaluate(() => window.__pecvdTwin!.host.world.camera.alpha as number);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const a1 = await page.evaluate(() => window.__pecvdTwin!.host.world.camera.alpha as number);
    expect(Math.abs(a1 - a0)).toBeGreaterThan(0.05);
    expect(await page.evaluate(() => window.__pecvdTwin!.host.clock.playheadSec as number)).toBeCloseTo(5.5, 6);
    await page.getByTestId("timeline-restart").click();
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__pecvdTwin!.host.clock.playheadSec as number)).toBeLessThan(0.8);
  });

  test("visual settings never create sensor data or backend calls", async ({ page }, info) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      const u = r.url();
      if (u.includes("/api/") || u.startsWith("ws://")) requests.push(u);
    });
    await openApp(page, info.project.name);
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setVisual({ glowIntensity: 1.5, opacity: 0.6, colorPreset: "pink", visualSeed: 3 });
      st.setViewMode("cutaway");
      st.setCutaway({ azimuthDeg: 200, sweepDeg: 120 });
    });
    await page.waitForTimeout(600);
    await page.getByTestId("tree-item-pressure_sensor").locator("button").first().click();
    await expect(page.getByTestId("inspector")).toContainText("Unbound / 연결된 데이터 없음");
    expect(requests).toEqual([]);
    const state = await page.evaluate(() => window.__pecvdTwin!.store.getState());
    expect(state.appMode).toBe("visual-inspection");
  });

  test("repeated mode/preset/reset cycles do not accumulate scene resources", async ({ page }, info) => {
    await openApp(page, info.project.name);
    const snapshot = () => page.evaluate(() => {
      const s = window.__pecvdTwin!.host.world.scene;
      return [s.meshes.length, s.materials.length, s.textures.length, s.lights.length];
    });
    const cycle = async () => {
      for (let i = 0; i < 4; i++) {
        await page.evaluate((i) => {
          const st = window.__pecvdTwin!.store.getState();
          st.setViewMode("cutaway");
          st.setCutaway({ azimuthDeg: 200 + i * 25, sweepDeg: 60 + i * 20 });
          st.setQualityPreset(i % 2 ? "balanced" : "high");
        }, i);
        await page.waitForTimeout(250);
        await page.evaluate(() => window.__pecvdTwin!.store.getState().setViewMode("xray"));
        await page.waitForTimeout(120);
        await page.evaluate(() => window.__pecvdTwin!.store.getState().setViewMode("exploded"));
        await page.waitForTimeout(120);
        await page.evaluate(() => {
          const st = window.__pecvdTwin!.store.getState();
          st.setViewMode("assembled");
          st.requestResetCamera();
          st.resetVisual();
        });
        await page.waitForTimeout(150);
      }
    };
    await cycle();
    const first = await snapshot();
    await cycle();
    const second = await snapshot();
    expect(second).toEqual(first);
  });

  test("two-chamber fixture builds distinct instances and scopes view modes to the active one", async ({ page }, info) => {
    await openApp(page, info.project.name, "&fixture=two-chambers");
    const ids = await page.evaluate(() => Array.from(window.__pecvdTwin!.host.world.instances.keys()) as string[]);
    expect(ids).toEqual(["PECVD-01.CH-A", "PECVD-01.CH-B"]);
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setActiveInstance("PECVD-01.CH-B");
      st.setViewMode("cutaway");
      st.select("lid");
    });
    await page.waitForTimeout(500);
    const kept = await page.evaluate(() => {
      const inst = window.__pecvdTwin!.host.world.instances;
      return { a: inst.get("PECVD-01.CH-A").kept[0].sweep, b: inst.get("PECVD-01.CH-B").kept[0].sweep };
    });
    expect(kept.a).toBeCloseTo(Math.PI * 2, 6);
    expect(kept.b).toBeLessThan(Math.PI * 2 - 0.5);
    const names = await page.evaluate(() => window.__pecvdTwin!.host.world.scene.meshes.map((m: { name: string }) => m.name) as string[]);
    expect(new Set(names).size).toBe(names.length);
  });
});
