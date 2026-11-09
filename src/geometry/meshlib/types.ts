/** Pure (scene-independent) mesh data used by the procedural generators. */
export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export function createMeshData(): MeshData {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

export function vertexCount(md: MeshData): number {
  return md.positions.length / 3;
}

export function pushVertex(md: MeshData, p: Vec3, n: Vec3, uv: Vec2): number {
  md.positions.push(p[0], p[1], p[2]);
  md.normals.push(n[0], n[1], n[2]);
  md.uvs.push(uv[0], uv[1]);
  return md.positions.length / 3 - 1;
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function getPos(md: MeshData, i: number): Vec3 {
  return [md.positions[i * 3], md.positions[i * 3 + 1], md.positions[i * 3 + 2]];
}

/**
 * Face normal using Babylon's `VertexData.ComputeNormals` convention: n = (p1 - p2) x (p3 - p2).
 * Triangles whose convention-normal points along the intended surface normal are front faces in Babylon.
 */
export function babylonFaceNormal(p1: Vec3, p2: Vec3, p3: Vec3): Vec3 {
  return cross(sub(p1, p2), sub(p3, p2));
}

/** Push a triangle, flipping its winding if needed so that it faces along `desiredNormal`. */
export function pushTriangleFacing(md: MeshData, a: number, b: number, c: number, desiredNormal: Vec3): void {
  const pa = getPos(md, a);
  const pb = getPos(md, b);
  const pc = getPos(md, c);
  const n = babylonFaceNormal(pa, pb, pc);
  const l2 = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
  if (l2 < 1e-24) return; // degenerate
  if (dot(n, desiredNormal) >= 0) md.indices.push(a, b, c);
  else md.indices.push(a, c, b);
}

/** Quad (a,b,c,d) in loop order, oriented to face along `desiredNormal`. */
export function pushQuadFacing(md: MeshData, a: number, b: number, c: number, d: number, desiredNormal: Vec3): void {
  pushTriangleFacing(md, a, b, c, desiredNormal);
  pushTriangleFacing(md, a, c, d, desiredNormal);
}

/** Append `src` into `target` (indices re-based). */
export function appendMeshData(target: MeshData, src: MeshData): MeshData {
  const base = vertexCount(target);
  for (let i = 0; i < src.positions.length; i++) target.positions.push(src.positions[i]);
  for (let i = 0; i < src.normals.length; i++) target.normals.push(src.normals[i]);
  for (let i = 0; i < src.uvs.length; i++) target.uvs.push(src.uvs[i]);
  for (let i = 0; i < src.indices.length; i++) target.indices.push(src.indices[i] + base);
  return target;
}

export function mergeMeshData(parts: MeshData[]): MeshData {
  const out = createMeshData();
  for (const p of parts) appendMeshData(out, p);
  return out;
}

/** Translate all positions. */
export function translateMeshData(md: MeshData, dx: number, dy: number, dz: number): MeshData {
  for (let i = 0; i < md.positions.length; i += 3) {
    md.positions[i] += dx;
    md.positions[i + 1] += dy;
    md.positions[i + 2] += dz;
  }
  return md;
}

/** Rotate positions and normals about +Y by `angle` radians (phi convention: +X toward +Z). */
export function rotateYMeshData(md: MeshData, angle: number): MeshData {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = (arr: number[]) => {
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i];
      const z = arr[i + 2];
      arr[i] = x * c - z * s;
      arr[i + 2] = x * s + z * c;
    }
  };
  rot(md.positions);
  rot(md.normals);
  return md;
}

/** Bounding box helper (used by tests and label placement). */
export function meshDataBounds(md: MeshData): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < md.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = md.positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

/** Every triangle's convention normal must agree with its vertex normals (used by tests). */
export function checkWindingConsistency(md: MeshData): { total: number; inconsistent: number } {
  let inconsistent = 0;
  const total = md.indices.length / 3;
  for (let t = 0; t < md.indices.length; t += 3) {
    const a = md.indices[t];
    const b = md.indices[t + 1];
    const c = md.indices[t + 2];
    const n = babylonFaceNormal(getPos(md, a), getPos(md, b), getPos(md, c));
    const l2 = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
    if (l2 < 1e-24) continue;
    const vn: Vec3 = [
      md.normals[a * 3] + md.normals[b * 3] + md.normals[c * 3],
      md.normals[a * 3 + 1] + md.normals[b * 3 + 1] + md.normals[c * 3 + 1],
      md.normals[a * 3 + 2] + md.normals[b * 3 + 2] + md.normals[c * 3 + 2],
    ];
    if (dot(n, vn) < 0) inconsistent++;
  }
  return { total, inconsistent };
}
