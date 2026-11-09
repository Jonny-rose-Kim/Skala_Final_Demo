import { describe, expect, it } from "vitest";
import { TAU } from "../../src/config/geometry";
import {
  bellowsProfile,
  chamferedBox,
  checkWindingConsistency,
  circleProfile,
  filletProfile,
  meshDataBounds,
  perforatedDisc,
  perforatedDiscHoleCount,
  polarHoleLayout,
  polygonArea,
  portedShell,
  prismY,
  rectProfile,
  revolveProfile,
  roundedRect,
  triangulatePolygon,
  tubeAlongPath,
  vertexCount,
  type MeshData,
} from "../../src/geometry/meshlib";

function expectValidMesh(md: MeshData, label: string) {
  expect(md.indices.length % 3, `${label}: index count`).toBe(0);
  expect(md.positions.length / 3, `${label}: has vertices`).toBeGreaterThan(0);
  expect(md.normals.length, `${label}: normals`).toBe(md.positions.length);
  expect(md.uvs.length / 2, `${label}: uvs`).toBe(md.positions.length / 3);
  const n = vertexCount(md);
  for (const i of md.indices) expect(i >= 0 && i < n, `${label}: index in range`).toBe(true);
  for (const v of md.positions) expect(Number.isFinite(v), `${label}: finite positions`).toBe(true);
  for (const v of md.normals) expect(Number.isFinite(v), `${label}: finite normals`).toBe(true);
  const w = checkWindingConsistency(md);
  expect(w.inconsistent, `${label}: winding consistent with vertex normals`).toBe(0);
}

describe("triangulation", () => {
  it("triangulates a concave polygon preserving area", () => {
    const poly: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 3],
      [2, 1],
      [0, 3],
    ];
    const tri = triangulatePolygon(poly);
    expect(tri.indices.length / 3).toBe(poly.length - 2);
    let area = 0;
    for (let t = 0; t < tri.indices.length; t += 3) {
      const a = tri.points[tri.indices[t]];
      const b = tri.points[tri.indices[t + 1]];
      const c = tri.points[tri.indices[t + 2]];
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    expect(area).toBeCloseTo(polygonArea(poly), 9);
  });
  it("triangulates a polygon with a hole preserving area", () => {
    const outer: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const hole: [number, number][] = [
      [3, 3],
      [3, 6],
      [6, 6],
      [6, 3],
    ];
    const tri = triangulatePolygon(outer, [hole]);
    let area = 0;
    for (let t = 0; t < tri.indices.length; t += 3) {
      const a = tri.points[tri.indices[t]];
      const b = tri.points[tri.indices[t + 1]];
      const c = tri.points[tri.indices[t + 2]];
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    expect(area).toBeCloseTo(100 - 9, 6);
  });
});

describe("revolve", () => {
  it("builds a full ring with consistent winding", () => {
    const md = revolveProfile(rectProfile(0.2, 0.25, 0, 0.1), { segments: 32 });
    expectValidMesh(md, "ring");
    const b = meshDataBounds(md);
    expect(b.max[0]).toBeCloseTo(0.25, 6);
    expect(b.min[1]).toBeCloseTo(0, 9);
  });
  it("adds section caps for a sector", () => {
    const full = revolveProfile(rectProfile(0.2, 0.25, 0, 0.1), { segments: 32 });
    const sector = revolveProfile(rectProfile(0.2, 0.25, 0, 0.1), { segments: 32, ranges: [{ start: 0.5, sweep: 4.0 }] });
    expectValidMesh(sector, "sector");
    // sector has fewer side triangles but adds 2 caps x 2 triangles
    expect(sector.indices.length).toBeLessThan(full.indices.length);
    expect(sector.indices.length / 3).toBeGreaterThan(4);
  });
  it("revolves profiles with holes and fillets", () => {
    const outer = filletProfile(rectProfile(0, 0.17, 0, 0.045), 0.004, 3);
    const hole = rectProfile(0.035, 0.15, 0.012, 0.03);
    const md = revolveProfile({ outer, holes: [hole] }, { segments: 48, ranges: [{ start: 1, sweep: 4 }] });
    expectValidMesh(md, "pedestal");
    const bell = revolveProfile(bellowsProfile(0.042, 0.055, -0.2, -0.04, 6, 0.002), { segments: 24 });
    expectValidMesh(bell, "bellows");
    const torus = revolveProfile(circleProfile(0.1, 0.05, 0.004, 12), { segments: 48 });
    expectValidMesh(torus, "torus");
  });
});

describe("ported shell", () => {
  const ports = [
    { id: "slit", azimuth: Math.PI, centerY: 0.112, hole: { kind: "rect" as const, width: 0.36, height: 0.05 } },
    { id: "view", azimuth: Math.PI / 4, centerY: 0.16, hole: { kind: "circle" as const, radius: 0.03 } },
    { id: "tap", azimuth: (3 * Math.PI) / 4, centerY: 0.125, hole: { kind: "circle" as const, radius: 0.008 } },
  ];
  it("generates a full wall with ports", () => {
    const md = portedShell({ rIn: 0.26, rOut: 0.295, y0: 0, y1: 0.24, ports, segments: 64, boreSegments: 16 });
    expectValidMesh(md, "wall");
    const b = meshDataBounds(md);
    expect(b.max[0]).toBeCloseTo(0.295, 3);
    expect(b.max[1]).toBeCloseTo(0.24, 9);
  });
  it("generates a sector wall with caps and drops ports outside the kept range", () => {
    const md = portedShell({ rIn: 0.26, rOut: 0.295, y0: 0, y1: 0.24, ports, segments: 64, boreSegments: 16, ranges: [{ start: 1.2, sweep: 4.4 }] });
    expectValidMesh(md, "sector wall");
  });
});

describe("perforated disc", () => {
  it("lays out holes deterministically", () => {
    const a = polarHoleLayout(0.0055, 0.155);
    const b = polarHoleLayout(0.0055, 0.155);
    expect(a.total).toBe(b.total);
    expect(a.total).toBeGreaterThan(2000);
  });
  it("builds a full faceplate with every hole", () => {
    const md = perforatedDisc({ radius: 0.17, y0: 0, y1: 0.012, holeRadius: 0.0006, pitch: 0.0055, patternRadius: 0.155, holeSegments: 8, rimSegments: 64 });
    expectValidMesh(md, "faceplate");
    expect(perforatedDiscHoleCount(md)).toBe(polarHoleLayout(0.0055, 0.155).total);
  });
  it("builds a sector faceplate", () => {
    const md = perforatedDisc({ radius: 0.17, y0: 0, y1: 0.012, holeRadius: 0.0006, pitch: 0.0055, patternRadius: 0.155, holeSegments: 8, rimSegments: 64, ranges: [{ start: 1, sweep: TAU - 1.6 }] });
    expectValidMesh(md, "sector faceplate");
    expect(perforatedDiscHoleCount(md)).toBeLessThan(polarHoleLayout(0.0055, 0.155).total);
  });
});

describe("primitives", () => {
  it("builds prisms, boxes and tubes", () => {
    expectValidMesh(prismY(roundedRect(0.2, 0.16, 0.01, 3), 0, 0.18), "prism");
    expectValidMesh(chamferedBox([0.2, 0.1, 0.3], 0.01), "chamfered box");
    expectValidMesh(tubeAlongPath([[0, 0, 0], [0, 0.3, 0], [0.4, 0.3, 0], [0.4, -0.2, 0]], 0.02, { segments: 12, cornerRadius: 0.05 }), "tube");
  });
});
