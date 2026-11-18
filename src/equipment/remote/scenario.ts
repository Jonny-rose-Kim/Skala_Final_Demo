/**
 * Remote ICP PECVD standalone demonstration:
 *   Idle → Pumpdown illustration → Thermal/flow stabilization → Source ignition →
 *   Precursor feed / deposition illustration (held until released) → Precursor off / purge → Source off → Ready
 * Phase durations and film growth are demonstration presets, not a production recipe. No pressure or
 * temperature observation is produced by the pumpdown / stabilization phases.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState } from "../../domain/materialFlow";
import { clamp01, emptyInstancePreview, smoothstep, type IllustrativeFilmState, type PreviewState } from "../../presentation/preview";
import { buildPhases, phaseAt, phaseProgress, plasmaSampleForPhase, type ScenarioContext, type ScenarioDefinition, type VisualScenario } from "../../presentation/scenario";
import { makeStationHandlingScenario, type ProcessSegment } from "../handling/handlingScenario";
import { stationIdleJoints } from "../handling/stationScenario";
import { idleToolPose } from "../idle";
import { REMOTE_STATION_PLAN } from "./handling";
import { REMOTE_TEMPLATE_ID } from "./template";

const rows = buildPhases([
  { id: "idle", label: "Idle", labelKo: "대기", duration: 2, equipment: "remote" },
  { id: "pumpdown", label: "Pumpdown illustration", labelKo: "Pumpdown 연출", duration: 4, equipment: "remote" },
  { id: "stabilize", label: "Thermal / flow stabilization", labelKo: "온도·유량 안정화", duration: 4, equipment: "remote" },
  { id: "ignition", label: "Source ignition", labelKo: "Source 점화", duration: 3, equipment: "remote" },
  { id: "deposition", label: "Precursor feed / deposition illustration", labelKo: "Precursor 투입·증착 연출", duration: 12, equipment: "remote", hold: true },
  { id: "purge", label: "Precursor off / purge", labelKo: "Precursor 차단·purge", duration: 3, equipment: "remote" },
  { id: "source_off", label: "Source off", labelKo: "Source 소등", duration: 3, equipment: "remote" },
  { id: "ready", label: "Ready", labelKo: "완료 (Ready)", duration: 2, equipment: "remote" },
]);

export const REMOTE_SCENARIO: VisualScenario = { id: "remote-icp-cycle-v1", title: "Remote ICP PECVD deposition cycle", durationSec: rows.durationSec, phases: rows.phases, renderSource: "illustrative" };

/** Effects of the remote source at time t (pure). Returns glow intensity, flicker, gas/precursor flow, overcoat fraction. */
export function remoteCycleEffects(scenario: VisualScenario, t: number, seed: number, animT: number, offsetSec = 0): { intensity: number; flicker: number; sourceGasFlow: number; precursorFlow: number; overcoat: number; phaseId: string } {
  const tt = t - offsetSec;
  const p = phaseAt(scenario, tt);
  let intensity = 0;
  let flicker = 0;
  switch (p.id) {
    case "ignition": {
      const s = plasmaSampleForPhase(p, "ignition", tt, seed, animT - offsetSec);
      intensity = s.intensity;
      flicker = s.flicker;
      break;
    }
    case "deposition":
    case "purge": {
      const s = plasmaSampleForPhase(p, "stable", tt, seed, animT - offsetSec);
      intensity = s.intensity;
      break;
    }
    case "source_off": {
      const s = plasmaSampleForPhase(p, "extinction", tt, seed, animT - offsetSec);
      intensity = s.intensity;
      break;
    }
  }
  const stabilize = phaseProgress(scenario, "stabilize", tt);
  const sourceOff = phaseProgress(scenario, "source_off", tt);
  const sourceGasFlow = clamp01(smoothstep(0, 0.4, stabilize) * (1 - smoothstep(0.6, 1, sourceOff)));
  const dep = phaseProgress(scenario, "deposition", tt);
  const purge = phaseProgress(scenario, "purge", tt);
  const precursorFlow = p.id === "deposition" ? smoothstep(0, 0.08, dep) : p.id === "purge" ? 1 - smoothstep(0, 0.5, purge) : 0;
  const overcoat = clamp01(dep);
  return { intensity, flicker, sourceGasFlow, precursorFlow, overcoat, phaseId: p.id };
}

export function applyOvercoat(film: IllustrativeFilmState, overcoat: number, phaseId: string): IllustrativeFilmState {
  const layers = film.layers.map((l) => (l.layerId === "demo_overcoat" ? { ...l, presentFraction: overcoat } : l));
  const status: IllustrativeFilmState["status"] = overcoat <= 0 ? "incoming" : overcoat < 1 && phaseId === "deposition" ? "depositing" : "deposited";
  return { ...film, layers, status };
}

