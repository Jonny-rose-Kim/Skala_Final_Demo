/**
 * CELLESTA standalone demonstration (and the clean segment of the route): dry FOUP -> EFEM robot -> pass
 * station -> transfer robot -> spin chuck -> clean / rinse / IPA-atmosphere dry -> dry-confirmed -> back to
 * the reserved slot. Pure in presentation time. The wet clean only reduces the schematic residue; the mask
 * and the oxide are untouched, and the wafer is dry before any robot takes it out.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER } from "../../domain/materialFlow";
import { standaloneIncoming, wetCleanResidue, type CleanPhase } from "../../domain/waferState";
import { evaluateTrack } from "../../presentation/motionTrack";
import { emptyInstancePreview, type CarrierPreview, type IllustrativeFilmState, type PreviewState, type WaferHolder, type WaferWetState } from "../../presentation/preview";
import { phaseAt, type ScenarioContext, type ScenarioDefinition, type ScenarioPhase, type VisualScenario } from "../../presentation/scenario";
import { slotIndex } from "../foup/index";
import { phasesFromSteps } from "../handling/stationScenario";
import { idleToolPose } from "../idle";
import { CELLESTA_LAYOUT } from "./layout";
import { CELLESTA_PROCESS_DURATION, CELLESTA_PROCESS_PHASES, cellestaJointValues, cellestaProcessAt, planCellesta, type CellestaHolder, type CellestaPlan } from "./sequence";
import { CELLESTA_TEMPLATE_ID } from "./template";

export const CELLESTA_PLAN: CellestaPlan = planCellesta(CELLESTA_LAYOUT, slotIndex(DEMO_RESERVED_SLOT.slotId));

export interface CellestaTimeline {
  loadStart: number;
  processStart: number;
  processEnd: number;
  unloadEnd: number;
}

export function cellestaTimeline(plan: CellestaPlan, loadStart: number): CellestaTimeline {
  const processStart = loadStart + plan.loadDuration;
  const processEnd = processStart + CELLESTA_PROCESS_DURATION;
  return { loadStart, processStart, processEnd, unloadEnd: processEnd + plan.unloadDuration };
}

const LOAD_GROUPS = [
  { id: "c_dock_open", label: "FOUP dock / door open", labelKo: "FOUP dock·door open", lastStep: "foup_door_lower" },
  { id: "c_efem_in", label: "EFEM robot: FOUP to pass station", labelKo: "EFEM robot: FOUP → pass station", lastStep: "atm_out_pass" },
  { id: "c_tr_in", label: "Transfer robot: pass station to PM-01", labelKo: "Transfer robot: pass station → PM-01 chuck", lastStep: "pm_shutter_close" },
];
const UNLOAD_GROUPS = [
  { id: "c_tr_out", label: "Transfer robot: PM-01 to pass station (dry)", labelKo: "Transfer robot: PM-01 → pass station (dry)", lastStep: "tr_out_pass_out" },
  { id: "c_efem_out", label: "EFEM robot: pass station to FOUP (dry)", labelKo: "EFEM robot: pass station → FOUP (dry)", lastStep: "atm_home" },
  { id: "c_close", label: "FOUP door close / undock", labelKo: "FOUP door close·undock", lastStep: "lp_undock" },
];

export function cellestaPhases(plan: CellestaPlan, tl: CellestaTimeline, prefix = ""): ScenarioPhase[] {
  const out: ScenarioPhase[] = [...phasesFromSteps(plan.load, LOAD_GROUPS, tl.loadStart, "wet_clean")];
  let t = tl.processStart;
  for (const p of CELLESTA_PROCESS_PHASES) {
    out.push({ id: `proc_${p.id}`, label: p.label, labelKo: p.labelKo, start: t, end: t + p.duration, equipment: "wet_clean" });
    t += p.duration;
  }
  out.push(...phasesFromSteps(plan.unload, UNLOAD_GROUPS, tl.processEnd, "wet_clean"));
  return out.map((p) => ({ ...p, id: `${prefix}${p.id}` }));
}

const PRESENTED: Record<CellestaHolder, string | null> = { foup: null, atm: "wafer_on_atm_robot", pass: "wafer_on_pass", tr: "wafer_on_transfer_robot", chuck: "wafer" };

function holderOf(h: CellestaHolder, instanceId: string, carrierId: string, slotId: string): WaferHolder {
  switch (h) {
    case "foup":
      return { kind: "carrier_slot", carrierId, slotId };
    case "atm":
      return { kind: "end_effector", instanceId, attachment: "atm_robot", noteKo: "EFEM robot fork (dry)" };
    case "pass":
      return { kind: "transfer_buffer", instanceId, attachment: "pass_station", noteKo: "Pass station pins" };
    case "tr":
      return { kind: "end_effector", instanceId, attachment: "transfer_robot", noteKo: "Transfer robot fork" };
    case "chuck":
      return { kind: "spin_chuck", instanceId, attachment: "spin_chuck", noteKo: "Spin chuck support pins" };
  }
}

export interface CellestaApplyArgs {
  out: PreviewState;
  plan: CellestaPlan;
  tl: CellestaTimeline;
  t: number;
  toolInstanceId: string;
  foupInstanceId: string | null;
  stationId: string;
  incoming: IllustrativeFilmState;
}

/** Tool joints, effects, FOUP, carrier and wafer of the CELLESTA flow at time t; returns the film after it. */
export function applyCellesta(a: CellestaApplyArgs): { film: IllustrativeFilmState; segment: "before" | "load" | "process" | "unload" | "after"; labelKo: string } {
  const { plan, tl, t } = a;
  const ip = a.out.instances[a.toolInstanceId];
  let segment: "before" | "load" | "process" | "unload" | "after";
  let values: Record<string, number>;
  let holder: CellestaHolder;
  let labelKo: string;
  let pmState = "closed_idle";
  let film = a.incoming;
  let wet: WaferWetState = "dry";
  if (t < tl.loadStart) {
    segment = "before";
    values = { ...plan.loadInitial.values };
    holder = "foup";
    labelKo = "대기 (dry wafer in FOUP)";
  } else if (t < tl.processStart) {
    segment = "load";
    const st = evaluateTrack(plan.load, plan.loadInitial, t - tl.loadStart);
    values = st.values;
    holder = st.holder;
    labelKo = st.labelKo;
    pmState = String(st.flags.pmState ?? pmState);
  } else if (t < tl.processEnd) {
    segment = "process";
    values = { ...plan.unloadInitial.values };
    holder = "chuck";
    const p = cellestaProcessAt(plan, t - tl.processStart);
    labelKo = p.phase.labelKo;
    pmState = p.transferReady ? "closed_dry_confirmed" : "processing";
    wet = p.wetState;
    const cleanPhase: CleanPhase = p.phase.id === "chemical" ? "chemical" : p.phase.id === "rinse" || p.phase.id === "pre_wet" ? "rinse" : p.phase.id === "ready" ? "chemical" : p.phase.id === "dry_confirm" && p.transferReady ? "done" : "dry";
    film = p.phase.id === "ready" || p.phase.id === "pre_wet" ? { ...film, status: "cleaning" } : wetCleanResidue(film, cleanPhase, p.phase.id === "chemical" ? p.phaseProgress : 1);
    ip.joints = { ...ip.joints, ...cellestaJointValues(plan, values), ...p.joints };
    ip.effects = { ...ip.effects, ...p.effects, rpm: p.rpm };
    ip.flags = { ...ip.flags, dispensing: p.dispensing, pmState, spindleStopped: p.rpm < 1e-6, nozzleParked: p.phase.id === "dry_confirm" || p.phase.id === "spin_down" };
  } else {
    segment = t < tl.unloadEnd ? "unload" : "after";
    const st = evaluateTrack(plan.unload, plan.unloadInitial, Math.min(t - tl.processEnd, plan.unloadDuration));
    values = st.values;
    holder = st.holder;
    labelKo = segment === "unload" ? st.labelKo : "완료 (dry wafer back in FOUP, undocked)";
    pmState = String(st.flags.pmState ?? "closed_idle");
    film = wetCleanResidue(film, "done", 1);
  }
  if (segment !== "process") {
    ip.joints = { ...ip.joints, ...cellestaJointValues(plan, values) };
    ip.effects = { ...ip.effects, rpm: 0 };
    ip.flags = { ...ip.flags, pmState, spindleStopped: true, nozzleParked: true, dispensing: "" };
  }
  ip.flags = { ...ip.flags, handlingStep: segment };
  const asset = PRESENTED[holder];
  if (asset) {
    ip.presentedWaferId = DEMO_WAFER.waferId;
    ip.presentedWaferAssetId = asset;
  }
  const door = values.doorPull > 1e-4 || values.doorLower > 1e-4;
  if (a.foupInstanceId && a.out.instances[a.foupInstanceId]) {
    const fp = a.out.instances[a.foupInstanceId];
    fp.joints = { ...fp.joints, foup_door_pull: values.doorPull, foup_door_lower: values.doorLower };
    if (holder === "foup") {
      fp.presentedWaferId = DEMO_WAFER.waferId;
      fp.presentedWaferAssetId = "foup_wafer";
    }
  }
  const slotId = DEMO_RESERVED_SLOT.slotId;
  const carrier: CarrierPreview = { carrierId: DEMO_CARRIER.carrierId, holder: { kind: "station", id: a.stationId }, doorOpen: door, slots: { [slotId]: holder === "foup" ? DEMO_WAFER.waferId : null }, docked: values.dock > plan.L.loadPort.dockStroke - 1e-4, dockOffset: values.dock };
  a.out.carriers[DEMO_CARRIER.carrierId] = carrier;
  a.out.wafers[DEMO_WAFER.waferId] = { waferId: DEMO_WAFER.waferId, holder: holderOf(holder, a.toolInstanceId, DEMO_CARRIER.carrierId, slotId), reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: [0, 1, 0], film, wetState: wet };
  return { film, segment, labelKo };
}

