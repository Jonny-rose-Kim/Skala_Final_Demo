/**
 * Current default route (versioned): Producer deposition -> external lithography (explicit transition at the
 * Producer load port) -> OHT leg 1 -> Tactras oxide etch -> external resist strip (explicit transition at the
 * Tactras load port) -> OHT leg 2 -> CELLESTA post-etch clean / rinse / dry. One wafer (W-01) in one FOUP
 * (FOUP-01) keeps its identity end to end; exactly one holder at any time. Pure in presentation time: the
 * same t always gives the same poses, holders and wafer state (scrub, reverse, Restart, Exploded agree).
 *
 * The two OHT legs are planned independently (own source / destination stations and start pose); leg 2
 * starts where leg 1 stopped. No pattern appears while the FOUP travels: the mask changes only inside the
 * named external step. Each tool's evaluator is the tool's own (no CMP or Remote evaluator is involved).
 */
import { CURRENT_RECIPES, DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, ROUTE_DEP_ETCH_CLEAN, type ProcessRouteDef } from "../../domain/materialFlow";
import { demoTrace } from "../../domain/traceability";
import { WAFER_STEPS, applyExternalMask, externalResistStrip, routeIncomingState } from "../../domain/waferState";
import type { EquipmentInstanceDef } from "../../domain/types";
import { emptyInstancePreview, type IllustrativeFilmState, type PreviewState, type RouteCard } from "../../presentation/preview";
import { phaseAt, type ScenarioContext, type ScenarioDefinition, type ScenarioPhase, type VisualScenario } from "../../presentation/scenario";
import { applyCellesta, CELLESTA_PLAN, cellestaPhases, cellestaTimeline } from "../cellesta/scenario";
import { CELLESTA_TEMPLATE_ID } from "../cellesta/template";
import { CLW_LAYOUT } from "../clw/layout";
import { CLW_TEMPLATE_ID } from "../clw/template";
import { stationHandlingPhases, type ProcessSegment } from "../handling/handlingScenario";
import { applyStationState, stationStateAt, stationTimeline, type StationTimeline } from "../handling/stationScenario";
import type { StationPlan } from "../handling/stationSequence";
import { idleToolPose } from "../idle";
import { ohtSequence, planTransfer } from "../oht/scenario";
import { CLW_TRANSFER_SCENARIO as OHT_SCENARIO } from "../clw/scenario";
import { PRODUCER_STATION_PLAN } from "../producer/handling";
import { PRODUCER_PROCESS_SEGMENT } from "../producer/scenario";
import { PRODUCER_TEMPLATE_ID } from "../producer/template";
import { TACTRAS_STATION_PLAN } from "../tactras/handling";
import { TACTRAS_PROCESS_SEGMENT } from "../tactras/scenario";
import { TACTRAS_TEMPLATE_ID } from "../tactras/template";

export const ROUTE = ROUTE_DEP_ETCH_CLEAN;
const EXTERNAL_SEC = 6;
const START_SEC = 1;
const COMPLETE_SEC = 3;

export interface CurrentRouteTimeline {
  dep: StationTimeline;
  litho: [number, number];
  leg1: [number, number];
  etch: StationTimeline;
  strip: [number, number];
  leg2: [number, number];
  clean: ReturnType<typeof cellestaTimeline>;
  total: number;
}

export function currentRouteTimeline(): CurrentRouteTimeline {
  const dep = stationTimeline(PRODUCER_STATION_PLAN, START_SEC, PRODUCER_PROCESS_SEGMENT.scenario.durationSec);
  const litho: [number, number] = [dep.unloadEnd, dep.unloadEnd + EXTERNAL_SEC];
  const leg1: [number, number] = [litho[1], litho[1] + OHT_SCENARIO.durationSec];
  const etch = stationTimeline(TACTRAS_STATION_PLAN, leg1[1], TACTRAS_PROCESS_SEGMENT.scenario.durationSec);
  const strip: [number, number] = [etch.unloadEnd, etch.unloadEnd + EXTERNAL_SEC];
  const leg2: [number, number] = [strip[1], strip[1] + OHT_SCENARIO.durationSec];
  const clean = cellestaTimeline(CELLESTA_PLAN, leg2[1]);
  return { dep, litho, leg1, etch, strip, leg2, clean, total: clean.unloadEnd + COMPLETE_SEC };
}

export const ROUTE_TL = currentRouteTimeline();

