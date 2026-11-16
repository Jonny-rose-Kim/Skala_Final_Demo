import { describe, expect, it } from "vitest";
import { TAU } from "../../src/config/geometry";
import { CHAMBER_LAYOUT } from "../../src/config/geometry";
import { isAzimuthRemoved, resolveCutaway, snapBoundary } from "../../src/presentation/cutaway";
import { DEFAULT_SCENARIO, evaluateScenario, holdPointSec, phaseAt, releasePointSec } from "../../src/presentation/scenario";
import { VisualClock } from "../../src/presentation/visualClock";

describe("cutaway resolver", () => {
  const keepOuts = Object.values(CHAMBER_LAYOUT.ports).map((p) => p.keepOut);
  it("disabled cutaway keeps the full circle", () => {
    const r = resolveCutaway({ enabled: false, azimuthDeg: 100, sweepDeg: 90 }, keepOuts);
    expect(r.enabled).toBe(false);
    expect(r.kept[0].sweep).toBeCloseTo(TAU, 9);
  });
  it("snaps a boundary out of a keep-out to its nearest edge", () => {
    const k = [{ start: 1.0, sweep: 0.4 }];
    expect(snapBoundary(1.1, k).angle).toBeCloseTo(1.0, 9);
    expect(snapBoundary(1.35, k).angle).toBeCloseTo(1.4, 9);
    expect(snapBoundary(2.0, k).snapped).toBe(false);
  });
  it("never leaves a boundary inside a port keep-out for any requested azimuth", () => {
    for (let az = 0; az < 360; az += 7) {
      for (const sweep of [40, 95, 180]) {
        const r = resolveCutaway({ enabled: true, azimuthDeg: az, sweepDeg: sweep }, keepOuts);
        expect(r.enabled).toBe(true);
        expect(r.effectiveSweepDeg).toBeGreaterThanOrEqual(10);
        expect(r.effectiveSweepDeg).toBeLessThanOrEqual(345);
        const ends = [r.removed!.start, r.removed!.start + r.removed!.sweep];
        for (const k of keepOuts) {
          for (const e of ends) {
            const d = ((e - k.start) % TAU + TAU) % TAU;
            expect(d < 1e-6 || d > k.sweep - 1e-6, `az ${az} sweep ${sweep}`).toBe(true);
          }
        }
        expect(r.kept[0].sweep + r.removed!.sweep).toBeCloseTo(TAU, 9);
      }
    }
  });
  it("classifies azimuths inside the removed sector", () => {
    const r = resolveCutaway({ enabled: true, azimuthDeg: 265, sweepDeg: 95 }, keepOuts);
    expect(isAzimuthRemoved((265 * Math.PI) / 180, r)).toBe(true);
    expect(isAzimuthRemoved((85 * Math.PI) / 180, r)).toBe(false);
  });
});

