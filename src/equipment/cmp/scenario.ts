/**
 * Rotary STI CMP demonstration sequence:
 *   Ready → Load/orient wafer → Pad wetting → Head approach → Bulk polish illustration → Clearing illustration →
 *   Bounded overpolish illustration → Head lift → Conditioning (head retracted) → Unload → Clean/Rinse → Dry → Return
 * Every joint value, holder and IllustrativeFilmState is a pure function of time. No endpoint detection,
 * PASS/FAIL, dishing or removal-rate number is produced: the final state is "Visual sequence complete".
 */
import { DEMO_CARRIER, DEMO_RESERVED_SLOT, DEMO_WAFER, incomingFilmState } from "../../domain/materialFlow";
import { clamp01, emptyInstancePreview, lerp, smoothstep, type HolderKind, type IllustrativeFilmState, type PreviewState, type WaferHolder } from "../../presentation/preview";
import { buildPhases, phaseAt, type ScenarioContext, type ScenarioDefinition, type VisualScenario } from "../../presentation/scenario";
import { CMP_LAYOUT, type CmpLayout } from "./layout";
import { CMP_TEMPLATE_ID } from "./template";

const rows = buildPhases([
  { id: "ready", label: "Ready", labelKo: "대기 (wafer on load cup)", duration: 2, equipment: "cmp" },
  { id: "load", label: "Load / orient wafer", labelKo: "Wafer 인계 (face-down)", duration: 4, equipment: "cmp" },
  { id: "wetting", label: "Pad wetting", labelKo: "Pad wetting", duration: 3, equipment: "cmp" },
  { id: "approach", label: "Head approach", labelKo: "Head 접근·접촉", duration: 2, equipment: "cmp" },
  { id: "bulk", label: "Bulk polish illustration", labelKo: "Bulk polish 연출", duration: 8, equipment: "cmp" },
  { id: "clearing", label: "Clearing illustration", labelKo: "Clearing 연출", duration: 5, equipment: "cmp" },
  { id: "overpolish", label: "Bounded overpolish illustration", labelKo: "제한된 overpolish 연출", duration: 3, equipment: "cmp" },
  { id: "lift", label: "Head lift", labelKo: "Head 이탈", duration: 2, equipment: "cmp" },
  { id: "conditioning", label: "Pad conditioning (head retracted)", labelKo: "Pad conditioning", duration: 6, equipment: "cmp" },
  { id: "unload", label: "Unload to wet transfer", labelKo: "Unload (wet transfer)", duration: 3, equipment: "cmp" },
  { id: "clean", label: "Clean / rinse", labelKo: "Clean / rinse", duration: 5, equipment: "cmp" },
  { id: "dry", label: "Spin dry", labelKo: "Spin dry", duration: 4, equipment: "cmp" },
  { id: "return", label: "Return to FOUP", labelKo: "FOUP 복귀", duration: 3, equipment: "cmp" },
]);

export const CMP_SCENARIO: VisualScenario = { id: "sti-cmp-cycle-v1", title: "Rotary STI CMP cycle", durationSec: rows.durationSec, phases: rows.phases, renderSource: "illustrative" };

/** Speed ramp segments (t0, t1, from, to) — integrated analytically so the angle is a pure function of t. */
interface Ramp {
  t0: number;
  t1: number;
  v0: number;
  v1: number;
}

function speedAt(ramps: Ramp[], t: number): number {
  let v = 0;
  for (const r of ramps) {
    if (t >= r.t1) v = r.v1;
    else if (t >= r.t0) return lerp(r.v0, r.v1, (t - r.t0) / Math.max(r.t1 - r.t0, 1e-9));
  }
  return v;
}

