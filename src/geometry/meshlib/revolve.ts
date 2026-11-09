/**
 * Revolve a closed 2D profile (r, y) around the +Y axis over one or more angular ranges.
 * Produces per-edge vertex strips with hard or smoothed normals, and planar section caps at the
 * range boundaries so a cutaway sector shows solid wall thickness instead of an open back face.
 */
import type { AngularInterval } from "../../config/geometry";
import { TAU } from "../../config/geometry";
import { orientCCW, signedArea2 } from "./profiles";
import { triangulatePolygon } from "./triangulate";
import { createMeshData, pushQuadFacing, pushTriangleFacing, pushVertex, type MeshData, type Vec2, type Vec3 } from "./types";

export interface RevolveProfile {
  outer: Vec2[];
  holes?: Vec2[][];
}

export interface RevolveOptions {
  /** Segments per full turn (default 96). */
  segments?: number;
  /** Kept angular ranges (default: full circle). */
  ranges?: AngularInterval[];
  /** Add planar section caps at range boundaries (default true). */
  caps?: boolean;
  /** Corners sharper than this angle keep hard normals (default 40 degrees). */
  smoothAngleDeg?: number;
  /** UV scale: texture repeats per meter (default 1). */
  uvScale?: number;
  /** Optional UV v offset to shift turning-mark textures between parts. */
  vOffset?: number;
}

export const FULL_CIRCLE: AngularInterval[] = [{ start: 0, sweep: TAU }];

export function isFullCircle(ranges: AngularInterval[]): boolean {
  return ranges.length === 1 && ranges[0].sweep >= TAU - 1e-6;
}

function edgeNormals(loop: Vec2[]): Vec2[] {
  const n = loop.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    out.push([dy / l, -dx / l]);
  }
  return out;
}

/** Tangent direction of the circle at angle phi (d/dphi of (cos, 0, sin)). */
export function tangentAt(phi: number): Vec3 {
  return [-Math.sin(phi), 0, Math.cos(phi)];
}

