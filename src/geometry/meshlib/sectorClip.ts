/**
 * Sector cutaway for parts that are not revolved (boxes, plates, merged details): keeps the part of every
 * triangle that lies inside the kept angular ranges around the +Y axis through the origin, and builds the
 * planar section caps of axis-aligned boxes on the range boundaries. The azimuth convention is the one of
 * revolveProfile (phi from +X toward +Z), so clipped parts and revolved parts share the same cut planes.
 */
import type { AngularInterval } from "../../config/geometry";
import { isFullCircle, tangentAt } from "./revolve";
import { createMeshData, pushQuadFacing, pushVertex, type MeshData, type Vec2, type Vec3 } from "./types";

/** Axis-aligned box in the part frame (section caps are rectangles where a boundary plane crosses it). */
export interface SectionBox {
  min: Vec3;
  max: Vec3;
}

interface ClipVertex {
  p: Vec3;
  n: Vec3;
  uv: Vec2;
  /** Index in the source mesh when the vertex is an original one. */
  src: number;
}

/** Half-plane n.(x, z) >= 0 through the axis. */
type HalfPlane = Vec2;

const EPS = 1e-9;

/** Points at azimuth [phi, phi + PI] (counterclockwise side of the ray at phi). */
const leftOf = (phi: number): HalfPlane => [-Math.sin(phi), Math.cos(phi)];
const rightOf = (phi: number): HalfPlane => [Math.sin(phi), -Math.cos(phi)];

/** Convex pieces whose union is the kept wedge [start, start + sweep]. */
function wedgePieces(r: AngularInterval): HalfPlane[][] {
  const a = r.start;
  const b = r.start + r.sweep;
  if (r.sweep <= Math.PI + EPS) return [[leftOf(a), rightOf(b)]];
  // wider than a half turn: the half-plane [a, a + PI] plus the convex rest [a + PI, b]
  return [[leftOf(a)], [rightOf(a), rightOf(b)]];
}

const side = (h: HalfPlane, p: Vec3) => h[0] * p[0] + h[1] * p[2];

function lerpVertex(a: ClipVertex, b: ClipVertex, t: number): ClipVertex {
  const n: Vec3 = [a.n[0] + (b.n[0] - a.n[0]) * t, a.n[1] + (b.n[1] - a.n[1]) * t, a.n[2] + (b.n[2] - a.n[2]) * t];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return {
    p: [a.p[0] + (b.p[0] - a.p[0]) * t, a.p[1] + (b.p[1] - a.p[1]) * t, a.p[2] + (b.p[2] - a.p[2]) * t],
    n: [n[0] / l, n[1] / l, n[2] / l],
    uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * t, a.uv[1] + (b.uv[1] - a.uv[1]) * t],
    src: -1,
  };
}

/** Sutherland-Hodgman against one half-plane (keeps the vertex order, so the winding survives). */
function clipPolygon(poly: ClipVertex[], h: HalfPlane): ClipVertex[] {
  const out: ClipVertex[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    let fa = side(h, a.p);
    let fb = side(h, b.p);
    if (Math.abs(fa) < EPS) fa = 0;
    if (Math.abs(fb) < EPS) fb = 0;
    if (fa >= 0) out.push(a);
    if ((fa > 0 && fb < 0) || (fa < 0 && fb > 0)) out.push(lerpVertex(a, b, fa / (fa - fb)));
  }
  return out;
}

/**
 * The part of `md` inside the kept ranges, as a new mesh (always a fresh copy, also for the full circle,
 * because the scene translates built meshes in place). Triangles fully inside keep their original vertices.
 */
export function clipToSector(md: MeshData, kept: AngularInterval[]): MeshData {
  const out = createMeshData();
  const full = isFullCircle(kept);
  const remap = new Map<number, number>();
  const vertexAt = (i: number): ClipVertex => ({
    p: [md.positions[i * 3], md.positions[i * 3 + 1], md.positions[i * 3 + 2]],
    n: [md.normals[i * 3], md.normals[i * 3 + 1], md.normals[i * 3 + 2]],
    uv: [md.uvs[i * 2] ?? 0, md.uvs[i * 2 + 1] ?? 0],
    src: i,
  });
  const emit = (v: ClipVertex): number => {
    if (v.src >= 0) {
      const known = remap.get(v.src);
      if (known !== undefined) return known;
      const idx = pushVertex(out, v.p, v.n, v.uv);
      remap.set(v.src, idx);
      return idx;
    }
    return pushVertex(out, v.p, v.n, v.uv);
  };
  const pieces = full ? [] : kept.flatMap(wedgePieces);
  for (let t = 0; t < md.indices.length; t += 3) {
    const tri = [vertexAt(md.indices[t]), vertexAt(md.indices[t + 1]), vertexAt(md.indices[t + 2])];
    if (full) {
      out.indices.push(emit(tri[0]), emit(tri[1]), emit(tri[2]));
      continue;
    }
    for (const piece of pieces) {
      let inside = true;
      let outside = false;
      for (const h of piece) {
        const f = tri.map((v) => side(h, v.p));
        if (f.some((x) => x < -EPS)) inside = false;
        if (f.every((x) => x < EPS)) outside = true;
      }
      if (outside && !inside) continue;
      if (inside) {
        out.indices.push(emit(tri[0]), emit(tri[1]), emit(tri[2]));
        continue;
      }
      let poly = tri;
      for (const h of piece) {
        poly = clipPolygon(poly, h);
        if (poly.length < 3) break;
      }
      if (poly.length < 3) continue;
      for (let k = 1; k + 1 < poly.length; k++) {
        const a = poly[0].p;
        const b = poly[k].p;
        const c = poly[k + 1].p;
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        if (area2 < 1e-12) continue;
        out.indices.push(emit(poly[0]), emit(poly[k]), emit(poly[k + 1]));
      }
    }
  }
  return out;
}

/** Ray from the axis at azimuth phi through the XZ footprint of a box: [r0, r1] or null. */
function raySpan(b: SectionBox, c: number, s: number): [number, number] | null {
  let t0 = 0;
  let t1 = Infinity;
  for (const [d, lo, hi] of [
    [c, b.min[0], b.max[0]],
    [s, b.min[2], b.max[2]],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (lo > 0 || hi < 0) return null;
      continue;
    }
    const a = lo / d;
    const e = hi / d;
    t0 = Math.max(t0, Math.min(a, e));
    t1 = Math.min(t1, Math.max(a, e));
  }
  return t1 - t0 > 1e-6 ? [t0, t1] : null;
}

/**
 * Section caps of axis-aligned boxes on the boundaries of the kept ranges: one rectangle per box and
 * boundary ray that crosses it, facing into the removed sector (same orientation as revolveCaps).
 */
export function boxSectionCaps(boxes: SectionBox[], kept: AngularInterval[]): MeshData {
  const md = createMeshData();
  if (isFullCircle(kept)) return md;
  for (const r of kept) {
    const t0 = tangentAt(r.start);
    const boundaries: [number, Vec3][] = [
      [r.start, [-t0[0], -t0[1], -t0[2]]],
      [r.start + r.sweep, tangentAt(r.start + r.sweep)],
    ];
    for (const [phi, normal] of boundaries) {
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      for (const b of boxes) {
        const span = raySpan(b, c, s);
        if (!span) continue;
        const v = (rr: number, y: number) => pushVertex(md, [rr * c, y, rr * s], normal, [rr, y]);
        pushQuadFacing(md, v(span[0], b.min[1]), v(span[1], b.min[1]), v(span[1], b.max[1]), v(span[0], b.max[1]), normal);
      }
    }
  }
  return md;
}
