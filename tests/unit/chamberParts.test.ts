import { describe, expect, it } from "vitest";
import { TAU } from "../../src/config/geometry";
import { CHAMBER_LAYOUT } from "../../src/config/geometry";
import { COMPONENTS } from "../../src/domain/ccpChamberTemplate";
import { buildChamberParts, intersectRanges, spokeRanges } from "../../src/geometry/chamberParts";
import { checkWindingConsistency, meshDataBounds, revolveCaps } from "../../src/geometry/meshlib";
import { resolveCutaway } from "../../src/presentation/cutaway";

describe("chamber parts", () => {
  const parts = buildChamberParts(CHAMBER_LAYOUT);
  const full = [{ start: 0, sweep: TAU }];
  const keepOuts = Object.values(CHAMBER_LAYOUT.ports).map((p) => p.keepOut);
  const cut = resolveCutaway({ enabled: true, azimuthDeg: 265, sweepDeg: 95 }, keepOuts);

  it("covers every selectable component with at least one part", () => {
    const assets = new Set(parts.map((p) => p.assetId));
    for (const c of COMPONENTS) {
      if (c.assetId === "plasma_volume") continue;
      expect(assets.has(c.assetId), c.assetId).toBe(true);
    }
  });

  it("references only known assets", () => {
    const known = new Set(COMPONENTS.map((c) => c.assetId));
    for (const p of parts) expect(known.has(p.assetId), `${p.key} -> ${p.assetId}`).toBe(true);
  });

  it("generates valid meshes assembled and cut", () => {
    for (const p of parts) {
      for (const ranges of [full, cut.kept]) {
        const md = p.build(ranges);
        expect(md.indices.length % 3, p.key).toBe(0);
        for (const v of md.positions) expect(Number.isFinite(v), `${p.key} finite`).toBe(true);
        const w = checkWindingConsistency(md);
        expect(w.inconsistent, `${p.key} winding`).toBe(0);
        if (!p.sectorDependent) break;
      }
      if (p.capProfile) {
        const caps = revolveCaps(p.capProfile, cut.kept);
        expect(caps.indices.length, `${p.key} caps`).toBeGreaterThan(0);
        expect(checkWindingConsistency(caps).inconsistent).toBe(0);
      }
    }
  });

  it("keeps the wafer on the pedestal and under the faceplate", () => {
    const L = CHAMBER_LAYOUT;
    const wafer = meshDataBounds(parts.find((p) => p.key === "wafer")!.build(full));
    const pedestal = meshDataBounds(parts.find((p) => p.key === "pedestal")!.build(full));
    const faceplate = meshDataBounds(parts.find((p) => p.key === "faceplate")!.build(full));
    expect(wafer.min[1]).toBeCloseTo(pedestal.max[1], 9);
    expect(faceplate.min[1] - wafer.max[1]).toBeCloseTo(L.cfg.electrodes.gap, 9);
    expect(wafer.max[0]).toBeLessThan(pedestal.max[0]);
  });

  it("snaps the default cutaway outside every port keep-out", () => {
    expect(cut.enabled).toBe(true);
    for (const k of keepOuts) {
      const inside = (a: number) => {
        const d = ((a - k.start) % TAU + TAU) % TAU;
        return d > 1e-6 && d < k.sweep - 1e-6;
      };
      expect(inside(cut.removed!.start)).toBe(false);
      expect(inside(cut.removed!.start + cut.removed!.sweep)).toBe(false);
    }
  });

  it("intersects spoke ranges with the kept sector", () => {
    const spokes = spokeRanges(36, 0.5);
    const r = intersectRanges(spokes, cut.kept);
    const total = r.reduce((s, x) => s + x.sweep, 0);
    expect(total).toBeLessThan(TAU * 0.5);
    expect(total).toBeGreaterThan(TAU * 0.5 * 0.5);
  });
});