function revolveLoop(md: MeshData, loop: Vec2[], ranges: AngularInterval[], segments: number, smoothCos: number, uvScale: number, vOffset: number): void {
  const n = loop.length;
  if (n < 2) return;
  const en = edgeNormals(loop);
  // per-edge start/end normals with optional smoothing at shared vertices
  const startN: Vec2[] = [];
  const endN: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const prev = en[(k + n - 1) % n];
    const cur = en[k];
    const next = en[(k + 1) % n];
    const dotPrev = prev[0] * cur[0] + prev[1] * cur[1];
    const dotNext = next[0] * cur[0] + next[1] * cur[1];
    if (dotPrev > smoothCos) {
      const sx = prev[0] + cur[0];
      const sy = prev[1] + cur[1];
      const l = Math.hypot(sx, sy) || 1;
      startN.push([sx / l, sy / l]);
    } else startN.push(cur);
    if (dotNext > smoothCos) {
      const sx = next[0] + cur[0];
      const sy = next[1] + cur[1];
      const l = Math.hypot(sx, sy) || 1;
      endN.push([sx / l, sy / l]);
    } else endN.push(cur);
  }
  // cumulative profile length for v
  const vAt: number[] = [0];
  for (let k = 0; k < n; k++) {
    const a = loop[k];
    const b = loop[(k + 1) % n];
    vAt.push(vAt[k] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }

  for (const range of ranges) {
    const segs = Math.max(2, Math.ceil((range.sweep / TAU) * segments));
    for (let k = 0; k < n; k++) {
      const a = loop[k];
      const b = loop[(k + 1) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
      const na = startN[k];
      const nb = endN[k];
      const ringA: number[] = [];
      const ringB: number[] = [];
      for (let j = 0; j <= segs; j++) {
        const phi = range.start + (range.sweep * j) / segs;
        const c = Math.cos(phi);
        const s = Math.sin(phi);
        ringA.push(pushVertex(md, [a[0] * c, a[1], a[0] * s], [na[0] * c, na[1], na[0] * s], [phi * a[0] * uvScale, (vAt[k] + vOffset) * uvScale]));
        ringB.push(pushVertex(md, [b[0] * c, b[1], b[0] * s], [nb[0] * c, nb[1], nb[0] * s], [phi * b[0] * uvScale, (vAt[k + 1] + vOffset) * uvScale]));
      }
      const mid = (range.start + range.sweep / 2);
      const nm: Vec3 = [en[k][0] * Math.cos(mid), en[k][1], en[k][0] * Math.sin(mid)];
      for (let j = 0; j < segs; j++) {
        // desired normal evaluated at this quad's angle
        const phi = range.start + (range.sweep * (j + 0.5)) / segs;
        const nq: Vec3 = [en[k][0] * Math.cos(phi), en[k][1], en[k][0] * Math.sin(phi)];
        const desired = Math.abs(nq[0]) + Math.abs(nq[1]) + Math.abs(nq[2]) > 1e-9 ? nq : nm;
        pushQuadFacing(md, ringA[j], ringB[j], ringB[j + 1], ringA[j + 1], desired);
      }
    }
  }
}

function addCap(md: MeshData, profile: RevolveProfile, phi: number, normal: Vec3, uvScale: number): void {
  const tri = triangulatePolygon(profile.outer, profile.holes ?? []);
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const base: number[] = [];
  for (const p of tri.points) base.push(pushVertex(md, [p[0] * c, p[1], p[0] * s], normal, [p[0] * uvScale, p[1] * uvScale]));
  for (let t = 0; t < tri.indices.length; t += 3) pushTriangleFacing(md, base[tri.indices[t]], base[tri.indices[t + 1]], base[tri.indices[t + 2]], normal);
}

export function revolveProfile(profileIn: RevolveProfile | Vec2[], opts: RevolveOptions = {}): MeshData {
  const profile: RevolveProfile = Array.isArray(profileIn) ? { outer: profileIn } : profileIn;
  const outer = orientCCW(profile.outer);
  const holes = (profile.holes ?? []).map((h) => (signedArea2(h) > 0 ? h.slice().reverse() : h.slice()));
  const segments = opts.segments ?? 96;
  const ranges = opts.ranges ?? FULL_CIRCLE;
  const caps = opts.caps ?? true;
  const smoothCos = Math.cos(((opts.smoothAngleDeg ?? 40) * Math.PI) / 180);
  const uvScale = opts.uvScale ?? 1;
  const vOffset = opts.vOffset ?? 0;
  const md = createMeshData();

  revolveLoop(md, outer, ranges, segments, smoothCos, uvScale, vOffset);
  for (const h of holes) revolveLoop(md, h, ranges, segments, smoothCos, uvScale, vOffset);

  if (caps && !isFullCircle(ranges)) {
    const prof = { outer, holes };
    for (const r of ranges) {
      const tStart = tangentAt(r.start);
      const tEnd = tangentAt(r.start + r.sweep);
      addCap(md, prof, r.start, [-tStart[0], -tStart[1], -tStart[2]], uvScale);
      addCap(md, prof, r.start + r.sweep, tEnd, uvScale);
    }
  }
  return md;
}

/** Only the planar section caps of a revolved profile at the range boundaries (for separate cap materials). */
export function revolveCaps(profileIn: RevolveProfile | Vec2[], ranges: AngularInterval[], uvScale = 1): MeshData {
  const profile: RevolveProfile = Array.isArray(profileIn) ? { outer: profileIn } : profileIn;
  const md = createMeshData();
  if (isFullCircle(ranges)) return md;
  const prof = { outer: orientCCW(profile.outer), holes: (profile.holes ?? []).map((h) => (signedArea2(h) > 0 ? h.slice().reverse() : h.slice())) };
  for (const r of ranges) {
    const tStart = tangentAt(r.start);
    const tEnd = tangentAt(r.start + r.sweep);
    addCap(md, prof, r.start, [-tStart[0], -tStart[1], -tStart[2]], uvScale);
    addCap(md, prof, r.start + r.sweep, tEnd, uvScale);
  }
  return md;
}

/** Convenience: solid cylinder or tube segment along Y. */
export function cylinderY(rIn: number, rOut: number, y0: number, y1: number, opts: RevolveOptions = {}): MeshData {
  const pts: Vec2[] = rIn > 1e-9 ? [[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1]] : [[0, y0], [rOut, y0], [rOut, y1], [0, y1]];
  return revolveProfile(pts, opts);
}