export function remoteStandalonePreview(t: number, seed: number, animT: number, ctx: ScenarioContext): PreviewState {
  const phase = phaseAt(REMOTE_SCENARIO, t);
  const fx = remoteCycleEffects(REMOTE_SCENARIO, t, seed, animT);
  const out: PreviewState = {
    scenarioId: REMOTE_SCENARIO.id,
    t,
    phaseId: phase.id,
    phaseLabel: phase.label,
    phaseLabelKo: phase.labelKo,
    phaseFocusInstanceId: null,
    instances: {},
    carriers: {},
    wafers: {},
    plasma: { intensity: fx.intensity, flicker: fx.flicker },
    blockedReason: null,
  };
  const remotes = ctx.instances.filter((i) => i.templateId === REMOTE_TEMPLATE_ID);
  for (const inst of ctx.instances) {
    const p = emptyInstancePreview(inst.instanceId);
    p.joints = idleToolPose(inst.templateId);
    if (inst.templateId === REMOTE_TEMPLATE_ID) {
      p.joints = stationIdleJoints(REMOTE_STATION_PLAN);
      p.effects = { plasmaIntensity: fx.intensity, plasmaFlicker: fx.flicker, sourceGasFlow: fx.sourceGasFlow, precursorFlow: fx.precursorFlow };
      p.flags = { gateClosed: true, pumpdownIllustration: phase.id === "pumpdown" };
      p.presentedWaferId = inst.instanceId === remotes[0]?.instanceId ? DEMO_WAFER.waferId : `W-${inst.instanceId}`;
      p.phaseLabelKo = phase.labelKo;
    }
    out.instances[inst.instanceId] = p;
  }
  const first = remotes[0];
  if (first) {
    const stationId = Object.values(ctx.stations).find((s) => s.instanceId === first.instanceId)?.stationId;
    if (stationId) out.carriers[DEMO_CARRIER.carrierId] = { carrierId: DEMO_CARRIER.carrierId, holder: { kind: "station", id: stationId }, doorOpen: false, slots: Object.fromEntries(Object.keys(DEMO_CARRIER.initialSlots).map((k) => [k, null])), docked: false, dockOffset: 0 };
    out.wafers[DEMO_WAFER.waferId] = {
      waferId: DEMO_WAFER.waferId,
      holder: { kind: "process_stage", instanceId: first.instanceId, attachment: "stage_surface", noteKo: "Heated stage 위 (standalone inspection)" },
      reservedSlot: DEMO_RESERVED_SLOT,
      frontsideNormalLocal: [0, 1, 0],
      film: applyOvercoat(incomingFilmState(DEMO_WAFER.waferId), fx.overcoat, phase.id),
      wetState: "dry",
    };
  }
  return out;
}

export const REMOTE_STANDALONE_SCENARIO: ScenarioDefinition = {
  id: REMOTE_SCENARIO.id,
  title: REMOTE_SCENARIO.title,
  titleKo: "Remote ICP PECVD 증착 연출 (단독)",
  kind: "standalone",
  templateId: REMOTE_TEMPLATE_ID,
  scenario: REMOTE_SCENARIO,
  requiredInstanceIds: [],
  requiredTemplateIds: [REMOTE_TEMPLATE_ID],
  releaseLabel: "Precursor off",
  evaluate: remoteStandalonePreview,
};

/** Remote cycle without the hold and without the leading idle phase (embedded in handling sequences and routes). */
export function remoteProcessScenario(): VisualScenario {
  const src = REMOTE_SCENARIO.phases.filter((p) => p.id !== "idle");
  const t0 = src[0].start;
  const phases = src.map((p) => ({ ...p, start: p.start - t0, end: p.end - t0, holdUntilRelease: false }));
  return { ...REMOTE_SCENARIO, id: "remote-icp-process-segment", durationSec: REMOTE_SCENARIO.durationSec - t0, phases };
}

/** Remote process segment used by the handling scenario and route B. */
export const REMOTE_PROCESS_SEGMENT: ProcessSegment = {
  scenario: remoteProcessScenario(),
  equipment: "remote",
  sample(tp, seed, animT) {
    const fx = remoteCycleEffects(remoteProcessScenario(), tp, seed, animT);
    return { effects: { plasmaIntensity: fx.intensity, plasmaFlicker: fx.flicker, sourceGasFlow: fx.sourceGasFlow, precursorFlow: fx.precursorFlow }, plasma: { intensity: fx.intensity, flicker: fx.flicker }, film: (f) => applyOvercoat(f, fx.overcoat, fx.phaseId) };
  },
  done: (f) => applyOvercoat(f, 1, "done"),
};

export const REMOTE_HANDLING_SCENARIO: ScenarioDefinition = makeStationHandlingScenario({
  id: "remote-handling-cycle-v1",
  title: "Remote ICP PECVD: FOUP to chamber and back (robot, load lock, vacuum blade)",
  titleKo: "Remote ICP PECVD wafer handling (FOUP → chamber → FOUP)",
  templateId: REMOTE_TEMPLATE_ID,
  plan: REMOTE_STATION_PLAN,
  process: REMOTE_PROCESS_SEGMENT,
  stageWaferAssetId: "wafer",
});