function ohtPhases(t0: number, prefix: string): ScenarioPhase[] {
  return OHT_SCENARIO.phases.map((p) => ({ ...p, id: `${prefix}${p.id}`, start: t0 + p.start, end: t0 + p.end, equipment: "oht" as const }));
}

function buildPhasesOfRoute(): ScenarioPhase[] {
  const T = ROUTE_TL;
  const proc = (plan: StationPlan, process: ProcessSegment, tl: StationTimeline, prefix: string) => stationHandlingPhases({ plan, process }, tl, prefix);
  return [
    { id: "route_start", label: "Route start (bare wafer in FOUP-01)", labelKo: "Route 시작: bare wafer in FOUP-01 (LP.PRODUCER-01)", start: 0, end: START_SEC, equipment: "carrier" },
    ...proc(PRODUCER_STATION_PLAN, PRODUCER_PROCESS_SEGMENT, T.dep, "dep_"),
    { id: "ext_litho", label: "External lithography / mask preparation (outside this scene)", labelKo: "외부 노광·mask 준비 (장면 밖, 시연 전환)", start: T.litho[0], end: T.litho[1], equipment: "external" },
    ...ohtPhases(T.leg1[0], "l1_"),
    ...proc(TACTRAS_STATION_PLAN, TACTRAS_PROCESS_SEGMENT, T.etch, "etch_"),
    { id: "ext_strip", label: "External resist strip (outside this scene, recipe-dependent)", labelKo: "외부 resist strip (장면 밖, recipe-dependent)", start: T.strip[0], end: T.strip[1], equipment: "external" },
    ...ohtPhases(T.leg2[0], "l2_"),
    ...cellestaPhases(CELLESTA_PLAN, T.clean, "cl_"),
    { id: "route_complete", label: "Route complete (dry wafer back in FOUP-01)", labelKo: "Route 완료: dry wafer, FOUP-01 (LP.CLEAN-01)", start: T.clean.unloadEnd, end: T.total, equipment: "carrier" },
  ];
}

export const CURRENT_ROUTE_SCENARIO_DEF: VisualScenario = { id: "route-dep-etch-clean-v1", title: ROUTE.title, durationSec: ROUTE_TL.total, phases: buildPhasesOfRoute(), renderSource: "illustrative" };

const recipeRevision = (id: string) => CURRENT_RECIPES.find((r) => r.recipeId === id)?.revision ?? null;

function find(ctx: ScenarioContext, instanceId: string | undefined, templateId: string): EquipmentInstanceDef | undefined {
  return ctx.instances.find((i) => i.instanceId === instanceId) ?? ctx.instances.find((i) => i.templateId === templateId);
}

/** Film of W-01 at the start of each segment (pure; each step owns its own transition). */
function filmAt(t: number): { film: IllustrativeFilmState; stepId: string | null } {
  const T = ROUTE_TL;
  let f = routeIncomingState(DEMO_WAFER.waferId);
  if (t < T.dep.processStart) return { film: f, stepId: t < START_SEC ? null : WAFER_STEPS.deposition };
  if (t < T.dep.processEnd) {
    const s = PRODUCER_PROCESS_SEGMENT.sample(t - T.dep.processStart, 0, 0);
    return { film: s.film(f), stepId: WAFER_STEPS.deposition };
  }
  f = PRODUCER_PROCESS_SEGMENT.done(f);
  if (t < T.litho[1]) return { film: t < T.dep.unloadEnd ? f : { ...f, status: "deposited" }, stepId: t < T.litho[0] ? WAFER_STEPS.deposition : WAFER_STEPS.lithography };
  f = applyExternalMask(f, ROUTE.maskKind);
  if (t < T.etch.processStart) return { film: f, stepId: t < T.leg1[1] ? "S30_OHT_LEG_1" : WAFER_STEPS.etch };
  if (t < T.etch.processEnd) {
    const s = TACTRAS_PROCESS_SEGMENT.sample(t - T.etch.processStart, 0, 0);
    return { film: s.film(f), stepId: WAFER_STEPS.etch };
  }
  f = TACTRAS_PROCESS_SEGMENT.done(f);
  if (t < T.strip[1]) return { film: f, stepId: t < T.strip[0] ? WAFER_STEPS.etch : WAFER_STEPS.strip };
  f = externalResistStrip(f);
  return { film: f, stepId: t < T.leg2[1] ? "S60_OHT_LEG_2" : WAFER_STEPS.clean };
}

