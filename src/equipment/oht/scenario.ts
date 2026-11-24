/**
 * OHT carrier transfer sequence (pure in t):
 *   Ready → Align at pickup → Lower empty gripper → Engage carrier → Lift loaded → Travel → Align at destination →
 *   Lower loaded → Seat / release → Lift empty → Complete
 * presented_holder is exactly one of {source station, gripper, destination station} and changes atomically
 * at the engage (lift start) and seat (release start) boundaries. Scrubbing backwards re-evaluates the same
 * function, so no pick/place history accumulates.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState } from "../../domain/materialFlow";
import { emptyInstancePreview, smoothstep, type CarrierHolder, type PreviewState } from "../../presentation/preview";
import { buildPhases, phaseAt, type ScenarioContext, type ScenarioDefinition, type StationWorldFrame, type VisualScenario } from "../../presentation/scenario";
import type { EquipmentInstanceDef } from "../../domain/types";
import { hoistExtensionForSeat, OHT_LAYOUT, projectOnRail, type OhtLayout } from "./layout";
import { OHT_TEMPLATE_ID } from "./template";
import { idleToolPose } from "../idle";

const rows = buildPhases([
  { id: "oht_ready", label: "Ready", labelKo: "대기 (park)", duration: 2, equipment: "oht" },
  { id: "oht_align_pickup", label: "Align at pickup", labelKo: "Pickup station 정렬", duration: 6, equipment: "oht" },
  { id: "oht_lower_empty", label: "Lower empty gripper", labelKo: "빈 gripper 하강", duration: 4, equipment: "oht" },
  { id: "oht_engage", label: "Engage carrier", labelKo: "Carrier 결합 (gripper close)", duration: 1.5, equipment: "oht" },
  { id: "oht_lift_loaded", label: "Lift loaded", labelKo: "적재 상승", duration: 4, equipment: "oht" },
  { id: "oht_travel", label: "Travel", labelKo: "주행 (retracted pose)", duration: 8, equipment: "oht" },
  { id: "oht_align_dest", label: "Align at destination", labelKo: "Destination 정렬", duration: 1, equipment: "oht" },
  { id: "oht_lower_loaded", label: "Lower loaded", labelKo: "적재 하강", duration: 4, equipment: "oht" },
  { id: "oht_release", label: "Seat / release", labelKo: "Seating·gripper 해제", duration: 1.5, equipment: "oht" },
  { id: "oht_lift_empty", label: "Lift empty", labelKo: "빈 gripper 상승", duration: 4, equipment: "oht" },
  { id: "oht_complete", label: "Complete", labelKo: "완료", duration: 2, equipment: "oht" },
]);

export const OHT_SCENARIO: VisualScenario = { id: "oht-transfer-v1", title: "OHT FOUP transfer (pickup → travel → dropoff)", durationSec: rows.durationSec, phases: rows.phases, renderSource: "illustrative" };

export interface OhtTransferPlan {
  ohtInstanceId: string;
  sourceStationId: string;
  destinationStationId: string;
  /** Station frames in the OHT instance frame (projected on the rail). */
  src: { s: number; ext: number; lateral: number };
  dst: { s: number; ext: number; lateral: number };
  parkS: number;
  blockedReason: string | null;
}