/** Idle pose (robots home, shutter closed, guard down, arm parked). */
export function cellestaIdleJoints(): Record<string, number> {
  return cellestaJointValues(CELLESTA_PLAN, { ...CELLESTA_PLAN.loadInitial.values });
}

const TL = cellestaTimeline(CELLESTA_PLAN, 0);
const SCENARIO: VisualScenario = { id: "cellesta-clean-cycle-v1", title: "CELLESTA-i MD (representative): FOUP to PM-01, clean / rinse / dry, and back", durationSec: TL.unloadEnd, phases: cellestaPhases(CELLESTA_PLAN, TL), renderSource: "illustrative" };

export const CELLESTA_STANDALONE_SCENARIO: ScenarioDefinition = {
  id: SCENARIO.id,
  title: SCENARIO.title,
  titleKo: "CELLESTA 습식 세정: FOUP → PM-01 (세정·rinse·건조) → FOUP",
  kind: "standalone",
  templateId: CELLESTA_TEMPLATE_ID,
  scenario: SCENARIO,
  requiredInstanceIds: [DEMO_CARRIER.carrierId],
  requiredTemplateIds: [CELLESTA_TEMPLATE_ID],
  evaluate(t: number, _seed: number, _animT: number, ctx: ScenarioContext): PreviewState {
    const phase = phaseAt(SCENARIO, t);
    const out: PreviewState = { scenarioId: SCENARIO.id, t, phaseId: phase.id, phaseLabel: phase.label, phaseLabelKo: phase.labelKo, phaseFocusInstanceId: null, instances: {}, carriers: {}, wafers: {}, plasma: { intensity: 0, flicker: 0 }, blockedReason: null };
    for (const inst of ctx.instances) {
      const p = emptyInstancePreview(inst.instanceId);
      p.joints = idleToolPose(inst.templateId);
      out.instances[inst.instanceId] = p;
    }
    const tool = ctx.instances.find((i) => i.templateId === CELLESTA_TEMPLATE_ID);
    if (!tool) return out;
    const station = Object.values(ctx.stations).find((s) => s.instanceId === tool.instanceId);
    if (!station) {
      out.blockedReason = "Preview blocked: no load port station for the tool";
      return out;
    }
    const foup = ctx.instances.find((i) => i.instanceId === DEMO_CARRIER.carrierId);
    const r = applyCellesta({ out, plan: CELLESTA_PLAN, tl: TL, t, toolInstanceId: tool.instanceId, foupInstanceId: foup?.instanceId ?? null, stationId: station.stationId, incoming: standaloneIncoming("clean", DEMO_WAFER.waferId) });
    out.instances[tool.instanceId].phaseLabelKo = r.labelKo;
    out.phaseFocusInstanceId = tool.instanceId;
    return out;
  },
};