export function currentRoutePreview(t: number, seed: number, animT: number, ctx: ScenarioContext): PreviewState {
  const S = CURRENT_ROUTE_SCENARIO_DEF;
  const T = ROUTE_TL;
  const phase = phaseAt(S, t);
  const out: PreviewState = { scenarioId: S.id, t, phaseId: phase.id, phaseLabel: phase.label, phaseLabelKo: phase.labelKo, phaseFocusInstanceId: null, instances: {}, carriers: {}, wafers: {}, plasma: { intensity: 0, flicker: 0 }, blockedReason: null, routeCard: null, trace: null };
  for (const inst of ctx.instances) {
    const p = emptyInstancePreview(inst.instanceId);
    p.joints = idleToolPose(inst.templateId);
    out.instances[inst.instanceId] = p;
  }
  const steps = ROUTE.steps;
  const dep = find(ctx, steps[0].instanceId, PRODUCER_TEMPLATE_ID);
  const etch = find(ctx, steps[3].instanceId, TACTRAS_TEMPLATE_ID);
  const clean = find(ctx, steps[6].instanceId, CELLESTA_TEMPLATE_ID);
  const oht = find(ctx, steps[2].instanceId, CLW_TEMPLATE_ID);
  const foup = ctx.instances.find((i) => i.instanceId === ROUTE.carrierId);
  const stationOf = (inst?: EquipmentInstanceDef) => (inst ? Object.values(ctx.stations).find((s) => s.instanceId === inst.instanceId) : undefined);
  const depSt = stationOf(dep);
  const etchSt = stationOf(etch);
  const cleanSt = stationOf(clean);
  if (!dep || !etch || !clean || !oht || !foup || !depSt || !etchSt || !cleanSt) {
    out.blockedReason = "Preview blocked: route needs PRODUCER, ETCH, CLEAN, OHT, FOUP-01 and their load-port stations";
    return out;
  }
  const leg1 = planTransfer(CLW_LAYOUT, oht, ctx.stations, depSt.stationId, etchSt.stationId);
  const leg2 = planTransfer(CLW_LAYOUT, oht, ctx.stations, etchSt.stationId, cleanSt.stationId, { startS: leg1.dst.s });
  const { film, stepId } = filmAt(t);
  out.trace = demoTrace(ROUTE, stepId, t, recipeRevision);
  const station = (plan: StationPlan, process: ProcessSegment, tl: StationTimeline, tool: EquipmentInstanceDef, stationId: string, f: IllustrativeFilmState) => {
    const st = stationStateAt(plan, tl, t);
    if (st.segment === "process") {
      const s = process.sample(t - tl.processStart, seed, animT - tl.processStart);
      out.instances[tool.instanceId].effects = { ...s.effects };
      out.plasma = { ...s.plasma };
    }
    applyStationState({ out, plan, state: st, toolInstanceId: tool.instanceId, foupInstanceId: foup.instanceId, stationId, carrierId: ROUTE.carrierId, waferId: ROUTE.waferId, slotId: ROUTE.slotId, stageWaferAssetId: "wafer", film: f, reservedSlot: DEMO_RESERVED_SLOT });
    out.instances[tool.instanceId].phaseLabelKo = st.segment === "process" ? phase.labelKo : st.labelKo;
  };
  const parkedAt = (stationId: string, f: IllustrativeFilmState, card: RouteCard | null) => {
    out.carriers[ROUTE.carrierId] = { carrierId: ROUTE.carrierId, holder: { kind: "station", id: stationId }, doorOpen: false, slots: { [ROUTE.slotId]: ROUTE.waferId }, docked: false, dockOffset: 0 };
    out.wafers[ROUTE.waferId] = { waferId: ROUTE.waferId, holder: { kind: "carrier_slot", carrierId: ROUTE.carrierId, slotId: ROUTE.slotId }, reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: [0, 1, 0], film: f, wetState: "dry" };
    out.instances[foup.instanceId].presentedWaferId = ROUTE.waferId;
    out.instances[foup.instanceId].presentedWaferAssetId = "foup_wafer";
    out.routeCard = card;
  };
  const leg = (plan: typeof leg1, t0: number, f: IllustrativeFilmState) => {
    const st = ohtSequence(CLW_LAYOUT, plan, t - t0, OHT_SCENARIO);
    const ip = out.instances[oht.instanceId];
    ip.joints = st.joints;
    ip.flags = st.flags;
    ip.phaseLabelKo = phase.labelKo;
    if (plan.blockedReason) out.blockedReason = plan.blockedReason;
    out.carriers[ROUTE.carrierId] = { carrierId: ROUTE.carrierId, holder: st.holder, doorOpen: false, slots: { [ROUTE.slotId]: ROUTE.waferId }, docked: false, yawFromStationId: st.yawFromStationId };
    out.wafers[ROUTE.waferId] = { waferId: ROUTE.waferId, holder: { kind: "carrier_slot", carrierId: ROUTE.carrierId, slotId: ROUTE.slotId }, reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: [0, 1, 0], film: f, wetState: "dry" };
    out.instances[foup.instanceId].presentedWaferId = ROUTE.waferId;
    out.instances[foup.instanceId].presentedWaferAssetId = "foup_wafer";
  };
  // the OHT stays where its last leg ended (or parked before leg 1)
  const ohtIp = out.instances[oht.instanceId];
  if (t >= T.leg1[1]) ohtIp.joints = ohtSequence(CLW_LAYOUT, leg1, OHT_SCENARIO.durationSec, OHT_SCENARIO).joints;
  if (t >= T.leg2[1]) ohtIp.joints = ohtSequence(CLW_LAYOUT, leg2, OHT_SCENARIO.durationSec, OHT_SCENARIO).joints;
  if (t < T.litho[0]) {
    station(PRODUCER_STATION_PLAN, PRODUCER_PROCESS_SEGMENT, T.dep, dep, depSt.stationId, film);
    out.phaseFocusInstanceId = dep.instanceId;
  } else if (t < T.litho[1]) {
    parkedAt(depSt.stationId, film, { stepId: WAFER_STEPS.lithography, kind: "external", titleKo: "외부 노광·mask 준비 (시연 전환)", bodyKo: "이 단계를 하는 장비는 이 장면에 없다. FOUP-01이 장면 밖 노광 공정을 거쳐 같은 load port로 돌아온 것으로 간주하고, 이 단계 끝에서 photoresist mask가 생긴다. OHT 이동 중에는 wafer 상태가 바뀌지 않는다." });
    out.phaseFocusInstanceId = dep.instanceId;
  } else if (t < T.leg1[1]) {
    leg(leg1, T.leg1[0], film);
    out.phaseFocusInstanceId = oht.instanceId;
  } else if (t < T.strip[0]) {
    station(TACTRAS_STATION_PLAN, TACTRAS_PROCESS_SEGMENT, T.etch, etch, etchSt.stationId, film);
    out.phaseFocusInstanceId = etch.instanceId;
  } else if (t < T.strip[1]) {
    parkedAt(etchSt.stationId, film, { stepId: WAFER_STEPS.strip, kind: "external", titleKo: "외부 resist strip (시연 전환)", bodyKo: "Photoresist mask는 장면 밖 strip 단계에서 제거한 것으로 둔다(recipe-dependent integration 가정). Hard mask였다면 이 단계가 mask를 지우지 않는다. 다음 세정이 mask를 지우지는 않는다." });
    out.phaseFocusInstanceId = etch.instanceId;
  } else if (t < T.leg2[1]) {
    leg(leg2, T.leg2[0], film);
    out.phaseFocusInstanceId = oht.instanceId;
  } else {
    const r = applyCellesta({ out, plan: CELLESTA_PLAN, tl: T.clean, t, toolInstanceId: clean.instanceId, foupInstanceId: foup.instanceId, stationId: cleanSt.stationId, incoming: film });
    out.instances[clean.instanceId].phaseLabelKo = r.labelKo;
    out.phaseFocusInstanceId = clean.instanceId;
  }
  // tools that already handled the wafer stand idle; their station state "after" equals the idle pose
  void DEMO_CARRIER;
  return out;
}

export const CURRENT_ROUTE_SCENARIO: ScenarioDefinition = {
  id: CURRENT_ROUTE_SCENARIO_DEF.id,
  title: CURRENT_ROUTE_SCENARIO_DEF.title,
  titleKo: "증착 → 외부 노광 → 식각 → 외부 strip → 세정 (route v1)",
  kind: "linked",
  scenario: CURRENT_ROUTE_SCENARIO_DEF,
  requiredInstanceIds: ["PRODUCER-01", "ETCH-01", "CLEAN-01", "OHT-01", "FOUP-01"],
  requiredTemplateIds: [PRODUCER_TEMPLATE_ID, TACTRAS_TEMPLATE_ID, CELLESTA_TEMPLATE_ID, CLW_TEMPLATE_ID],
  evaluate: currentRoutePreview,
};

export type { ProcessRouteDef };
