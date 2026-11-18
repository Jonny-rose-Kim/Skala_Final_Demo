import { describe, expect, it } from "vitest";
import "../../src/equipment/index";
import { listBundles, validateAllBundles, measurementIndex } from "../../src/domain/registry";
import { validateMeasurementSeed, type MeasurementSeed } from "../../src/domain/measurement";
import { DEFAULT_INSTANCES, instanceFixture } from "../../src/domain/instances";
import { getScenario, listScenarios } from "../../src/presentation/scenarioRegistry";
import type { ScenarioContext, StationWorldFrame } from "../../src/presentation/scenario";
import { CMP_LAYOUT, conditionerDiscXZ, opticalFootprint, validateCmpConfig, CMP_CONFIG } from "../../src/equipment/cmp/layout";
import { cmpFullState, CMP_PLAN, CMP_POLISH_SCENARIO } from "../../src/equipment/cmp/scenario";
import { OHT_LAYOUT, hoistExtensionForSeat } from "../../src/equipment/oht/layout";
import { ohtSequence, planTransfer, OHT_SCENARIO } from "../../src/equipment/oht/scenario";
import { REMOTE_LAYOUT } from "../../src/equipment/remote/layout";
import { ROUTE_A_SCENARIO, ROUTE_B_SCENARIO, routeSegments } from "../../src/equipment/routes/index";
import { routeById } from "../../src/domain/materialFlow";
import { CHAMBER_LAYOUT } from "../../src/config/geometry";

/** Station frames as the scene host derives them (instance pose + template seat frame). */
function stationsFor(instances = DEFAULT_INSTANCES): Record<string, StationWorldFrame> {
  const out: Record<string, StationWorldFrame> = {};
  for (const def of instances) {
    const b = listBundles().find((x) => x.template.templateId === def.templateId);
    const st = b?.template.station;
    if (!st) continue;
    const yaw = (def.rotationYDeg * Math.PI) / 180;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const lx = st.seatLocal[0];
    const lz = st.seatLocal[2];
    const seat: [number, number, number] = [def.position[0] + lx * cs + lz * sn, def.position[1] + st.seatLocal[1], def.position[2] - lx * sn + lz * cs];
    const dfx = st.doorFacingLocal[0] * cs + st.doorFacingLocal[2] * sn;
    const dfz = -st.doorFacingLocal[0] * sn + st.doorFacingLocal[2] * cs;
    const id = `LP.${def.instanceId}`;
    out[id] = { stationId: id, instanceId: def.instanceId, seatWorld: seat, yawRad: Math.atan2(dfx, dfz), doorFacing: [dfx, 0, dfz] };
  }
  return out;
}

const ctx: ScenarioContext = { instances: DEFAULT_INSTANCES, stations: stationsFor() };