function angleAt(ramps: Ramp[], t: number): number {
  // piecewise: constant speed between ramps (= previous v1), linear inside ramps
  let angle = 0;
  let prevT = 0;
  let prevV = 0;
  for (const r of ramps) {
    if (t <= r.t0) {
      angle += prevV * (t - prevT);
      return angle;
    }
    angle += prevV * (r.t0 - prevT);
    const tEnd = Math.min(t, r.t1);
    const frac = (tEnd - r.t0) / Math.max(r.t1 - r.t0, 1e-9);
    const vEnd = lerp(r.v0, r.v1, frac);
    angle += ((r.v0 + vEnd) / 2) * (tEnd - r.t0);
    if (t <= r.t1) return angle;
    prevT = r.t1;
    prevV = r.v1;
  }
  angle += prevV * (t - prevT);
  return angle;
}

export interface CmpState {
  phaseId: string;
  joints: Record<string, number>;
  effects: Record<string, number>;
  flags: Record<string, boolean | string>;
  holder: HolderKind | "carrier_slot" | "internal_transfer";
  presentedAssetId: string | null;
  frontsideNormalLocal: [number, number, number];
  film: { overcoat: number; surfaceOxide: number; sin: number; trenchFill: number; nitrideExposed: boolean; status: IllustrativeFilmState["status"] };
  /** Wafer is physically back in its FOUP slot (door closed afterwards). */
  inSlot: boolean;
}

const PLATEN_RPM = 60;
const HEAD_RPM = 55;
const COND_PLATEN_RPM = 30;
const DISC_RPM = 90;
const DRY_RPM = 900;
const rpm = (v: number) => (v * 2 * Math.PI) / 60;

function phaseTimes(scenario: VisualScenario): Record<string, { start: number; end: number }> {
  const out: Record<string, { start: number; end: number }> = {};
  for (const p of scenario.phases) out[p.id] = { start: p.start, end: p.end };
  return out;
}

