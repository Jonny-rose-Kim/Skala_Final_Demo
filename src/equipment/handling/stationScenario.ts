/**
 * Scenario glue for the station handling of the chamber-type tools: maps a time inside the
 * load / process / unload timeline to the tool joints, FOUP door joints, carrier docking, wafer holder,
 * presented wafer asset and gate flags of the preview. Pure functions of time.
 */
import type { CarrierPreview, IllustrativeFilmState, InstancePreview, PreviewState, WaferPreview } from "../../presentation/preview";
import { evaluateTrack, type MotionStep } from "../../presentation/motionTrack";
import type { PhaseEquipment, ScenarioPhase } from "../../presentation/scenario";
import { foupDoorJoints, stationGates, stationHomeValues, stationJointValues, stationPresentedAsset, stationWaferHolder, type StationHolder, type StationPlan } from "./stationSequence";

export type StationSegment = "before" | "load" | "process" | "unload" | "after";

export interface StationTimeline {
  loadStart: number;
  processStart: number;
  processEnd: number;
  unloadEnd: number;
}

export function stationTimeline(plan: StationPlan, loadStart: number, processDuration: number): StationTimeline {
  const processStart = loadStart + plan.loadDuration;
  const processEnd = processStart + processDuration;
  return { loadStart, processStart, processEnd, unloadEnd: processEnd + plan.unloadDuration };
}

export interface StationState {
  segment: StationSegment;
  values: Record<string, number>;
  holder: StationHolder;
  labelKo: string;
  stepId: string;
  flags: Record<string, boolean | string>;
}

export function stationStateAt(plan: StationPlan, tl: StationTimeline, t: number): StationState {
  if (t < tl.loadStart) return { segment: "before", values: { ...plan.loadInitial.values }, holder: "foup", labelKo: "대기 (wafer in FOUP)", stepId: "", flags: { ...(plan.loadInitial.flags ?? {}) } };
  if (t < tl.processStart) {
    const st = evaluateTrack(plan.load, plan.loadInitial, t - tl.loadStart);
    return { segment: "load", values: st.values, holder: st.holder, labelKo: st.labelKo, stepId: st.stepId, flags: st.flags };
  }
  if (t < tl.processEnd) return { segment: "process", values: { ...plan.unloadInitial.values }, holder: "stage", labelKo: "Process (stage at process position)", stepId: "process", flags: { ...(plan.unloadInitial.flags ?? {}) } };
  const st = evaluateTrack(plan.unload, plan.unloadInitial, Math.min(t - tl.processEnd, plan.unloadDuration));
  return { segment: t < tl.unloadEnd ? "unload" : "after", values: st.values, holder: st.holder, labelKo: t < tl.unloadEnd ? st.labelKo : "완료 (wafer back in FOUP, undocked)", stepId: st.stepId, flags: st.flags };
}

/** Steady state of a station tool that is not handling (robot home, gates closed, stage at process). */
export function stationIdleJoints(plan: StationPlan): Record<string, number> {
  return stationJointValues(plan, stationHomeValues(plan));
}

export interface StationApplyArgs {
  out: PreviewState;
  plan: StationPlan;
  state: StationState;
  toolInstanceId: string;
  foupInstanceId: string | null;
  stationId: string;
  carrierId: string;
  waferId: string;
  slotId: string;
  stageWaferAssetId: string;
  film: IllustrativeFilmState;
  reservedSlot: { carrierId: string; slotId: string };
}

