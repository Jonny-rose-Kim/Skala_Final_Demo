/**
 * VisualScenario: scripted, deterministic illustration sequence
 *   Off -> Ignition illustration -> Stable plasma -> Extinction illustration -> Off
 * Every value is a pure function f(time, visual_seed) so pause/scrub reproduce the same frame.
 * The transition times are presentation choices, not computed ignition/transient physics.
 */
export type ScenarioPhaseId = "off" | "ignition" | "stable" | "extinction" | "off_end";

export interface ScenarioPhase {
  id: ScenarioPhaseId;
  label: string;
  labelKo: string;
  start: number;
  end: number;
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
  phases: scenarioConfig.phases.map((p) => ({ id: p.id as ScenarioPhaseId, label: p.label, labelKo: p.labelKo, start: p.start, end: p.end })),
};

function hash1(n: number): number {
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

/** Deterministic evaluation: identical (t, seed) always yield the same sample. */
export function evaluateScenario(scenario: VisualScenario, t: number, seed: number): ScenarioSample {
  const p = phaseAt(scenario, t);
  const prog = (t - p.start) / Math.max(p.end - p.start, 1e-6);
  switch (p.id) {
    case "off":
    case "off_end":
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
      const slow = 1 + 0.025 * Math.sin(t * 0.9 + seed) + 0.015 * Math.sin(t * 2.3 + seed * 1.7);
      return { phase: p.id, intensity: slow, flicker: 0, phaseProgress: prog };
    }
    case "extinction": {
      const decay = 1 - smoothstep(0.0, 0.7, prog);
      const tail = prog > 0.7 ? 0.08 * (1 - smoothstep(0.7, 1.0, prog)) * (hash1(Math.floor(t * 12) + seed) > 0.5 ? 1 : 0.3) : 0;
      return { phase: p.id, intensity: Math.max(decay, tail), flicker: 0, phaseProgress: prog };
    }
  }
}
