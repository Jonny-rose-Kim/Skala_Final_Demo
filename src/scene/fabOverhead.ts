/**
 * Overhead AMHS scenery of the bay (visual only): additional OHT rails with hanger frames, red position strips,
 * position marker plates, cable trays and control boxes, S-curve branches between parallel rails, side-track /
 * under-track FOUP buffers, and parked decorative vehicles built from the CLW-08v2 GLB shell (logo kept, vehicle
 * number and status display left out so no second vehicle identity appears). Arrangement follows public documentary
 * footage of a memory fab ceiling; dimensions and positions are design assumptions from the environment config.
 *
 * Nothing here is equipment, picking target, measurement, fleet or WIP state: the decorative vehicles never move and
 * the buffered FOUPs are scenery. Geometry is merged per spatial chunk (one vertex-coloured mesh per chunk), so a
 * chunk that sits between the camera and its target is hidden, and the whole layer is hidden from above the ceiling.
 */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { chamferedBox, createMeshData, mergeMeshData, pushTriangleFacing, pushVertex, revolveProfile, rectProfile, translateMeshData, type MeshData, type Vec3 } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";

export type RGB = [number, number, number];

export interface OverheadConfig {
  rail: { width: number; height: number; slot: number; stripe_height: number; marker_pitch: number; hanger_pitch: number; tray_width: number; box_every: number };
  rails: { id: string; x: number; bottom: number; z0: number; z1: number }[];
  branches: { from: string; to: string; z0: number; length: number }[];
  buffers: { id: string; x: number; bottom: number; z: number[][] }[];
  buffer: { pitch: number; depth: number; fill_pattern: number[] };
  vehicles: { rail: string; z: number; foup: boolean }[];
  chunk: number;
}

/** Shell of the decorative vehicles: GLB parts of the OHT template at its rest pose (instance frame). */
export interface DecorVehicleSource {
  parts: { md: MeshData; material: Material }[];
  /** Rail bottom height of the template config (floor relative) and the rest-pose travel position. */
  railBottom: number;
  restZ: number;
  /** Underside of the vehicle housing (floor relative), for the gripper plate and a carried FOUP. */
  bodyBottom: number;
  foupSize: [number, number, number];
}

export const C = {
  rail: [0.78, 0.79, 0.8] as RGB,
  railDark: [0.16, 0.17, 0.18] as RGB,
  stripe: [0.78, 0.12, 0.14] as RGB,
  frame: [0.7, 0.71, 0.72] as RGB,
  tray: [0.62, 0.63, 0.64] as RGB,
  cable: [0.08, 0.08, 0.09] as RGB,
  box: [0.9, 0.9, 0.88] as RGB,
  led: [0.1, 0.85, 0.3] as RGB,
  label: [0.93, 0.93, 0.92] as RGB,
  shelf: [0.74, 0.75, 0.76] as RGB,
  shelfFront: [0.82, 0.83, 0.84] as RGB,
  connector: [0.1, 0.55, 0.35] as RGB,
  foup: [0.075, 0.08, 0.085] as RGB,
  foupDoor: [0.16, 0.17, 0.18] as RGB,
  amber: [0.85, 0.42, 0.08] as RGB,
  amberRib: [0.6, 0.26, 0.04] as RGB,
  bolt: [0.7, 0.45, 0.2] as RGB,
  handleYellow: [0.95, 0.76, 0.1] as RGB,
  handleBlue: [0.22, 0.36, 0.86] as RGB,
  flange: [0.72, 0.73, 0.74] as RGB,
  gripper: [0.12, 0.12, 0.13] as RGB,
};

