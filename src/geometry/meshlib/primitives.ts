/** Small procedural primitives: prisms from 2D profiles, swept tubes, boxes. */
import { orientCCW } from "./profiles";
import { triangulatePolygon } from "./triangulate";
import { createMeshData, cross, normalize, pushQuadFacing, pushTriangleFacing, pushVertex, sub, type MeshData, type Vec2, type Vec3 } from "./types";

/**
 * Vertical prism: profile in the local (x, z) plane extruded from y0 to y1 with top/bottom caps.
 * Side normals are per edge (hard) unless the corner angle is below `smoothAngleDeg`.
 */
export function prismY(profileIn: Vec2[], y0: number, y1: number, opts: { smoothAngleDeg?: number; uvScale?: number; center?: Vec3; capTop?: boolean; capBottom?: boolean } = {}): MeshData {
  const md = createMeshData();
  const profile = orientCCW(profileIn);
  const n = profile.length;
  const smoothCos = Math.cos(((opts.smoothAngleDeg ?? 40) * Math.PI) / 180);
  const uvScale = opts.uvScale ?? 1;
  const cx = opts.center?.[0] ?? 0;
  const cy = opts.center?.[1] ?? 0;
  const cz = opts.center?.[2] ?? 0;
  // 2D outward normals: profile is CCW in (x, z) -> outward = (dz, -dx)
  const en: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    en.push([dz / l, -dx / l]);
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    const prev = en[(i + n - 1) % n];
    const cur = en[i];
    const next = en[(i + 1) % n];
    const na: Vec2 = prev[0] * cur[0] + prev[1] * cur[1] > smoothCos ? normalize2([prev[0] + cur[0], prev[1] + cur[1]]) : cur;
    const nb: Vec2 = next[0] * cur[0] + next[1] * cur[1] > smoothCos ? normalize2([next[0] + cur[0], next[1] + cur[1]]) : cur;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const v00 = pushVertex(md, [a[0] + cx, y0 + cy, a[1] + cz], [na[0], 0, na[1]], [s * uvScale, 0]);
    const v10 = pushVertex(md, [b[0] + cx, y0 + cy, b[1] + cz], [nb[0], 0, nb[1]], [(s + len) * uvScale, 0]);
    const v11 = pushVertex(md, [b[0] + cx, y1 + cy, b[1] + cz], [nb[0], 0, nb[1]], [(s + len) * uvScale, (y1 - y0) * uvScale]);
    const v01 = pushVertex(md, [a[0] + cx, y1 + cy, a[1] + cz], [na[0], 0, na[1]], [s * uvScale, (y1 - y0) * uvScale]);
    pushQuadFacing(md, v00, v10, v11, v01, [cur[0], 0, cur[1]]);
    s += len;
  }
  const tri = triangulatePolygon(profile);
  for (const [y, ny] of [
    [y0, -1],
    [y1, 1],
  ] as const) {
    if (ny < 0 && opts.capBottom === false) continue;
    if (ny > 0 && opts.capTop === false) continue;
    const nrm: Vec3 = [0, ny, 0];
    const base = tri.points.map((p) => pushVertex(md, [p[0] + cx, y + cy, p[1] + cz], nrm, [p[0] * uvScale, p[1] * uvScale]));
    for (let t = 0; t < tri.indices.length; t += 3) pushTriangleFacing(md, base[tri.indices[t]], base[tri.indices[t + 1]], base[tri.indices[t + 2]], nrm);
  }
  return md;
}

