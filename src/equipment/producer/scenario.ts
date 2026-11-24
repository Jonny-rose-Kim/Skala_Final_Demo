/**
 * Producer standalone demonstration: FOUP (LP1) -> EFEM robot -> load lock -> blade shuttle through the
 * transfer chamber -> cell A lift pins -> deposition cycle -> the way back to the reserved slot.
 * The deposition segment grows the illustrative PECVD oxide (target_oxide) during the stable plasma phase.
 */
import { depositTargetOxide, standaloneIncoming } from "../../domain/waferState";
import { DEFAULT_SCENARIO, evaluateScenario, type VisualScenario } from "../../presentation/scenario";
import { makeStationHandlingScenario, type ProcessSegment } from "../handling/handlingScenario";
import { PRODUCER_STATION_PLAN } from "./handling";
import { PRODUCER_TEMPLATE_ID } from "./template";

/** Deposition cycle of cell A (the illustrative CCP cycle without the hold). */
export function producerProcessScenario(): VisualScenario {
  return { ...DEFAULT_SCENARIO, id: "producer-cell-a-deposition-v1", title: "Producer cell A deposition (illustrative)", phases: DEFAULT_SCENARIO.phases.map((p) => ({ ...p, holdUntilRelease: false, equipment: "deposition" })) };
}

function oxideAt(tp: number): { fraction: number; growing: boolean } {
  const stable = DEFAULT_SCENARIO.phases.find((p) => p.id === "stable")!;
  if (tp <= stable.start) return { fraction: 0, growing: false };
  if (tp >= stable.end) return { fraction: 1, growing: false };
  return { fraction: (tp - stable.start) / (stable.end - stable.start), growing: true };
}

export const PRODUCER_PROCESS_SEGMENT: ProcessSegment = {
  scenario: producerProcessScenario(),
  equipment: "deposition",
  sample(tp, seed, animT) {
    const s = evaluateScenario(producerProcessScenario(), tp, seed, animT);
    const ox = oxideAt(tp);
    return { effects: { plasmaIntensity: s.intensity, plasmaFlicker: s.flicker }, plasma: { intensity: s.intensity, flicker: s.flicker }, film: (f) => depositTargetOxide(f, ox.fraction, ox.growing) };
  },
  done: (f) => depositTargetOxide(f, 1, false),
};

export const PRODUCER_HANDLING_SCENARIO = makeStationHandlingScenario({
  id: "producer-deposition-cycle-v1",
  title: "Producer SE (representative): FOUP to cell A, deposition, and back",
  titleKo: "Producer SE 증착: FOUP → cell A → FOUP",
  templateId: PRODUCER_TEMPLATE_ID,
  plan: PRODUCER_STATION_PLAN,
  process: PRODUCER_PROCESS_SEGMENT,
  stageWaferAssetId: "wafer",
  incoming: (w) => standaloneIncoming("deposition", w),
});
