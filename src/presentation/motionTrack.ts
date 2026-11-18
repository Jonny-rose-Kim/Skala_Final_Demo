/**
 * Motion tracks for the scripted handling sequences (robots, gates, pins, docking).
 *
 * A track is an ordered list of steps. Each step moves named channels to target values with a
 * smoothstep profile over its duration, may set discrete flags, and may switch the wafer holder at an
 * exact time inside the step. The switch time is computed analytically from the moment a moving
 * channel crosses a contact value (inverse smoothstep), so the wafer pose before and after the switch
 * is identical by construction. Evaluation always walks the steps from the start: the state at time t
 * is a pure function of t, which keeps pause, scrub, reverse and restart reproducible.
 *
 * Durations are presentation timing (config), never an equipment cycle time.
 */
import { clamp01, smoothstep, smoothstepInverse } from "./preview";

export type ChannelValues = Record<string, number>;
export type TrackFlags = Record<string, boolean | string>;

export interface HandoffSpec<H> {
  holder: H;
  /**
   * When the holder switches inside the step:
   *  - { channel, value }: when that channel (moving in this step) crosses `value`
   *  - "start" | "end": at the step boundary
   *  - number: fraction of the step (0..1)
   */
  at: { channel: string; value: number } | "start" | "end" | number;
}

export interface MotionStep<H> {
  id: string;
  labelKo: string;
  duration: number;
  /** Channel targets reached at the end of the step; unlisted channels hold their value. */
  to?: ChannelValues;
  /** Flags valid from the start of the step on (until overwritten). */
  set?: TrackFlags;
  handoff?: HandoffSpec<H>;
}

export interface TrackInitial<H> {
  values: ChannelValues;
  holder: H;
  flags?: TrackFlags;
}

export interface TrackState<H> {
  values: ChannelValues;
  holder: H;
  flags: TrackFlags;
  stepIndex: number;
  stepId: string;
  labelKo: string;
  /** Progress inside the current step (0..1). */
  stepProgress: number;
}

export interface HandoffEvent<H> {
  t: number;
  stepId: string;
  from: H;
  to: H;
}

export function trackDuration<H>(steps: MotionStep<H>[]): number {
  return steps.reduce((s, x) => s + x.duration, 0);
}

/** Time (absolute) at which a step's handoff happens, given the channel values at the step start. */
function handoffTime<H>(step: MotionStep<H>, t0: number, startValues: ChannelValues): number {
  const spec = step.handoff!;
  const t1 = t0 + step.duration;
  if (spec.at === "start") return t0;
  if (spec.at === "end") return t1;
  if (typeof spec.at === "number") return t0 + step.duration * clamp01(spec.at);
  const from = startValues[spec.at.channel] ?? 0;
  const to = step.to?.[spec.at.channel] ?? from;
  if (Math.abs(to - from) < 1e-12) return t1;
  const f = (spec.at.value - from) / (to - from);
  return t0 + step.duration * smoothstepInverse(f);
}

/** Evaluate a track at time t (seconds since the track start). */
export function evaluateTrack<H>(steps: MotionStep<H>[], initial: TrackInitial<H>, t: number): TrackState<H> {
  const values: ChannelValues = { ...initial.values };
  const flags: TrackFlags = { ...(initial.flags ?? {}) };
  let holder = initial.holder;
  let t0 = 0;
  if (!steps.length) return { values, holder, flags, stepIndex: -1, stepId: "", labelKo: "", stepProgress: 0 };
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const t1 = t0 + s.duration;
    const last = i === steps.length - 1;
    if (t < t0) {
      return { values, holder, flags, stepIndex: i, stepId: s.id, labelKo: s.labelKo, stepProgress: 0 };
    }
    if (s.set) Object.assign(flags, s.set);
    if (t < t1 || last) {
      const start = { ...values };
      const k = s.duration > 0 ? smoothstep(t0, t1, t) : 1;
      if (s.to) for (const [c, v] of Object.entries(s.to)) values[c] = (start[c] ?? 0) + (v - (start[c] ?? 0)) * k;
      if (s.handoff && t >= handoffTime(s, t0, start)) holder = s.handoff.holder;
      return { values, holder, flags, stepIndex: i, stepId: s.id, labelKo: s.labelKo, stepProgress: s.duration > 0 ? clamp01((t - t0) / s.duration) : 1 };
    }
    if (s.to) Object.assign(values, s.to);
    if (s.handoff) holder = s.handoff.holder;
    t0 = t1;
  }
  const s = steps[steps.length - 1];
  return { values, holder, flags, stepIndex: steps.length - 1, stepId: s.id, labelKo: s.labelKo, stepProgress: 1 };
}

/** Every holder switch of a track with its exact time (tests use this). */
export function trackHandoffs<H>(steps: MotionStep<H>[], initial: TrackInitial<H>): HandoffEvent<H>[] {
  const out: HandoffEvent<H>[] = [];
  const values: ChannelValues = { ...initial.values };
  let holder = initial.holder;
  let t0 = 0;
  for (const s of steps) {
    if (s.handoff) {
      out.push({ t: handoffTime(s, t0, values), stepId: s.id, from: holder, to: s.handoff.holder });
      holder = s.handoff.holder;
    }
    if (s.to) Object.assign(values, s.to);
    t0 += s.duration;
  }
  return out;
}

/** Start time of each step (tests, phase tables). */
export function stepStarts<H>(steps: MotionStep<H>[]): Record<string, { start: number; end: number }> {
  const out: Record<string, { start: number; end: number }> = {};
  let t = 0;
  for (const s of steps) {
    if (!out[s.id]) out[s.id] = { start: t, end: t + s.duration };
    t += s.duration;
  }
  return out;
}
