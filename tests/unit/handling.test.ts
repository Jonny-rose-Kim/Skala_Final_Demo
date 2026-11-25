import { describe, expect, it } from "vitest";
import "../../src/equipment/index";
import { CHAMBER_LAYOUT, GEOMETRY_CONFIG, validateGeometryConfig, type Vec3Tuple } from "../../src/config/geometry";
import { listBundles } from "../../src/domain/registry";
import { attachedPoint, jointGraphErrors } from "../../src/domain/kinematics";
import type { JointDef } from "../../src/domain/types";
import { instanceFixture } from "../../src/domain/instances";
// these tests cover the legacy V1 bay (CCP / Remote / STI CMP / OHT): its instance set is the legacy-v1 fixture
const DEFAULT_INSTANCES = instanceFixture("legacy-v1")!;
import { DEMO_CARRIER, DEMO_WAFER } from "../../src/domain/materialFlow";
import { evaluateTrack, trackHandoffs } from "../../src/presentation/motionTrack";
import { smoothstep, smoothstepInverse } from "../../src/presentation/preview";
import type { ScenarioContext, StationWorldFrame } from "../../src/presentation/scenario";
import { getScenario } from "../../src/presentation/scenarioRegistry";
import { CCP_STATION_PLAN } from "../../src/equipment/ccp/handling";
import { REMOTE_STATION_PLAN } from "../../src/equipment/remote/handling";
import { REMOTE_CONFIG, validateRemoteConfig } from "../../src/equipment/remote/layout";
import { PRODUCER_STATION_PLAN } from "../../src/equipment/producer/handling";
import { PRODUCER_LAYOUT, validateProducerConfig } from "../../src/equipment/producer/layout";
import { TACTRAS_STATION_PLAN } from "../../src/equipment/tactras/handling";
import { validateTactrasConfig } from "../../src/equipment/tactras/layout";
import { scaraFK, scaraIK, type ScaraGeom } from "../../src/equipment/handling/scara";
import { stationPoint } from "../../src/equipment/handling/stationLayout";
import { STATION_IDS } from "../../src/equipment/handling/stationParts";
import { stationJointValues, type StationHolder, type StationPlan } from "../../src/equipment/handling/stationSequence";

