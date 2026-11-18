/**
 * Linked demonstration routes A (CCP) and B (Remote ICP PECVD), two alternatives (no CCP to Remote route):
 *   prepared STI wafer in the FOUP (external) -> station handling into the chamber (EFEM robot, load lock,
 *   vacuum blade) -> deposition illustration -> the same path back to the reserved slot, door closed, undock
 *   -> OHT pickup / travel / dropoff -> CMP front end (dry robot, flip, wet robot) -> polish -> clean, rinse,
 *   spin dry -> dry robot back to the reserved slot.
 * One presentation clock drives every instance; the tool poses, carrier and wafer holders, slot occupancy,
 * face orientation, wet state and the IllustrativeFilmState are rebuilt from (t, scenario), so scrubbing
 * backwards restores earlier states without replaying events.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState, routeById, type RouteDef } from "../../domain/materialFlow";
import { emptyInstancePreview, type PreviewState } from "../../presentation/preview";
import { phaseAt, type ScenarioContext, type ScenarioDefinition, type ScenarioPhase, type VisualScenario } from "../../presentation/scenario";
import { CCP_STATION_PLAN } from "../ccp/handling";
import { CCP_TEMPLATE_ID } from "../ccp/index";
import { CCP_PROCESS_SEGMENT } from "../ccp/scenario";
import { applyCmpFilm, applyCmpState, cmpFullState, cmpPhases, CMP_PLAN } from "../cmp/scenario";
import { CMP_TEMPLATE_ID } from "../cmp/template";
import { stationHandlingPhases, type ProcessSegment } from "../handling/handlingScenario";
import { applyStationState, applyStationTool, stationStateAt, stationTimeline, type StationTimeline } from "../handling/stationScenario";
import type { StationPlan } from "../handling/stationSequence";
import { idleToolPose } from "../idle";
import { OHT_LAYOUT } from "../oht/layout";
import { ohtSequence, OHT_SCENARIO, planTransfer } from "../oht/scenario";
import { OHT_TEMPLATE_ID } from "../oht/template";
import { REMOTE_STATION_PLAN } from "../remote/handling";
import { REMOTE_PROCESS_SEGMENT } from "../remote/scenario";
import { REMOTE_TEMPLATE_ID } from "../remote/template";

const EXTERNAL_SEC = 2;
const COMPLETE_SEC = 3;

interface RouteTool {
  plan: StationPlan;
  process: ProcessSegment;
  stageWaferAssetId: string;
}

function routeTool(route: RouteDef): RouteTool {
  return route.routeId === "A" ? { plan: CCP_STATION_PLAN, process: CCP_PROCESS_SEGMENT, stageWaferAssetId: "wafer" } : { plan: REMOTE_STATION_PLAN, process: REMOTE_PROCESS_SEGMENT, stageWaferAssetId: "wafer" };
}

export interface RouteSegments {
  station: StationTimeline;
  /** Kept for tests: deposition (process) window and the end of the return to the FOUP. */
  loadStart: number;
  depStart: number;
  depEnd: number;
  returnEnd: number;
  ohtStart: number;
  ohtEnd: number;
  cmpStart: number;
  cmpEnd: number;
  total: number;
}

export function routeSegments(route: RouteDef): RouteSegments {
  const tool = routeTool(route);
  const station = stationTimeline(tool.plan, EXTERNAL_SEC, tool.process.scenario.durationSec);
  const ohtStart = station.unloadEnd;
  const ohtEnd = ohtStart + OHT_SCENARIO.durationSec;
  const cmpStart = ohtEnd;
  const cmpEnd = cmpStart + CMP_PLAN.total;
  return { station, loadStart: station.loadStart, depStart: station.processStart, depEnd: station.processEnd, returnEnd: station.unloadEnd, ohtStart, ohtEnd, cmpStart, cmpEnd, total: cmpEnd + COMPLETE_SEC };
}

export function buildRouteScenario(route: RouteDef): VisualScenario {
  const S = routeSegments(route);
  const tool = routeTool(route);
  const phases: ScenarioPhase[] = [
    { id: "ext_prepared", label: "External: prepared STI wafer in FOUP", labelKo: "외부 준비 공정 완료 (prepared STI wafer, FOUP 내)", start: 0, end: EXTERNAL_SEC, equipment: "external" },
    ...stationHandlingPhases(tool, S.station, "dep_"),
    ...OHT_SCENARIO.phases.map((p) => ({ ...p, start: S.ohtStart + p.start, end: S.ohtStart + p.end, equipment: "oht" as const })),
    ...cmpPhases(CMP_PLAN, S.cmpStart, "cmp_"),
    { id: "route_complete", label: "Visual sequence complete", labelKo: "완료 (Visual sequence complete)", start: S.cmpEnd, end: S.total, equipment: "carrier" },
  ];
  return { id: `route-${route.routeId.toLowerCase()}-linked-v2`, title: route.title, durationSec: S.total, phases, renderSource: "illustrative" };
}