describe("equipment registry", () => {
  it("registers the four equipment templates plus the carrier", () => {
    const ids = listBundles().map((b) => b.template.templateId).sort();
    expect(ids).toEqual(["ccp_pecvd_single_wafer_300", "foup_carrier_300", "oht_single_vehicle", "remote_pecvd_upstream_icp", "sti_cmp_rotary_single_platen"]);
  });
  it("every bundle validates: template references, measurement seed semantics, geometry", () => {
    for (const r of validateAllBundles()) expect(r.errors, r.templateId).toEqual([]);
  });
  it("asset ids are unique per template and measurement ids are unique across all templates", () => {
    const all = new Set<string>();
    for (const b of listBundles()) {
      const ids = b.template.components.map((c) => c.assetId);
      expect(new Set(ids).size, b.template.templateId).toBe(ids.length);
      const m = b.measurement;
      for (const id of [...m.instruments.map((i) => i.instrumentId), ...m.points.map((p) => p.pointId), ...m.channels.map((c) => c.channelId)]) {
        expect(all.has(id), `duplicate measurement id ${id}`).toBe(false);
        all.add(id);
      }
    }
  });
  it("keeps the original CCP asset ids and channel ids", () => {
    const ccp = listBundles().find((b) => b.template.templateId === "ccp_pecvd_single_wafer_300")!;
    const ids = new Set(ccp.template.components.map((c) => c.assetId));
    for (const id of ["chamber_body", "lid", "showerhead_faceplate", "wafer", "pedestal", "slit_valve", "plasma_volume", "mfc_01", "pressure_sensor"]) expect(ids.has(id), id).toBe(true);
    const chans = new Set(ccp.measurement.channels.map((c) => c.channelId));
    for (const id of ["ch.pressure.chamber", "ch.temperature.pedestal", "ch.rf.forward_power", "ch.rf.reflected_power", "ch.valve.throttle_position", "ch.flow.mfc1"]) expect(chans.has(id), id).toBe(true);
  });
  it("has no data source binding, no observation and no fabricated calibration anywhere", () => {
    for (const b of listBundles()) {
      expect(b.measurement.sourceBindings).toEqual([]);
      expect(b.measurement.calibrations.every((c) => c.status === "unknown")).toBe(true);
      const idx = measurementIndex(b.template.templateId)!;
      for (const c of b.measurement.channels) expect(idx.dataStatus(c.channelId)).toBe("unbound");
    }
  });
  it("separates sensor body, measurement point and channel: point linked but not installed candidates exist", () => {
    const remote = measurementIndex("remote_pecvd_upstream_icp")!;
    expect(remote.isNotInstalled("remote.mp.source_pressure_candidate")).toBe(true);
    expect(remote.isNotInstalled("remote.mp.chamber_pressure")).toBe(false);
    const oes = remote.pointsById.get("remote.mp.source_oes_path")!;
    const body = remote.installationOf("remote.oes")!;
    // body outside the housing, path inside the tube
    expect(Math.hypot(body.mountPosition[0], body.mountPosition[2])).toBeGreaterThan(REMOTE_LAYOUT.housing.rOut);
    expect(Math.hypot(oes.geometry.pathTo![0], oes.geometry.pathTo![2])).toBeLessThan(REMOTE_LAYOUT.tube.rIn);
    const ccp = measurementIndex("ccp_pecvd_single_wafer_300")!;
    expect(ccp.isNotInstalled("mp.ccp_viewport_oes_path")).toBe(true);
  });
  it("rejects quantity / unit / reference mismatches", () => {
    const b = listBundles().find((x) => x.template.templateId === "remote_pecvd_upstream_icp")!;
    const bad: MeasurementSeed = structuredClone(b.measurement);
    bad.channels[0].canonicalUnit = "sccm";
    bad.pointBindings.push({ bindingId: "x", channelId: "remote.ch.flow.source", pointId: "remote.mp.chamber_pressure", role: "primary", configurationRevision: "r" });
    bad.points.push({ pointId: "p.bad", name: "bad", targetAssetId: "nonexistent", pointKind: "point", geometry: { position: [0, 0, 0] }, quantity: "pressure", reference: {}, coverageKo: "", noteKo: "" });
    const errors = validateMeasurementSeed(bad, b.template);
    expect(errors.some((e) => e.includes("unit"))).toBe(true);
    expect(errors.some((e) => e.includes("quantity mismatch"))).toBe(true);
    expect(errors.some((e) => e.includes("more than one active primary"))).toBe(true);
    expect(errors.some((e) => e.includes("unknown target asset"))).toBe(true);
    expect(errors.some((e) => e.includes("absolute/gauge"))).toBe(true);
  });
});

describe("remote ICP PECVD structure", () => {
  it("puts the main glow inside the dielectric tube and far above the wafer; afterglow only in the transport section", () => {
    const L = REMOTE_LAYOUT;
    expect(L.sourceGlow.bottomY).toBeGreaterThan(L.tube.y0);
    expect(L.sourceGlow.topY).toBeLessThan(L.tube.y1);
    expect(L.sourceGlow.bottomY - L.waferTopY).toBeGreaterThan(0.3);
    expect(L.afterglow.topY).toBeLessThanOrEqual(L.tube.y0);
    expect(L.afterglow.bottomY).toBeGreaterThanOrEqual(L.lidTopY);
    expect(L.coil.R - L.coil.r).toBeGreaterThan(L.tube.rOut);
    expect(L.ring.rIn).toBeGreaterThan(L.rWafer);
  });
  it("differs from the CCP: no powered showerhead, separate source and precursor branches", () => {
    const remote = listBundles().find((b) => b.template.templateId === "remote_pecvd_upstream_icp")!;
    const ids = new Set(remote.template.components.map((c) => c.assetId));
    expect(ids.has("showerhead_faceplate")).toBe(false);
    expect(ids.has("injection_ring") && ids.has("discharge_tube") && ids.has("induction_coil") && ids.has("transport_section")).toBe(true);
    const rfToRing = remote.template.connections.some((c) => c.kind === "rf" && (c.to.assetId === "injection_ring" || c.from.assetId === "injection_ring"));
    expect(rfToRing).toBe(false);
    const idx = measurementIndex("remote_pecvd_upstream_icp")!;
    expect(idx.channelsById.get("remote.ch.flow.source")!.instrumentId).not.toBe(idx.channelsById.get("remote.ch.flow.precursor")!.instrumentId);
  });
});