/** Pure CMP sequence state at local time t (seconds since the sequence start). */
export function cmpSequence(L: CmpLayout, t: number, scenario: VisualScenario = CMP_SCENARIO): CmpState {
  const P = phaseTimes(scenario);
  const p = phaseAt(scenario, t);
  const prog = (id: string) => (t <= P[id].start ? 0 : t >= P[id].end ? 1 : (t - P[id].start) / (P[id].end - P[id].start));
  const at = (id: string, off: number) => P[id].start + off;
  // --- platen & head spin ramps
  const platenRamps: Ramp[] = [
    { t0: at("wetting", 0), t1: at("wetting", 2), v0: 0, v1: rpm(PLATEN_RPM) },
    { t0: at("lift", 0.5), t1: at("lift", 2), v0: rpm(PLATEN_RPM), v1: 0 },
    { t0: at("conditioning", 1), t1: at("conditioning", 2), v0: 0, v1: rpm(COND_PLATEN_RPM) },
    { t0: at("conditioning", 5), t1: at("conditioning", 6), v0: rpm(COND_PLATEN_RPM), v1: 0 },
  ];
  const headRamps: Ramp[] = [
    { t0: at("approach", 0.5), t1: at("approach", 2), v0: 0, v1: rpm(HEAD_RPM) },
    { t0: at("lift", 0), t1: at("lift", 1.5), v0: rpm(HEAD_RPM), v1: 0 },
  ];
  const discRamps: Ramp[] = [
    { t0: at("conditioning", 1.5), t1: at("conditioning", 2.2), v0: 0, v1: rpm(DISC_RPM) },
    { t0: at("conditioning", 5), t1: at("conditioning", 5.6), v0: rpm(DISC_RPM), v1: 0 },
  ];
  const dryRamps: Ramp[] = [
    { t0: at("dry", 0.3), t1: at("dry", 1.3), v0: 0, v1: rpm(DRY_RPM) },
    { t0: at("dry", 3.0), t1: at("dry", 4.0), v0: rpm(DRY_RPM), v1: 0 },
  ];
  // --- hatch (open during load pickup and unload release)
  let hatch = 0;
  if (p.id === "load") {
    const pr = prog("load") * 4;
    hatch = pr < 1 ? smoothstep(0, 1, pr) : pr < 3.4 ? 1 : 1 - smoothstep(3.4, 4, pr);
  } else if (p.id === "unload") {
    const pr = prog("unload") * 3;
    hatch = pr < 0.8 ? smoothstep(0, 0.8, pr) : pr < 2.6 ? 1 : 1 - smoothstep(2.6, 3, pr);
  }
  // --- head lateral (0 = polish, loadTravel = load cup) and lift
  let lateral = L.head.loadTravel;
  if (t >= at("wetting", 0.5) && t < at("conditioning", 0)) lateral = L.head.loadTravel * (1 - smoothstep(at("wetting", 0.5), at("wetting", 2.5), t));
  else if (t >= at("conditioning", 0)) lateral = L.head.loadTravel * smoothstep(at("conditioning", 0), at("conditioning", 1.5), t);
  let lift = 0;
  if (p.id === "load") {
    const pr = prog("load") * 4;
    lift = pr < 1 ? 0 : pr < 2.5 ? L.head.liftPick * smoothstep(1, 2.5, pr) : L.head.liftPick * (1 - smoothstep(2.5, 4, pr));
  } else if (t >= at("approach", 0) && t < at("lift", 0)) lift = L.head.liftContact * smoothstep(at("approach", 0), at("approach", 1.5), t);
  else if (p.id === "lift") lift = L.head.liftContact * (1 - smoothstep(at("lift", 0), at("lift", 1.2), t));
  else if (p.id === "unload") {
    const pr = prog("unload") * 3;
    lift = pr < 0.8 ? 0 : pr < 1.8 ? L.head.liftPick * smoothstep(0.8, 1.8, pr) : L.head.liftPick * (1 - smoothstep(1.8, 2.6, pr));
  }
  // --- conditioner (ex-situ): park → sweep oscillation → park
  const c = L.conditioner;
  let sweep = c.parkAngle;
  let condLift = c.liftStroke;
  if (p.id === "conditioning") {
    const pr = prog("conditioning") * 6;
    if (pr < 1) sweep = c.parkAngle;
    else if (pr < 2) sweep = lerp(c.parkAngle, c.sweepMax, smoothstep(1, 2, pr));
    else if (pr < 5) sweep = c.sweepMin + (c.sweepMax - c.sweepMin) * (0.5 + 0.5 * Math.cos(((pr - 2) / 3) * Math.PI * 2));
    else sweep = lerp(c.sweepMax, c.parkAngle, smoothstep(5, 6, pr));
    condLift = pr < 1.5 ? c.liftStroke : pr < 2.2 ? c.liftStroke * (1 - smoothstep(1.5, 2.2, pr)) : pr < 5 ? 0 : c.liftStroke * smoothstep(5, 5.6, pr);
  }
  // --- effects
  const slurryFlow = t < at("wetting", 1) ? 0 : t < at("lift", 0) ? smoothstep(at("wetting", 1), at("wetting", 2), t) : 1 - smoothstep(at("lift", 0), at("lift", 1), t);
  const padWet = t < at("wetting", 1) ? 0 : t < at("conditioning", 6) ? smoothstep(at("wetting", 1), at("wetting", 3), t) : clamp01(1 - smoothstep(at("conditioning", 6), at("unload", 2), t));
  const rinseFlow = p.id === "clean" ? smoothstep(0, 0.1, prog("clean")) * (1 - smoothstep(0.9, 1, prog("clean"))) : 0;
  const joints: Record<string, number> = {
    platen_spin: angleAt(platenRamps, t),
    head_lateral: lateral,
    head_lift: lift,
    head_spin: angleAt(headRamps, t),
    conditioner_sweep: sweep,
    conditioner_lift: condLift,
    conditioner_spin: angleAt(discRamps, t),
    load_hatch: hatch * L.loadCup.alcove.hatch_travel,
    dry_spin: angleAt(dryRamps, t),
  };
  // --- holder transitions (atomic at the capture / release boundaries)
  let holder: CmpState["holder"] = "load_cup";
  let presentedAssetId: string | null = "wafer_on_cup";
  let frontside: [number, number, number] = [0, -1, 0];
  let inSlot = false;
  const captureT = at("load", 2.5);
  const releaseT = at("unload", 1.8);
  const toWetT = at("unload", 2.6);
  if (t < captureT) {
    holder = "load_cup";
    presentedAssetId = "wafer_on_cup";
  } else if (t < releaseT) {
    holder = "cmp_head";
    presentedAssetId = "wafer";
  } else if (t < toWetT) {
    holder = "load_cup";
    presentedAssetId = "wafer_on_cup";
  } else if (t < at("clean", 0)) {
    holder = "internal_transfer";
    presentedAssetId = null;
    frontside = [0, 1, 0];
  } else if (t < at("dry", 0)) {
    holder = "clean_module";
    presentedAssetId = "wafer_in_clean";
    frontside = [0, 1, 0];
  } else if (t < at("return", 0)) {
    holder = "dry_module";
    presentedAssetId = "wafer_in_dry";
    frontside = [0, 1, 0];
  } else if (t < at("return", 2)) {
    holder = "internal_transfer";
    presentedAssetId = null;
    frontside = [0, 1, 0];
  } else {
    holder = "carrier_slot";
    presentedAssetId = null;
    frontside = [0, 1, 0];
    inSlot = true;
  }
  // --- illustrative film (presentation only)
  const bulk = prog("bulk");
  const clear = prog("clearing");
  const over = prog("overpolish");
  const overcoat = t < at("bulk", 0) ? 1 : t < at("clearing", 0) ? 1 - 0.65 * bulk : clamp01(0.35 * (1 - smoothstep(0, 0.4, clear)));
  const surfaceOxide = t < at("clearing", 0) ? 1 : t < at("overpolish", 0) ? 1 - 0.85 * smoothstep(0.2, 1, clear) : 0.15 * (1 - over);
  const sin = t < at("overpolish", 0) ? 1 : 1 - 0.05 * over;
  const trenchFill = t < at("overpolish", 0) ? 1 : 1 - 0.03 * over;
  const nitrideExposed = clear >= 0.8;
  let status: IllustrativeFilmState["status"] = "deposited";
  if (t >= at("bulk", 0) && t < at("clearing", 0)) status = "polishing";
  else if (t >= at("clearing", 0) && t < at("overpolish", 0)) status = "cleared";
  else if (t >= at("overpolish", 0) && t < at("lift", 0)) status = "overpolish_illustration";
  else if (t >= at("lift", 0)) status = "complete";
  const opt = (() => {
    // reported as a flag only (In view / Out of view); the scene computes the footprint pose itself
    const w = L.pad.window;
    const a = joints.platen_spin;
    const wx = w.r * Math.cos(w.azimuth) * Math.cos(a) + w.r * Math.sin(w.azimuth) * Math.sin(a);
    const wz = -w.r * Math.cos(w.azimuth) * Math.sin(a) + w.r * Math.sin(w.azimuth) * Math.cos(a);
    const d = Math.hypot(wx - (L.head.polishX - lateral), wz);
    return Math.abs(lift - L.head.liftContact) < 0.004 && d < L.rWafer - w.lenR / 2;
  })();
  return {
    phaseId: p.id,
    joints,
    effects: { slurryFlow, padWet, rinseFlow, platenSpeed: speedAt(platenRamps, t), headSpeed: speedAt(headRamps, t) },
    flags: { hatchOpen: hatch > 0.5, headContact: Math.abs(lift - L.head.liftContact) < 0.004, opticalInView: opt ? "In view" : "Out of view", conditioning: p.id === "conditioning" },
    holder,
    presentedAssetId,
    frontsideNormalLocal: frontside,
    film: { overcoat, surfaceOxide, sin, trenchFill, nitrideExposed, status },
    inSlot,
  };
}

