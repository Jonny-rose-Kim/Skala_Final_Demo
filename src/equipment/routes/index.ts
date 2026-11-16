/**
 * Linked demonstration routes A (CCP) and B (Remote ICP PECVD):
 *   Prepared STI input (external) → deposition illustration → return to FOUP (simplified internal transfer, door closed) →
 *   OHT pickup / travel / dropoff → STI CMP + Clean / Rinse / Dry → return to FOUP
 * One presentation clock drives all four instances; every instance's pose, the carrier / wafer holders,
 * slot occupancy and the IllustrativeFilmState are rebuilt from (t, scenario) so scrubbing backwards restores
 * the earlier state (including the incoming film state before deposition) without replaying events.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState, routeById, type RouteDef } from "../../domain/materialFlow";
import { emptyInstancePreview, type CarrierPreview, type HolderKind, type PreviewState, type WaferHolder } from "../../presentation/preview";
import { DEFAULT_SCENARIO, evaluateScenario, phaseAt, type ScenarioContext, type ScenarioDefinition, type ScenarioPhase, type VisualScenario } from "../../presentation/scenario";
import { CCP_TEMPLATE_ID } from "../ccp/index";
import { CMP_LAYOUT } from "../cmp/layout";
import { applyCmpFilm, cmpSequence, CMP_SCENARIO } from "../cmp/scenario";
import { CMP_TEMPLATE_ID } from "../cmp/template";
import { OHT_LAYOUT } from "../oht/layout";
import { ohtSequence, OHT_SCENARIO, planTransfer } from "../oht/scenario";
import { OHT_TEMPLATE_ID } from "../oht/template";
import { applyOvercoat, remoteCycleEffects, REMOTE_SCENARIO } from "../remote/scenario";
import { REMOTE_TEMPLATE_ID } from "../remote/template";

/** CCP plasma cycle without the hold (the linked demonstration keeps playing). */
function ccpDepositionScenario(): VisualScenario {
  return { ...DEFAULT_SCENARIO, phases: DEFAULT_SCENARIO.phases.map((p) => ({ ...p, holdUntilRelease: false })) };
}

/** Deposition tool segment (local phases) with a short load-in before and a return-to-FOUP after it. */
function depositionSegment(route: RouteDef): { phases: ScenarioPhase[]; duration: number; depStart: number; depScenario: VisualScenario } {
  const isCcp = route.routeId === "A";
  const eq = isCcp ? "ccp" : "remote";
  const loadIn = 4;
  const returnOut = 4;
  const dep = isCcp ? ccpDepositionScenario() : REMOTE_SCENARIO;
  const phases: ScenarioPhase[] = [
    { id: "ext_prepared", label: "External: prepared STI wafer in FOUP", labelKo: "외부 준비 공정 완료 (prepared STI wafer, FOUP 내)", start: 0, end: 2, equipment: "external" },
    { id: "dep_load", label: "Load wafer (simplified internal transfer)", labelKo: "Wafer 반입 (simplified internal transfer)", start: 2, end: 2 + loadIn, equipment: eq },
  ];
  let t = 2 + loadIn;
  const depStart = t;
  for (const p of dep.phases) phases.push({ ...p, id: `dep_${p.id}`, start: t + p.start, end: t + p.end, equipment: eq, holdUntilRelease: false });
  t += dep.durationSec;
  phases.push({ id: "dep_return", label: "Return to FOUP · door closed", labelKo: "FOUP 복귀 · door 닫힘 (simplified internal transfer)", start: t, end: t + returnOut, equipment: eq });
  t += returnOut;
  return { phases, duration: t, depStart, depScenario: dep };
}

export function buildRouteScenario(route: RouteDef): VisualScenario {
  const dep = depositionSegment(route);
  const phases = [...dep.phases];
  let t = dep.duration;
  for (const p of OHT_SCENARIO.phases) phases.push({ ...p, start: t + p.start, end: t + p.end, equipment: "oht" });
  t += OHT_SCENARIO.durationSec;
  for (const p of CMP_SCENARIO.phases) phases.push({ ...p, id: `cmp_${p.id}`, start: t + p.start, end: t + p.end, equipment: "cmp" });
  t += CMP_SCENARIO.durationSec;
  phases.push({ id: "route_complete", label: "Visual sequence complete", labelKo: "완료 (Visual sequence complete)", start: t, end: t + 3, equipment: "carrier" });
  t += 3;
  return { id: `route-${route.routeId.toLowerCase()}-linked-v1`, title: route.title, durationSec: t, phases, renderSource: "illustrative" };
}

