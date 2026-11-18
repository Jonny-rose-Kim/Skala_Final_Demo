import { describe, expect, it } from "vitest";
import "../../src/equipment/index";
import { TAU, type Vec3Tuple } from "../../src/config/geometry";
import { attachedDirection, attachedPoint, jointGraphErrors } from "../../src/domain/kinematics";
import { DEFAULT_INSTANCES } from "../../src/domain/instances";
import { DEMO_CARRIER, DEMO_WAFER } from "../../src/domain/materialFlow";
import { listBundles } from "../../src/domain/registry";
import { meshDataBounds } from "../../src/geometry/meshlib/types";
import { evaluateTrack, stepStarts, trackHandoffs } from "../../src/presentation/motionTrack";
import type { ScenarioContext, StationWorldFrame } from "../../src/presentation/scenario";
import { getScenario } from "../../src/presentation/scenarioRegistry";
import { CMP_LAYOUT } from "../../src/equipment/cmp/layout";
import { cmpFrontJointValues, cmpFullState, CMP_PLAN, CMP_POLISH_SCENARIO, type CmpHolder } from "../../src/equipment/cmp/scenario";
import { scaraFK, scaraIK } from "../../src/equipment/handling/scara";

function stationsFor(instances = DEFAULT_INSTANCES): Record<string, StationWorldFrame> {
  const out: Record<string, StationWorldFrame> = {};
  for (const def of instances) {
    const st = listBundles().find((x) => x.template.templateId === def.templateId)?.template.station;
    if (!st) continue;
    const yaw = (def.rotationYDeg * Math.PI) / 180;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const [lx, ly, lz] = st.seatLocal;
    const dfx = st.doorFacingLocal[0] * cs + st.doorFacingLocal[2] * sn;
    const dfz = -st.doorFacingLocal[0] * sn + st.doorFacingLocal[2] * cs;
    const id = `LP.${def.instanceId}`;
    out[id] = { stationId: id, instanceId: def.instanceId, seatWorld: [def.position[0] + lx * cs + lz * sn, def.position[1] + ly, def.position[2] - lx * sn + lz * cs], yawRad: Math.atan2(dfx, dfz), doorFacing: [dfx, 0, dfz] };
  }
  return out;
}

const ctx: ScenarioContext = { instances: DEFAULT_INSTANCES, stations: stationsFor() };
const L = CMP_LAYOUT;
const F = L.front;
const fe = L.cfg.front_end;
const plan = CMP_PLAN;
const bundle = listBundles().find((b) => b.template.templateId === "sti_cmp_rotary_single_platen")!;
const joints = bundle.template.joints;
const t = L.waferThickness;
const dist = (a: Vec3Tuple, b: Vec3Tuple) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Wafer midplane center (instance frame) for a handling holder, from the authored rest geometry and the joints. */
function waferCenter(holder: CmpHolder, v: Record<string, number>): Vec3Tuple {
  const jv = cmpFrontJointValues(plan, v);
  switch (holder) {
    case "foup":
      return [-(F.loadPort.seatR - v.dock - F.foup.waferCenterX), F.slotY(plan.slot) + t / 2, -F.efem.qc];
    case "dry_robot": {
      const g = F.dry.geom;
      return attachedPoint(joints, jv, "dry_wrist", [g.axisXZ[0] + g.eeReach * g.d0[0], F.dry.shoulderY0 + F.dry.supportOffset + t / 2, g.axisXZ[1] + g.eeReach * g.d0[1]]);
    }
    case "flip":
      return attachedPoint(joints, jv, "flip_roll", [F.tower.x, F.tower.flipAxisY, F.tower.z]);
    case "wet_robot": {
      const g = F.wet.geom;
      return attachedPoint(joints, jv, "wet_roll", [g.axisXZ[0] + g.eeReach * g.d0[0], F.wet.rollAxisY0, g.axisXZ[1] + g.eeReach * g.d0[1]]);
    }
    case "load_cup":
      return [L.loadCup.x, F.cupPlaneY + t / 2, L.loadCup.z];
    case "cleaner":
      return [F.cleaner.x, F.cleaner.planeY + t / 2, F.cleaner.z];
    case "dryer":
      return attachedPoint(joints, jv, "dry_spin", [F.tower.x, F.tower.dryerPlaneY + t / 2, F.tower.z]);
    case "head":
      throw new Error("head holder is not part of the handling tracks");
  }
}