export function boxMd(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, chamfer = 0.002): MeshData {
  const sx = x1 - x0;
  const sy = y1 - y0;
  const sz = z1 - z0;
  return chamferedBox([sx, sy, sz], Math.min(chamfer, sx / 4, sy / 4, sz / 4), [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
}

/** Box section swept along a polyline in XZ (lateral offset from the path, half width w, heights y0..y1). */
export function sweepBox(path: [number, number][], y0: number, y1: number, w: number, offset = 0): MeshData {
  const md = createMeshData();
  const n = path.length;
  const L: Vec3[] = [];
  const R: Vec3[] = [];
  const lat: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    const nx = -tz;
    const nz = tx;
    lat.push([nx, nz]);
    const [px, pz] = path[i];
    L.push([px + nx * (offset + w), 0, pz + nz * (offset + w)]);
    R.push([px + nx * (offset - w), 0, pz + nz * (offset - w)]);
  }
  const face = (pts: (i: number) => [Vec3, Vec3], nrm: (i: number) => Vec3) => {
    for (let i = 0; i < n - 1; i++) {
      const [p0, p1] = pts(i);
      const [p2, p3] = pts(i + 1);
      const nn = nrm(i);
      const a = pushVertex(md, p0, nn, [0, 0]);
      const b = pushVertex(md, p1, nn, [1, 0]);
      const c = pushVertex(md, p3, nn, [1, 1]);
      const d = pushVertex(md, p2, nn, [0, 1]);
      pushTriangleFacing(md, a, b, c, nn);
      pushTriangleFacing(md, a, c, d, nn);
    }
  };
  const at = (p: Vec3, y: number): Vec3 => [p[0], y, p[2]];
  face((i) => [at(L[i], y1), at(R[i], y1)], () => [0, 1, 0]);
  face((i) => [at(L[i], y0), at(R[i], y0)], () => [0, -1, 0]);
  face((i) => [at(L[i], y0), at(L[i], y1)], (i) => [lat[i][0], 0, lat[i][1]]);
  face((i) => [at(R[i], y0), at(R[i], y1)], (i) => [-lat[i][0], 0, -lat[i][1]]);
  for (const [i, s] of [
    [0, -1],
    [n - 1, 1],
  ] as const) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nn: Vec3 = [(s * (b[0] - a[0])) / l, 0, (s * (b[1] - a[1])) / l];
    const v = [at(L[i], y0), at(R[i], y0), at(R[i], y1), at(L[i], y1)].map((p) => pushVertex(md, p, nn, [0, 0]));
    pushTriangleFacing(md, v[0], v[1], v[2], nn);
    pushTriangleFacing(md, v[0], v[2], v[3], nn);
  }
  return md;
}

/** Vertex-coloured mesh batch of one spatial chunk. */
export class ColorBatch {
  readonly md = createMeshData();
  readonly colors: number[] = [];
  add(md: MeshData, c: RGB): void {
    const base = this.md.positions.length / 3;
    for (const v of md.positions) this.md.positions.push(v);
    for (const v of md.normals) this.md.normals.push(v);
    for (const v of md.uvs) this.md.uvs.push(v);
    for (const i of md.indices) this.md.indices.push(i + base);
    for (let k = 0; k < md.positions.length / 3; k++) this.colors.push(c[0], c[1], c[2], 1);
  }
}

interface Chunk {
  meshes: Mesh[];
  min: Vec3;
  max: Vec3;
}

export function bounds(md: MeshData): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < md.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = md.positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  return { min, max };
}

/** Segment (a -> b) against an axis-aligned box (slab test). */
export function segmentHitsBox(a: Vector3, b: Vector3, min: Vec3, max: Vec3): boolean {
  let t0 = 0;
  let t1 = 1;
  const o = [a.x, a.y, a.z];
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < min[k] || o[k] > max[k]) return false;
      continue;
    }
    let ta = (min[k] - o[k]) / d[k];
    let tb = (max[k] - o[k]) / d[k];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** Simplified closed FOUP (dark shell, amber window plates with ribs and bolts, side handles, top flange); door on
 * the side away from `front` (+1 / -1 along x). */
