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

async function useScenario(page: Page, id: string, instance?: string) {
  await page.evaluate(
    ([id, instance]) => {
      const st = window.__pecvdTwin!.store.getState();
      if (instance) st.setActiveInstance(instance);
      st.setScenario(id);
      st.setFollowPhase(false);
    },
    [id, instance] as const,
  );
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__pecvdTwin!.scenario())).toBe(id);
}

/** Holder switches of the active scenario found by scanning the pure evaluator in the page. */
async function holderSwitches(page: Page, duration: number, step = 0.02) {
  return page.evaluate(
    ([duration, step]) => {
      const api = window.__pecvdTwin!;
      const out: { t: number; from: string; to: string }[] = [];
      const key = (p: any) => {
        const h = p.wafers["W-01"].holder;
        return `${h.kind}:${h.attachment ?? h.slotId ?? ""}`;
      };
      let prev = key(api.evaluateAt(0));
      for (let t = step; t <= duration; t += step) {
        const k = key(api.evaluateAt(t));
        if (k !== prev) {
          // refine by bisection
          let a = t - step;
          let b = t;
          for (let i = 0; i < 30; i++) {
            const m = (a + b) / 2;
            if (key(api.evaluateAt(m)) === prev) a = m;
            else b = m;
          }
          out.push({ t: b, from: prev, to: k });
          prev = k;
        }
      }
      return out;
    },
    [duration, step] as const,
  );
}

