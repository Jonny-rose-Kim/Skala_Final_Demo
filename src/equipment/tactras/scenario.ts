/**
 * Tactras standalone demonstration: FOUP -> EFEM -> load lock -> blade shuttle -> PM-01 lift pins -> ESC
 * clamp (process-ready) -> oxide etch -> de-clamp / release -> the way back. The etch segment thins the
 * exposed oxide only (mask retained) and leaves schematic residue; it is never called by other tools.
 * Phase timing follows the step order of the team's synthetic etch recipe (pump-down, gas stabilize,
 * ignition, main etch, RF off / purge) scaled for presentation; it is not a recipe or an etch rate.
 */
import { etchExposedOxide, standaloneIncoming } from "../../domain/waferState";
import { buildPhases, phaseAt, plasmaSampleForPhase, type VisualScenario } from "../../presentation/scenario";
import { makeStationHandlingScenario, type ProcessSegment } from "../handling/handlingScenario";
import { TACTRAS_STATION_PLAN } from "./handling";
import { TACTRAS_TEMPLATE_ID } from "./template";

const BUILT = buildPhases([
  { id: "esc_clamp", label: "ESC clamp / backside He on", labelKo: "ESC clamp, backside He on (process-ready)", duration: 2.5, equipment: "etch" },
  { id: "pump_gas", label: "Pump-down / gas stabilize", labelKo: "Pump-down, gas stabilize (scripted)", duration: 3.5, equipment: "etch" },
  { id: "ignition", label: "RF on / ignition", labelKo: "RF on, ignition", duration: 1.5, equipment: "etch" },
  { id: "main_etch", label: "Main etch (exposed oxide)", labelKo: "Main etch: 노출 oxide만 감소 (illustrative)", duration: 9.5, equipment: "etch" },
  { id: "rf_off", label: "RF off / purge", labelKo: "RF off, purge", duration: 2.5, equipment: "etch" },
  { id: "declamp", label: "He off / de-clamp", labelKo: "He off, de-clamp (release)", duration: 2.5, equipment: "etch" },
]);

export const TACTRAS_PROCESS: VisualScenario = { id: "tactras-pm01-oxide-etch-v1", title: "Tactras PM-01 oxide etch (illustrative)", durationSec: BUILT.durationSec, renderSource: "illustrative", phases: BUILT.phases };

function etchProgress(tp: number): { p: number; running: boolean } {
  const main = TACTRAS_PROCESS.phases.find((p) => p.id === "main_etch")!;
  if (tp <= main.start) return { p: 0, running: false };
  if (tp >= main.end) return { p: 1, running: false };
  return { p: (tp - main.start) / (main.end - main.start), running: true };
}

export const TACTRAS_PROCESS_SEGMENT: ProcessSegment = {
  scenario: TACTRAS_PROCESS,
  equipment: "etch",
  sample(tp, seed, animT) {
    const phase = phaseAt(TACTRAS_PROCESS, tp);
    const kind = phase.id === "ignition" ? "ignition" : phase.id === "main_etch" ? "stable" : phase.id === "rf_off" ? "extinction" : "off";
    const s = plasmaSampleForPhase(phase, kind, tp, seed, animT);
    const e = etchProgress(tp);
    const clamped = phase.id !== "declamp" || tp < phase.start + 0.6 ? 1 : 0;
    return {
      effects: { plasmaIntensity: s.intensity, plasmaFlicker: s.flicker, ionArrows: phase.id === "main_etch" ? 1 : 0, escClamped: clamped, backsideHe: phase.id === "declamp" ? 0 : 1 },
      plasma: { intensity: s.intensity, flicker: s.flicker },
      film: (f) => etchExposedOxide(f, e.p, e.running),
    };
  },
  done: (f) => etchExposedOxide(f, 1, false),
};

export const TACTRAS_HANDLING_SCENARIO = makeStationHandlingScenario({
  id: "tactras-etch-cycle-v1",
  title: "Tactras (representative): FOUP to PM-01, oxide etch, and back",
  titleKo: "Tactras 산화막 식각: FOUP → PM-01 → FOUP",
  templateId: TACTRAS_TEMPLATE_ID,
  plan: TACTRAS_STATION_PLAN,
  process: TACTRAS_PROCESS_SEGMENT,
  stageWaferAssetId: "wafer",
  incoming: (w) => standaloneIncoming("etch", w),
});