export function foupDecor(b: ColorBatch, x: number, y: number, z: number, front: number, handle: RGB): void {
  const dx = 0.19;
  const dz = 0.19;
  const h = 0.3;
  b.add(boxMd(x - dx, x + dx, y + 0.012, y + h, z - dz, z + dz, 0.02), C.foup);
  b.add(boxMd(x - dx + 0.02, x + dx - 0.02, y, y + 0.014, z - dz + 0.02, z + dz - 0.02, 0.003), C.foupDoor);
  // door on the back (away from the aisle), amber plate facing the aisle side and on both sides
  const bxo = x - front * (dx + 0.004);
  b.add(boxMd(Math.min(bxo, bxo + front * 0.008), Math.max(bxo, bxo + front * 0.008), y + 0.03, y + h - 0.03, z - dz + 0.03, z + dz - 0.03, 0.004), C.foupDoor);
  const fxo = x + front * (dx + 0.002);
  b.add(boxMd(Math.min(fxo, fxo + front * 0.004), Math.max(fxo, fxo + front * 0.004), y + 0.05, y + h - 0.05, z - 0.12, z + 0.12, 0.003), C.amber);
  for (let i = 0; i < 6; i++) {
    const zr = z - 0.09 + i * 0.036;
    b.add(boxMd(Math.min(fxo, fxo + front * 0.007), Math.max(fxo, fxo + front * 0.007), y + 0.07, y + h - 0.07, zr - 0.004, zr + 0.004, 0.001), C.amberRib);
  }
  for (const [sy, sz] of [
    [0.07, -0.1],
    [0.07, 0.1],
    [h - 0.07, -0.1],
    [h - 0.07, 0.1],
  ] as const)
    b.add(boxMd(Math.min(fxo, fxo + front * 0.01), Math.max(fxo, fxo + front * 0.01), y + sy - 0.008, y + sy + 0.008, z + sz - 0.008, z + sz + 0.008, 0.003), C.bolt);
  for (const s of [-1, 1]) {
    const zo = z + s * (dz + 0.002);
    b.add(boxMd(x - 0.1, x + 0.1, y + 0.06, y + h - 0.06, Math.min(zo, zo + s * 0.004), Math.max(zo, zo + s * 0.004), 0.003), C.amber);
    const zh = z + s * (dz + 0.006);
    b.add(boxMd(x - 0.07, x + 0.07, y + h * 0.55, y + h * 0.55 + 0.035, Math.min(zh, zh + s * 0.035), Math.max(zh, zh + s * 0.035), 0.008), handle);
  }
  const neck = revolveProfile(rectProfile(0, 0.03, 0, 0.02), { segments: 12 });
  b.add(translateMeshData(neck, x, y + h, z), C.flange);
  b.add(boxMd(x - 0.11, x + 0.11, y + h + 0.02, y + h + 0.032, z - 0.08, z + 0.08, 0.003), C.flange);
}


export class FabOverhead {
  private readonly chunks: Chunk[] = [];
  private readonly material: PBRMaterial;
  private triangles = 0;