function normalize2(v: Vec2): Vec2 {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/** Axis-aligned box with chamfered edges (all 12), centered at `center`. */
export function chamferedBox(size: Vec3, chamfer: number, center: Vec3 = [0, 0, 0], uvScale = 1): MeshData {
  const md = createMeshData();
  const [w, h, d] = size;
  const c = Math.min(chamfer, w / 4, h / 4, d / 4);
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  // Build as the convex hull of a chamfered box via explicit faces: 6 main faces, 12 edge faces, 8 corner triangles.
  const face = (pts: Vec3[], n: Vec3) => {
    const idx = pts.map((p) => pushVertex(md, [p[0] + center[0], p[1] + center[1], p[2] + center[2]], n, [(p[0] + p[2]) * uvScale, p[1] * uvScale]));
    for (let i = 1; i + 1 < idx.length; i++) pushTriangleFacing(md, idx[0], idx[i], idx[i + 1], n);
  };
  // main faces (inset by c)
  face([[hx, -hy + c, -hz + c], [hx, hy - c, -hz + c], [hx, hy - c, hz - c], [hx, -hy + c, hz - c]], [1, 0, 0]);
  face([[-hx, -hy + c, hz - c], [-hx, hy - c, hz - c], [-hx, hy - c, -hz + c], [-hx, -hy + c, -hz + c]], [-1, 0, 0]);
  face([[-hx + c, hy, -hz + c], [-hx + c, hy, hz - c], [hx - c, hy, hz - c], [hx - c, hy, -hz + c]], [0, 1, 0]);
  face([[-hx + c, -hy, hz - c], [-hx + c, -hy, -hz + c], [hx - c, -hy, -hz + c], [hx - c, -hy, hz - c]], [0, -1, 0]);
  face([[-hx + c, -hy + c, hz], [hx - c, -hy + c, hz], [hx - c, hy - c, hz], [-hx + c, hy - c, hz]], [0, 0, 1]);
  face([[hx - c, -hy + c, -hz], [-hx + c, -hy + c, -hz], [-hx + c, hy - c, -hz], [hx - c, hy - c, -hz]], [0, 0, -1]);
  // edge faces: for each pair of axes
  const sgn = [-1, 1];
  const r2 = Math.SQRT1_2;
  for (const sx of sgn)
    for (const sy of sgn) {
      // edges parallel to z
      face(
        [
          [sx * hx, sy * (hy - c), -hz + c],
          [sx * (hx - c), sy * hy, -hz + c],
          [sx * (hx - c), sy * hy, hz - c],
          [sx * hx, sy * (hy - c), hz - c],
        ],
        [sx * r2, sy * r2, 0],
      );
    }
  for (const sx of sgn)
    for (const sz of sgn) {
      face(
        [
          [sx * hx, -hy + c, sz * (hz - c)],
          [sx * hx, hy - c, sz * (hz - c)],
          [sx * (hx - c), hy - c, sz * hz],
          [sx * (hx - c), -hy + c, sz * hz],
        ],
        [sx * r2, 0, sz * r2],
      );
    }
  for (const sy of sgn)
    for (const sz of sgn) {
      face(
        [
          [-hx + c, sy * hy, sz * (hz - c)],
          [hx - c, sy * hy, sz * (hz - c)],
          [hx - c, sy * (hy - c), sz * hz],
          [-hx + c, sy * (hy - c), sz * hz],
        ],
        [0, sy * r2, sz * r2],
      );
    }
  // corner triangles
  const r3 = 1 / Math.sqrt(3);
  for (const sx of sgn)
    for (const sy of sgn)
      for (const sz of sgn) {
        face(
          [
            [sx * hx, sy * (hy - c), sz * (hz - c)],
            [sx * (hx - c), sy * hy, sz * (hz - c)],
            [sx * (hx - c), sy * (hy - c), sz * hz],
          ],
          [sx * r3, sy * r3, sz * r3],
        );
      }
  return md;
}

/** Plain axis-aligned box. */
export function box(size: Vec3, center: Vec3 = [0, 0, 0], uvScale = 1): MeshData {
  return chamferedBox(size, 0.0005, center, uvScale);
}

/** Round the corners of a 3D polyline with circular arcs (for pipe routing). */
export function roundPolyline(path: Vec3[], radius: number, steps = 6): Vec3[] {
  if (path.length < 3) return path.slice();
  const out: Vec3[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1];
    const b = path[i];
    const c = path[i + 1];
    const u = normalize(sub(a, b));
    const v = normalize(sub(c, b));
    const cosT = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
    const theta = Math.acos(cosT);
    if (theta > Math.PI - 1e-3) {
      continue; // straight through
    }
    const lab = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const lbc = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
    let r = radius;
    let t = r / Math.tan(theta / 2);
    const tMax = Math.min(lab, lbc) * 0.49;
    if (t > tMax) {
      t = tMax;
      r = t * Math.tan(theta / 2);
    }
    const p1: Vec3 = [b[0] + u[0] * t, b[1] + u[1] * t, b[2] + u[2] * t];
    const p2: Vec3 = [b[0] + v[0] * t, b[1] + v[1] * t, b[2] + v[2] * t];
    const bis = normalize([u[0] + v[0], u[1] + v[1], u[2] + v[2]]);
    const d = r / Math.sin(theta / 2);
    const center: Vec3 = [b[0] + bis[0] * d, b[1] + bis[1] * d, b[2] + bis[2] * d];
    const e1 = normalize(sub(p1, center));
    const e2raw = sub(p2, center);
    // orthonormal basis in the arc plane
    const k = normalize(cross(e1, e2raw));
    const e2 = cross(k, e1);
    const ang = Math.acos(Math.max(-1, Math.min(1, (e1[0] * e2raw[0] + e1[1] * e2raw[1] + e1[2] * e2raw[2]) / r)));
    for (let s = 0; s <= steps; s++) {
      const a2 = (ang * s) / steps;
      out.push([center[0] + r * (e1[0] * Math.cos(a2) + e2[0] * Math.sin(a2)), center[1] + r * (e1[1] * Math.cos(a2) + e2[1] * Math.sin(a2)), center[2] + r * (e1[2] * Math.cos(a2) + e2[2] * Math.sin(a2))]);
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

/** Sweep a circle of `radius` along a 3D polyline using parallel-transport frames. */
export function tubeAlongPath(path: Vec3[], radius: number, opts: { segments?: number; caps?: boolean; uvScale?: number; cornerRadius?: number } = {}): MeshData {
  const md = createMeshData();
  const segments = opts.segments ?? 24;
  const uvScale = opts.uvScale ?? 1;
  const pts = opts.cornerRadius ? roundPolyline(path, opts.cornerRadius) : path;
  if (pts.length < 2) return md;
  // tangents
  const tangents: Vec3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    tangents.push(normalize(sub(b, a)));
  }
  // initial normal
  let nrm: Vec3 = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  nrm = normalize(cross(cross(tangents[0], nrm), tangents[0]));
  const rings: number[][] = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      // parallel transport
      const t0 = tangents[i - 1];
      const t1 = tangents[i];
      const axis = cross(t0, t1);
      const al = Math.hypot(axis[0], axis[1], axis[2]);
      if (al > 1e-9) {
        const ang = Math.asin(Math.min(1, al));
        nrm = rotateAroundAxis(nrm, normalize(axis), ang);
      }
      nrm = normalize(cross(cross(t1, nrm), t1));
      dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    }
    const bin = cross(tangents[i], nrm);
    const ring: number[] = [];
    for (let k = 0; k <= segments; k++) {
      const th = (k / segments) * Math.PI * 2;
      const n: Vec3 = [nrm[0] * Math.cos(th) + bin[0] * Math.sin(th), nrm[1] * Math.cos(th) + bin[1] * Math.sin(th), nrm[2] * Math.cos(th) + bin[2] * Math.sin(th)];
      ring.push(pushVertex(md, [pts[i][0] + n[0] * radius, pts[i][1] + n[1] * radius, pts[i][2] + n[2] * radius], n, [(k / segments) * Math.PI * 2 * radius * uvScale, dist * uvScale]));
    }
    rings.push(ring);
  }
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < segments; k++) {
      const a = rings[i][k];
      const b = rings[i][k + 1];
      const c = rings[i + 1][k + 1];
      const d = rings[i + 1][k];
      const n: Vec3 = [md.normals[a * 3] + md.normals[c * 3], md.normals[a * 3 + 1] + md.normals[c * 3 + 1], md.normals[a * 3 + 2] + md.normals[c * 3 + 2]];
      pushQuadFacing(md, a, b, c, d, n);
    }
  }
  if (opts.caps ?? true) {
    for (const [ringIdx, sign] of [
      [0, -1],
      [rings.length - 1, 1],
    ] as const) {
      const t = tangents[ringIdx];
      const n: Vec3 = [t[0] * sign, t[1] * sign, t[2] * sign];
      const p = pts[ringIdx];
      const center = pushVertex(md, p, n, [0, 0]);
      const ring = rings[ringIdx];
      const capRing = ring.map((vi) => pushVertex(md, [md.positions[vi * 3], md.positions[vi * 3 + 1], md.positions[vi * 3 + 2]], n, [0, 0]));
      for (let k = 0; k < segments; k++) pushTriangleFacing(md, center, capRing[k], capRing[k + 1], n);
    }
  }
  return md;
}

