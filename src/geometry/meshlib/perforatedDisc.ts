/**
 * Showerhead faceplate: a disc with a polar array of through-holes. Each hole lives in an
 * annular-sector cell; the cell surface is a ring patch between the hole circle and the cell
 * boundary, and every hole gets a bore tube. Supports sector cutaway by clipping cells in phi.
 */
import type { AngularInterval } from "../../config/geometry";
import { TAU } from "../../config/geometry";
import { isFullCircle, tangentAt } from "./revolve";
import { createMeshData, pushQuadFacing, pushTriangleFacing, pushVertex, type MeshData, type Vec3 } from "./types";

export interface PerforatedDiscOptions {
  radius: number;
  y0: number;
  y1: number;
  holeRadius: number;
  pitch: number;
  patternRadius: number;
  holeSegments?: number;
  rimSegments?: number;
  ranges?: AngularInterval[];
  uvScale?: number;
  /** Generate section caps at range ends (default true). */
  caps?: boolean;
}

export interface HolePosition {
  r: number;
  phi: number;
}

/** Deterministic polar hole layout (ring i at radius i * pitch, count ~ circumference / pitch). */
export function polarHoleLayout(pitch: number, patternRadius: number): { rings: { r: number; count: number; phi0: number }[]; total: number } {
  const rings: { r: number; count: number; phi0: number }[] = [];
  let total = 0;
  const m = Math.floor(patternRadius / pitch);
  for (let i = 0; i <= m; i++) {
    const r = i * pitch;
    if (i === 0) {
      rings.push({ r: 0, count: 1, phi0: 0 });
      total += 1;
      continue;
    }
    const count = Math.max(6, Math.round((TAU * r) / pitch));
    rings.push({ r, count, phi0: (i % 2) * (Math.PI / count) });
    total += count;
  }
  return { rings, total };
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** Return the sub-interval of [a,b] kept by the ranges (assumes cells are narrower than any range). */
function clipToRanges(a: number, b: number, ranges: AngularInterval[]): [number, number] | null {
  if (isFullCircle(ranges)) return [a, b];
  for (const r of ranges) {
    // express a,b relative to r.start
    const ra = ((a - r.start) % TAU + TAU) % TAU;
    let rb = ra + (b - a);
    if (ra < r.sweep) {
      rb = Math.min(rb, r.sweep);
      return [r.start + ra, r.start + rb];
    }
    // a is before the range start on the circle; check whether b enters the range
    if (ra > TAU - (b - a)) {
      const over = ra + (b - a) - TAU;
      if (over > 1e-9) return [r.start, r.start + Math.min(over, r.sweep)];
    }
  }
  return null;
}

export function perforatedDisc(o: PerforatedDiscOptions): MeshData {
  const md = createMeshData();
  const ranges = o.ranges ?? [{ start: 0, sweep: TAU }];
  const full = isFullCircle(ranges);
  const holeSegs = o.holeSegments ?? 10;
  const rimSegs = o.rimSegments ?? 160;
  const uvScale = o.uvScale ?? 1;
  const { radius, y0, y1, holeRadius, pitch, patternRadius } = o;
  const layout = polarHoleLayout(pitch, patternRadius);
  const rings = layout.rings;
  const outerPatternR = rings[rings.length - 1].r + pitch / 2;

  const faceVertex = (r: number, phi: number, y: number, ny: number) =>
    pushVertex(md, [r * Math.cos(phi), y, r * Math.sin(phi)], [0, ny, 0], [r * Math.cos(phi) * uvScale, r * Math.sin(phi) * uvScale]);

  // Boundary breakpoints shared between adjacent rings (avoid cracks): for ring i, outer circle
  // at r_i + pitch/2 uses the union of cell edges of ring i and ring i+1.
  const cellEdges = (ri: number): number[] => {
    const ring = rings[ri];
    if (ring.count === 1) return [];
    const edges: number[] = [];
    for (let j = 0; j < ring.count; j++) edges.push(ring.phi0 + ((j + 0.5) / ring.count) * TAU);
    return edges;
  };

  const holesOut: HolePosition[] = [];

  for (let ri = 0; ri < rings.length; ri++) {
    const ring = rings[ri];
    const rInner = Math.max(0, ring.r - pitch / 2);
    const rOuter = ring.r + pitch / 2;
    const edgesInner = ri > 0 ? cellEdges(ri - 1) : [];
    const edgesOuter = ri + 1 < rings.length ? cellEdges(ri + 1) : [];

    for (let j = 0; j < ring.count; j++) {
      const phiC = ring.count === 1 ? 0 : ring.phi0 + (j / ring.count) * TAU;
      const half = ring.count === 1 ? Math.PI : Math.PI / ring.count;
      let phiA = phiC - half;
      let phiB = phiC + half;
      let holeHere = true;
      if (!full) {
        if (ring.count === 1) {
          // center cell: treat as full disc of radius pitch/2 clipped by ranges -> build as sectors per range
          for (const r of ranges) {
            buildCell(0, rOuter, r.start, r.start + r.sweep, 0, [], [], false);
          }
          // center hole only when the full circle around it is kept (never in cutaway)
          continue;
        }
        const clipped = clipToRanges(phiA, phiB, ranges);
        if (!clipped) continue;
        [phiA, phiB] = clipped;
        // hole only if fully inside the clipped cell with margin
        const marginAng = (holeRadius * 1.6) / Math.max(ring.r, 1e-6);
        holeHere = angDiff(phiC, phiA) > marginAng && angDiff(phiB, phiC) > marginAng;
      }
      buildCell(rInner, rOuter, phiA, phiB, ring.r, edgesInner, edgesOuter, holeHere, phiC);
      if (holeHere) holesOut.push({ r: ring.r, phi: phiC });
    }
  }

  function buildCell(rInner: number, rOuter: number, phiA: number, phiB: number, holeR: number, edgesInner: number[], edgesOuter: number[], withHole: boolean, phiC = 0): void {
    // boundary loop in order: inner arc (phiA->phiB), radial out at phiB, outer arc (phiB->phiA), radial in at phiA
    const loop: [number, number][] = [];
    const innerPts = edgesInner.filter((e) => angDiff(e, phiA) > 1e-9 && angDiff(phiB, e) > 1e-9).sort((a, b) => angDiff(a, phiA) - angDiff(b, phiA));
    const outerPts = edgesOuter.filter((e) => angDiff(e, phiA) > 1e-9 && angDiff(phiB, e) > 1e-9).sort((a, b) => angDiff(a, phiA) - angDiff(b, phiA));
    if (rInner > 1e-9) {
      loop.push([rInner, phiA]);
      for (const e of innerPts) loop.push([rInner, e]);
      loop.push([rInner, phiB]);
    } else {
      loop.push([0, (phiA + phiB) / 2]);
    }
    loop.push([rOuter, phiB]);
    for (const e of outerPts.slice().reverse()) loop.push([rOuter, e]);
    loop.push([rOuter, phiA]);
    // extra subdivision of the outer arc for wide cells (center / rim) to keep it round
    const span = phiB - phiA;
    const need = Math.ceil(span / (TAU / 48));
    if (need > outerPts.length + 1) {
      const extra: [number, number][] = [];
      for (let k = 1; k < need; k++) extra.push([rOuter, phiB - (span * k) / need]);
      // insert after [rOuter, phiB]
      const idx = loop.findIndex((p) => p[0] === rOuter && Math.abs(p[1] - phiB) < 1e-12);
      loop.splice(idx + 1, 0, ...extra);
    }

    for (const [y, ny] of [
      [y0, -1],
      [y1, 1],
    ] as const) {
      const n: Vec3 = [0, ny, 0];
      const idx = loop.map(([r, phi]) => faceVertex(r, phi, y, ny));
      if (!withHole) {
        // fan from the first vertex (cells are convex in the (r,phi) sense; fine for small cells)
        const cx = ((rInner + rOuter) / 2) * Math.cos((phiA + phiB) / 2);
        const cz = ((rInner + rOuter) / 2) * Math.sin((phiA + phiB) / 2);
        const center = pushVertex(md, [cx, y, cz], n, [cx * uvScale, cz * uvScale]);
        for (let k = 0; k < idx.length; k++) pushTriangleFacing(md, center, idx[k], idx[(k + 1) % idx.length], n);
        continue;
      }
      // hole loop around (holeR, phiC)
      const hx = holeR * Math.cos(phiC);
      const hz = holeR * Math.sin(phiC);
      const hidx: number[] = [];
      const hang: number[] = [];
      for (let k = 0; k < holeSegs; k++) {
        const th = (k / holeSegs) * TAU;
        const x = hx + holeRadius * Math.cos(th);
        const z = hz + holeRadius * Math.sin(th);
        hidx.push(pushVertex(md, [x, y, z], n, [x * uvScale, z * uvScale]));
        hang.push(th);
      }
      // boundary angles around the hole center
      const bang = loop.map(([r, phi]) => Math.atan2(r * Math.sin(phi) - hz, r * Math.cos(phi) - hx));
      // rotate boundary so angles ascend from the smallest
      const order = bang.map((_, i) => i).sort((a, b) => bang[a] - bang[b]);
      const B = order.map((i) => idx[i]);
      const BA = order.map((i) => bang[i]);
      const NA = holeSegs;
      const NB = B.length;
      // Align start: hole angles start at -pi equivalently; shift hole list so ang[0] is the smallest (>= -pi)
      const hOrder = hang.map((_, i) => i).sort((a, b) => ((hang[a] + Math.PI) % TAU) - ((hang[b] + Math.PI) % TAU));
      const H = hOrder.map((i) => hidx[i]);
      const HA = hOrder.map((i) => ((hang[i] + Math.PI) % TAU) - Math.PI);
      let i = 0;
      let j = 0;
      const angA = (k: number) => HA[k % NA] + (k >= NA ? TAU : 0);
      const angB = (k: number) => BA[k % NB] + (k >= NB ? TAU : 0);
      while (i < NA || j < NB) {
        const nextA = i < NA ? angA(i + 1) : Infinity;
        const nextB = j < NB ? angB(j + 1) : Infinity;
        if (nextA <= nextB) {
          pushTriangleFacing(md, H[i % NA], H[(i + 1) % NA], B[j % NB], n);
          i++;
        } else {
          pushTriangleFacing(md, H[i % NA], B[j % NB], B[(j + 1) % NB], n);
          j++;
        }
      }
    }
    if (withHole) {
      // bore
      const hx = holeR * Math.cos(phiC);
      const hz = holeR * Math.sin(phiC);
      const bottom: number[] = [];
      const top: number[] = [];
      for (let k = 0; k < holeSegs; k++) {
        const th = (k / holeSegs) * TAU;
        const nx = -Math.cos(th);
        const nz = -Math.sin(th);
        const x = hx + holeRadius * Math.cos(th);
        const z = hz + holeRadius * Math.sin(th);
        bottom.push(pushVertex(md, [x, y0, z], [nx, 0, nz], [k / holeSegs, 0]));
        top.push(pushVertex(md, [x, y1, z], [nx, 0, nz], [k / holeSegs, (y1 - y0) * uvScale]));
      }
      for (let k = 0; k < holeSegs; k++) {
        const k2 = (k + 1) % holeSegs;
        const th = ((k + 0.5) / holeSegs) * TAU;
        pushQuadFacing(md, bottom[k], top[k], top[k2], bottom[k2], [-Math.cos(th), 0, -Math.sin(th)]);
      }
    }
  }

  // Rim annulus from the pattern edge to the plate radius (both faces) and the cylindrical side.
  for (const range of ranges) {
    const segs = Math.max(8, Math.ceil((range.sweep / TAU) * rimSegs));
    for (const [y, ny] of [
      [y0, -1],
      [y1, 1],
    ] as const) {
      const n: Vec3 = [0, ny, 0];
      const a: number[] = [];
      const b: number[] = [];
      for (let j = 0; j <= segs; j++) {
        const phi = range.start + (range.sweep * j) / segs;
        a.push(faceVertex(outerPatternR, phi, y, ny));
        b.push(faceVertex(radius, phi, y, ny));
      }
      for (let j = 0; j < segs; j++) pushQuadFacing(md, a[j], b[j], b[j + 1], a[j + 1], n);
    }
    const lo: number[] = [];
    const hi: number[] = [];
    for (let j = 0; j <= segs; j++) {
      const phi = range.start + (range.sweep * j) / segs;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      lo.push(pushVertex(md, [radius * c, y0, radius * s], [c, 0, s], [phi * radius * uvScale, 0]));
      hi.push(pushVertex(md, [radius * c, y1, radius * s], [c, 0, s], [phi * radius * uvScale, (y1 - y0) * uvScale]));
    }
    for (let j = 0; j < segs; j++) {
      const phi = range.start + (range.sweep * (j + 0.5)) / segs;
      pushQuadFacing(md, lo[j], hi[j], hi[j + 1], lo[j + 1], [Math.cos(phi), 0, Math.sin(phi)]);
    }
    if (!full && (o.caps ?? true)) {
      for (const [phi, sgn] of [
        [range.start, -1],
        [range.start + range.sweep, 1],
      ] as const) {
        const t = tangentAt(phi);
        const n: Vec3 = [sgn * t[0], 0, sgn * t[2]];
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        const v00 = pushVertex(md, [0, y0, 0], n, [0, 0]);
        const v10 = pushVertex(md, [radius * c, y0, radius * s], n, [radius * uvScale, 0]);
        const v11 = pushVertex(md, [radius * c, y1, radius * s], n, [radius * uvScale, (y1 - y0) * uvScale]);
        const v01 = pushVertex(md, [0, y1, 0], n, [0, (y1 - y0) * uvScale]);
        pushQuadFacing(md, v00, v10, v11, v01, n);
      }
    }
  }
  (md as MeshData & { holeCount?: number }).holeCount = holesOut.length;
  return md;
}

export function perforatedDiscHoleCount(md: MeshData): number {
  return (md as MeshData & { holeCount?: number }).holeCount ?? 0;
}