describe("visual clock", () => {
  it("advances only while playing and clamps large gaps", () => {
    const c = new VisualClock(18);
    c.play();
    c.tick(1000);
    for (let i = 1; i <= 10; i++) c.tick(1000 + i * 50); // 10 x 50 ms frames
    expect(c.playheadSec).toBeCloseTo(0.5, 9);
    c.tick(6500); // 5 s gap (hidden tab) -> clamped to maxStepSec
    expect(c.playheadSec).toBeCloseTo(0.6, 9);
    c.pause();
    c.tick(7000);
    expect(c.playheadSec).toBeCloseTo(0.6, 9);
  });
  it("scrubs backwards and stops at the end instead of looping", () => {
    const c = new VisualClock(18);
    c.scrub(17.95);
    c.play();
    c.tick(0);
    c.tick(100);
    expect(c.playheadSec).toBe(18);
    expect(c.playing).toBe(false);
    c.scrub(3);
    expect(c.playheadSec).toBe(3);
    c.scrub(18);
    c.play(); // play at the end starts over
    expect(c.playheadSec).toBe(0);
    expect(c.playing).toBe(true);
  });
  it("holds at the hold point while effect time keeps running", () => {
    const c = new VisualClock(18, 13.999);
    c.scrub(13.9);
    c.play();
    c.tick(0);
    for (let i = 1; i <= 20; i++) c.tick(i * 50); // 1 s of frames
    expect(c.holding).toBe(true);
    expect(c.playing).toBe(true);
    expect(c.playheadSec).toBe(13.999);
    expect(c.effectTimeSec).toBeCloseTo(14.9, 9);
    c.pause();
    c.tick(2000);
    expect(c.effectTimeSec).toBeCloseTo(14.9, 9);
  });
  it("release continues past the hold with continuous effect time and ends stopped", () => {
    const c = new VisualClock(18, 13.999);
    c.scrub(13.9);
    c.play();
    c.tick(0);
    for (let i = 1; i <= 20; i++) c.tick(i * 50);
    const effectBefore = c.effectTimeSec;
    c.release(14);
    expect(c.holding).toBe(false);
    expect(c.playheadSec).toBe(14);
    expect(c.effectTimeSec).toBeCloseTo(effectBefore, 9);
    c.tick(5000);
    c.tick(5050);
    expect(c.playheadSec).toBeCloseTo(14.05, 9);
    expect(c.effectTimeSec).toBeCloseTo(effectBefore + 0.05, 9);
    c.speed = 4;
    for (let i = 1; i <= 100; i++) c.tick(5050 + i * 50);
    expect(c.playheadSec).toBe(18);
    expect(c.playing).toBe(false);
    expect(c.holding).toBe(false);
  });
  it("scrubbing resets the hold so a position always maps to the same effect time", () => {
    const c = new VisualClock(18, 13.999);
    c.scrub(13.9);
    c.play();
    c.tick(0);
    for (let i = 1; i <= 20; i++) c.tick(i * 50);
    expect(c.holding).toBe(true);
    c.scrub(8);
    expect(c.holding).toBe(false);
    expect(c.effectTimeSec).toBe(8);
    c.scrub(15); // past the hold point: playing on does not hold again
    c.tick(1050); // last tick was at 1000 ms
    expect(c.holding).toBe(false);
    expect(c.playheadSec).toBeCloseTo(15.05, 9);
  });
  it("restart returns to zero and plays", () => {
    const c = new VisualClock(18);
    c.scrub(9);
    c.pause();
    c.restart();
    expect(c.playheadSec).toBe(0);
    expect(c.playing).toBe(true);
  });
});

describe("scenario", () => {
  it("is deterministic in (time, seed)", () => {
    for (const t of [0.3, 2.1, 3.3, 8, 14.9, 17]) {
      const a = evaluateScenario(DEFAULT_SCENARIO, t, 7);
      const b = evaluateScenario(DEFAULT_SCENARIO, t, 7);
      expect(a).toEqual(b);
    }
    const s1 = evaluateScenario(DEFAULT_SCENARIO, 2.1, 7);
    const s2 = evaluateScenario(DEFAULT_SCENARIO, 2.1, 8);
    expect(s1.phase).toBe(s2.phase);
  });
  it("follows the scripted phase order with plasma off at both ends", () => {
    expect(phaseAt(DEFAULT_SCENARIO, 0.5).id).toBe("off");
    expect(phaseAt(DEFAULT_SCENARIO, 2).id).toBe("ignition");
    expect(phaseAt(DEFAULT_SCENARIO, 8).id).toBe("stable");
    expect(phaseAt(DEFAULT_SCENARIO, 15).id).toBe("extinction");
    expect(phaseAt(DEFAULT_SCENARIO, 17.5).id).toBe("off_end");
    expect(evaluateScenario(DEFAULT_SCENARIO, 0.5, 1).intensity).toBe(0);
    expect(evaluateScenario(DEFAULT_SCENARIO, 8, 1).intensity).toBeGreaterThan(0.9);
    expect(evaluateScenario(DEFAULT_SCENARIO, 17.5, 1).intensity).toBe(0);
  });
  it("holds inside the stable phase and releases into extinction", () => {
    const hold = holdPointSec(DEFAULT_SCENARIO)!;
    const release = releasePointSec(DEFAULT_SCENARIO)!;
    expect(phaseAt(DEFAULT_SCENARIO, hold).id).toBe("stable");
    expect(phaseAt(DEFAULT_SCENARIO, release).id).toBe("extinction");
    expect(release - hold).toBeLessThan(0.01);
    // stable modulation follows effect time, so it keeps moving while the playhead is parked
    const a = evaluateScenario(DEFAULT_SCENARIO, hold, 7, hold + 1);
    const b = evaluateScenario(DEFAULT_SCENARIO, hold, 7, hold + 2);
    expect(a.phase).toBe("stable");
    expect(a.intensity).not.toBe(b.intensity);
  });
});