describe("rotary STI CMP", () => {
  const L = CMP_LAYOUT;
  const P0 = CMP_PLAN.polishStart;
  const ph = (id: string) => CMP_POLISH_SCENARIO.phases.find((p) => p.id === id)!;
  it("config validates and the wafer faces the pad during polishing", () => {
    expect(validateCmpConfig(CMP_CONFIG).errors).toEqual([]);
    const s = cmpFullState(CMP_PLAN, P0 + 15);
    expect(s.holder).toBe("head");
    expect(s.frontside).toEqual([0, -1, 0]);
    expect(Math.abs(s.joints.head_lift - L.head.liftContact)).toBeLessThan(1e-6);
    // wafer front plane coincides with the pad top at contact (no floating, no penetration)
    expect(L.head.waferFrontY + s.joints.head_lift).toBeCloseTo(L.padTopY, 9);
  });
  it("conditioner disc stays on the pad while sweeping and never touches the head footprint; head is retracted meanwhile", () => {
    for (let t = P0 + ph("conditioning").start; t < P0 + ph("conditioning").end; t += 0.05) {
      const s = cmpFullState(CMP_PLAN, t);
      const p = conditionerDiscXZ(L, s.joints.conditioner_sweep);
      const r = Math.hypot(p.x, p.z);
      if (s.joints.conditioner_lift < 1e-6) {
        expect(r + L.conditioner.discR).toBeLessThanOrEqual(L.pad.r + 1e-6);
        const headX = L.head.polishX - s.joints.head_lateral;
        expect(Math.hypot(p.x - headX, p.z)).toBeGreaterThan(L.conditioner.discR + L.head.rRingOut);
      }
    }
  });
  it("optical footprint is In view only when the window track passes under the wafer at contact", () => {
    const polish = cmpFullState(CMP_PLAN, P0 + 15);
    let inView = 0;
    let outView = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const fp = opticalFootprint(L, a, polish.joints.head_lateral, polish.joints.head_lift);
      if (fp.inView) inView++;
      else outView++;
      if (fp.inView) expect(Math.hypot(fp.windowXZ.x - fp.waferCenter.x, fp.windowXZ.z - fp.waferCenter.z)).toBeLessThan(L.rWafer);
    }
    expect(inView).toBeGreaterThan(0);
    expect(outView).toBeGreaterThan(inView);
    const raised = opticalFootprint(L, Math.PI, 0, 0);
    expect(raised.inView).toBe(false);
  });
  it("illustrative film: oxide overburden removed, trench oxide and SiN preserved, no numbers invented", () => {
    const end = cmpFullState(CMP_PLAN, CMP_PLAN.total - 0.5);
    expect(end.polish.film.overcoat).toBe(0);
    expect(end.polish.film.surfaceOxide).toBe(0);
    expect(end.polish.film.sin).toBeGreaterThan(0.9);
    expect(end.polish.film.trenchFill).toBeGreaterThan(0.9);
    expect(end.polish.film.nitrideExposed).toBe(true);
    expect(end.polish.film.status).toBe("complete");
    expect(Object.keys(end.effects).some((k) => /dishing|removal_rate|thickness_nm|endpoint_detected/i.test(k))).toBe(false);
  });
  it("the slot holds the wafer only at the start and after the dry return", () => {
    let leftSlot = false;
    let back = false;
    for (let t = 0; t <= CMP_PLAN.total; t += 0.1) {
      const s = cmpFullState(CMP_PLAN, t);
      if (s.holder !== "foup") leftSlot = true;
      else if (leftSlot) back = true;
      if (back) expect(s.holder, `t=${t.toFixed(1)}`).toBe("foup");
    }
    expect(leftSlot && back).toBe(true);
  });
});

