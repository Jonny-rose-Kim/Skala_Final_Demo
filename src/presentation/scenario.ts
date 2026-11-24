/**
 * VisualScenario: scripted, deterministic illustration sequences.
 * The original CCP sequence (Off -> Ignition illustration -> Stable plasma -> Extinction illustration -> Off)
 * is kept unchanged as DEFAULT_SCENARIO. Every value is a pure function f(time, visual_seed) so pause/scrub
 * reproduce the same frame. Transition times are presentation choices, not computed physics.
 * The phase marked `holdUntilRelease` is held by the VisualClock until the viewer asks to continue.
 *
 * Multi-equipment scenarios (Remote, CMP, OHT, Route A/B) are ScenarioDefinitions registered in
 * `scenarioRegistry.ts`; they evaluate to a PreviewState (joint poses, holders, film state).
 */
import type { EquipmentInstanceDef } from "../domain/types";
import type { PreviewState } from "./preview";

export type ScenarioPhaseId = string;

/** Which equipment a phase is about (the UI follows it in linked demonstrations). */
/**
 * Equipment a phase belongs to (timeline color, Follow target). Current bay: deposition / etch / wet_clean
 * / oht / carrier / external. Legacy bay: ccp / remote / cmp.
 */
export type PhaseEquipment = "deposition" | "etch" | "wet_clean" | "oht" | "carrier" | "external" | "ccp" | "remote" | "cmp";

export interface ScenarioPhase {
  id: ScenarioPhaseId;
  label: string;
  labelKo: string;
  start: number;
  end: number;
  holdUntilRelease?: boolean;
  equipment?: PhaseEquipment;
}

export interface ScenarioSample {
  phase: ScenarioPhaseId;
  /** 0..1 overall plasma intensity. */
  intensity: number;
  /** Extra brightness flicker (-0.2..0.4) used during ignition. */
  flicker: number;
  /** Progress inside the current phase 0..1. */
  phaseProgress: number;
}

export interface VisualScenario {
  id: string;
  title: string;
  durationSec: number;
  phases: ScenarioPhase[];
  renderSource: "illustrative";
}

import scenarioConfig from "../../config/visual/illustrative-cycle-v1.json";

export const DEFAULT_SCENARIO: VisualScenario = {
  id: scenarioConfig.id,
  title: scenarioConfig.title,
  durationSec: scenarioConfig.durationSec,
  renderSource: "illustrative",
  phases: scenarioConfig.phases.map((p) => ({
    id: p.id as ScenarioPhaseId,
    label: p.label,
    labelKo: p.labelKo,
    start: p.start,
    end: p.end,
    holdUntilRelease: "holdUntilRelease" in p ? !!p.holdUntilRelease : false,
    equipment: "ccp" as const,
  })),
};

/** Where the clock parks: just inside the end of the held phase, so phaseAt() still reports that phase. */
const HOLD_INSET_SEC = 1e-3;

export function holdPointSec(scenario: VisualScenario): number | null {
  const p = scenario.phases.find((ph) => ph.holdUntilRelease);
  return p ? p.end - HOLD_INSET_SEC : null;
}

/** Start of the phase that follows the held phase (extinction), i.e. where release() continues. */
export function releasePointSec(scenario: VisualScenario): number | null {
  const p = scenario.phases.find((ph) => ph.holdUntilRelease);
  return p ? p.end : null;
}

export function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

export function phaseAt(scenario: VisualScenario, t: number): ScenarioPhase {
  const tt = Math.min(Math.max(t, 0), scenario.durationSec);
  for (const p of scenario.phases) if (tt >= p.start && tt < p.end) return p;
  return scenario.phases[scenario.phases.length - 1];
}

/**
 * Plasma glow sample of a phase table with the CCP phase vocabulary (off / ignition / stable / extinction).
 * Identical (t, seed, animT) always yield the same sample. `t` is the playhead (selects the phase);
 * `animT` is effect time, which keeps advancing while the stable phase is held.
 */