/** Write the station state into the preview (tool joints, FOUP door, carrier docking, wafer holder). */
export function applyStationState(a: StationApplyArgs): void {
  const ip: InstancePreview = a.out.instances[a.toolInstanceId];
  const v = a.state.values;
  ip.joints = { ...ip.joints, ...stationJointValues(a.plan, v) };
  const gates = stationGates(v);
  ip.flags = { ...ip.flags, gateClosed: !gates.slitGateOpen, slitGateOpen: gates.slitGateOpen, atmDoorOpen: gates.atmDoorOpen, loadLockState: String(a.state.flags.llState ?? "atmosphere"), handlingStep: a.state.stepId };
  const asset = stationPresentedAsset(a.state.holder, a.stageWaferAssetId);
  if (asset) {
    ip.presentedWaferId = a.waferId;
    ip.presentedWaferAssetId = asset;
  }
  if (a.foupInstanceId && a.out.instances[a.foupInstanceId]) {
    const fp = a.out.instances[a.foupInstanceId];
    fp.joints = { ...fp.joints, ...foupDoorJoints(v) };
    if (a.state.holder === "foup") {
      fp.presentedWaferId = a.waferId;
      fp.presentedWaferAssetId = "foup_wafer";
    }
  }
  const inSlot = a.state.holder === "foup";
  const carrier: CarrierPreview = {
    carrierId: a.carrierId,
    holder: { kind: "station", id: a.stationId },
    doorOpen: gates.foupDoorOpen,
    slots: { [a.slotId]: inSlot ? a.waferId : null },
    docked: v.dock > a.plan.S.loadPort.dockStroke - 1e-4,
    dockOffset: v.dock,
  };
  a.out.carriers[a.carrierId] = carrier;
  const wafer: WaferPreview = {
    waferId: a.waferId,
    holder: stationWaferHolder(a.state.holder, a.toolInstanceId, a.carrierId, a.slotId, v.pins),
    reservedSlot: a.reservedSlot,
    frontsideNormalLocal: [0, 1, 0],
    film: a.film,
    wetState: "dry",
  };
  a.out.wafers[a.waferId] = wafer;
}

/** Group consecutive steps of a track into timeline phases (`groups` lists the last step id of each phase). */
export function phasesFromSteps<H>(steps: MotionStep<H>[], groups: { id: string; label: string; labelKo: string; lastStep: string }[], t0: number, equipment: PhaseEquipment): ScenarioPhase[] {
  const phases: ScenarioPhase[] = [];
  let t = t0;
  let gi = 0;
  let start = t0;
  for (const s of steps) {
    t += s.duration;
    const g = groups[gi];
    if (g && s.id === g.lastStep) {
      phases.push({ id: g.id, label: g.label, labelKo: g.labelKo, start, end: t, equipment });
      start = t;
      gi++;
    }
  }
  if (start < t - 1e-9) phases.push({ id: `${groups[groups.length - 1]?.id ?? "handling"}_tail`, label: "Handling", labelKo: "Handling", start, end: t, equipment });
  return phases;
}

export const LOAD_GROUPS = [
  { id: "h_dock_open", label: "FOUP dock / door open", labelKo: "FOUP dock·door open", lastStep: "foup_door_lower" },
  { id: "h_atm_in", label: "Atmospheric robot: FOUP to load lock", labelKo: "대기 robot: FOUP → load lock", lastStep: "ll_door_close" },
  { id: "h_pumpdown", label: "Load lock pump-down (scripted)", labelKo: "Load lock pump-down (scripted)", lastStep: "ll_pumpdown" },
  { id: "h_vac_in", label: "Vacuum transfer: load lock to chamber", labelKo: "진공 이송: load lock → chamber", lastStep: "slit_close" },
  { id: "h_stage_up", label: "Pins down / stage to process", labelKo: "Pin 하강·stage 상승", lastStep: "stage_up" },
];

export const UNLOAD_GROUPS = [
  { id: "h_stage_down", label: "Stage to transfer / pins up", labelKo: "Stage 하강·pin 상승", lastStep: "pins_lift" },
  { id: "h_vac_out", label: "Vacuum transfer: chamber to load lock", labelKo: "진공 이송: chamber → load lock", lastStep: "ll_pins_up" },
  { id: "h_vent", label: "Cooldown readiness / vent (scripted)", labelKo: "Cooldown readiness·vent (scripted)", lastStep: "ll_vent" },
  { id: "h_atm_out", label: "Atmospheric robot: load lock to FOUP", labelKo: "대기 robot: load lock → FOUP", lastStep: "robot_home" },
  { id: "h_close", label: "FOUP door close / undock", labelKo: "FOUP door close·undock", lastStep: "lp_undock" },
];
