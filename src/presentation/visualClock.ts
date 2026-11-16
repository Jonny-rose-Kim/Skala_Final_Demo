/**
 * presentation_time: a monotonic, scrubbable playhead for the illustrative visual sequence.
 * It is independent of any simulation or replay clock. Pausing freezes effect time; the camera,
 * selection and cutaway stay interactive. Large gaps (hidden tab) never jump the playhead.
 *
 * Hold: when playback reaches `holdAtSec` (end of the stable phase) the playhead parks there until
 * `release()` is called, so the plasma stays on while the viewer inspects the chamber. Effect time
 * (noise, slow modulation) keeps running during the hold: effectTime = playhead + effectOffset.
 * Scrub/restart reset the offset to 0, so any timeline position reproduces the same frame.
 */
export interface VisualClockState {
  playheadSec: number;
  playing: boolean;
  holding: boolean;
  speed: number;
  durationSec: number;
}

export type ClockListener = (state: VisualClockState) => void;

export class VisualClock {
  playheadSec = 0;
  playing = false;
  holding = false;
  speed = 1;
  durationSec: number;
  holdAtSec: number | null;
  /** effectTime - playhead; grows while holding and is kept across release() so effects stay continuous. */
  effectOffsetSec = 0;
  /** Maximum real-time step accepted per tick (seconds); larger gaps are clamped. */
  maxStepSec = 0.1;
  private lastNowMs: number | null = null;
  private readonly listeners = new Set<ClockListener>();

  constructor(durationSec: number, holdAtSec: number | null = null) {
    this.durationSec = durationSec;
    this.holdAtSec = holdAtSec;
  }

  /** Switch to another sequence: new duration / hold point, playhead back to 0 (keeps play state unless told). */
  configure(durationSec: number, holdAtSec: number | null, play = true): void {
    this.durationSec = durationSec;
    this.holdAtSec = holdAtSec;
    this.reset(0);
    this.playing = play;
    this.lastNowMs = null;
    this.emit();
  }

  get effectTimeSec(): number {
    return this.playheadSec + this.effectOffsetSec;
  }

  state(): VisualClockState {
    return { playheadSec: this.playheadSec, playing: this.playing, holding: this.holding, speed: this.speed, durationSec: this.durationSec };
  }

  subscribe(fn: ClockListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const s = this.state();
    for (const l of this.listeners) l(s);
  }

  /** Advance using a monotonic timestamp (performance.now()). Returns the playhead. */
  tick(nowMs: number): number {
    if (this.lastNowMs === null) {
      this.lastNowMs = nowMs;
      return this.playheadSec;
    }
    let dt = (nowMs - this.lastNowMs) / 1000;
    this.lastNowMs = nowMs;
    if (!this.playing) return this.playheadSec;
    if (dt < 0) dt = 0;
    if (dt > this.maxStepSec) dt = this.maxStepSec; // hidden tab / stall: do not jump
    const step = dt * this.speed;
    if (this.holding) {
      this.effectOffsetSec += step;
    } else {
      const prev = this.playheadSec;
      let next = prev + step;
      if (this.holdAtSec !== null && prev < this.holdAtSec && next >= this.holdAtSec) {
        this.effectOffsetSec += next - this.holdAtSec;
        next = this.holdAtSec;
        this.holding = true;
      }
      if (next >= this.durationSec) {
        next = this.durationSec;
        this.playing = false;
      }
      this.playheadSec = next;
    }
    this.emit();
    return this.playheadSec;
  }

  play(): void {
    if (!this.playing && this.playheadSec >= this.durationSec) this.reset(0);
    this.playing = true;
    this.lastNowMs = null;
    this.emit();
  }
  pause(): void {
    this.playing = false;
    this.emit();
  }
  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }
  restart(): void {
    this.reset(0);
    this.playing = true;
    this.lastNowMs = null;
    this.emit();
  }
  scrub(sec: number): void {
    this.reset(sec);
    this.emit();
  }
  /** End the hold (or skip ahead from earlier in the held phase) and play on from `toSec`, keeping effect time continuous. */
  release(toSec: number): void {
    const effect = this.effectTimeSec;
    this.playheadSec = Math.min(Math.max(toSec, 0), this.durationSec);
    this.effectOffsetSec = effect - this.playheadSec;
    this.holding = false;
    this.playing = true;
    this.lastNowMs = null;
    this.emit();
  }
  setSpeed(v: number): void {
    this.speed = Math.min(Math.max(v, 0.1), 4);
    this.emit();
  }

  private reset(sec: number): void {
    this.playheadSec = Math.min(Math.max(sec, 0), this.durationSec);
    this.effectOffsetSec = 0;
    this.holding = false;
  }
}
