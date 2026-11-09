import { describe, expect, it } from "vitest";
import { TAU } from "../../src/config/geometry";
import { CHAMBER_LAYOUT } from "../../src/config/geometry";
import { isAzimuthRemoved, resolveCutaway, snapBoundary } from "../../src/presentation/cutaway";
import { DEFAULT_SCENARIO, evaluateScenario, phaseAt } from "../../src/presentation/scenario";
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
  it("scrubs backwards and loops", () => {
    const c = new VisualClock(18);
    c.scrub(17.95);
    c.play();
    c.tick(0);
    c.tick(100);
    expect(c.playheadSec).toBeCloseTo(0.05, 6);
    c.scrub(3);
    expect(c.playheadSec).toBe(3);
    c.setLoop(false);
    c.scrub(17.99);
    c.tick(200);
    c.tick(300);
    expect(c.playheadSec).toBe(18);
    expect(c.playing).toBe(false);
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
});
