/**
 * Standalone "FOUP to chamber and back" demonstrations of the chamber-type tools (CCP, Remote ICP), built
 * from the shared station plan and a tool-specific process segment (plasma cycle without the hold).
 * Pure in presentation time like every other scenario.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState } from "../../domain/materialFlow";
import { emptyInstancePreview, type IllustrativeFilmState, type PreviewState } from "../../presentation/preview";
import { phaseAt, type PhaseEquipment, type ScenarioContext, type ScenarioDefinition, type ScenarioPhase, type VisualScenario } from "../../presentation/scenario";
import { idleToolPose } from "../idle";
import { LOAD_GROUPS, UNLOAD_GROUPS, applyStationState, phasesFromSteps, stationIdleJoints, stationStateAt, stationTimeline, type StationTimeline } from "./stationScenario";
import type { StationPlan } from "./stationSequence";

/** Process segment of a chamber tool: phases (no hold) and the effects / film at a local process time. */
export interface ProcessSegment {
  scenario: VisualScenario;
  equipment: PhaseEquipment;
  sample(tp: number, seed: number, animT: number): { effects: Record<string, number>; plasma: { intensity: number; flicker: number }; film(f: IllustrativeFilmState): IllustrativeFilmState };
  /** Film after the process segment. */
  done(f: IllustrativeFilmState): IllustrativeFilmState;
}

export interface StationHandlingSpec {
  id: string;
  title: string;
  titleKo: string;
  templateId: string;
  plan: StationPlan;
  process: ProcessSegment;
  stageWaferAssetId: string;
  /** Incoming wafer state of this standalone demonstration (default: the legacy STI incoming stack). */
  incoming?: (waferId: string) => IllustrativeFilmState;
  /** Tool-specific preview additions (flags, effects) evaluated after the station state. */
  decorate?: (out: PreviewState, toolInstanceId: string, segment: string, tProcess: number) => void;
}

/** Phase rows of load, process and unload starting at `t0` (ids optionally prefixed). */
export function stationHandlingPhases(spec: { plan: StationPlan; process: ProcessSegment }, tl: StationTimeline, prefix = ""): ScenarioPhase[] {
  const eq = spec.process.equipment;
  return [
    ...phasesFromSteps(spec.plan.load, LOAD_GROUPS, tl.loadStart, eq).map((p) => ({ ...p, id: `${prefix}${p.id}` })),
    ...spec.process.scenario.phases.map((p) => ({ ...p, id: `${prefix}proc_${p.id}`, start: tl.processStart + p.start, end: tl.processStart + p.end, equipment: eq, holdUntilRelease: false })),
    ...phasesFromSteps(spec.plan.unload, UNLOAD_GROUPS, tl.processEnd, eq).map((p) => ({ ...p, id: `${prefix}${p.id}` })),
  ];
}

export function makeStationHandlingScenario(spec: StationHandlingSpec): ScenarioDefinition {
  const tl = stationTimeline(spec.plan, 0, spec.process.scenario.durationSec);
  const scenario: VisualScenario = { id: spec.id, title: spec.title, durationSec: tl.unloadEnd, phases: stationHandlingPhases(spec, tl), renderSource: "illustrative" };
  const evaluate = (t: number, seed: number, animT: number, ctx: ScenarioContext): PreviewState => {
    const phase = phaseAt(scenario, t);
    const out: PreviewState = { scenarioId: scenario.id, t, phaseId: phase.id, phaseLabel: phase.label, phaseLabelKo: phase.labelKo, phaseFocusInstanceId: null, instances: {}, carriers: {}, wafers: {}, plasma: { intensity: 0, flicker: 0 }, blockedReason: null };
    for (const inst of ctx.instances) {
      const p = emptyInstancePreview(inst.instanceId);
      p.joints = idleToolPose(inst.templateId);
      out.instances[inst.instanceId] = p;
    }
    const tools = ctx.instances.filter((i) => i.templateId === spec.templateId);
    const first = tools[0];
    if (!first) return out;
    // further instances of the same template (fixtures) keep their own wafer on the stage
    for (const other of tools.slice(1)) {
      const p = out.instances[other.instanceId];
      p.joints = stationIdleJoints(spec.plan);
      p.presentedWaferId = `W-${other.instanceId}`;
      p.presentedWaferAssetId = spec.stageWaferAssetId;
    }
    const station = Object.values(ctx.stations).find((s) => s.instanceId === first.instanceId);
    const foup = ctx.instances.find((i) => i.instanceId === DEMO_CARRIER.carrierId);
    const state = stationStateAt(spec.plan, tl, t);
    let film = spec.incoming ? spec.incoming(DEMO_WAFER.waferId) : incomingFilmState(DEMO_WAFER.waferId);
    const ip = out.instances[first.instanceId];
    if (state.segment === "process") {
      const s = spec.process.sample(t - tl.processStart, seed, animT - tl.processStart);
      ip.effects = { ...s.effects };
      out.plasma = { ...s.plasma };
      film = s.film(film);
    } else if (state.segment === "unload" || state.segment === "after") film = spec.process.done(film);
    ip.phaseLabelKo = state.segment === "process" ? phase.labelKo : state.labelKo;
    if (station) {
      applyStationState({ out, plan: spec.plan, state, toolInstanceId: first.instanceId, foupInstanceId: foup?.instanceId ?? null, stationId: station.stationId, carrierId: DEMO_CARRIER.carrierId, waferId: DEMO_WAFER.waferId, slotId: DEMO_RESERVED_SLOT.slotId, stageWaferAssetId: spec.stageWaferAssetId, film, reservedSlot: DEMO_RESERVED_SLOT });
    } else out.blockedReason = "Preview blocked: no load port station for the tool";
    spec.decorate?.(out, first.instanceId, state.segment, t - tl.processStart);
    out.phaseFocusInstanceId = first.instanceId;
    return out;
  };
  return { id: scenario.id, title: scenario.title, titleKo: spec.titleKo, kind: "standalone", templateId: spec.templateId, scenario, requiredInstanceIds: [DEMO_CARRIER.carrierId], requiredTemplateIds: [spec.templateId], evaluate };
}
