/**
 * presentation_time: a monotonic, scrubbable playhead for the illustrative visual sequence.
 * It is independent of any simulation or replay clock. Pausing freezes effect time; the camera,
 * selection and cutaway stay interactive. Large gaps (hidden tab) never jump the playhead.
 */
export interface VisualClockState {
  playheadSec: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  durationSec: number;
}

export type ClockListener = (state: VisualClockState) => void;

export class VisualClock {
  playheadSec = 0;
  playing = false;
  loop = true;
  speed = 1;
  durationSec: number;
  /** Maximum real-time step accepted per tick (seconds); larger gaps are clamped. */
  maxStepSec = 0.1;
  private lastNowMs: number | null = null;
  private readonly listeners = new Set<ClockListener>();

  constructor(durationSec: number) {
    this.durationSec = durationSec;
  }

  state(): VisualClockState {
    return { playheadSec: this.playheadSec, playing: this.playing, loop: this.loop, speed: this.speed, durationSec: this.durationSec };
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
    this.playheadSec += dt * this.speed;
    if (this.playheadSec >= this.durationSec) {
      if (this.loop) this.playheadSec = this.playheadSec % this.durationSec;
      else {
        this.playheadSec = this.durationSec;
        this.playing = false;
      }
    }
    this.emit();
    return this.playheadSec;
  }

  play(): void {
    if (!this.playing && this.playheadSec >= this.durationSec && !this.loop) this.playheadSec = 0;
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
    this.playheadSec = 0;
    this.playing = true;
    this.lastNowMs = null;
    this.emit();
  }
  scrub(sec: number): void {
    this.playheadSec = Math.min(Math.max(sec, 0), this.durationSec);
    this.emit();
  }
  setLoop(v: boolean): void {
    this.loop = v;
    this.emit();
  }
  setSpeed(v: number): void {
    this.speed = Math.min(Math.max(v, 0.1), 4);
    this.emit();
  }
}
