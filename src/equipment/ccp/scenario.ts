/**
 * CCP standalone demonstrations:
 *  - `ccp-illustrative-cycle-v1`: the original illustrative plasma cycle (hold in the stable phase until
 *    Extinguish). The wafer stays on the pedestal; the robot is home and the FOUP waits docked-out, closed.
 *  - `ccp-handling-cycle-v1`: FOUP -> EFEM robot -> load lock -> vacuum blade -> chamber, the plasma cycle
 *    without the hold, and the way back to the reserved FOUP slot.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState } from "../../domain/materialFlow";
import { emptyInstancePreview, type PreviewState } from "../../presentation/preview";
import { DEFAULT_SCENARIO, evaluateScenario, phaseAt, type ScenarioContext, type ScenarioDefinition, type VisualScenario } from "../../presentation/scenario";
import { makeStationHandlingScenario, type ProcessSegment } from "../handling/handlingScenario";
import { stationIdleJoints } from "../handling/stationScenario";
import { idleToolPose } from "../idle";
import { applyOvercoat } from "../remote/scenario";
import { CCP_STATION_PLAN } from "./handling";
import { CCP_TEMPLATE_ID } from "./index";

export function ccpStandalonePreview(t: number, seed: number, animT: number, ctx: ScenarioContext): PreviewState {
  const sample = evaluateScenario(DEFAULT_SCENARIO, t, seed, animT);
  const phase = phaseAt(DEFAULT_SCENARIO, t);
  const out: PreviewState = {
    scenarioId: DEFAULT_SCENARIO.id,
    t,
    phaseId: phase.id,
    phaseLabel: phase.label,
    phaseLabelKo: phase.labelKo,
    phaseFocusInstanceId: null,
    instances: {},
    carriers: {},
    wafers: {},
    plasma: { intensity: sample.intensity, flicker: sample.flicker },
    blockedReason: null,
  };
  const ccps = ctx.instances.filter((i) => i.templateId === CCP_TEMPLATE_ID);
  for (const inst of ctx.instances) {
    const p = emptyInstancePreview(inst.instanceId);
    p.joints = idleToolPose(inst.templateId);
    if (inst.templateId === CCP_TEMPLATE_ID) {
      p.joints = stationIdleJoints(CCP_STATION_PLAN);
      p.effects = { plasmaIntensity: sample.intensity, plasmaFlicker: sample.flicker };
      p.flags = { gateClosed: true };
      p.presentedWaferId = inst.instanceId === ccps[0]?.instanceId ? DEMO_WAFER.waferId : `W-${inst.instanceId}`;
      p.presentedWaferAssetId = "wafer";
      p.phaseLabelKo = phase.labelKo;
    }
    out.instances[inst.instanceId] = p;
  }
  const first = ccps[0];
  if (first) {
    const stationId = Object.values(ctx.stations).find((s) => s.instanceId === first.instanceId)?.stationId;
    if (stationId) {
      out.carriers[DEMO_CARRIER.carrierId] = { carrierId: DEMO_CARRIER.carrierId, holder: { kind: "station", id: stationId }, doorOpen: false, slots: { ...Object.fromEntries(Object.keys(DEMO_CARRIER.initialSlots).map((k) => [k, null])) }, docked: false, dockOffset: 0 };
    }
    out.wafers[DEMO_WAFER.waferId] = {
      waferId: DEMO_WAFER.waferId,
      holder: { kind: "process_stage", instanceId: first.instanceId, attachment: "stage_surface", noteKo: "Heated pedestal 위 (standalone inspection)" },
      reservedSlot: DEMO_RESERVED_SLOT,
      frontsideNormalLocal: [0, 1, 0],
      film: incomingFilmState(DEMO_WAFER.waferId),
      wetState: "dry",
    };
  }
  return out;
}

export const CCP_STANDALONE_SCENARIO: ScenarioDefinition = {
  id: DEFAULT_SCENARIO.id,
  title: DEFAULT_SCENARIO.title,
  titleKo: "CCP PECVD plasma 연출 (단독)",
  kind: "standalone",
  templateId: CCP_TEMPLATE_ID,
  scenario: DEFAULT_SCENARIO,
  requiredInstanceIds: [],
  requiredTemplateIds: [CCP_TEMPLATE_ID],
  releaseLabel: "Extinguish",
  evaluate: ccpStandalonePreview,
};

/** CCP plasma cycle without the hold (embedded in handling sequences and routes). */
export function ccpProcessScenario(): VisualScenario {
  return { ...DEFAULT_SCENARIO, phases: DEFAULT_SCENARIO.phases.map((p) => ({ ...p, holdUntilRelease: false })) };
}

/** Overcoat fraction grown during the stable plasma phase (illustrative). */
export function ccpOvercoatAt(tProcess: number): { fraction: number; growing: boolean } {
  const stable = DEFAULT_SCENARIO.phases.find((p) => p.id === "stable")!;
  if (tProcess <= stable.start) return { fraction: 0, growing: false };
  if (tProcess >= stable.end) return { fraction: 1, growing: false };
  return { fraction: (tProcess - stable.start) / (stable.end - stable.start), growing: true };
}

/** CCP process segment used by the handling scenario and route A. */
export const CCP_PROCESS_SEGMENT: ProcessSegment = {
  scenario: ccpProcessScenario(),
  equipment: "ccp",
  sample(tp, seed, animT) {
    const sample = evaluateScenario(ccpProcessScenario(), tp, seed, animT);
    const oc = ccpOvercoatAt(tp);
    return { effects: { plasmaIntensity: sample.intensity, plasmaFlicker: sample.flicker }, plasma: { intensity: sample.intensity, flicker: sample.flicker }, film: (f) => applyOvercoat(f, oc.fraction, oc.growing ? "deposition" : "x") };
  },
  done: (f) => applyOvercoat(f, 1, "done"),
};

export const CCP_HANDLING_SCENARIO: ScenarioDefinition = makeStationHandlingScenario({
  id: "ccp-handling-cycle-v1",
  title: "CCP PECVD: FOUP to chamber and back (robot, load lock, vacuum blade)",
  titleKo: "CCP PECVD wafer handling (FOUP → chamber → FOUP)",
  templateId: CCP_TEMPLATE_ID,
  plan: CCP_STATION_PLAN,
  process: CCP_PROCESS_SEGMENT,
  stageWaferAssetId: "wafer",
});

export const CCP_HANDLING_SCENARIO_DEF: VisualScenario = CCP_HANDLING_SCENARIO.scenario;