  constructor(
    private readonly scene: Scene,
    parent: TransformNode,
    floorY: number,
    private readonly ceilingY: number,
    cfg: OverheadConfig,
    vehicle: DecorVehicleSource | null,
  ) {
    this.material = new PBRMaterial("env.overhead", scene);
    this.material.albedoColor = new Color3(1, 1, 1);
    this.material.metallic = 0;
    this.material.roughness = 0.5;
    this.material.environmentIntensity = 0.85;
    const batches = new Map<string, ColorBatch>();
    const batch = (group: string, z: number): ColorBatch => {
      const key = `${group}:${Math.floor((z + 100) / cfg.chunk)}`;
      let b = batches.get(key);
      if (!b) batches.set(key, (b = new ColorBatch()));
      return b;
    };
    const Y = (h: number) => floorY + h;
    const r = cfg.rail;
    const hw = r.width / 2;
    const rails = new Map(cfg.rails.map((rl) => [rl.id, rl]));

    // ---------------------------------------------------------------- rail track along a path
    const track = (group: string, path: [number, number][], bottom: number) => {
      const y0 = Y(bottom);
      const y1 = y0 + r.height;
      const zMid = (path[0][1] + path[path.length - 1][1]) / 2;
      // split long straight rails per chunk so the occlusion test stays local
      const pieces: [number, number][][] = [];
      if (path.length === 2) {
        const [[x, za], [, zb]] = path;
        for (let z = za; z < zb - 1e-6; z += cfg.chunk) pieces.push([[x, z], [x, Math.min(zb, z + cfg.chunk)]]);
      } else pieces.push(path);
      for (const p of pieces) {
        const zc = path.length === 2 ? (p[0][1] + p[1][1]) / 2 : zMid;
        const b = batch(group, zc);
        const halfBody = (hw - r.slot / 2) / 2;
        for (const s of [-1, 1]) b.add(sweepBox(p, y0, y1 - 0.02, halfBody, s * (r.slot / 2 + halfBody)), C.rail);
        b.add(sweepBox(p, y1 - 0.02, y1, hw), C.rail);
        b.add(sweepBox(p, y1 - 0.05, y1 - 0.02, r.slot / 2), C.railDark);
        for (const s of [-1, 1]) b.add(sweepBox(p, y0 + 0.03, y0 + 0.03 + r.stripe_height, 0.003, s * (hw + 0.003)), C.stripe);
      }
    };

    // ---------------------------------------------------------------- straight rails with hangers, markers, trays, boxes
    for (const rl of cfg.rails) {
      const group = `rail.${rl.id}`;
      track(group, [[rl.x, rl.z0], [rl.x, rl.z1]], rl.bottom);
      const y0 = Y(rl.bottom);
      const y1 = y0 + r.height;
      const cy = ceilingY;
      let k = 0;
      for (let z = rl.z0 + 0.6; z < rl.z1 - 0.2; z += r.hanger_pitch, k++) {
        const b = batch(group, z);
        for (const s of [-1, 1]) b.add(boxMd(rl.x + s * (hw + 0.03) - 0.02, rl.x + s * (hw + 0.03) + 0.02, y1, cy, z - 0.02, z + 0.02), C.frame);
        b.add(boxMd(rl.x - hw - 0.06, rl.x + hw + 0.06, y1, y1 + 0.04, z - 0.025, z + 0.025), C.frame);
        b.add(boxMd(rl.x - hw - 0.1, rl.x + hw + 0.22, cy - 0.05, cy, z - 0.03, z + 0.03), C.frame);
        // cable tray carrier arm on the +x side
        b.add(boxMd(rl.x + hw + 0.03, rl.x + hw + 0.06 + r.tray_width, y1 + 0.1, y1 + 0.12, z - 0.015, z + 0.015), C.frame);
        if (k % r.box_every === 1) {
          // control box on the -x post with a status LED window
          const bx = rl.x - hw - 0.03 - 0.02;
          b.add(boxMd(bx - 0.1, bx, y1 + 0.02, y1 + 0.24, z + 0.03, z + 0.19, 0.006), C.box);
          b.add(boxMd(bx - 0.102, bx - 0.098, y1 + 0.18, y1 + 0.2, z + 0.06, z + 0.08, 0.001), C.led);
        }
      }
      for (let z = rl.z0 + 0.3; z < rl.z1 - 0.1; z += r.marker_pitch) {
        const b = batch(group, z);
        for (const s of [-1, 1]) {
          const x = rl.x + s * (hw + 0.004);
          b.add(boxMd(x - 0.002, x + 0.002, y0 + 0.06, y0 + 0.12, z - 0.035, z + 0.035, 0.001), C.label);
          b.add(boxMd(x - 0.0025 + s * 0.0005, x + 0.0025 + s * 0.0005, y0 + 0.085, y0 + 0.095, z - 0.025, z + 0.025, 0.0005), C.railDark);
        }
      }
      // cable tray with a cable bundle along the rail
      for (let z = rl.z0; z < rl.z1 - 1e-6; z += cfg.chunk) {
        const z1 = Math.min(rl.z1, z + cfg.chunk);
        const b = batch(group, (z + z1) / 2);
        const tx0 = rl.x + hw + 0.06;
        const tx1 = tx0 + r.tray_width;
        b.add(boxMd(tx0, tx1, y1 + 0.12, y1 + 0.125, z, z1, 0.001), C.tray);
        b.add(boxMd(tx0, tx0 + 0.004, y1 + 0.125, y1 + 0.17, z, z1, 0.001), C.tray);
        b.add(boxMd(tx1 - 0.004, tx1, y1 + 0.125, y1 + 0.17, z, z1, 0.001), C.tray);
        b.add(boxMd(tx0 + 0.02, tx1 - 0.03, y1 + 0.125, y1 + 0.15, z, z1, 0.008), C.cable);
      }
    }

    // ---------------------------------------------------------------- S-curve branches between parallel rails
    for (const br of cfg.branches) {
      const a = rails.get(br.from);
      const bb = rails.get(br.to);
      if (!a || !bb) continue;
      const path: [number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const s = t * t * (3 - 2 * t);
        path.push([a.x + (bb.x - a.x) * s, br.z0 + br.length * t]);
      }
      track(`branch.${br.from}-${br.to}.${br.z0}`, path, Math.max(a.bottom, bb.bottom));
    }

    // ---------------------------------------------------------------- side-track / under-track FOUP buffers
    const aisleX = -3.175;
    let fill = 0;
    for (const bf of cfg.buffers) {
      const front = Math.sign(aisleX - bf.x) || 1;
      const d2 = cfg.buffer.depth / 2;
      const yb = Y(bf.bottom);
      const topY = yb + 0.56;
      for (const [za, zb] of bf.z) {
        const n = Math.max(1, Math.floor((zb - za) / cfg.buffer.pitch));
        const p = (zb - za) / n;
        for (let i = 0; i < n; i++) {
          const z0 = za + i * p;
          const zc = z0 + p / 2;
          const b = batch(`buffer.${bf.id}`, zc);
          b.add(boxMd(bf.x - d2, bf.x + d2, yb, yb + 0.02, z0 + 0.01, z0 + p - 0.01), C.shelf);
          b.add(boxMd(bf.x - d2, bf.x + d2, yb, topY, z0, z0 + 0.006, 0.001), C.shelf);
          b.add(boxMd(bf.x - front * d2 - 0.006, bf.x - front * d2, yb, topY, z0, z0 + p), C.shelf);
          // front plate with handling slot, label and connector block (as on the documentary shelves)
          const fx = bf.x + front * d2;
          b.add(boxMd(Math.min(fx, fx + front * 0.008), Math.max(fx, fx + front * 0.008), yb, yb + 0.16, z0 + 0.01, z0 + p - 0.01), C.shelfFront);
          const fo = fx + front * 0.01;
          b.add(boxMd(Math.min(fo, fo + front * 0.002), Math.max(fo, fo + front * 0.002), yb + 0.07, yb + 0.085, zc - 0.05, zc + 0.05, 0.001), C.railDark);
          b.add(boxMd(Math.min(fo, fo + front * 0.002), Math.max(fo, fo + front * 0.002), yb + 0.11, yb + 0.14, z0 + 0.04, z0 + 0.12, 0.001), C.label);
          b.add(boxMd(Math.min(fx, fx + front * 0.015), Math.max(fx, fx + front * 0.015), yb + 0.12, yb + 0.15, z0 + p - 0.09, z0 + p - 0.06, 0.002), C.connector);
          if (cfg.buffer.fill_pattern[fill++ % cfg.buffer.fill_pattern.length]) foupDecor(b, bf.x, yb + 0.02, zc, front, fill % 3 === 0 ? C.handleBlue : C.handleYellow);
        }
        const b = batch(`buffer.${bf.id}`, (za + zb) / 2);
        b.add(boxMd(bf.x - 0.03, bf.x + 0.03, topY, topY + 0.04, za, zb), C.frame);
        for (let z = za + 0.3; z < zb; z += 1.2) b.add(boxMd(bf.x - 0.012, bf.x + 0.012, topY + 0.04, ceilingY, z - 0.012, z + 0.012, 0.001), C.frame);
      }
    }

    // ---------------------------------------------------------------- parked decorative vehicles
    const vehicleChunks: { meshes: Mesh[]; md: MeshData[] }[] = [];
    if (vehicle) {
      for (const [vi, v] of cfg.vehicles.entries()) {
        const rl = rails.get(v.rail);
        if (!rl) continue;
        const dy = floorY + (rl.bottom - vehicle.railBottom);
        const dz = v.z - vehicle.restZ;
        const meshes: Mesh[] = [];
        const mds: MeshData[] = [];
        const byMat = new Map<Material, MeshData[]>();
        for (const part of vehicle.parts) {
          const md = translateMeshData(mergeMeshData([part.md]), rl.x, dy, dz);
          const list = byMat.get(part.material) ?? [];
          list.push(md);
          byMat.set(part.material, list);
        }
        for (const [mat, list] of byMat) {
          const md = mergeMeshData(list);
          const m = new Mesh(`env.overhead.vehicle${vi}.${mat.name}`, scene);
          applyMeshData(m, md);
          m.material = mat;
          meshes.push(m);
          mds.push(md);
        }
        // bogie block, gripper plate and a carried FOUP (vertex-coloured)
        const extra = new ColorBatch();
        const yBody = floorY + vehicle.bodyBottom + (rl.bottom - vehicle.railBottom);
        extra.add(boxMd(rl.x - 0.09, rl.x + 0.09, Y(rl.bottom) - 0.04, Y(rl.bottom) + 0.03, v.z - 0.3, v.z + 0.3, 0.004), C.railDark);
        extra.add(boxMd(rl.x - 0.18, rl.x + 0.18, yBody - 0.05, yBody - 0.02, v.z - 0.18, v.z + 0.18, 0.004), C.gripper);
        if (v.foup) foupDecor(extra, rl.x, yBody - 0.05 - vehicle.foupSize[1] - 0.06, v.z, 1, vi % 2 ? C.handleBlue : C.handleYellow);
        const em = this.batchMesh(`env.overhead.vehicle${vi}.extra`, extra);
        meshes.push(em);
        mds.push(extra.md);
        vehicleChunks.push({ meshes, md: mds });
      }
    }

    for (const [key, b] of batches) {
      if (!b.md.indices.length) continue;
      const m = this.batchMesh(`env.overhead.${key}`, b);
      const bb = bounds(b.md);
      this.chunks.push({ meshes: [m], min: bb.min, max: bb.max });
    }
    for (const vc of vehicleChunks) {
      const bb = bounds(mergeMeshData(vc.md));
      this.chunks.push({ meshes: vc.meshes, min: bb.min, max: bb.max });
    }
    for (const c of this.chunks)
      for (const m of c.meshes) {
        m.parent = parent;
        m.isPickable = false;
        m.metadata = { isGround: true, isEnvironment: true };
        m.freezeWorldMatrix();
        m.doNotSyncBoundingInfo = true;
        this.triangles += (m.getTotalIndices() || 0) / 3;
      }
  }

  private batchMesh(name: string, b: ColorBatch): Mesh {
    const m = new Mesh(name, this.scene);
    applyMeshData(m, b.md);
    m.setVerticesData(VertexBuffer.ColorKind, b.colors, false, 4);
    m.material = this.material;
    return m;
  }

  /** Hidden from above the ceiling; a chunk between the camera and its target is hidden so views stay open. */
  update(camera: Vector3, target: Vector3 | null, visible: boolean): void {
    const on = visible && camera.y < this.ceilingY - 0.05;
    for (const c of this.chunks) {
      const occluding = on && !!target && segmentHitsBox(camera, target, [c.min[0] - 0.05, c.min[1] - 0.05, c.min[2] - 0.05], [c.max[0] + 0.05, c.max[1] + 0.05, c.max[2] + 0.05]);
      for (const m of c.meshes) m.setEnabled(on && !occluding);
    }
  }

  stats(): { meshes: number; triangles: number } {
    return { meshes: this.chunks.reduce((s, c) => s + c.meshes.length, 0), triangles: this.triangles };
  }

  dispose(): void {
    for (const c of this.chunks) for (const m of c.meshes) m.dispose(false, false);
    this.material.dispose(false, false);
  }
}