interface Segments {
  depStart: number;
  depEnd: number;
  loadStart: number;
  returnEnd: number;
  ohtStart: number;
  ohtEnd: number;
  cmpStart: number;
  cmpEnd: number;
}

export function routeSegments(route: RouteDef): Segments {
  const dep = depositionSegment(route);
  const depStart = dep.depStart;
  const depEnd = depStart + dep.depScenario.durationSec;
  const returnEnd = dep.duration;
  const ohtStart = returnEnd;
  const ohtEnd = ohtStart + OHT_SCENARIO.durationSec;
  const cmpStart = ohtEnd;
  const cmpEnd = cmpStart + CMP_SCENARIO.durationSec;
  return { depStart, depEnd, loadStart: 2, returnEnd, ohtStart, ohtEnd, cmpStart, cmpEnd };
}

export function routePreview(route: RouteDef, scenario: VisualScenario, t: number, seed: number, animT: number, ctx: ScenarioContext): PreviewState {
  const S = routeSegments(route);
  const phase = phaseAt(scenario, t);
  const out: PreviewState = { scenarioId: scenario.id, t, phaseId: phase.id, phaseLabel: phase.label, phaseLabelKo: phase.labelKo, phaseFocusInstanceId: null, instances: {}, carriers: {}, wafers: {}, plasma: { intensity: 0, flicker: 0 }, blockedReason: null };
  for (const inst of ctx.instances) out.instances[inst.instanceId] = emptyInstancePreview(inst.instanceId);
  const depInst = ctx.instances.find((i) => i.instanceId === route.depositionInstanceId);
  const cmpInst = ctx.instances.find((i) => i.instanceId === route.cmpInstanceId);
  const ohtInst = ctx.instances.find((i) => i.instanceId === route.ohtInstanceId);
  const srcStation = Object.values(ctx.stations).find((s) => s.instanceId === route.depositionInstanceId);
  const dstStation = Object.values(ctx.stations).find((s) => s.instanceId === route.cmpInstanceId);
  if (!depInst || !cmpInst || !ohtInst || !srcStation || !dstStation) {
    out.blockedReason = "Preview blocked: route instances or stations missing";
    return out;
  }
  // ---------------------------------------------------------------- deposition tool
  let film = incomingFilmState(DEMO_WAFER.waferId);
  let waferHolder: WaferHolder = { kind: "carrier_slot", carrierId: DEMO_CARRIER.carrierId, slotId: DEMO_RESERVED_SLOT.slotId };
  let waferInSlot = true;
  let waferPresentedAt: { instanceId: string; assetId?: string } | null = null;
  let frontside: [number, number, number] = [0, 1, 0];
  const dp = out.instances[depInst.instanceId];
  const isCcp = route.routeId === "A";
  const depT = t - S.depStart;
  if (t >= S.loadStart && t < S.depStart) {
    waferHolder = { kind: "internal_transfer", instanceId: depInst.instanceId, noteKo: "Simplified internal transfer (EFEM · load lock)" };
    waferInSlot = false;
    dp.phaseLabelKo = phase.labelKo;
  } else if (t >= S.depStart && t < S.depEnd) {
    waferHolder = { kind: "process_stage", instanceId: depInst.instanceId };
    waferInSlot = false;
    waferPresentedAt = { instanceId: depInst.instanceId };
    if (isCcp) {
      const sample = evaluateScenario(ccpDepositionScenario(), depT, seed, animT - S.depStart);
      dp.effects = { plasmaIntensity: sample.intensity, plasmaFlicker: sample.flicker };
      out.plasma = { intensity: sample.intensity, flicker: sample.flicker };
      const stable = DEFAULT_SCENARIO.phases.find((p) => p.id === "stable")!;
      const overcoat = depT <= stable.start ? 0 : depT >= stable.end ? 1 : (depT - stable.start) / (stable.end - stable.start);
      film = applyOvercoat(film, overcoat, depT < stable.end && depT >= stable.start ? "deposition" : "x");
    } else {
      const fx = remoteCycleEffects(REMOTE_SCENARIO, depT, seed, animT - S.depStart);
      dp.effects = { plasmaIntensity: fx.intensity, plasmaFlicker: fx.flicker, sourceGasFlow: fx.sourceGasFlow, precursorFlow: fx.precursorFlow };
      out.plasma = { intensity: fx.intensity, flicker: fx.flicker };
      film = applyOvercoat(film, fx.overcoat, fx.phaseId);
    }
    dp.phaseLabelKo = phase.labelKo;
  } else if (t >= S.depEnd) {
    film = applyOvercoat(film, 1, "done");
    if (t < S.returnEnd) {
      const back = t >= S.returnEnd - 1.0;
      waferHolder = back ? { kind: "carrier_slot", carrierId: DEMO_CARRIER.carrierId, slotId: DEMO_RESERVED_SLOT.slotId } : { kind: "internal_transfer", instanceId: depInst.instanceId, noteKo: "Simplified internal transfer (return)" };
      waferInSlot = back;
      dp.phaseLabelKo = phase.labelKo;
    } else dp.phaseLabelKo = "완료 (wafer 반출)";
  } else dp.phaseLabelKo = "대기 (prepared wafer in FOUP)";
  dp.flags = { gateClosed: true };
  // ---------------------------------------------------------------- OHT
  const plan = planTransfer(OHT_LAYOUT, ohtInst, ctx.stations, srcStation.stationId, dstStation.stationId);
  out.blockedReason = plan.blockedReason;
  const ohtT = Math.min(Math.max(t - S.ohtStart, 0), OHT_SCENARIO.durationSec - 1e-6);
  const ohtState = ohtSequence(OHT_LAYOUT, plan, ohtT);
  const op = out.instances[ohtInst.instanceId];
  op.joints = ohtState.joints;
  op.flags = ohtState.flags;
  op.phaseLabelKo = t < S.ohtStart ? "대기 (pickup 전: FOUP door 닫힘 대기)" : t >= S.ohtEnd ? "완료 (carrier at CMP load port)" : phase.labelKo;
  const carrier: CarrierPreview = {
    carrierId: DEMO_CARRIER.carrierId,
    holder: t < S.ohtStart ? { kind: "station", id: srcStation.stationId } : t >= S.ohtEnd ? { kind: "station", id: dstStation.stationId } : ohtState.holder,
    doorOpen: false,
    slots: { [DEMO_RESERVED_SLOT.slotId]: null },
    docked: true,
    yawFromStationId: ohtState.yawFromStationId,
  };
  // ---------------------------------------------------------------- CMP
  const cp = out.instances[cmpInst.instanceId];
  if (t >= S.cmpStart) {
    const cmpT = Math.min(t - S.cmpStart, CMP_SCENARIO.durationSec - 1e-6);
    const cs = cmpSequence(CMP_LAYOUT, cmpT);
    cp.joints = cs.joints;
    cp.effects = cs.effects;
    cp.flags = cs.flags;
    cp.phaseLabelKo = t >= S.cmpEnd ? "완료 (Visual sequence complete)" : phase.labelKo;
    film = applyCmpFilm(film, cs.film);
    frontside = cs.frontsideNormalLocal;
    if (cs.holder === "carrier_slot") {
      waferHolder = { kind: "carrier_slot", carrierId: DEMO_CARRIER.carrierId, slotId: DEMO_RESERVED_SLOT.slotId };
      waferInSlot = true;
    } else {
      waferHolder = { kind: cs.holder as HolderKind, instanceId: cmpInst.instanceId, noteKo: cs.holder === "internal_transfer" ? "Simplified internal transfer (dry / wet)" : undefined };
      waferInSlot = false;
      waferPresentedAt = cs.presentedAssetId ? { instanceId: cmpInst.instanceId, assetId: cs.presentedAssetId } : null;
    }
  } else {
    const cs = cmpSequence(CMP_LAYOUT, 0);
    cp.joints = cs.joints;
    cp.effects = { slurryFlow: 0, padWet: 0, rinseFlow: 0 };
    cp.flags = { hatchOpen: false, headContact: false, opticalInView: "Out of view", conditioning: false };
    cp.phaseLabelKo = "대기 (carrier 도착 전)";
  }
  // ---------------------------------------------------------------- wafer presentation + carrier slots
  if (waferPresentedAt) {
    const ip = out.instances[waferPresentedAt.instanceId];
    ip.presentedWaferId = DEMO_WAFER.waferId;
    ip.presentedWaferAssetId = waferPresentedAt.assetId;
  }
  carrier.slots[DEMO_RESERVED_SLOT.slotId] = waferInSlot ? DEMO_WAFER.waferId : null;
  out.carriers[DEMO_CARRIER.carrierId] = carrier;
  out.wafers[DEMO_WAFER.waferId] = { waferId: DEMO_WAFER.waferId, holder: waferHolder, reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: frontside, film };
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
