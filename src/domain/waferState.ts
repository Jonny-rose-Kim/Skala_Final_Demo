/**
 * Illustrative wafer state of the current route (deposition -> external lithography -> oxide etch ->
 * external resist strip -> wet clean). Pure functions on IllustrativeFilmState; nothing here is a film
 * measurement, an etch depth or a contamination reading. Layer fractions are schematic (0..1 of the
 * illustrated thickness) and the cross-section inset draws them with an exaggerated vertical scale.
 *
 * Each step owns exactly one transition: deposition grows the target oxide, the external lithography step
 * adds the mask, the etch step thins the exposed oxide and leaves schematic residue, the external strip
 * removes a photoresist mask, and the wet clean only reduces the residue. The clean never removes the mask
 * or the oxide (it is not a polish), and the etch function is never called by the deposition or the clean.
 */
import type { IllustrativeFilmLayer, IllustrativeFilmState, MaskKind, PatternState } from "../presentation/preview";

export const SCALE_NOTE = "Schematic · Exaggerated scale · Illustrative" as const;

/** Mask kind of the demonstration route (photoresist: removed by an external strip before the clean). */
export const ROUTE_MASK_KIND: MaskKind = "photoresist";

/** Step ids of the route that change the wafer state (see materialFlow ROUTE_DEP_ETCH_CLEAN). */
export const WAFER_STEPS = {
  deposition: "S10_PRODUCER_DEPOSITION",
  lithography: "S20_EXTERNAL_LITHOGRAPHY",
  etch: "S40_TACTRAS_OXIDE_ETCH",
  strip: "S50_EXTERNAL_RESIST_STRIP",
  clean: "S70_CELLESTA_POST_ETCH_CLEAN",
} as const;

const SUBSTRATE: IllustrativeFilmLayer = { layerId: "si_substrate", material: "Si", role: "substrate", presentFraction: 1, origin: "incoming_external" };

/** Incoming wafer of the route: bare silicon substrate (no prior film stack is assumed). */
export function routeIncomingState(waferId: string): IllustrativeFilmState {
  return { renderSource: "illustrative", waferId, layers: [{ ...SUBSTRATE }], nitrideExposed: false, status: "incoming", scaleNote: SCALE_NOTE };
}

function withLayer(f: IllustrativeFilmState, layer: IllustrativeFilmLayer): IllustrativeFilmLayer[] {
  const others = f.layers.filter((l) => l.layerId !== layer.layerId);
  return [...others, layer];
}

/** PECVD oxide grown by the Producer cell (fraction 0..1 of the illustrated thickness). */
export function depositTargetOxide(f: IllustrativeFilmState, fraction: number, growing: boolean): IllustrativeFilmState {
  const x = Math.min(1, Math.max(0, fraction));
  const layer: IllustrativeFilmLayer = { layerId: "pecvd_oxide", material: "SiO2 (PECVD, representative)", role: "target_oxide", presentFraction: x, origin: "demo_deposition", originStepId: WAFER_STEPS.deposition };
  return { ...f, layers: withLayer(f, layer), status: growing ? "depositing" : x > 0 ? "deposited" : f.status };
}

/** External lithography: the mask appears as an explicit route event (no tool in the scene performs it). */
export function applyExternalMask(f: IllustrativeFilmState, maskKind: MaskKind = ROUTE_MASK_KIND): IllustrativeFilmState {
  const layer: IllustrativeFilmLayer = { layerId: "etch_mask", material: maskKind === "photoresist" ? "Photoresist (patterned)" : "Hard mask (patterned)", role: "mask", presentFraction: 1, origin: "external_step", originStepId: WAFER_STEPS.lithography };
  const pattern: PatternState = { maskKind, mask: "retained", exposedOxideRemaining: 1, residue: "none" };
  return { ...f, layers: withLayer(f, layer), status: "masked", pattern };
}

/**
 * Oxide etch of the exposed region (progress 0..1 of the illustrated main etch). The masked region keeps
 * its oxide; residue appears in the exposed region once the etch is under way. Only the etch step calls this.
 */
export function etchExposedOxide(f: IllustrativeFilmState, progress: number, running: boolean): IllustrativeFilmState {
  if (!f.pattern || f.pattern.mask !== "retained") return f;
  const p = Math.min(1, Math.max(0, progress));
  const pattern: PatternState = { ...f.pattern, exposedOxideRemaining: 1 - p, residue: p > 0.35 ? "present" : f.pattern.residue };
  let layers = f.layers;
  if (p > 0.35) layers = withLayer(f, { layerId: "post_etch_residue", material: "Post-etch residue (schematic, kind unspecified)", role: "residue", presentFraction: Math.min(1, (p - 0.35) / 0.4), origin: "demo_etch", originStepId: WAFER_STEPS.etch });
  return { ...f, layers, pattern, status: running ? "etching" : p >= 1 ? "etched" : f.status };
}

/** External resist strip (recipe-dependent; only for a photoresist mask). A hard mask stays on the wafer. */
export function externalResistStrip(f: IllustrativeFilmState): IllustrativeFilmState {
  if (!f.pattern || f.pattern.maskKind !== "photoresist" || f.pattern.mask !== "retained") return f;
  return { ...f, layers: f.layers.filter((l) => l.role !== "mask"), pattern: { ...f.pattern, mask: "removed", maskRemovedByStepId: WAFER_STEPS.strip }, status: "stripped" };
}

export type CleanPhase = "chemical" | "rinse" | "dry" | "done";

/**
 * Wet clean of the selected residue (schematic): the residue fraction drops during the chemical phase; the
 * rinse and dry phases only change the status. Mask and oxide are untouched (this is not a polish / CMP).
 */
export function wetCleanResidue(f: IllustrativeFilmState, phase: CleanPhase, chemicalProgress: number): IllustrativeFilmState {
  const res = f.layers.find((l) => l.role === "residue");
  const k = phase === "chemical" ? Math.min(1, Math.max(0, chemicalProgress)) : 1;
  const left = res ? Math.max(0.12, res.presentFraction * (1 - 0.88 * k)) : 0;
  const layers = res ? withLayer(f, { ...res, presentFraction: left }) : f.layers;
  const pattern = f.pattern ? { ...f.pattern, residue: res ? (k >= 1 ? ("reduced" as const) : f.pattern.residue) : f.pattern.residue } : f.pattern;
  const status = phase === "chemical" ? "cleaning" : phase === "rinse" ? "rinsing" : phase === "dry" ? "drying" : "complete";
  return { ...f, layers, pattern, status };
}

/** Incoming states of the standalone demonstrations (each tool shown on its own). */
export function standaloneIncoming(kind: "deposition" | "etch" | "clean", waferId: string): IllustrativeFilmState {
  const bare = routeIncomingState(waferId);
  if (kind === "deposition") return bare;
  const masked = applyExternalMask(depositTargetOxide(bare, 1, false));
  if (kind === "etch") return masked;
  return externalResistStrip(etchExposedOxide(masked, 1, false));
}