export function routePreview(route: RouteDef, scenario: VisualScenario, t: number, seed: number, animT: number, ctx: ScenarioContext): PreviewState {
  const S = routeSegments(route);
  const tool = routeTool(route);
  const phase = phaseAt(scenario, t);
  const out: PreviewState = { scenarioId: scenario.id, t, phaseId: phase.id, phaseLabel: phase.label, phaseLabelKo: phase.labelKo, phaseFocusInstanceId: null, instances: {}, carriers: {}, wafers: {}, plasma: { intensity: 0, flicker: 0 }, blockedReason: null };
  for (const inst of ctx.instances) {
    const p = emptyInstancePreview(inst.instanceId);
    p.joints = idleToolPose(inst.templateId);
    out.instances[inst.instanceId] = p;
  }
  const depInst = ctx.instances.find((i) => i.instanceId === route.depositionInstanceId);
  const cmpInst = ctx.instances.find((i) => i.instanceId === route.cmpInstanceId);
  const ohtInst = ctx.instances.find((i) => i.instanceId === route.ohtInstanceId);
  const foupInst = ctx.instances.find((i) => i.instanceId === route.carrierId);
  const srcStation = Object.values(ctx.stations).find((s) => s.instanceId === route.depositionInstanceId);
  const dstStation = Object.values(ctx.stations).find((s) => s.instanceId === route.cmpInstanceId);
  if (!depInst || !cmpInst || !ohtInst || !srcStation || !dstStation) {
    out.blockedReason = "Preview blocked: route instances or stations missing";
    return out;
  }
  const carrierId = DEMO_CARRIER.carrierId;
  const waferId = DEMO_WAFER.waferId;
  const slotId = DEMO_RESERVED_SLOT.slotId;
  // ---------------------------------------------------------------- deposition tool (station handling + process)
  const st = stationStateAt(tool.plan, S.station, t);
  let film = incomingFilmState(waferId);
  const dp = out.instances[depInst.instanceId];
  if (st.segment === "process") {
    const s = tool.process.sample(t - S.depStart, seed, animT - S.depStart);
    dp.effects = { ...s.effects };
    out.plasma = { ...s.plasma };
    film = s.film(film);
  } else if (st.segment === "unload" || st.segment === "after") film = tool.process.done(film);
  dp.phaseLabelKo = t < S.loadStart ? "대기 (prepared wafer in FOUP)" : st.segment === "process" ? phase.labelKo : t >= S.returnEnd ? "완료 (wafer 반출, FOUP undock)" : st.labelKo;
  // ---------------------------------------------------------------- OHT
  const plan = planTransfer(OHT_LAYOUT, ohtInst, ctx.stations, srcStation.stationId, dstStation.stationId);
  out.blockedReason = plan.blockedReason;
  const ohtT = Math.min(Math.max(t - S.ohtStart, 0), OHT_SCENARIO.durationSec - 1e-6);
  const ohtState = ohtSequence(OHT_LAYOUT, plan, ohtT);
  const op = out.instances[ohtInst.instanceId];
  op.joints = ohtState.joints;
  op.flags = ohtState.flags;
  op.phaseLabelKo = t < S.ohtStart ? "대기 (pickup 전: FOUP door 닫힘·undock 대기)" : t >= S.ohtEnd ? "완료 (carrier at CMP load port)" : phase.labelKo;
  // ---------------------------------------------------------------- carrier / wafer by segment
  if (t < S.ohtStart) {
    // the deposition tool holds the carrier, the wafer and the FOUP door
    applyStationState({ out, plan: tool.plan, state: st, toolInstanceId: depInst.instanceId, foupInstanceId: foupInst?.instanceId ?? null, stationId: srcStation.stationId, carrierId, waferId, slotId, stageWaferAssetId: tool.stageWaferAssetId, film, reservedSlot: DEMO_RESERVED_SLOT });
  } else if (t < S.cmpStart) {
    // after the unload the deposition tool keeps its end pose (stage at transfer height, as at the route start)
    applyStationTool(dp, tool.plan, st);
    out.carriers[carrierId] = { carrierId, holder: ohtState.holder, doorOpen: false, slots: { [slotId]: waferId }, docked: false, dockOffset: 0, yawFromStationId: ohtState.yawFromStationId };
    out.wafers[waferId] = { waferId, holder: { kind: "carrier_slot", carrierId, slotId }, reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: [0, 1, 0], film, wetState: "dry" };
    if (foupInst) {
      out.instances[foupInst.instanceId].presentedWaferId = waferId;
      out.instances[foupInst.instanceId].presentedWaferAssetId = "foup_wafer";
    }
  } else {
    applyStationTool(dp, tool.plan, st);
    const cs = cmpFullState(CMP_PLAN, Math.min(t - S.cmpStart, CMP_PLAN.total));
    applyCmpState({ out, plan: CMP_PLAN, state: cs, cmpInstanceId: cmpInst.instanceId, foupInstanceId: foupInst?.instanceId ?? null, stationId: dstStation.stationId, carrierId, waferId, slotId, film: applyCmpFilm(film, cs.polish.film) });
    out.instances[cmpInst.instanceId].phaseLabelKo = t >= S.cmpEnd ? "완료 (Visual sequence complete)" : cs.labelKo || phase.labelKo;
  }
  if (t < S.cmpStart) out.instances[cmpInst.instanceId].phaseLabelKo = "대기 (carrier 도착 전)";
  out.phaseFocusInstanceId = phase.equipment === "oht" ? ohtInst.instanceId : phase.equipment === "cmp" || phase.equipment === "carrier" ? cmpInst.instanceId : depInst.instanceId;
  return out;
}

function routeDefinition(routeId: "A" | "B"): ScenarioDefinition {
  const route = routeById(routeId);
  const scenario = buildRouteScenario(route);
  return {
    id: scenario.id,
    title: scenario.title,
    titleKo: route.titleKo,
    kind: "linked",
    routeId,
    scenario,
    requiredInstanceIds: [route.depositionInstanceId, route.cmpInstanceId, route.ohtInstanceId, route.carrierId],
    requiredTemplateIds: [routeId === "A" ? CCP_TEMPLATE_ID : REMOTE_TEMPLATE_ID, CMP_TEMPLATE_ID, OHT_TEMPLATE_ID],
    evaluate: (t, seed, animT, ctx) => routePreview(route, scenario, t, seed, animT, ctx),
  };
}

export const ROUTE_A_SCENARIO = routeDefinition("A");
export const ROUTE_B_SCENARIO = routeDefinition("B");
