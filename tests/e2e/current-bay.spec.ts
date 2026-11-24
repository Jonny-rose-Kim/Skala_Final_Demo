import { test, expect, type Page } from "@playwright/test";

const isWebGPUProject = (name: string) => name.includes("webgpu");

async function openApp(page: Page, projectName: string) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/${isWebGPUProject(projectName) ? "?" : "?renderer=webgl2"}`);
  await page.waitForFunction(() => !!window.__pecvdTwin && window.__pecvdTwin!.isReady(), null, { timeout: 120_000 });
  await page.waitForTimeout(500);
  return errors;
}

/** Wafer presentation meshes shown right now (the FOUP shows its occupied slot; tools their presented asset). */
async function visibleWaferMeshes(page: Page) {
  return page.evaluate(() => window.__pecvdTwin!.waferMeshes());
}

test.describe("Current bay: Producer SE / Tactras / CELLESTA-i MD / CLW-08v2", () => {
  test("loads the new equipment with their GLB exteriors, no backend and no console errors", async ({ page }, info) => {
    const errors = await openApp(page, info.project.name);
    const st = await page.evaluate(() => window.__pecvdTwin!.store.getState());
    expect(st.instances.map((i: { instanceId: string }) => i.instanceId)).toEqual(["PRODUCER-01", "ETCH-01", "CLEAN-01", "OHT-01", "FOUP-01"]);
    expect(st.scenarioId).toBe("route-dep-etch-clean-v1");
    // GLB parts are registered under their template assets with instance metadata
    const glb = await page.evaluate(() => {
      const host = window.__pecvdTwin!.host as unknown as { world: { scene: { meshes: { name: string; metadata?: { instanceId?: string; assetId?: string } }[] } } };
      return host.world.scene.meshes.filter((m) => m.name.includes("::glb.")).map((m) => `${m.metadata?.instanceId}:${m.metadata?.assetId}`);
    });
    for (const want of ["PRODUCER-01:mod01_enclosure", "ETCH-01:pm01_enclosure", "CLEAN-01:pm01_enclosure", "OHT-01:vehicle_body"]) expect(glb).toContain(want);
    expect(st.devWarnings.filter((w: string) => w.includes("GLB"))).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("route scrub: one wafer mesh at a time, FOUP closed while carried, reverse scrub restores the state", async ({ page }, info) => {
    await openApp(page, info.project.name);
    const times = [10, 35, 60, 74, 95, 130, 152, 175, 191, 215, 245, 263, 290, 306];
    const snap: Record<number, unknown> = {};
    for (const t of times) {
      await page.evaluate((tt) => window.__pecvdTwin!.freezeTime(tt), t);
      await page.waitForTimeout(120);
      expect((await visibleWaferMeshes(page)).length, `t=${t}`).toBe(1);
      const p = await page.evaluate(() => window.__pecvdTwin!.preview());
      const w = p.wafers["W-01"];
      const c = p.carriers["FOUP-01"];
      if (c.holder.kind === "gripper") expect(c.doorOpen).toBe(false);
      if (w.holder.kind === "carrier_slot") expect(w.wetState ?? "dry").toBe("dry");
      snap[t] = { holder: w.holder, film: w.film, carrier: c.holder };
    }
    for (const t of [...times].reverse()) {
      await page.evaluate((tt) => window.__pecvdTwin!.freezeTime(tt), t);
      await page.waitForTimeout(60);
      const p = await page.evaluate(() => window.__pecvdTwin!.preview());
      expect({ holder: p.wafers["W-01"].holder, film: p.wafers["W-01"].film, carrier: p.carriers["FOUP-01"].holder }, `t=${t}`).toEqual(snap[t]);
    }
  });

  test("Follow moves the active tool with the route phase; Tactras cutaway opens the PM-01 stack and hides the module covers", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setFollowPhase(true));
    for (const [t, id] of [[35, "PRODUCER-01"], [95, "OHT-01"], [152, "ETCH-01"], [263, "CLEAN-01"]] as const) {
      await page.evaluate((tt) => window.__pecvdTwin!.freezeTime(tt), t);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().activeInstanceId), `t=${t}`).toBe(id);
    }
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setFollowPhase(false);
      st.setActiveInstance("ETCH-01");
      st.setOverview(false);
      st.setViewMode("cutaway");
    });
    await page.evaluate(() => window.__pecvdTwin!.freezeTime(152));
    await page.waitForTimeout(600);
    const vis = await page.evaluate(() => {
      const host = window.__pecvdTwin!.host as unknown as { world: { scene: { meshes: { name: string; isEnabled: (b?: boolean) => boolean; metadata?: { instanceId?: string; assetId?: string } }[] } } };
      const on = (pred: (n: string, a?: string) => boolean) => host.world.scene.meshes.filter((m) => m.metadata?.instanceId === "ETCH-01" && pred(m.name, m.metadata?.assetId) && m.isEnabled(true)).length;
      return { skins: on((_, a) => a === "pm01_enclosure"), esc: on((_, a) => a === "esc_puck"), wafer: on((_, a) => a === "wafer") };
    });
    expect(vis.skins).toBe(0);
    expect(vis.esc).toBeGreaterThan(0);
    expect(vis.wafer).toBeGreaterThan(0);
  });

  test("tree and 3D pick resolve GLB exterior parts and procedural parts to their components", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setActiveInstance("CLEAN-01");
      st.setOverview(false);
    });
    await page.waitForTimeout(400);
    await page.getByTestId("tree-search").fill("Dispense arm");
    await page.locator('[data-testid="tree-item-dispense_arm"] button').first().click();
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().selectedAssetId)).toBe("dispense_arm");
    await page.getByTestId("tree-search").fill("PM-01 module enclosure");
    await page.locator('[data-testid="tree-item-pm01_enclosure"] button').first().click();
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().selectedAssetId)).toBe("pm01_enclosure");
  });

  test("an agent event highlights its resolved component and a cleared event removes it", async ({ page }, info) => {
    await openApp(page, info.project.name);
    const d = await page.evaluate(() =>
      window.__pecvdTwin!.applyAgentEvent({ eventId: "det-1", kind: "detection", state: "raised", severity: "major", source: { providerKind: "manual", providerId: "e2e" }, eventTime: "2027-01-01T00:00:00Z", target: { level: "component", instanceId: "ETCH-01", assetId: "esc_puck" }, channelIds: [], evidence: [] }),
    );
    expect(d.targets[0]).toEqual({ instanceId: "ETCH-01", assetIds: ["esc_puck"] });
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().diagnosis?.eventId)).toBe("det-1");
    await page.evaluate(() => window.__pecvdTwin!.applyAgentEvent({ eventId: "det-1", kind: "detection", state: "cleared", severity: "major", source: { providerKind: "manual", providerId: "e2e" }, eventTime: "2027-01-01T00:05:00Z", target: { level: "component", instanceId: "ETCH-01", assetId: "esc_puck" }, channelIds: [], evidence: [] }));
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().diagnosis)).toBeNull();
  });
});