/** Project the two stations into the OHT frame and check reachability with the implemented DOF. */
export function planTransfer(L: OhtLayout, oht: EquipmentInstanceDef, stations: Record<string, StationWorldFrame>, sourceId: string, destId: string, opts: { startS?: number } = {}): OhtTransferPlan {
  const toLocal = (w: [number, number, number]): [number, number, number] => {
    // instance rotation about Y (rotationYDeg) then translation
    const yaw = (oht.rotationYDeg * Math.PI) / 180;
    const dx = w[0] - oht.position[0];
    const dy = w[1] - oht.position[1];
    const dz = w[2] - oht.position[2];
    const cs = Math.cos(-yaw);
    const sn = Math.sin(-yaw);
    return [dx * cs + dz * sn, dy, -dx * sn + dz * cs];
  };
  const mk = (id: string) => {
    const st = stations[id];
    if (!st) return null;
    const local = toLocal(st.seatWorld);
    const p = projectOnRail(L, local);
    return { s: p.s, lateral: p.lateral, ext: hoistExtensionForSeat(L, local[1]) };
  };
  const src = mk(sourceId);
  const dst = mk(destId);
  const tol = L.cfg.station.lateral_tolerance;
  let blocked: string | null = null;
  if (!src || !dst) blocked = `Preview blocked: station ${!src ? sourceId : destId} not found`;
  else if (Math.abs(src.lateral) > tol || Math.abs(dst.lateral) > tol) blocked = `Preview blocked: load port seat is ${(Math.max(Math.abs(src.lateral), Math.abs(dst.lateral)) * 1000).toFixed(0)} mm off the rail line (no lateral axis implemented)`;
  else if (src.s < 0 || src.s > L.rail.length || dst.s < 0 || dst.s > L.rail.length) blocked = "Preview blocked: station outside the rail";
  else if (src.ext < 0 || src.ext > L.hoist.stroke || dst.ext < 0 || dst.ext > L.hoist.stroke) blocked = "Preview blocked: load port height outside the hoist stroke";
  // a leg that follows another one starts where the vehicle stopped (opts.startS); a first leg starts at park
  return { ohtInstanceId: oht.instanceId, sourceStationId: sourceId, destinationStationId: destId, src: src ?? { s: 0, ext: 0, lateral: 0 }, dst: dst ?? { s: 0, ext: 0, lateral: 0 }, parkS: opts.startS ?? L.vehicle.parkS, blockedReason: blocked };
}

export interface OhtState {
  phaseId: string;
  joints: Record<string, number>;
  flags: Record<string, boolean | string>;
  holder: CarrierHolder;
  yawFromStationId: string;
}

/** Pure OHT state at local time t (seconds since the transfer sequence start). */
export function ohtSequence(L: OhtLayout, plan: OhtTransferPlan, t: number, scenario: VisualScenario = OHT_SCENARIO): OhtState {
  const P: Record<string, { start: number; end: number }> = {};
  for (const p of scenario.phases) P[p.id] = { start: p.start, end: p.end };
  const p = phaseAt(scenario, t);
  const ease = (id: string) => smoothstep(P[id].start, P[id].end, t);
  const closedTravel = L.gripper.openHalfGap - L.gripper.closedHalfGap;
  if (plan.blockedReason) {
    return { phaseId: p.id, joints: { travel: plan.parkS, hoist: 0, gripper_a: 0, gripper_b: 0 }, flags: { blocked: plan.blockedReason, gripperClosed: false, carrierPresent: false, hoistRetracted: true }, holder: { kind: "station", id: plan.sourceStationId }, yawFromStationId: plan.sourceStationId };
  }
  // travel
  let s = plan.parkS;
  if (t >= P.oht_align_pickup.start && t < P.oht_travel.start) s = plan.parkS + (plan.src.s - plan.parkS) * ease("oht_align_pickup");
  else if (t >= P.oht_travel.start) s = plan.src.s + (plan.dst.s - plan.src.s) * ease("oht_travel");
  // hoist
  let ext = 0;
  if (t >= P.oht_lower_empty.start && t < P.oht_lift_loaded.start) ext = plan.src.ext * ease("oht_lower_empty");
  else if (t >= P.oht_lift_loaded.start && t < P.oht_travel.start) ext = plan.src.ext * (1 - ease("oht_lift_loaded"));
  else if (t >= P.oht_lower_loaded.start && t < P.oht_lift_empty.start) ext = plan.dst.ext * ease("oht_lower_loaded");
  else if (t >= P.oht_lift_empty.start) ext = plan.dst.ext * (1 - ease("oht_lift_empty"));
  // gripper: closes during engage, opens during release
  let grip = 0;
  if (t >= P.oht_engage.start && t < P.oht_release.start) grip = closedTravel * ease("oht_engage");
  else if (t >= P.oht_release.start) grip = closedTravel * (1 - ease("oht_release"));
  // holder: gripper from the end of engage (lift start) until the seat moment (release start)
  const onGripper = t >= P.oht_lift_loaded.start && t < P.oht_release.start;
  const atDest = t >= P.oht_release.start;
  const holder: CarrierHolder = onGripper ? { kind: "gripper", id: plan.ohtInstanceId } : { kind: "station", id: atDest ? plan.destinationStationId : plan.sourceStationId };
  return {
    phaseId: p.id,
    joints: { travel: s, hoist: ext, gripper_a: grip, gripper_b: grip },
    flags: { gripperClosed: grip > closedTravel * 0.95, carrierPresent: onGripper || (t >= P.oht_engage.start && t < P.oht_release.end && ext > 0.01), hoistRetracted: ext < 0.002, holder: holder.kind === "gripper" ? "gripper" : holder.id },
    holder,
    yawFromStationId: atDest ? plan.destinationStationId : plan.sourceStationId,
  };
}