/** Frontside normal of the presentation mesh for a holder (authored orientation carried by the joints). */
function frontsideOf(holder: CmpHolder, v: Record<string, number>): Vec3Tuple {
  const jv = cmpFrontJointValues(plan, v);
  switch (holder) {
    case "flip":
      return attachedDirection(joints, jv, "flip_roll", [0, 1, 0]);
    case "wet_robot":
      return attachedDirection(joints, jv, "wet_roll", [0, -1, 0]);
    case "load_cup":
    case "head":
      return [0, -1, 0];
    default:
      return [0, 1, 0];
  }
}

const tracks = [
  { label: "in", steps: plan.inSteps, init: plan.inInitial, dur: plan.inDuration },
  { label: "out", steps: plan.outSteps, init: plan.outInitial, dur: plan.outDuration },
];

function sampleAll(step = 0.05) {
  const out: ReturnType<typeof cmpFullState>[] = [];
  for (let x = 0; x <= plan.total + 1e-9; x += step) out.push(cmpFullState(plan, x));
  return out;
}
const SAMPLES = sampleAll();

describe("CMP front end structure", () => {
  it("joint graph has no unknown parents or cycles, every part follows its component's joint", () => {
    expect(jointGraphErrors(joints)).toEqual([]);
    const comps = new Map(bundle.template.components.map((c) => [c.assetId, c]));
    for (const p of bundle.buildParts(bundle.layout)) {
      const c = comps.get(p.assetId)!;
      expect(c, p.assetId).toBeDefined();
      expect(p.jointId ?? c.jointId, `${p.key} (${p.assetId})`).toBe(c.jointId);
    }
  });
  it("presentation wafers are authored exactly on the handoff planes", () => {
    const parts = bundle.buildParts(bundle.layout);
    const bounds = (key: string) => meshDataBounds(parts.find((p) => p.key === key)!.build([{ start: 0, sweep: TAU }]));
    const near = (a: number, b: number, what: string) => expect(Math.abs(a - b), what).toBeLessThan(1e-6);
    const flip = bounds("wafer_on_flip");
    near(flip.min[1], F.tower.flipPlaneY, "flip wafer bottom");
    near((flip.min[0] + flip.max[0]) / 2, F.tower.x, "flip wafer x");
    near(bounds("wafer_in_dry").min[1], F.tower.dryerPlaneY, "dryer wafer bottom");
    near(bounds("wafer_in_clean").min[1], F.cleaner.planeY, "cleaner wafer bottom");
    near(Math.min(bounds("wafer_on_cup").min[1], bounds("wafer_on_cup_front").min[1]), F.cupPlaneY, "cup wafer bottom (pin top)");
    const dry = bounds("dry_wafer");
    near(dry.min[1], F.dry.shoulderY0 + F.dry.supportOffset, "dry robot wafer bottom");
    const wetB = bounds("wet_wafer");
    const wetF = bounds("wet_wafer_front");
    near((Math.min(wetB.min[1], wetF.min[1]) + Math.max(wetB.max[1], wetF.max[1])) / 2, F.wet.rollAxisY0, "wet robot wafer midplane on the roll axis");
  });
});