function rotateAroundAxis(v: Vec3, axis: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const cr = cross(axis, v);
  return [v[0] * c + cr[0] * s + axis[0] * d * (1 - c), v[1] * c + cr[1] * s + axis[1] * d * (1 - c), v[2] * c + cr[2] * s + axis[2] * d * (1 - c)];
}

/** Flat rectangular bar (strap) along a polyline in the XZ plane at constant y, width w, thickness t. */
export function flatStrap(path: Vec3[], width: number, thickness: number, uvScale = 1): MeshData {
  // Build as a tube with 4 segments of a rectangular cross-section: approximate with a thin box per segment.
  const md = createMeshData();
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dir = normalize(sub(b, a));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const up: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const side = normalize(cross(up, dir));
    const nUp = normalize(cross(dir, side));
    const corners = (s: number, u: number, t: number): Vec3 => [
      a[0] + dir[0] * t + side[0] * s * (width / 2) + nUp[0] * u * (thickness / 2),
      a[1] + dir[1] * t + side[1] * s * (width / 2) + nUp[1] * u * (thickness / 2),
      a[2] + dir[2] * t + side[2] * s * (width / 2) + nUp[2] * u * (thickness / 2),
    ];
    const faces: { n: Vec3; pts: Vec3[] }[] = [
      { n: nUp, pts: [corners(-1, 1, 0), corners(1, 1, 0), corners(1, 1, len), corners(-1, 1, len)] },
      { n: [-nUp[0], -nUp[1], -nUp[2]], pts: [corners(-1, -1, 0), corners(1, -1, 0), corners(1, -1, len), corners(-1, -1, len)] },
      { n: side, pts: [corners(1, -1, 0), corners(1, 1, 0), corners(1, 1, len), corners(1, -1, len)] },
      { n: [-side[0], -side[1], -side[2]], pts: [corners(-1, -1, 0), corners(-1, 1, 0), corners(-1, 1, len), corners(-1, -1, len)] },
      { n: [-dir[0], -dir[1], -dir[2]], pts: [corners(-1, -1, 0), corners(1, -1, 0), corners(1, 1, 0), corners(-1, 1, 0)] },
      { n: dir, pts: [corners(-1, -1, len), corners(1, -1, len), corners(1, 1, len), corners(-1, 1, len)] },
    ];
    for (const f of faces) {
      const idx = f.pts.map((p) => pushVertex(md, p, f.n, [p[0] * uvScale, p[2] * uvScale]));
      pushQuadFacing(md, idx[0], idx[1], idx[2], idx[3], f.n);
    }
  }
  return md;
}
