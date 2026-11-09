import { describe, expect, it } from "vitest";
import { deriveChamberLayout, loadGeometryConfig, validateGeometryConfig } from "../../src/config/geometry";
import { CCP_CHAMBER_TEMPLATE, validateTemplate } from "../../src/domain/ccpChamberTemplate";
import { CHANNEL_BINDINGS, SENSORS, measurementPoints } from "../../src/domain/sensors";

describe("geometry config", () => {
  const cfg = loadGeometryConfig();
  const L = deriveChamberLayout(cfg);

  it("has no validation errors", () => {
    const report = validateGeometryConfig(cfg);
    expect(report.errors).toEqual([]);
  });

  it("stacks the electrode assembly consistently", () => {
    expect(L.waferTopY).toBeGreaterThan(L.pedestalTopY);
    expect(L.faceplateBottomY - L.waferTopY).toBeCloseTo(cfg.electrodes.gap, 9);
    expect(L.faceplateTopY).toBeGreaterThan(L.faceplateBottomY);
    expect(L.plenumTopY).toBeGreaterThan(L.faceplateTopY);
    expect(L.backingTopY).toBeGreaterThan(L.plenumTopY);
    expect(L.isolatorTopY).toBeGreaterThan(L.isolatorBottomY + 0.008);
    expect(L.lidTopY).toBeGreaterThan(L.lidBottomY);
  });

  it("keeps the plasma volume strictly between wafer and faceplate", () => {
    expect(L.plasma.bottomY).toBeCloseTo(L.waferTopY, 12);
    expect(L.plasma.topY).toBeCloseTo(L.faceplateBottomY, 12);
    expect(L.plasma.radius).toBeLessThan(L.rLinerIn);
  });

  it("aligns the slit with the transfer plane", () => {
    const slit = cfg.ports.slit;
    expect(L.transferWaferTopY).toBeGreaterThan(slit.center_y - slit.height / 2);
    expect(L.transferWaferTopY).toBeLessThan(slit.center_y + slit.height / 2);
  });

  it("detects a broken configuration", () => {
    const bad = structuredClone(cfg);
    bad.electrodes.gap = -0.01;
    bad.pedestal.edge_ring_inner_diameter = 0.2;
    const report = validateGeometryConfig(bad);
    expect(report.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("equipment template", () => {
  it("is referentially consistent", () => {
    expect(validateTemplate(CCP_CHAMBER_TEMPLATE)).toEqual([]);
  });
  it("includes the required V1 components", () => {
    const ids = new Set(CCP_CHAMBER_TEMPLATE.components.map((c) => c.assetId));
    for (const id of ["chamber_body", "lid", "showerhead_faceplate", "showerhead_isolator", "wafer", "pedestal", "slit_valve", "exhaust_port", "rf_stem", "plasma_volume"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
  it("has all sensor channels unbound in V1", () => {
    const channelIds = SENSORS.flatMap((s) => s.channels.map((c) => c.channelId));
    expect(CHANNEL_BINDINGS.map((b) => b.channelId).sort()).toEqual(channelIds.sort());
    expect(CHANNEL_BINDINGS.every((b) => b.source === "unbound")).toBe(true);
    const L = deriveChamberLayout(loadGeometryConfig());
    const points = measurementPoints(L);
    for (const s of SENSORS) for (const ch of s.channels) expect(points.some((p) => p.pointId === ch.measurementPointId), ch.channelId).toBe(true);
  });
});
