import { test, expect, type Page } from "@playwright/test";

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

test.describe("Expansion: Remote ICP PECVD, STI CMP, OHT", () => {
  test("loads the four equipment templates plus the FOUP, with no backend and no console errors", async ({ page }, info) => {
    const errors = await openApp(page, info.project.name);
    const ids = await page.evaluate(() => (window.__pecvdTwin!.stats() as { instances: string[] }).instances);
    expect(ids).toEqual(["PECVD-01.CH-A", "REMOTE-01", "CMP-01", "OHT-01", "FOUP-01"]);
    // the original CCP keeps its default scenario and identity
    expect(await page.evaluate(() => window.__pecvdTwin!.scenario())).toBe("ccp-illustrative-cycle-v1");
    await expect(page.getByTestId("instance-select")).toBeVisible();
    expect(errors.filter((e) => !e.includes("Outdated Optimize Dep"))).toEqual([]);
  });

  test("switching equipment switches the component tree and standalone scenario", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.getByTestId("instance-select").selectOption("REMOTE-01");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("tree-item-discharge_tube")).toBeVisible();
    await expect(page.getByTestId("tree-item-induction_coil")).toBeVisible();
    expect(await page.evaluate(() => window.__pecvdTwin!.scenario())).toBe("remote-icp-cycle-v1");
    await page.getByTestId("instance-select").selectOption("CMP-01");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("tree-item-retaining_ring")).toBeVisible();
    expect(await page.evaluate(() => window.__pecvdTwin!.scenario())).toBe("sti-cmp-cycle-v2");
    await page.getByTestId("instance-select").selectOption("OHT-01");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("tree-item-gripper_plate")).toBeVisible();
    expect(await page.evaluate(() => window.__pecvdTwin!.scenario())).toBe("oht-transfer-v1");
  });

  test("remote source glow sits inside the discharge tube, far above the wafer; no glow slab over the wafer", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setActiveInstance("REMOTE-01"));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__pecvdTwin!.freezeTime(20));
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const inst = window.__pecvdTwin!.host.world.instances.get("REMOTE-01");
      const L = inst.bundle.layout;
      const glow = inst.plasma.mesh;
      glow.computeWorldMatrix(true);
      const b = glow.getBoundingInfo().boundingBox;
      return { glowMinY: b.minimumWorld.y - inst.root.position.y, glowMaxY: b.maximumWorld.y - inst.root.position.y, tubeY0: L.tube.y0, tubeY1: L.tube.y1, waferTopY: L.waferTopY, enabled: glow.isEnabled() };
    });
    expect(r.enabled).toBe(true);
    expect(r.glowMinY).toBeGreaterThan(r.tubeY0 - 0.01);
    expect(r.glowMaxY).toBeLessThan(r.tubeY1 + 0.01);
    expect(r.glowMinY - r.waferTopY).toBeGreaterThan(0.3);
  });

  test("CMP: polishing contact puts the wafer frontside on the pad; cutaway opens head and pad together", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setActiveInstance("CMP-01");
    });
    await page.waitForTimeout(300);
    // sti-cmp-cycle-v2: the polish segment starts after the front-end handling (25.32 s); bulk polish at +15 s
    await page.evaluate(() => window.__pecvdTwin!.freezeTime(25.32 + 15));
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const inst = window.__pecvdTwin!.host.world.instances.get("CMP-01");
      const L = inst.bundle.layout;
      const pad = inst.meshesByAsset.get("pad")[0];
      pad.computeWorldMatrix(true);
      // two-tone wafer: take the lowest point of both halves (the frontside half faces the pad)
      const waferMinY = Math.min(
        ...inst.meshesByAsset.get("wafer").map((m: any) => {
          m.computeWorldMatrix(true);
          return m.getBoundingInfo().boundingBox.minimumWorld.y as number;
        }),
      );
      return { waferMinY, padMaxY: pad.getBoundingInfo().boundingBox.maximumWorld.y, contact: L.head.liftContact, holder: window.__pecvdTwin!.preview().wafers["W-01"].holder.kind, normal: window.__pecvdTwin!.preview().wafers["W-01"].frontsideNormalLocal };
    });
    expect(Math.abs(r.waferMinY - r.padMaxY)).toBeLessThan(0.0015);
    expect(r.holder).toBe("cmp_head");
    expect(r.normal).toEqual([0, -1, 0]);
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setViewMode("cutaway");
      st.setCutaway({ azimuthDeg: 270, sweepDeg: 100 });
    });
    await page.waitForTimeout(500);
    const kept = await page.evaluate(() => window.__pecvdTwin!.host.world.instances.get("CMP-01").kept[0].sweep as number);
    expect(kept).toBeLessThan(Math.PI * 2 - 0.5);
    // spin joints are held at 0 while the sector cutaway is active (sector must not turn with the parts)
    const platenRot = await page.evaluate(() => window.__pecvdTwin!.host.world.instances.get("CMP-01").jointValues.platen_spin as number);
    expect(platenRot).toBe(0);
  });

  test("OHT: the same FOUP entity moves load port → gripper → load port without a pose jump; reverse scrub restores holders", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setScenario("oht-transfer-v1");
      st.setActiveInstance("OHT-01");
    });
    await page.waitForTimeout(400);
    const sample = async (t: number) => {
      await page.evaluate((t) => window.__pecvdTwin!.freezeTime(t), t);
      await page.waitForTimeout(120);
      return page.evaluate(() => {
        const w = window.__pecvdTwin!.host.world;
        const foup = w.instances.get("FOUP-01");
        const p = window.__pecvdTwin!.preview();
        const foupMeshes = w.scene.meshes.filter((m: { metadata?: { instanceId?: string } }) => m.metadata?.instanceId === "FOUP-01").length;
        return { pos: foup.root.position.asArray() as number[], holder: p.carriers["FOUP-01"].holder, foupMeshes, travel: p.instances["OHT-01"].joints.travel as number };
      });
    };
    // phase table of oht-transfer-v1: ready 0-2, align 2-8, lower 8-12, engage 12-13.5, lift loaded 13.5-17.5,
    // travel 17.5-25.5, align 25.5-26.5, lower loaded 26.5-30.5, seat/release 30.5-32, lift empty 32-36
    const P = { engage: 12.0, liftStart: 13.5, release: 30.5 };
    const a = await sample(P.liftStart - 0.05);
    const b = await sample(P.liftStart + 0.05);
    expect(a.holder.kind).toBe("station");
    expect(b.holder.kind).toBe("gripper");
    // continuity across the capture boundary (no jump)
    expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2])).toBeLessThan(0.01);
    expect(b.foupMeshes).toBe(a.foupMeshes); // one mesh entity, never duplicated
    const c = await sample(P.release - 0.05);
    const d = await sample(P.release + 0.05);
    expect(c.holder.kind).toBe("gripper");
    expect(d.holder).toEqual({ kind: "station", id: "LP.CMP-01" });
    expect(Math.hypot(c.pos[0] - d.pos[0], c.pos[1] - d.pos[1], c.pos[2] - d.pos[2])).toBeLessThan(0.01);
    // carried FOUP travels with the vehicle
    const mid = await sample(21);
    expect(mid.holder.kind).toBe("gripper");
    const vehicleZ = await page.evaluate(() => {
      const oht = window.__pecvdTwin!.host.world.instances.get("OHT-01");
      const n = oht.jointNodes.get("hoist");
      n.computeWorldMatrix(true);
      return n.getAbsolutePosition().z as number;
    });
    expect(Math.abs(mid.pos[2] - vehicleZ)).toBeLessThan(0.01);
    // reverse scrub: back to the source station, no accumulated history
    const back = await sample(5);
    expect(back.holder).toEqual({ kind: "station", id: "LP.PECVD-01.CH-A" });
    expect(Math.hypot(back.pos[0] - a.pos[0], back.pos[1] - a.pos[1], back.pos[2] - a.pos[2])).toBeLessThan(1e-6);
    expect(await page.evaluate(() => window.__pecvdTwin!.preview().blockedReason)).toBeNull();
  });

  test("Route A: rewinding from CMP to before deposition restores slot occupancy, holders and the incoming film state", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setScenario("route-a-linked-v2"));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__pecvdTwin!.scenario())).toBe("route-a-linked-v2");
    const at = async (t: number) => {
      await page.evaluate((t) => window.__pecvdTwin!.freezeTime(t), t);
      await page.waitForTimeout(150);
      return page.evaluate(() => {
        const p = window.__pecvdTwin!.preview();
        const w = p.wafers["W-01"];
        return { slot: p.carriers["FOUP-01"].slots["slot-13"], holder: w.holder.kind, overcoat: w.film.layers.find((l: { layerId: string }) => l.layerId === "demo_overcoat").presentFraction, nitride: w.film.nitrideExposed, status: w.film.status, presented: Object.values(p.instances).filter((i: any) => i.presentedWaferId).map((i: any) => i.instanceId) };
      });
    };
    // route A v2: external 0-2 s, station load 2-27.2 s, CCP process 27.2-45.2 s, unload 45.2-71.6 s,
    // OHT 71.6-109.6 s, CMP 109.6-224.76 s (polish from +25.32 s), complete 224.76-227.76 s
    const late = await at(226.5);
    expect(late.holder).toBe("carrier_slot");
    expect(late.slot).toBe("W-01");
    expect(late.overcoat).toBe(0);
    expect(late.nitride).toBe(true);
    expect(late.presented).toEqual(["FOUP-01"]);
    const polishing = await at(149.9);
    expect(polishing.holder).toBe("cmp_head");
    expect(polishing.presented).toEqual(["CMP-01"]);
    expect(polishing.slot).toBeNull();
    const dep = await at(27.2 + 9);
    expect(dep.holder).toBe("process_stage");
    expect(dep.presented).toEqual(["PECVD-01.CH-A"]);
    expect(dep.overcoat).toBeGreaterThan(0);
    expect(dep.overcoat).toBeLessThan(1);
    const handling = await at(12);
    expect(["end_effector", "loadlock_support"]).toContain(handling.holder);
    expect(handling.presented).toEqual(["PECVD-01.CH-A"]);
    expect(handling.slot).toBeNull();
    const early = await at(1);
    expect(early.holder).toBe("carrier_slot");
    expect(early.slot).toBe("W-01");
    expect(early.overcoat).toBe(0);
    expect(early.nitride).toBe(false);
    expect(early.status).toBe("incoming");
    expect(early.presented).toEqual(["FOUP-01"]);
  });

  test("two CMP instances: cutaway, hidden parts and markers stay independent", async ({ page }, info) => {
    await openApp(page, info.project.name, "&fixture=two-cmps");
    const ids = await page.evaluate(() => (window.__pecvdTwin!.stats() as { instances: string[] }).instances);
    expect(ids).toEqual(["CMP-01", "CMP-02"]);
    await page.evaluate(() => {
      const st = window.__pecvdTwin!.store.getState();
      st.setActiveInstance("CMP-02");
      st.setViewMode("cutaway");
      st.setHidden("head_housing", true);
      st.setOverlay("markers", true);
    });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const w = window.__pecvdTwin!.host.world;
      const a = w.instances.get("CMP-01");
      const b = w.instances.get("CMP-02");
      return {
        keptA: a.kept[0].sweep as number,
        keptB: b.kept[0].sweep as number,
        housingA: a.assetNodes.get("head_housing").isEnabled() as boolean,
        housingB: b.assetNodes.get("head_housing").isEnabled() as boolean,
        names: w.scene.meshes.map((m: { name: string }) => m.name) as string[],
      };
    });
    expect(r.keptA).toBeCloseTo(Math.PI * 2, 6);
    expect(r.keptB).toBeLessThan(Math.PI * 2 - 0.5);
    expect(r.housingA).toBe(true);
    expect(r.housingB).toBe(false);
    expect(new Set(r.names).size).toBe(r.names.length);
  });

  test("repeated instance / scenario / view switches do not accumulate scene resources", async ({ page }, info) => {
    await openApp(page, info.project.name);
    const snapshot = () => page.evaluate(() => {
      const s = window.__pecvdTwin!.host.world.scene;
      return [s.meshes.length, s.materials.length, s.textures.length, s.lights.length, s.transformNodes.length];
    });
    const cycle = async () => {
      for (const [inst, scen] of [["REMOTE-01", "remote-icp-cycle-v1"], ["CMP-01", "sti-cmp-cycle-v2"], ["OHT-01", "oht-transfer-v1"], ["PECVD-01.CH-A", "route-a-linked-v2"]] as const) {
        await page.evaluate(([inst, scen]) => {
          const st = window.__pecvdTwin!.store.getState();
          st.setActiveInstance(inst);
          st.setScenario(scen);
          st.setViewMode("cutaway");
          st.setOverlay("markers", true);
        }, [inst, scen] as const);
        await page.waitForTimeout(200);
        await page.evaluate(() => {
          const st = window.__pecvdTwin!.store.getState();
          st.setViewMode("xray");
          st.select("wafer");
        });
        await page.waitForTimeout(100);
        await page.evaluate(() => {
          const st = window.__pecvdTwin!.store.getState();
          st.setViewMode("exploded");
          st.setOverlay("markers", false);
          st.setViewMode("assembled");
          st.select(null);
        });
        await page.waitForTimeout(100);
      }
    };
    await cycle();
    const first = await snapshot();
    await cycle();
    const second = await snapshot();
    expect(second).toEqual(first);
  });
});