describe("OHT transfer", () => {
  const oht = DEFAULT_INSTANCES.find((i) => i.templateId === "oht_single_vehicle")!;
  const stations = stationsFor();
  const plan = planTransfer(OHT_LAYOUT, oht, stations, "LP.PECVD-01.CH-A", "LP.CMP-01");
  it("all three load ports are reachable with rail travel + hoist only (no lateral axis)", () => {
    expect(plan.blockedReason).toBeNull();
    for (const id of Object.keys(stations)) {
      const p = planTransfer(OHT_LAYOUT, oht, stations, id, id);
      expect(p.blockedReason, id).toBeNull();
      expect(Math.abs(p.src.lateral)).toBeLessThanOrEqual(OHT_LAYOUT.cfg.station.lateral_tolerance);
      expect(p.src.ext).toBeGreaterThan(0);
      expect(p.src.ext).toBeLessThan(OHT_LAYOUT.hoist.stroke);
    }
  });
  it("hoist extension matches the seat height so the gripper meets the flange without a pose jump", () => {
    const ext = hoistExtensionForSeat(OHT_LAYOUT, 0.9);
    expect(OHT_LAYOUT.hoist.originY + OHT_LAYOUT.carrierSeatInHoistFrame[1] - ext).toBeCloseTo(0.9, 9);
  });
  it("presented_holder is exactly one of source station / gripper / destination station and switches atomically", () => {
    const seen = new Set<string>();
    let prev: string | null = null;
    let switches = 0;
    for (let t = 0; t <= OHT_SCENARIO.durationSec; t += 0.05) {
      const s = ohtSequence(OHT_LAYOUT, plan, t);
      const key = s.holder.kind === "gripper" ? "gripper" : s.holder.id;
      seen.add(key);
      if (prev !== null && key !== prev) switches++;
      prev = key;
    }
    expect(Array.from(seen).sort()).toEqual(["LP.CMP-01", "LP.PECVD-01.CH-A", "gripper"]);
    expect(switches).toBe(2);
  });
  it("is a pure function of time: reverse scrub reproduces earlier states exactly", () => {
    const a = ohtSequence(OHT_LAYOUT, plan, 12);
    ohtSequence(OHT_LAYOUT, plan, 30);
    ohtSequence(OHT_LAYOUT, plan, 37);
    const b = ohtSequence(OHT_LAYOUT, plan, 12);
    expect(b).toEqual(a);
  });
  it("travels only with the hoist retracted and lifts only with the gripper closed", () => {
    const P = Object.fromEntries(OHT_SCENARIO.phases.map((p) => [p.id, p]));
    for (let t = P.oht_travel.start; t < P.oht_travel.end; t += 0.1) expect(ohtSequence(OHT_LAYOUT, plan, t).joints.hoist).toBeLessThan(1e-6);
    for (let t = P.oht_lift_loaded.start; t < P.oht_travel.start; t += 0.1) expect(ohtSequence(OHT_LAYOUT, plan, t).flags.gripperClosed).toBe(true);
  });
  it("blocks the preview when a station is off the rail line instead of inventing a lateral move", () => {
    const shifted = structuredClone(stations);
    shifted["LP.CMP-01"].seatWorld[0] += 0.05;
    const p = planTransfer(OHT_LAYOUT, oht, shifted, "LP.PECVD-01.CH-A", "LP.CMP-01");
    expect(p.blockedReason).toContain("Preview blocked");
    const s = ohtSequence(OHT_LAYOUT, p, 20);
    expect(s.joints.travel).toBeCloseTo(OHT_LAYOUT.vehicle.parkS, 9);
  });
});