describe("CMP handling sequence (sti-cmp-cycle-v2)", () => {
  it("handoffs are continuous: wafer center identical at every holder switch and < 2 mm across +-5 ms", () => {
    const seen: string[] = [];
    for (const tr of tracks) {
      const events = trackHandoffs(tr.steps, tr.init);
      for (const e of events) {
        seen.push(`${e.from}->${e.to}`);
        const st = evaluateTrack(tr.steps, tr.init, e.t);
        expect(dist(waferCenter(e.from, st.values), waferCenter(e.to, st.values)), `${tr.label} ${e.stepId} ${e.from}->${e.to}`).toBeLessThan(1e-6);
        const before = evaluateTrack(tr.steps, tr.init, e.t - 0.005);
        const after = evaluateTrack(tr.steps, tr.init, e.t + 0.005);
        expect(before.holder).toBe(e.from);
        expect(after.holder).toBe(e.to);
        expect(dist(waferCenter(before.holder, before.values), waferCenter(after.holder, after.values)), `${tr.label} ${e.stepId}`).toBeLessThan(0.002);
        // the face orientation does not jump at a handoff either
        const fa = frontsideOf(e.from, st.values);
        const fb = frontsideOf(e.to, st.values);
        expect(fa[0] * fb[0] + fa[1] * fb[1] + fa[2] * fb[2], `${e.stepId} face`).toBeGreaterThan(1 - 1e-6);
      }
    }
    expect(seen).toEqual(["foup->dry_robot", "dry_robot->flip", "flip->wet_robot", "wet_robot->load_cup", "load_cup->wet_robot", "wet_robot->cleaner", "cleaner->wet_robot", "wet_robot->dryer", "dryer->dry_robot", "dry_robot->foup"]);
  });
  it("a wet wafer never returns to the FOUP and the dry robot only carries dry wafers", () => {
    let sawWet = false;
    for (const s of SAMPLES) {
      if (s.wetState !== "dry") sawWet = true;
      if (s.holder === "foup" || s.holder === "dry_robot" || s.holder === "flip") expect(s.wetState, `${s.stepId}`).toBe("dry");
    }
    expect(sawWet).toBe(true);
    const end = cmpFullState(plan, plan.total);
    expect(end.holder).toBe("foup");
    expect(end.wetState).toBe("dry");
  });
  it("the wafer is turned over only while it is clamped (flip jaws or wet edge grip)", () => {
    for (let i = 1; i < SAMPLES.length; i++) {
      const a = SAMPLES[i - 1];
      const b = SAMPLES[i];
      if (Math.abs(b.values.flipRoll - a.values.flipRoll) > 1e-9 && (a.holder === "flip" || b.holder === "flip")) {
        expect(a.values.flipJaw, `flip jaw at ${b.stepId}`).toBeCloseTo(fe.tower.flip_jaw_travel, 9);
        expect(b.values.flipJaw).toBeCloseTo(fe.tower.flip_jaw_travel, 9);
      }
      if (Math.abs(b.values.wRoll - a.values.wRoll) > 1e-9 && (a.holder === "wet_robot" || b.holder === "wet_robot")) {
        expect(a.values.wGrip, `wet grip at ${b.stepId}`).toBeCloseTo(fe.wet_robot.grip_stroke ?? 0.008, 9);
        expect(b.values.wGrip).toBeCloseTo(fe.wet_robot.grip_stroke ?? 0.008, 9);
      }
      // an empty flip / roll may move back, but never while a support is half-closed on the wafer
    }
  });
  it("face orientation: face up in the FOUP, on the dry robot, in the cleaner and dryer; face down on the load cup and head", () => {
    for (const s of SAMPLES) {
      const f = s.frontside;
      if (["foup", "dry_robot", "cleaner", "dryer"].includes(s.holder)) expect(f[1], `${s.holder} ${s.stepId}`).toBeCloseTo(1, 6);
      if (s.holder === "load_cup" || s.holder === "head") expect(f[1], s.stepId).toBeCloseTo(-1, 6);
      const g = frontsideOf(s.holder, s.values);
      if (s.holder !== "head") expect(Math.abs(f[0] - g[0]) + Math.abs(f[1] - g[1]) + Math.abs(f[2] - g[2]), `${s.holder} ${s.stepId}`).toBeLessThan(1e-5);
    }
  });
  it("dirty-wet and clean-wet contacts are separated by the end-effector rinse", () => {
    const os = stepStarts(plan.outSteps);
    const st = (id: string, frac = 1) => evaluateTrack(plan.outSteps, plan.outInitial, os[id].start + (os[id].end - os[id].start) * frac - 1e-6);
    expect(st("wet_clamp_cup").flags.eeState).toBe("dirty");
    expect(st("clean_and_rinse", 0.5).flags.eeState).toBe("rinsing");
    expect(st("wet_clamp_cl2").flags.eeState).toBe("clean_ready");
    expect(os.clean_and_rinse.end).toBeLessThan(os.wet_clamp_cl2.start);
  });
  it("interlocks: one dryer shutter at a time, cleaner shutter closed while the brushes touch the wafer", () => {
    for (const tr of tracks) for (let x = 0; x <= tr.dur; x += 0.02) {
      const v = evaluateTrack(tr.steps, tr.init, x).values;
      expect(v.shutterWet > 1e-4 && v.shutterDry > 1e-4, `${tr.label} ${x.toFixed(2)}`).toBe(false);
      if (v.brushUp < fe.cleaner.brush_travel - 1e-4 || v.brushLow < fe.cleaner.brush_travel - 1e-4) expect(v.cleanShutter, `${tr.label} ${x.toFixed(2)}`).toBeLessThan(1e-4);
      if (v.dryChuck < -1e-4) expect(v.shutterWet + v.shutterDry, "dryer closed while the chuck spins").toBeLessThan(1e-4);
    }
  });
  it("nothing passes a closed opening: FOUP door, dryer shutters, cleaner shutter", () => {
    const R = L.rWafer;
    const cl = F.cleaner;
    const tw = F.tower;
    for (const tr of tracks) for (let x = 0; x <= tr.dur; x += 0.02) {
      const v = evaluateTrack(tr.steps, tr.init, x).values;
      const d = scaraFK(F.dry.geom, scaraIK(F.dry.geom, v.dRho, v.dTheta)).wafer;
      const w = scaraFK(F.wet.geom, scaraIK(F.wet.geom, v.wRho, v.wTheta)).wafer;
      const at = `${tr.label} ${x.toFixed(2)}`;
      // dry robot: wafer edge beyond the EFEM front wall (r = -x) needs the FOUP door lowered
      if (-d[0] + R > F.efem.r1) expect(v.doorLower, `FOUP door ${at}`).toBeGreaterThan(F.loadPort.doorLower - 1e-6);
      // dry robot into the dryer through the dry-side face (x = tower.x - half)
      if (Math.abs(d[1] - tw.z) < tw.half && d[0] + R > tw.x - tw.half - 0.003 && Math.abs(v.dY - tw.dryerPlaneY) < 0.05) expect(v.shutterDry, `dry shutter ${at}`).toBeGreaterThan(fe.tower.shutter_travel - 1e-6);
      // wet robot into the dryer through the wet-side face (x = tower.x + half)
      if (Math.abs(w[1] - tw.z) < tw.half && w[0] - R < tw.x + tw.half + 0.003 && Math.abs(v.wY - (tw.dryerPlaneY + t / 2)) < 0.05) expect(v.shutterWet, `wet shutter ${at}`).toBeGreaterThan(fe.tower.shutter_travel - 1e-6);
      // wet robot into the cleaner through its front face (z = cleaner.z - depth / 2)
      if (Math.abs(w[0] - cl.x) < cl.size[0] / 2 && w[1] + R > cl.z - cl.size[2] / 2 - 0.003 && Math.abs(v.wY - (cl.planeY + t / 2)) < 0.05) expect(v.cleanShutter, `cleaner shutter ${at}`).toBeGreaterThan(fe.cleaner.shutter_travel - 1e-6);
    }
  });
  it("keeps every joint inside its declared range over the whole FOUP-to-FOUP sequence", () => {
    for (const s of SAMPLES) for (const j of joints) {
      const v = s.joints[j.jointId] ?? 0;
      expect(v, `${j.jointId} @ ${s.stepId}`).toBeGreaterThanOrEqual(j.range[0] - 1e-9);
      expect(v, `${j.jointId} @ ${s.stepId}`).toBeLessThanOrEqual(j.range[1] + 1e-9);
    }
  });
  it("FOUP undocked and closed at both ends; the polish segment keeps the robots parked", () => {
    for (const s of [cmpFullState(plan, 0), cmpFullState(plan, plan.total)]) {
      expect(s.values.dock).toBe(0);
      expect(s.values.doorPull).toBe(0);
      expect(s.values.doorLower).toBe(0);
    }
    const a = cmpFullState(plan, plan.polishStart + 0.01);
    const b = cmpFullState(plan, plan.outStart - 0.01);
    expect(b.values).toEqual(a.values);
    expect(CMP_POLISH_SCENARIO.durationSec).toBe(plan.outStart - plan.polishStart);
  });
});