export function plasmaSampleForPhase(p: ScenarioPhase, kind: "off" | "ignition" | "stable" | "extinction", t: number, seed: number, animT: number): ScenarioSample {
  const prog = (t - p.start) / Math.max(p.end - p.start, 1e-6);
  switch (kind) {
    case "off":
      return { phase: p.id, intensity: 0, flicker: 0, phaseProgress: prog };
    case "ignition": {
      // a few deterministic pre-breakdown flashes then a quick rise
      const slot = Math.floor(t * 18);
      const gate = hash1(slot + seed * 97);
      const pre = prog < 0.35 ? (gate > 0.72 ? 0.25 * hash1(slot * 3 + seed) : 0.02) : 0;
      const rise = smoothstep(0.3, 0.75, prog);
      const settle = 1 - 0.25 * (1 - smoothstep(0.75, 1, prog));
      const flicker = prog < 0.75 ? (hash1(slot * 7 + seed * 3) - 0.5) * 0.5 * (1 - rise) : 0;
      return { phase: p.id, intensity: Math.max(pre, rise * settle), flicker, phaseProgress: prog };
    }
    case "stable": {
      // very slow, small modulation (presentation only; not RF-cycle physics)
      const slow = 1 + 0.025 * Math.sin(animT * 0.9 + seed) + 0.015 * Math.sin(animT * 2.3 + seed * 1.7);
      return { phase: p.id, intensity: slow, flicker: 0, phaseProgress: prog };
    }
    case "extinction": {
      const decay = 1 - smoothstep(0.0, 0.7, prog);
      const tail = prog > 0.7 ? 0.08 * (1 - smoothstep(0.7, 1.0, prog)) * (hash1(Math.floor(t * 12) + seed) > 0.5 ? 1 : 0.3) : 0;
      return { phase: p.id, intensity: Math.max(decay, tail), flicker: 0, phaseProgress: prog };
    }
  }
}

/** Deterministic evaluation of the CCP plasma cycle (kept for the original sequence and its tests). */
export function evaluateScenario(scenario: VisualScenario, t: number, seed: number, animT: number = t): ScenarioSample {
  const p = phaseAt(scenario, t);
  switch (p.id) {
    case "off":
    case "off_end":
      return plasmaSampleForPhase(p, "off", t, seed, animT);
    case "ignition":
      return plasmaSampleForPhase(p, "ignition", t, seed, animT);
    case "stable":
      return plasmaSampleForPhase(p, "stable", t, seed, animT);
    case "extinction":
      return plasmaSampleForPhase(p, "extinction", t, seed, animT);
    default:
      return plasmaSampleForPhase(p, "off", t, seed, animT);
  }
}

/** Static world placement of a load-port station (derived from instance pose + template seat frame). */
export interface StationWorldFrame {
  stationId: string;
  instanceId: string;
  seatWorld: [number, number, number];
  /** Yaw of the FOUP (rad, about +Y) when seated: its door faces the tool. */
  yawRad: number;
  /** Unit vector the door faces (world XZ). */
  doorFacing: [number, number, number];
}

export interface ScenarioContext {
  instances: EquipmentInstanceDef[];
  stations: Record<string, StationWorldFrame>;
}

export type ScenarioKind = "standalone" | "linked";

/** A registered demonstration: phase table plus a pure evaluator to PreviewState. */
export interface ScenarioDefinition {
  id: string;
  title: string;
  titleKo: string;
  kind: ScenarioKind;
  /** Standalone scenarios belong to one template; linked ones to a route. */
  templateId?: string;
  routeId?: "A" | "B";
  scenario: VisualScenario;
  /** Instance ids that must exist in the loaded fixture for the scenario to be offered. */
  requiredInstanceIds: string[];
  /** Template ids that must be present (standalone scenarios). */
  requiredTemplateIds: string[];
  /** Label of the release action for the held phase (e.g. Extinguish), when the scenario holds. */
  releaseLabel?: string;
  evaluate(t: number, seed: number, animT: number, ctx: ScenarioContext): PreviewState;
}

/** Helper for evaluators: progress 0..1 of t inside phase `id` (0 before, 1 after). */
export function phaseProgress(scenario: VisualScenario, id: string, t: number): number {
  const p = scenario.phases.find((x) => x.id === id);
  if (!p) return 0;
  if (t <= p.start) return 0;
  if (t >= p.end) return 1;
  return (t - p.start) / Math.max(p.end - p.start, 1e-6);
}

/** True when t is after the end of phase `id`. */
export function phaseDone(scenario: VisualScenario, id: string, t: number): boolean {
  const p = scenario.phases.find((x) => x.id === id);
  return !!p && t >= p.end;
}

export function phaseStarted(scenario: VisualScenario, id: string, t: number): boolean {
  const p = scenario.phases.find((x) => x.id === id);
  return !!p && t >= p.start;
}

/** Build a phase table from ordered (id, label, labelKo, durationSec, equipment, hold?) rows. */
export function buildPhases(rows: { id: string; label: string; labelKo: string; duration: number; equipment?: PhaseEquipment; hold?: boolean }[]): { phases: ScenarioPhase[]; durationSec: number } {
  const phases: ScenarioPhase[] = [];
  let t = 0;
  for (const r of rows) {
    phases.push({ id: r.id, label: r.label, labelKo: r.labelKo, start: t, end: t + r.duration, holdUntilRelease: !!r.hold, equipment: r.equipment });
    t += r.duration;
  }
  return { phases, durationSec: t };
}