describe("linked routes A / B", () => {
  it("both routes are registered, independent alternatives (no CCP → Remote serial route)", () => {
    const ids = listScenarios().map((s) => s.id);
    expect(ids).toContain("route-a-linked-v2");
    expect(ids).toContain("route-b-linked-v2");
    const a = getScenario("route-a-linked-v2")!;
    const b = getScenario("route-b-linked-v2")!;
    expect(a.scenario.phases.some((p) => p.equipment === "remote")).toBe(false);
    expect(b.scenario.phases.some((p) => p.equipment === "ccp")).toBe(false);
    expect(a.scenario.phases[0].equipment).toBe("external");
    for (const r of ["A", "B"] as const) for (const st of routeById(r).steps) if (st.recipeId) expect(st.recipeId).toMatch(/demo/);
  });
  it("pickup starts only after the wafer is back in its slot (door closed) and the slot is empty while the wafer is in a tool", () => {
    for (const def of [ROUTE_A_SCENARIO, ROUTE_B_SCENARIO]) {
      const S = routeSegments(routeById(def.routeId!));
      const before = def.evaluate(S.ohtStart - 0.01, 7, S.ohtStart - 0.01, ctx);
      expect(before.carriers["FOUP-01"].slots["slot-13"]).toBe("W-01");
      expect(before.wafers["W-01"].holder.kind).toBe("carrier_slot");
      expect(before.carriers["FOUP-01"].doorOpen).toBe(false);
      const during = def.evaluate(S.depStart + 5, 7, S.depStart + 5, ctx);
      expect(during.carriers["FOUP-01"].slots["slot-13"]).toBeNull();
      expect(during.wafers["W-01"].holder.kind).toBe("process_stage");
      const dep = routeById(def.routeId!).depositionInstanceId;
      expect(during.instances[dep].presentedWaferId).toBe("W-01");
      // the wafer is shown by exactly one instance at a time (the FOUP while it is in its slot)
      for (let t = 0; t < def.scenario.durationSec; t += 0.5) {
        const p = def.evaluate(t, 7, t, ctx);
        const shown = Object.values(p.instances).filter((i) => i.presentedWaferId === "W-01");
        expect(shown.length, `t=${t}`).toBe(1);
        expect(p.wafers["W-01"].holder.kind === "carrier_slot", `t=${t}`).toBe(shown[0].instanceId === "FOUP-01");
        expect(p.carriers["FOUP-01"].slots["slot-13"] === "W-01", `t=${t}`).toBe(p.wafers["W-01"].holder.kind === "carrier_slot");
        if (p.wafers["W-01"].holder.kind === "carrier_slot") expect(p.wafers["W-01"].wetState ?? "dry").toBe("dry");
      }
    }
  });
  it("rewind restores slot occupancy, holders and the incoming film state", () => {
    const def = ROUTE_A_SCENARIO;
    const S = routeSegments(routeById("A"));
    const late = def.evaluate(S.cmpEnd - 1, 7, S.cmpEnd - 1, ctx);
    expect(late.wafers["W-01"].film.layers.find((l) => l.layerId === "demo_overcoat")!.presentFraction).toBe(0);
    expect(late.wafers["W-01"].film.nitrideExposed).toBe(true);
    const early = def.evaluate(1, 7, 1, ctx);
    const film = early.wafers["W-01"].film;
    expect(film.status).toBe("incoming");
    expect(film.layers.find((l) => l.layerId === "demo_overcoat")!.presentFraction).toBe(0);
    expect(film.layers.find((l) => l.layerId === "surface_oxide")!.presentFraction).toBe(1);
    expect(film.nitrideExposed).toBe(false);
    expect(early.carriers["FOUP-01"].holder).toEqual({ kind: "station", id: "LP.PECVD-01.CH-A" });
    expect(early.carriers["FOUP-01"].slots["slot-13"]).toBe("W-01");
    const mid = def.evaluate(S.ohtStart + 20, 7, S.ohtStart + 20, ctx);
    expect(mid.carriers["FOUP-01"].holder.kind).toBe("gripper");
    expect(mid.wafers["W-01"].film.layers.find((l) => l.layerId === "demo_overcoat")!.presentFraction).toBe(1);
    expect(mid.carriers["FOUP-01"].slots["slot-13"]).toBe("W-01");
  });
  it("same time, same seed → identical preview (determinism)", () => {
    const def = ROUTE_B_SCENARIO;
    const a = def.evaluate(33.3, 7, 33.3, ctx);
    def.evaluate(90, 7, 90, ctx);
    const b = def.evaluate(33.3, 7, 33.3, ctx);
    expect(b).toEqual(a);
  });
});

describe("fixtures", () => {
  it("duplicate-instance fixtures exist for independence checks", () => {
    for (const name of ["two-chambers", "two-remotes", "two-cmps"]) {
      const f = instanceFixture(name)!;
      expect(f.length).toBe(2);
      expect(f[0].templateId).toBe(f[1].templateId);
      expect(f[0].instanceId).not.toBe(f[1].instanceId);
    }
  });
  it("CCP station seat derives from the geometry config (no duplicated spacing)", () => {
    const ccp = listBundles().find((b) => b.template.templateId === "ccp_pecvd_single_wafer_300")!;
    expect(ccp.template.station!.seatLocal).toEqual(CHAMBER_LAYOUT.station.seat);
  });
});
