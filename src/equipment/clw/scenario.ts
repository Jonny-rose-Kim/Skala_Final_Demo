/**
 * CLW-08v2 standalone demonstration: closed FOUP-01 from the Producer load port to the Tactras load port
 * (falls back to the first two stations). Same pure transfer sequence as the route legs.
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER } from "../../domain/materialFlow";
import { standaloneIncoming } from "../../domain/waferState";
import { emptyInstancePreview, type PreviewState } from "../../presentation/preview";
import { phaseAt, type ScenarioContext, type ScenarioDefinition } from "../../presentation/scenario";
import { idleToolPose } from "../idle";
import { ohtSequence, ohtTransferScenario, planTransfer } from "../oht/scenario";
import { PRODUCER_TEMPLATE_ID } from "../producer/template";
import { TACTRAS_TEMPLATE_ID } from "../tactras/template";
import { CLW_LAYOUT } from "./layout";
import { CLW_TEMPLATE_ID } from "./template";

/**
 * Transfer phases of the current bay: the travel phase is 11 s (8 s in the legacy bay) because the tools stand 1.4x
 * farther apart (instances-v6), which keeps the presentation peak speed under 1 m/s. Presentation timing, not the
 * rated CLW-08v2 speed.
 */
export const CLW_TRANSFER_SCENARIO = ohtTransferScenario("clw08v2-transfer-v1", "CLW-08v2 FOUP transfer", 11);

export function clwStandalonePreview(t: number, _seed: number, _animT: number, ctx: ScenarioContext): PreviewState {
  const phase = phaseAt(CLW_TRANSFER_SCENARIO, t);
  const out: PreviewState = { scenarioId: "clw08v2-transfer-v1", t, phaseId: phase.id, phaseLabel: phase.label, phaseLabelKo: phase.labelKo, phaseFocusInstanceId: null, instances: {}, carriers: {}, wafers: {}, plasma: { intensity: 0, flicker: 0 }, blockedReason: null };
  for (const inst of ctx.instances) {
    const p = emptyInstancePreview(inst.instanceId);
    p.joints = idleToolPose(inst.templateId);
    out.instances[inst.instanceId] = p;
  }
  const oht = ctx.instances.find((i) => i.templateId === CLW_TEMPLATE_ID);
  if (!oht) return out;
  const byTemplate = (tid: string) => Object.values(ctx.stations).find((s) => ctx.instances.find((i) => i.instanceId === s.instanceId)?.templateId === tid)?.stationId;
  const ids = Object.keys(ctx.stations);
  const srcId = byTemplate(PRODUCER_TEMPLATE_ID) ?? ids[0];
  const dstId = byTemplate(TACTRAS_TEMPLATE_ID) ?? ids[1] ?? ids[0];
  if (!srcId || !dstId) return out;
  const plan = planTransfer(CLW_LAYOUT, oht, ctx.stations, srcId, dstId);
  const st = ohtSequence(CLW_LAYOUT, plan, t, CLW_TRANSFER_SCENARIO);
  const ip = out.instances[oht.instanceId];
  ip.joints = st.joints;
  ip.flags = st.flags;
  ip.phaseLabelKo = phase.labelKo;
  out.blockedReason = plan.blockedReason;
  out.carriers[DEMO_CARRIER.carrierId] = { carrierId: DEMO_CARRIER.carrierId, holder: st.holder, doorOpen: false, slots: { [DEMO_RESERVED_SLOT.slotId]: DEMO_WAFER.waferId }, docked: false, yawFromStationId: st.yawFromStationId };
  out.wafers[DEMO_WAFER.waferId] = { waferId: DEMO_WAFER.waferId, holder: { kind: "carrier_slot", carrierId: DEMO_CARRIER.carrierId, slotId: DEMO_RESERVED_SLOT.slotId }, reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: [0, 1, 0], film: standaloneIncoming("etch", DEMO_WAFER.waferId), wetState: "dry" };
  const foup = out.instances[DEMO_CARRIER.carrierId];
  if (foup) {
    foup.presentedWaferId = DEMO_WAFER.waferId;
    foup.presentedWaferAssetId = "foup_wafer";
  }
  out.phaseFocusInstanceId = oht.instanceId;
  return out;
}

export const CLW_STANDALONE_SCENARIO: ScenarioDefinition = {
  id: "clw08v2-transfer-v1",
  title: "CLW-08v2 (representative): closed FOUP transfer, Producer load port to Tactras load port",
  titleKo: "CLW-08v2 FOUP 반송 (단독: Producer LP → Tactras LP)",
  kind: "standalone",
  templateId: CLW_TEMPLATE_ID,
  scenario: CLW_TRANSFER_SCENARIO,
  requiredInstanceIds: [],
  requiredTemplateIds: [CLW_TEMPLATE_ID],
  evaluate: clwStandalonePreview,
};