export function applyCmpFilm(film: IllustrativeFilmState, s: CmpState["film"]): IllustrativeFilmState {
  const layers = film.layers.map((l) => {
    switch (l.layerId) {
      case "demo_overcoat":
        return { ...l, presentFraction: Math.min(l.presentFraction, s.overcoat) };
      case "surface_oxide":
        return { ...l, presentFraction: s.surfaceOxide };
      case "sin_stop":
        return { ...l, presentFraction: s.sin };
      case "trench_fill":
        return { ...l, presentFraction: s.trenchFill };
      default:
        return l;
    }
  });
  return { ...film, layers, nitrideExposed: s.nitrideExposed, status: s.status };
}

export function cmpStandalonePreview(t: number, _seed: number, _animT: number, ctx: ScenarioContext): PreviewState {
  const phase = phaseAt(CMP_SCENARIO, t);
  const out: PreviewState = {
    scenarioId: CMP_SCENARIO.id,
    t,
    phaseId: phase.id,
    phaseLabel: phase.label,
    phaseLabelKo: phase.labelKo,
    phaseFocusInstanceId: null,
    instances: {},
    carriers: {},
    wafers: {},
    plasma: { intensity: 0, flicker: 0 },
    blockedReason: null,
  };
  const cmps = ctx.instances.filter((i) => i.templateId === CMP_TEMPLATE_ID);
  let first: CmpState | null = null;
  for (const inst of ctx.instances) {
    const p = emptyInstancePreview(inst.instanceId);
    if (inst.templateId === CMP_TEMPLATE_ID) {
      const s = cmpSequence(CMP_LAYOUT, t);
      if (!first) first = s;
      p.joints = s.joints;
      p.effects = s.effects;
      p.flags = s.flags;
      p.presentedWaferId = s.presentedAssetId ? (inst.instanceId === cmps[0]?.instanceId ? DEMO_WAFER.waferId : `W-${inst.instanceId}`) : null;
      p.presentedWaferAssetId = s.presentedAssetId ?? undefined;
      p.phaseLabelKo = phase.labelKo;
    }
    out.instances[inst.instanceId] = p;
  }
  const inst0 = cmps[0];
  if (inst0 && first) {
    const stationId = Object.values(ctx.stations).find((s) => s.instanceId === inst0.instanceId)?.stationId;
    if (stationId) out.carriers[DEMO_CARRIER.carrierId] = { carrierId: DEMO_CARRIER.carrierId, holder: { kind: "station", id: stationId }, doorOpen: false, slots: { [DEMO_RESERVED_SLOT.slotId]: first.inSlot ? DEMO_WAFER.waferId : null }, docked: true };
    const holder: WaferHolder =
      first.holder === "carrier_slot"
        ? { kind: "carrier_slot", carrierId: DEMO_CARRIER.carrierId, slotId: DEMO_RESERVED_SLOT.slotId }
        : { kind: first.holder as HolderKind, instanceId: inst0.instanceId, noteKo: first.holder === "internal_transfer" ? "Simplified internal transfer (enclosed)" : undefined };
    // standalone CMP starts from a wafer that already carries the illustrated overcoat
    const incoming = incomingFilmState(DEMO_WAFER.waferId);
    incoming.layers = incoming.layers.map((l) => (l.layerId === "demo_overcoat" ? { ...l, presentFraction: 1 } : l));
    out.wafers[DEMO_WAFER.waferId] = { waferId: DEMO_WAFER.waferId, holder, reservedSlot: DEMO_RESERVED_SLOT, frontsideNormalLocal: first.frontsideNormalLocal, film: applyCmpFilm(incoming, first.film) };
  }
  return out;
}

export const CMP_STANDALONE_SCENARIO: ScenarioDefinition = {
  id: CMP_SCENARIO.id,
  title: CMP_SCENARIO.title,
  titleKo: "Rotary STI CMP 연출 (단독, conditioning 포함)",
  kind: "standalone",
  templateId: CMP_TEMPLATE_ID,
  scenario: CMP_SCENARIO,
  requiredInstanceIds: [],
  requiredTemplateIds: [CMP_TEMPLATE_ID],
  evaluate: cmpStandalonePreview,
};