async function meshesAt(page: Page, t: number) {
  await page.evaluate((t) => window.__pecvdTwin!.freezeTime(t), t);
  await page.waitForTimeout(160);
  return page.evaluate(() => window.__pecvdTwin!.waferMeshes().filter((m) => !m.instanceId.startsWith("W-")));
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test.describe("Wafer handling: robots, load lock, CMP front end", () => {
  test("CCP handling: exactly one wafer mesh, no visible jump at any holder switch", async ({ page }, info) => {
    const errors = await openApp(page, info.project.name);
    await useScenario(page, "ccp-handling-cycle-v1", "PECVD-01.CH-A");
    const duration = (await page.evaluate(() => window.__pecvdTwin!.store.getState().timeline.durationSec)) as number;
    const switches = await holderSwitches(page, duration);
    // holder kinds in order (the stage holder also switches its attachment between lift pins and stage surface)
    const kinds = switches.map((s) => s.to.split(":")[0]).filter((k, i, a) => i === 0 || k !== a[i - 1]);
    expect(kinds).toEqual(["end_effector", "loadlock_support", "transfer_blade", "process_stage", "transfer_blade", "loadlock_support", "end_effector", "carrier_slot"]);
    expect(switches.filter((s) => s.to === "process_stage:stage_surface").length).toBe(1);
    for (const s of switches) {
      const a = await meshesAt(page, s.t - 0.01);
      const b = await meshesAt(page, s.t + 0.01);
      expect(a.length, `before ${s.to} @ ${s.t.toFixed(3)}`).toBe(1);
      expect(b.length, `after ${s.to} @ ${s.t.toFixed(3)}`).toBe(1);
      expect(dist(a[0].center, b[0].center), `${s.from} -> ${s.to} @ ${s.t.toFixed(3)}`).toBeLessThan(0.004);
    }
    for (let t = 0; t < duration; t += 3.1) expect((await meshesAt(page, t)).length, `t=${t}`).toBe(1);
    expect(errors.filter((e) => !e.includes("Outdated Optimize Dep"))).toEqual([]);
  });

  test("CMP: dry robot, flip, wet robot, cup, head, cleaner, dryer; face orientation and wet state follow the holder", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await useScenario(page, "sti-cmp-cycle-v2", "CMP-01");
    const duration = (await page.evaluate(() => window.__pecvdTwin!.store.getState().timeline.durationSec)) as number;
    const switches = await holderSwitches(page, duration);
    expect(switches.map((s) => s.to)).toEqual([
      "end_effector:dry_robot",
      "flip_station:flip_jaws",
      "end_effector:wet_robot",
      "load_cup:load_cup_pins",
      "cmp_head:carrier_head",
      "load_cup:load_cup_pins",
      "end_effector:wet_robot",
      "clean_module:edge_rollers",
      "end_effector:wet_robot",
      "dry_module:spin_chuck",
      "end_effector:dry_robot",
      "carrier_slot:slot-13",
    ]);
    // presented mesh continuity at the handling switches (the head pick / release is checked by the polish tests)
    for (const s of switches.filter((x) => !x.to.startsWith("cmp_head") && !x.from.startsWith("cmp_head"))) {
      const a = await meshesAt(page, s.t - 0.01);
      const b = await meshesAt(page, s.t + 0.01);
      expect(a.length).toBe(1);
      expect(b.length).toBe(1);
      expect(dist(a[0].center, b[0].center), `${s.from} -> ${s.to} @ ${s.t.toFixed(3)}`).toBeLessThan(0.004);
    }
    const states = await page.evaluate(
      ([sw]) => {
        const api = window.__pecvdTwin!;
        const at = (t: number) => api.evaluateAt(t).wafers["W-01"];
        return { cup: at(sw[3].t + 0.5), head: at(sw[4].t + 3), cleaner: at(sw[7].t + 0.5), dryer: at(sw[9].t + 0.3), end: at(sw[11].t + 0.5) };
      },
      [switches] as const,
    );
    expect(states.cup.frontsideNormalLocal[1]).toBeCloseTo(-1, 6);
    expect(states.head.frontsideNormalLocal[1]).toBeCloseTo(-1, 6);
    expect(states.cleaner.frontsideNormalLocal[1]).toBeCloseTo(1, 6);
    expect(states.cleaner.wetState).toBe("wet_dirty");
    expect(states.dryer.wetState).toBe("wet_clean");
    expect(states.end.wetState).toBe("dry");
    expect(states.end.holder.kind).toBe("carrier_slot");
  });

  test("covers: auto opens only the active tool, closed and removed apply to all; covers never change a door", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await useScenario(page, "ccp-handling-cycle-v1", "PECVD-01.CH-A");
    await page.evaluate(() => window.__pecvdTwin!.freezeTime(12));
    await page.waitForTimeout(200);
    const doors = () => page.evaluate(() => JSON.stringify(window.__pecvdTwin!.preview().instances["PECVD-01.CH-A"].joints));
    const before = await doors();
    const auto = await page.evaluate(() => window.__pecvdTwin!.covers());
    expect(auto["PECVD-01.CH-A"]).toBe(true);
    expect(auto["CMP-01"]).toBe(false);
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setCoverMode("closed"));
    await page.waitForTimeout(250);
    const closed = await page.evaluate(() => window.__pecvdTwin!.covers());
    expect(Object.values(closed).filter((v) => v !== null).every((v) => v === false)).toBe(true);
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setCoverMode("removed"));
    await page.waitForTimeout(250);
    const removed = await page.evaluate(() => window.__pecvdTwin!.covers());
    expect(Object.values(removed).filter((v) => v !== null).every((v) => v === true)).toBe(true);
    expect(await doors()).toBe(before);
  });

  test("exploded view freezes robot, wafer and carrier together and restores the evaluator state on exit", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await useScenario(page, "ccp-handling-cycle-v1", "PECVD-01.CH-A");
    await page.evaluate(() => window.__pecvdTwin!.freezeTime(9));
    await page.waitForTimeout(200);
    const t9 = await page.evaluate(() => JSON.stringify(window.__pecvdTwin!.preview()));
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setViewMode("exploded"));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__pecvdTwin!.freezeTime(30));
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => JSON.stringify(window.__pecvdTwin!.preview()))).toBe(t9);
    await page.evaluate(() => window.__pecvdTwin!.store.getState().setViewMode("assembled"));
    await page.waitForTimeout(250);
    const p = await page.evaluate(() => window.__pecvdTwin!.preview());
    expect(p.t).toBeCloseTo(30, 6);
    expect(p.wafers["W-01"].holder.kind).toBe("process_stage");
  });

  test("two-chambers fixture: the rotated instance keeps its own station frame and wafer", async ({ page }, info) => {
    await openApp(page, info.project.name, "&fixture=two-chambers");
    const st = await page.evaluate(() => window.__pecvdTwin!.stations());
    expect(Math.abs(st["LP.PECVD-01.CH-B"].seatWorld[0] - (1.25 + 1.974))).toBeLessThan(1e-6);
    expect(Math.abs(st["LP.PECVD-01.CH-A"].seatWorld[0] - (-1.25 - 1.974))).toBeLessThan(1e-6);
    await page.evaluate(() => window.__pecvdTwin!.freezeTime(5));
    await page.waitForTimeout(250);
    const meshes = await page.evaluate(() => window.__pecvdTwin!.waferMeshes());
    const b = meshes.filter((m) => m.instanceId === "PECVD-01.CH-B");
    expect(b.length).toBe(1);
    expect(Math.abs(b[0].center[0] - 1.25)).toBeLessThan(0.01);
  });

  test("tree pick of a robot link selects its own component, not the whole robot", async ({ page }, info) => {
    await openApp(page, info.project.name);
    await useScenario(page, "ccp-handling-cycle-v1", "PECVD-01.CH-A");
    await page.getByTestId("tree-item-atm_robot_link1").locator("button").first().click();
    expect(await page.evaluate(() => window.__pecvdTwin!.store.getState().selectedAssetId)).toBe("atm_robot_link1");
    await expect(page.getByTestId("tree-item-atm_robot_link1")).toHaveAttribute("data-selected", "true");
  });
});