/** Standalone OHT demonstration: FOUP-01 from the CCP load port to the CMP load port (falls back to the first two stations). */
export function ohtStandalonePreview(t: number, _seed: number, _animT: number, ctx: ScenarioContext): PreviewState {
  const phase = phaseAt(OHT_SCENARIO, t);
  const out: PreviewState = { scenarioId: OHT_SCENARIO.id, t, phaseId: phase.id, phaseLabel: phase.label, phaseLabelKo: phase.labelKo, phaseFocusInstanceId: null, instances: {}, carriers: {}, wafers: {}, plasma: { intensity: 0, flicker: 0 }, blockedReason: null };
  const oht = ctx.instances.find((i) => i.templateId === OHT_TEMPLATE_ID);
  for (const inst of ctx.instances) {
    // tools outside the demonstration stand in their home pose
    const p = emptyInstancePreview(inst.instanceId);
    p.joints = idleToolPose(inst.templateId);
    out.instances[inst.instanceId] = p;
  }
  if (!oht) return out;
  const stationIds = Object.keys(ctx.stations);
  const srcId = stationIds.find((id) => ctx.stations[id].instanceId === "PECVD-01.CH-A") ?? stationIds[0];
  const dstId = stationIds.find((id) => ctx.stations[id].instanceId === "CMP-01") ?? stationIds[1] ?? stationIds[0];
  if (!srcId || !dstId) return out;
  const plan = planTransfer(OHT_LAYOUT, oht, ctx.stations, srcId, dstId);
  const st = ohtSequence(OHT_LAYOUT, plan, t);
  const ip = out.instances[oht.instanceId];
  ip.joints = st.joints;
  ip.flags = st.flags;
  ip.phaseLabelKo = phase.labelKo;
  out.blockedReason = plan.blockedReason;
  out.carriers[DEMO_CARRIER.carrierId] = { carrierId: DEMO_CARRIER.carrierId, holder: st.holder, doorOpen: false, slots: { [DEMO_RESERVED_SLOT.slotId]: DEMO_WAFER.waferId }, docked: st.holder.kind === "station", yawFromStationId: st.yawFromStationId };
  out.wafers[DEMO_WAFER.waferId] = { waferId: DEMO_WAFER.waferId, holder: { kind: "carrier_slot", carrierId: DEMO_CARRIER.carrierId, slotId: DEMO_RESERVED_SLOT.slotId }, reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: [0, 1, 0], film: incomingFilmState(DEMO_WAFER.waferId) };
  // the tools present no wafer: it stays in its slot of the closed FOUP for the whole transfer
  const foup = out.instances[DEMO_CARRIER.carrierId];
  if (foup) {
    foup.presentedWaferId = DEMO_WAFER.waferId;
    foup.presentedWaferAssetId = "foup_wafer";
  }
  return out;
}

export const OHT_STANDALONE_SCENARIO: ScenarioDefinition = {
  id: OHT_SCENARIO.id,
  title: OHT_SCENARIO.title,
  titleKo: "OHT FOUP 반송 연출 (단독: PECVD load port → CMP load port)",
  kind: "standalone",
  templateId: OHT_TEMPLATE_ID,
  scenario: OHT_SCENARIO,
  requiredInstanceIds: [],
  requiredTemplateIds: [OHT_TEMPLATE_ID],
  evaluate: ohtStandalonePreview,
};