function stationsFor(instances = DEFAULT_INSTANCES): Record<string, StationWorldFrame> {
  const out: Record<string, StationWorldFrame> = {};
  for (const def of instances) {
    const b = listBundles().find((x) => x.template.templateId === def.templateId);
    const st = b?.template.station;
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

/** Wafer bottom-center (instance frame) for a station holder, from the authored rest geometry and the joints. */
function waferPoint(plan: StationPlan, joints: JointDef[], holder: StationHolder, v: Record<string, number>): Vec3Tuple {
  const S = plan.S;
  const jv = stationJointValues(plan, v);
  switch (holder) {
    case "foup": {
      const r = S.loadPort.seatR - v.dock - S.foup.waferCenterX;
      return stationPoint(S, r, S.slotY(plan.slot), 0);
    }
    case "robot": {
      const rest = stationPoint(S, S.robot.axisR + S.cfg.atm_robot.ee_reach, S.robot.shoulderY0 + S.robot.supportOffset, 0);
      return attachedPoint(joints, jv, "atm_wrist", rest);
    }
    case "loadlock":
      return attachedPoint(joints, jv, "ll_pins", stationPoint(S, S.ll.centerR, S.ll.pinDropTop, 0));
    case "blade":
      return attachedPoint(joints, jv, "vac_blade_s2", stationPoint(S, S.blade.pocketRestR, S.planeY, 0));
    case "stage": {
      // process height of the stage top per chamber kinematics (Tactras: fixed lower electrode at 0)
      const processTop = plan === PRODUCER_STATION_PLAN ? PRODUCER_LAYOUT.pedestalTopY : plan.K.stageJoint === "pedestal_z" ? CHAMBER_LAYOUT.pedestalTopY : plan.K.stageJoint === "stage_z" ? REMOTE_CONFIG.stage.top_y : 0;
      return attachedPoint(joints, jv, "lift_pins_z", [0, processTop, 0]);
    }
  }
}

const dist = (a: Vec3Tuple, b: Vec3Tuple) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("motion track primitives", () => {
  it("inverse smoothstep inverts the profile", () => {
    for (let f = 0; f <= 1.0001; f += 0.05) expect(smoothstep(0, 1, smoothstepInverse(f))).toBeCloseTo(Math.min(f, 1), 9);
  });
  it("SCARA inverse kinematics round-trips through forward kinematics over the reachable range", () => {
    const g: ScaraGeom = { axisXZ: [0.3, -0.2], d0: [-1, 0], linkLength: 0.28, eeReach: 0.31 };
    for (let rho = 0; rho <= 0.85; rho += 0.05) {
      for (let th = -3; th <= 3; th += 0.5) {
        const fk = scaraFK(g, scaraIK(g, rho, th));
        const ex = g.axisXZ[0] + rho * (g.d0[0] * Math.cos(th) + g.d0[1] * Math.sin(th));
        const ez = g.axisXZ[1] + rho * (-g.d0[0] * Math.sin(th) + g.d0[1] * Math.cos(th));
        expect(Math.hypot(fk.wafer[0] - ex, fk.wafer[1] - ez)).toBeLessThan(1e-9);
      }
    }
  });
});

for (const [name, plan, templateId] of [
  ["CCP", CCP_STATION_PLAN, "ccp_pecvd_single_wafer_300"],
  ["Remote", REMOTE_STATION_PLAN, "remote_pecvd_upstream_icp"],
  ["Producer", PRODUCER_STATION_PLAN, "producer_se_ccp_twin_300"],
  ["Tactras", TACTRAS_STATION_PLAN, "tactras_oxide_ccp_rie_300"],
] as const) {
  describe(`${name} wafer handling station`, () => {
    const bundle = listBundles().find((b) => b.template.templateId === templateId)!;
    const joints = bundle.template.joints;
    const S = plan.S;
    const tracks = [
      { label: "load", steps: plan.load, init: plan.loadInitial, dur: plan.loadDuration },
      { label: "unload", steps: plan.unload, init: plan.unloadInitial, dur: plan.unloadDuration },
    ];
    it("config validates: load lock holds wafer + blade + pins + gate retreat, robot reach and swing, door openings", () => {
      const r = name === "CCP" ? validateGeometryConfig(GEOMETRY_CONFIG) : name === "Remote" ? validateRemoteConfig(REMOTE_CONFIG) : name === "Producer" ? validateProducerConfig() : validateTactrasConfig();
      expect(r.errors).toEqual([]);
      expect(S.ll.innerR1 - S.ll.innerR0).toBeGreaterThan(0.3 + 0.06);
    });
    it("joint graph has no unknown parents or cycles and every joint axis is a unit vector", () => {
      expect(jointGraphErrors(joints)).toEqual([]);
    });
    it("every part follows the joint of its component (motion hierarchy is not mixed inside one asset)", () => {
      const comps = new Map(bundle.template.components.map((c) => [c.assetId, c]));
      for (const p of bundle.buildParts(bundle.layout)) {
        const c = comps.get(p.assetId)!;
        expect(p.jointId ?? c.jointId, `${p.key} (${p.assetId})`).toBe(c.jointId);
      }
    });
    it("handoffs are continuous: the wafer pose is identical just before and after every holder switch", () => {
      for (const tr of tracks) {
        const events = trackHandoffs(tr.steps, tr.init);
        expect(events.length).toBe(4);
        for (const e of events) {
          const st = evaluateTrack(tr.steps, tr.init, e.t);
          const a = waferPoint(plan, joints, e.from, st.values);
          const b = waferPoint(plan, joints, e.to, st.values);
          expect(dist(a, b), `${tr.label} ${e.stepId} ${e.from}->${e.to}`).toBeLessThan(1e-6);
          // and the displayed pose moves less than 2 mm across +-5 ms around the switch
          const before = evaluateTrack(tr.steps, tr.init, e.t - 0.005);
          const after = evaluateTrack(tr.steps, tr.init, e.t + 0.005);
          expect(before.holder).toBe(e.from);
          expect(after.holder).toBe(e.to);
          expect(dist(waferPoint(plan, joints, before.holder, before.values), waferPoint(plan, joints, after.holder, after.values))).toBeLessThan(0.002);
        }
      }
    });
    it("the atmospheric door and the slit gate are never open at the same time", () => {
      for (const tr of tracks) for (let t = 0; t <= tr.dur; t += 0.02) {
        const v = evaluateTrack(tr.steps, tr.init, t).values;
        expect(v.llDoor > 0.0005 && v.slitGate > 0.0005, `${tr.label} t=${t.toFixed(2)}`).toBe(false);
      }
    });
    it("nothing passes a closed door: fork through the FOUP and load-lock doors, blade through the slit", () => {
      const ar = S.cfg.atm_robot;
      for (const tr of tracks) for (let t = 0; t <= tr.dur; t += 0.02) {
        const v = evaluateTrack(tr.steps, tr.init, t).values;
        const fk = scaraFK(S.robot.scara, scaraIK(S.robot.scara, v.rho, v.theta));
        const tipX = fk.wafer[0] + fk.eeDir[0] * ar.tip_beyond_center;
        const tipZ = fk.wafer[1] + fk.eeDir[1] * ar.tip_beyond_center;
        const tipR = tipX * S.u[0] + tipZ * S.u[1];
        const waferEdgeR = fk.wafer[0] * S.u[0] + fk.wafer[1] * S.u[1];
        if (tipR > S.efem.r1 - 0.005 || waferEdgeR + 0.15 > S.efem.r1 - 0.005) expect(v.doorLower, `FOUP door at t=${t.toFixed(2)} (${tr.label})`).toBeGreaterThan(S.loadPort.doorLower - 1e-6);
        if (Math.min(tipR, waferEdgeR - 0.15) < S.atmDoor.r1 + 0.002) expect(v.llDoor, `LL door at t=${t.toFixed(2)} (${tr.label})`).toBeGreaterThan(S.atmDoor.gateTravel - 1e-6);
        const bladeTipR = S.blade.pocketRestR - v.blade - S.cfg.vacuum_blade.tip_beyond_pocket;
        if (bladeTipR < S.slit.valveR1 + 0.002) expect(v.slitGate, `slit gate at t=${t.toFixed(2)} (${tr.label})`).toBeGreaterThan(plan.K.gateTravel - 1e-6);
      }
    });
    it("keeps every joint inside its declared range", () => {
      const byId = new Map(joints.map((j) => [j.jointId, j]));
      for (const tr of tracks) for (let t = 0; t <= tr.dur; t += 0.05) {
        const jv = stationJointValues(plan, evaluateTrack(tr.steps, tr.init, t).values);
        for (const [id, v] of Object.entries(jv)) {
          const j = byId.get(id);
          expect(j, id).toBeDefined();
          expect(v, `${id} at ${t.toFixed(2)}`).toBeGreaterThanOrEqual(j!.range[0] - 1e-9);
          expect(v, `${id} at ${t.toFixed(2)}`).toBeLessThanOrEqual(j!.range[1] + 1e-9);
        }
      }
    });
    it("the FOUP is undocked with the door closed at both ends (OHT handoff precondition)", () => {
      const a = plan.loadInitial.values;
      const b = evaluateTrack(plan.unload, plan.unloadInitial, plan.unloadDuration + 1).values;
      for (const v of [a, b]) {
        expect(v.dock).toBe(0);
        expect(v.doorPull).toBe(0);
        expect(v.doorLower).toBe(0);
      }
    });
  });
}

describe("CCP handling scenario (preview)", () => {
  const def = getScenario("ccp-handling-cycle-v1")!;
  it("exists and presents W-01 on exactly one asset at a time; slot-13 is occupied only while the holder is the slot", () => {
    expect(def).toBeDefined();
    for (let t = 0; t <= def.scenario.durationSec; t += 0.1) {
      const p = def.evaluate(t, 7, t, ctx);
      const presenting = Object.values(p.instances).filter((i) => i.presentedWaferId === DEMO_WAFER.waferId);
      expect(presenting.length, `t=${t.toFixed(1)}`).toBe(1);
      const w = p.wafers[DEMO_WAFER.waferId];
      const inSlot = w.holder.kind === "carrier_slot";
      expect(p.carriers[DEMO_CARRIER.carrierId].slots["slot-13"] === DEMO_WAFER.waferId).toBe(inSlot);
      expect(w.reservedSlot.slotId).toBe("slot-13");
      if (inSlot) expect(presenting[0].instanceId).toBe(DEMO_CARRIER.carrierId);
    }
  });
  it("is a pure function of time: reverse scrub reproduces earlier states exactly", () => {
    const a = def.evaluate(18.3, 7, 18.3, ctx);
    def.evaluate(60, 7, 60, ctx);
    def.evaluate(3, 7, 3, ctx);
    expect(def.evaluate(18.3, 7, 18.3, ctx)).toEqual(a);
  });
  it("robot, blade and doors use only the presented-wafer assets of the station", () => {
    const ids = new Set(listBundles().find((b) => b.template.templateId === "ccp_pecvd_single_wafer_300")!.template.station!.waferPresentationAssetIds);
    for (const a of [STATION_IDS.robot.wafer, STATION_IDS.waferLL, STATION_IDS.waferBlade, "wafer"]) expect(ids.has(a), a).toBe(true);
  });
});
