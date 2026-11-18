import { test, expect, type Page } from "@playwright/test";

const isWebGPUProject = (name: string) => name.includes("webgpu");

async function openApp(page: Page, projectName: string) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/${isWebGPUProject(projectName) ? "?" : "?renderer=webgl2"}`);
  await page.waitForFunction(() => !!window.__pecvdTwin && window.__pecvdTwin.isReady(), null, { timeout: 90_000 });
  await page.waitForTimeout(500);
  return errors;
}

async function useScenario(page: Page, id: string, instance: string, t: number) {
  await page.evaluate(
    ([id, instance]) => {
      const st = window.__pecvdTwin!.store.getState();
      st.setActiveInstance(instance);
      st.setScenario(id);
      st.setFollowPhase(false);
    },
    [id, instance] as const,
  );
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__pecvdTwin!.scenario())).toBe(id);
  await freeze(page, t);
}

async function freeze(page: Page, t: number) {
  await page.evaluate((t) => window.__pecvdTwin!.freezeTime(t), t);
  await page.waitForTimeout(250);
}

const cuts = (page: Page) => page.evaluate(() => window.__pecvdTwin!.cuts());
const foupWafers = (page: Page) => page.evaluate(() => window.__pecvdTwin!.waferMeshes().filter((m) => m.instanceId === "FOUP-01"));
/** Enabled section caps of the FOUP (cut faces of shell, ribs, wafers). */
const foupCaps = (page: Page) => page.evaluate(() => window.__pecvdTwin!.host.world.scene.meshes.filter((m: any) => m.metadata?.instanceId === "FOUP-01" && m.metadata?.isCap && m.isEnabled()).length as number);

test.describe("FOUP section view", () => {
  test("top-bar toggle cuts only the FOUP; the count and slot map follow the scripted slot map", async ({ page }, info) => {
    const errors = await openApp(page, info.project.name);
    await useScenario(page, "ccp-handling-cycle-v1", "PECVD-01.CH-A", 0.5);
    expect((await cuts(page))["FOUP-01"]).toBeNull();
    await expect(page.getByTestId("carrier-inset")).toHaveCount(0);

    await page.getByTestId("carrier-section-button").click();
    await page.waitForTimeout(300);
    const on = await cuts(page);
    // back half removed (removed sector centered at 180 deg, 180 deg wide): kept from 270 deg over 180 deg
    expect(on["FOUP-01"]).toHaveLength(1);
    expect(on["FOUP-01"]![0].startDeg).toBeCloseTo(270, 3);
    expect(on["FOUP-01"]![0].sweepDeg).toBeCloseTo(180, 3);
    for (const id of ["PECVD-01.CH-A", "REMOTE-01", "CMP-01", "OHT-01"]) expect(on[id], id).toBeNull();
    expect(await foupCaps(page)).toBeGreaterThan(0);

    const inset = page.getByTestId("carrier-inset");
    await expect(inset).toBeVisible();
    await expect(inset.getByTestId("foup-wafer-count")).toHaveAttribute("data-count", "1");
    await expect(inset.locator('[data-occupied="1"]')).toHaveCount(1);
    await expect(inset.locator('[data-slot="13"]')).toHaveAttribute("data-occupied", "1");
    // the slot-13 wafer is drawn inside the carrier at its slot height
    const seatY = await page.evaluate(() => window.__pecvdTwin!.host.world.instances.get("FOUP-01").root.position.y as number);
    const inSlot = await foupWafers(page);
    expect(inSlot).toHaveLength(1);
    expect(inSlot[0].center[1] - seatY).toBeCloseTo(0.065 + 12 * 0.01 + 0.0003875, 3);

    // wafer on the CCP stage: the FOUP is empty and the panel says where W-01 is
    await freeze(page, 30);
    await expect(inset.getByTestId("foup-wafer-count")).toHaveAttribute("data-count", "0");
    await expect(inset.getByTestId("carrier-wafer-away")).toContainText("PECVD-01.CH-A");
    expect(await foupWafers(page)).toHaveLength(0);
    expect((await page.evaluate(() => window.__pecvdTwin!.waferMeshes())).some((m) => m.instanceId === "PECVD-01.CH-A")).toBe(true);

    await page.getByTestId("carrier-section-button").click();
    await page.waitForTimeout(300);
    expect((await cuts(page))["FOUP-01"]).toBeNull();
    expect(await foupCaps(page)).toBe(0);
    await expect(page.getByTestId("carrier-inset")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the section travels with the carrier; the active FOUP cutaway overrides it and the camera can focus the FOUP", async ({ page }, info) => {
    const errors = await openApp(page, info.project.name);
    await useScenario(page, "oht-transfer-v1", "OHT-01", 20);
    expect((await page.evaluate(() => window.__pecvdTwin!.preview().carriers["FOUP-01"].holder.kind))).toBe("gripper");
    await page.getByTestId("carrier-section-button").click();
    await page.waitForTimeout(300);
    expect((await cuts(page))["FOUP-01"]![0].sweepDeg).toBeCloseTo(180, 3);
    // the wafer rides in its slot through the transfer
    expect(await foupWafers(page)).toHaveLength(1);
    await expect(page.getByTestId("carrier-inset").getByTestId("foup-wafer-count")).toHaveAttribute("data-count", "1");

    // FOUP as the active instance: the cutaway sliders win while the cutaway view is on
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setActiveInstance("FOUP-01");
      st.setViewMode("cutaway");
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setCutaway({ azimuthDeg: 270, sweepDeg: 90 }));
    await page.waitForTimeout(400);
    const quarter = (await cuts(page))["FOUP-01"]!;
    expect(quarter[0].sweepDeg).toBeCloseTo(270, 3);
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setViewMode("assembled"));
    await page.waitForTimeout(300);
    expect((await cuts(page))["FOUP-01"]![0].sweepDeg).toBeCloseTo(180, 3);

    // camera to the FOUP from the cut side (button in the viewport inset); the active instance does not change
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setActiveInstance("PECVD-01.CH-A"));
    await page.waitForTimeout(300);
    await page.getByTestId("carrier-inset").getByTestId("focus-carrier").click();
    await page.waitForTimeout(1500);
    const cam = await page.evaluate(() => {
      const w = window.__pecvdTwin!.host.world;
      const foup = w.instances.get("FOUP-01").root.position;
      return { target: w.camera.target.asArray() as number[], foup: foup.asArray() as number[], pos: w.camera.globalPosition.asArray() as number[], active: window.__pecvdTwin!.store.getState().activeInstanceId };
    });
    expect(cam.active).toBe("PECVD-01.CH-A");
    expect(Math.hypot(cam.target[0] - cam.foup[0], cam.target[1] - cam.foup[1] - 0.19, cam.target[2] - cam.foup[2])).toBeLessThan(0.05);
    // looking from the removed (back, -X) side
    expect(cam.pos[0]).toBeLessThan(cam.foup[0]);
    expect(errors).toEqual([]);
  });
});
