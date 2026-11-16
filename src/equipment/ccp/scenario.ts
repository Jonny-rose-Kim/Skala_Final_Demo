/**
 * CCP standalone demonstration: the original illustrative plasma cycle (hold in the stable phase until
 * Extinguish). The wafer stays on the pedestal; a FOUP docked at the load port is shown closed.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState } from "../../domain/materialFlow";
import { emptyInstancePreview, type PreviewState } from "../../presentation/preview";
import { DEFAULT_SCENARIO, evaluateScenario, phaseAt, type ScenarioContext, type ScenarioDefinition } from "../../presentation/scenario";
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
    if (inst.templateId === CCP_TEMPLATE_ID) {
      p.effects = { plasmaIntensity: sample.intensity, plasmaFlicker: sample.flicker };
      p.flags = { gateClosed: true };
      p.presentedWaferId = inst.instanceId === ccps[0]?.instanceId ? DEMO_WAFER.waferId : `W-${inst.instanceId}`;
      p.phaseLabelKo = phase.labelKo;
    }
    out.instances[inst.instanceId] = p;
  }
  const first = ccps[0];
  if (first) {
    const stationId = Object.values(ctx.stations).find((s) => s.instanceId === first.instanceId)?.stationId;
    if (stationId) {
      out.carriers[DEMO_CARRIER.carrierId] = { carrierId: DEMO_CARRIER.carrierId, holder: { kind: "station", id: stationId }, doorOpen: false, slots: { ...Object.fromEntries(Object.keys(DEMO_CARRIER.initialSlots).map((k) => [k, null])) }, docked: true };
    }
    out.wafers[DEMO_WAFER.waferId] = {
      waferId: DEMO_WAFER.waferId,
      holder: { kind: "process_stage", instanceId: first.instanceId, noteKo: "Heated pedestal 위 (standalone inspection)" },
      reservedSlot: DEMO_RESERVED_SLOT,
      frontsideNormalLocal: [0, 1, 0],
      film: incomingFilmState(DEMO_WAFER.waferId),
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