describe("CMP standalone preview", () => {
  const def = getScenario("sti-cmp-cycle-v2")!;
  it("presents W-01 on exactly one asset at a time; slot-13 is occupied only while the holder is the slot", () => {
    expect(def).toBeDefined();
    const ids = new Set(bundle.template.waferPresentationAssetIds ?? bundle.template.station?.waferPresentationAssetIds);
    for (let x = 0; x <= def.scenario.durationSec; x += 0.1) {
      const p = def.evaluate(x, 7, x, ctx);
      const presenting = Object.values(p.instances).filter((i) => i.presentedWaferId === DEMO_WAFER.waferId);
      expect(presenting.length, `t=${x.toFixed(1)}`).toBe(1);
      const w = p.wafers[DEMO_WAFER.waferId];
      const inSlot = w.holder.kind === "carrier_slot";
      expect(p.carriers[DEMO_CARRIER.carrierId].slots["slot-13"] === DEMO_WAFER.waferId).toBe(inSlot);
      if (inSlot) expect(presenting[0].instanceId).toBe(DEMO_CARRIER.carrierId);
      else expect(ids.has(presenting[0].presentedWaferAssetId!), presenting[0].presentedWaferAssetId).toBe(true);
    }
  });
  it("is a pure function of time: reverse scrub reproduces earlier states exactly", () => {
    const x = plan.outStart + 12.3;
    const a = def.evaluate(x, 7, x, ctx);
    def.evaluate(plan.total - 1, 7, plan.total - 1, ctx);
    def.evaluate(3, 7, 3, ctx);
    expect(def.evaluate(x, 7, x, ctx)).toEqual(a);
  });
});
