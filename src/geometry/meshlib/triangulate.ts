/**
 * Ear-clipping triangulation for simple polygons with optional holes (2D).
 * Outer ring: counter-clockwise. Holes: clockwise. Returns triangle index triplets
 * into the concatenated point list (outer points first, then holes in order).
 * Small, dependency-free; adequate for section-cap profiles (tens to a few hundred points).
 */
import type { Vec2 } from "./types";

function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return -a / 2; // positive for CCW (x right, y up)
}

function cross2(o: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = cross2(a, b, p);
  const d2 = cross2(b, c, p);
  const d3 = cross2(c, a, p);
  const hasNeg = d1 < -1e-12 || d2 < -1e-12 || d3 < -1e-12;
  const hasPos = d1 > 1e-12 || d2 > 1e-12 || d3 > 1e-12;
  return !(hasNeg && hasPos);
}

/** Merge holes into the outer ring via bridge edges (Eberly's method, simplified). */
function mergeHoles(outer: number[], holes: number[][], pts: Vec2[]): number[] {
  let ring = outer.slice();
  // Process holes from the right-most vertex inward.
  const sorted = holes
    .map((h) => {
      let best = h[0];
      for (const i of h) if (pts[i][0] > pts[best][0]) best = i;
      return { hole: h, rightmost: best };
    })
    .sort((a, b) => pts[b.rightmost][0] - pts[a.rightmost][0]);

  for (const { hole, rightmost } of sorted) {
    const M = pts[rightmost];
    // Find the closest intersection of the ray (M, +x) with ring edges.
    let bestT = Infinity;
    let bestEdge = -1;
    let bestPoint: Vec2 = [0, 0];
    for (let i = 0; i < ring.length; i++) {
      const a = pts[ring[i]];
      const b = pts[ring[(i + 1) % ring.length]];
      if ((a[1] <= M[1] && b[1] >= M[1]) || (b[1] <= M[1] && a[1] >= M[1])) {
        if (Math.abs(b[1] - a[1]) < 1e-15) continue;
        const t = (M[1] - a[1]) / (b[1] - a[1]);
        const x = a[0] + t * (b[0] - a[0]);
        if (x >= M[0] - 1e-12 && x < bestT) {
          bestT = x;
          bestEdge = i;
          bestPoint = [x, M[1]];
        }
      }
    }
    if (bestEdge < 0) {
      // Degenerate input; attach to the globally right-most ring vertex.
      let far = 0;
      for (let i = 1; i < ring.length; i++) if (pts[ring[i]][0] > pts[ring[far]][0]) far = i;
      bestEdge = far;
      bestPoint = pts[ring[far]];
    }
    // Candidate: the endpoint of the hit edge with the larger x.
    const ia = ring[bestEdge];
    const ib = ring[(bestEdge + 1) % ring.length];
    let candidateIdx = pts[ia][0] > pts[ib][0] ? bestEdge : (bestEdge + 1) % ring.length;
    const P = pts[ring[candidateIdx]];
    // If some reflex ring vertex lies inside triangle (M, I, P), pick the one with the smallest angle to +x.
    let bestAngle = Infinity;
    for (let i = 0; i < ring.length; i++) {
      if (i === candidateIdx) continue;
      const v = pts[ring[i]];
      if (pointInTriangle(v, M, bestPoint, P)) {
        const ang = Math.atan2(Math.abs(v[1] - M[1]), v[0] - M[0]);
        if (ang < bestAngle) {
          bestAngle = ang;
          candidateIdx = i;
        }
      }
    }
    // Splice: ring[0..candidate], hole starting at rightmost (full loop back to rightmost), candidate, rest.
    const holeStart = hole.indexOf(rightmost);
    const holeSeq: number[] = [];
    for (let k = 0; k <= hole.length; k++) holeSeq.push(hole[(holeStart + k) % hole.length]);
    ring = [...ring.slice(0, candidateIdx + 1), ...holeSeq, ...ring.slice(candidateIdx)];
  }
  return ring;
}

export interface TriangulationResult {
  points: Vec2[];
  indices: number[];
}

export function triangulatePolygon(outer: Vec2[], holes: Vec2[][] = []): TriangulationResult {
  const pts: Vec2[] = [];
  const outerIdx: number[] = [];
  const o = signedArea(outer) < 0 ? outer.slice().reverse() : outer;
  for (const p of o) {
    outerIdx.push(pts.length);
    pts.push(p);
  }
  const holeIdx: number[][] = [];
  for (const h of holes) {
    const hh = signedArea(h) > 0 ? h.slice().reverse() : h; // holes clockwise
    const idx: number[] = [];
    for (const p of hh) {
      idx.push(pts.length);
      pts.push(p);
    }
    holeIdx.push(idx);
  }
  let ring = holeIdx.length ? mergeHoles(outerIdx, holeIdx, pts) : outerIdx.slice();
  const indices: number[] = [];

  const isConvex = (i: number) => {
    const a = pts[ring[(i + ring.length - 1) % ring.length]];
    const b = pts[ring[i]];
    const c = pts[ring[(i + 1) % ring.length]];
    return cross2(a, b, c) > 1e-14;
  };
  const isEar = (i: number) => {
    if (!isConvex(i)) return false;
    const a = pts[ring[(i + ring.length - 1) % ring.length]];
    const b = pts[ring[i]];
    const c = pts[ring[(i + 1) % ring.length]];
    for (let k = 0; k < ring.length; k++) {
      if (k === i || k === (i + 1) % ring.length || k === (i + ring.length - 1) % ring.length) continue;
      const p = pts[ring[k]];
      // Skip duplicates of the ear corners (bridge vertices appear twice).
      if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) continue;
      if (pointInTriangle(p, a, b, c)) return false;
    }
    return true;
  };

  let guard = 0;
  while (ring.length > 3 && guard < 100000) {
    guard++;
    let clipped = false;
    for (let i = 0; i < ring.length; i++) {
      if (isEar(i)) {
        indices.push(ring[(i + ring.length - 1) % ring.length], ring[i], ring[(i + 1) % ring.length]);
        ring.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) {
      // Fallback for numerically degenerate configurations: clip the first convex vertex.
      let done = false;
      for (let i = 0; i < ring.length; i++) {
        if (isConvex(i)) {
          indices.push(ring[(i + ring.length - 1) % ring.length], ring[i], ring[(i + 1) % ring.length]);
          ring.splice(i, 1);
          done = true;
          break;
        }
      }
      if (!done) break;
    }
  }
  if (ring.length === 3) indices.push(ring[0], ring[1], ring[2]);
  return { points: pts, indices };
}

export function polygonArea(pts: Vec2[]): number {
  return Math.abs(signedArea(pts));
}
