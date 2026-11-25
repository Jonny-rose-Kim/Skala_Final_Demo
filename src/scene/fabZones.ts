/**
 * Human-level bay scenery (visual only), informed by public documentary footage of a memory fab: locker banks
 * against the aisle wall (small doors with keypads and label cards), building columns, and numbered location markers
 * on the aisle floor. Nothing here is equipment, picking target, measurement or state.
 */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createMeshData, pushTriangleFacing, pushVertex } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import { boxMd, C, ColorBatch, type RGB } from "./fabOverhead";

export interface ZonesConfig {
  lockers?: { x: number; depth: number; z0: number; z1: number; height: number }[];
  columns?: { x: number; z: number; size: number }[];
  floor_marks?: { x: number; z: number[]; start: number; size: number };
}

const Z = {
  white: [0.9, 0.9, 0.89] as RGB,
  panel: [0.84, 0.85, 0.85] as RGB,
  seam: [0.55, 0.56, 0.57] as RGB,
  glass: [0.22, 0.24, 0.26] as RGB,
  dark: [0.1, 0.1, 0.11] as RGB,
  screen: [0.2, 0.32, 0.45] as RGB,
  red: [0.85, 0.12, 0.1] as RGB,
  yellow: [0.95, 0.75, 0.1] as RGB,
  green: [0.15, 0.75, 0.3] as RGB,
  floor: [0.62, 0.63, 0.64] as RGB,
  tileSeam: [0.42, 0.43, 0.45] as RGB,
  kick: [0.3, 0.31, 0.33] as RGB,
  locker: [0.8, 0.81, 0.82] as RGB,
  lockerDoor: [0.86, 0.87, 0.875] as RGB,
  keypad: [0.16, 0.17, 0.19] as RGB,
  card: [0.96, 0.96, 0.95] as RGB,
  stopBase: [0.95, 0.8, 0.12] as RGB,
};

export class FabZones {
  private readonly meshes: Mesh[] = [];
  private readonly materials: PBRMaterial[] = [];
  private readonly textures: DynamicTexture[] = [];
  private triangles = 0;

  constructor(
    private readonly scene: Scene,
    private readonly parent: TransformNode,
    floorY: number,
    ceilingY: number,
    cfg: ZonesConfig,
  ) {
    const Y = (h: number) => floorY + h;
    const base = this.material("env.zone.base", [0, 0, 0], 0.55);

    // ---------------------------------------------------------------- locker banks along the aisle wall
    if (cfg.lockers?.length) {
      const b = new ColorBatch();
      for (const lk of cfg.lockers) {
        const xf = lk.x + lk.depth;
        b.add(boxMd(lk.x, xf, Y(0.06), Y(lk.height), lk.z0, lk.z1, 0.006), Z.locker);
        b.add(boxMd(lk.x + 0.02, xf - 0.02, Y(0), Y(0.06), lk.z0 + 0.02, lk.z1 - 0.02, 0.003), Z.kick);
        const cols = Math.max(1, Math.round((lk.z1 - lk.z0) / 0.34));
        const rows = Math.max(1, Math.round((lk.height - 0.16) / 0.36));
        const w = (lk.z1 - lk.z0) / cols;
        const h = (lk.height - 0.16) / rows;
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < rows; j++) {
            const za = lk.z0 + i * w + 0.006;
            const zb = za + w - 0.012;
            const ya = Y(0.1 + j * h + 0.006);
            const yb = ya + h - 0.012;
            b.add(boxMd(xf, xf + 0.012, ya, yb, za, zb, 0.002), Z.lockerDoor);
            b.add(boxMd(xf + 0.012, xf + 0.024, yb - 0.11, yb - 0.04, zb - 0.07, zb - 0.03, 0.002), Z.keypad);
            b.add(boxMd(xf + 0.012, xf + 0.015, yb - 0.1, yb - 0.02, za + 0.03, za + 0.12, 0.001), Z.card);
            b.add(boxMd(xf + 0.012, xf + 0.016, ya + 0.04, ya + 0.1, za + 0.04, za + 0.09, 0.001), Z.card);
          }
        b.add(boxMd(lk.x, xf + 0.03, Y(lk.height), Y(lk.height + 0.03), lk.z0, lk.z1, 0.004), Z.locker);
      }
      this.push(b, base);
    }

    // ---------------------------------------------------------------- building columns
    if (cfg.columns?.length) {
      const b = new ColorBatch();
      for (const c of cfg.columns) {
        const s2 = c.size / 2;
        b.add(boxMd(c.x - s2, c.x + s2, Y(0), ceilingY, c.z - s2, c.z + s2, 0.01), Z.white);
        b.add(boxMd(c.x - s2 - 0.01, c.x + s2 + 0.01, Y(0), Y(0.12), c.z - s2 - 0.01, c.z + s2 + 0.01, 0.004), Z.kick);
        b.add(boxMd(c.x + s2, c.x + s2 + 0.006, Y(1.5), Y(1.75), c.z - 0.12, c.z + 0.12, 0.002), C.handleYellow);
      }
      this.push(b, base);
    }

    // ---------------------------------------------------------------- numbered location markers on the aisle floor
    const fm = cfg.floor_marks;
    if (fm?.z.length) {
      const n = fm.z.length;
      const tex = new DynamicTexture("env.zone.floor_marks", { width: 256 * n, height: 256 }, scene, true);
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
      for (let i = 0; i < n; i++) {
        const ox = i * 256;
        ctx.fillStyle = "#e9eee6";
        ctx.fillRect(ox + 8, 8, 240, 240);
        ctx.strokeStyle = "#1d1f22";
        ctx.lineWidth = 10;
        ctx.strokeRect(ox + 20, 20, 216, 216);
        ctx.fillStyle = "#1d1f22";
        ctx.font = "bold 120px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(fm.start + i), ox + 128, 134);
      }
      tex.update(true);
      this.textures.push(tex);
      const mat = new PBRMaterial("env.zone.floor_marks", scene);
      mat.albedoTexture = tex;
      mat.metallic = 0;
      mat.roughness = 0.7;
      mat.environmentIntensity = 0.6;
      this.materials.push(mat);
      const md = createMeshData();
      const s2 = fm.size / 2;
      const y = Y(0.0075);
      fm.z.forEach((z, i) => {
        const u0 = i / n;
        const u1 = (i + 1) / n;
        // readable from the south end of the aisle: the number's top points to +z
        const a = pushVertex(md, [fm.x + s2, y, z - s2], [0, 1, 0], [u1, 1]);
        const bb = pushVertex(md, [fm.x - s2, y, z - s2], [0, 1, 0], [u0, 1]);
        const c = pushVertex(md, [fm.x - s2, y, z + s2], [0, 1, 0], [u0, 0]);
        const d = pushVertex(md, [fm.x + s2, y, z + s2], [0, 1, 0], [u1, 0]);
        pushTriangleFacing(md, a, bb, c, [0, 1, 0]);
        pushTriangleFacing(md, a, c, d, [0, 1, 0]);
      });
      const m = new Mesh("env.zone.floor_marks", scene);
      applyMeshData(m, md);
      m.material = mat;
      m.receiveShadows = true;
      this.register(m);
    }
  }

  private material(name: string, emissive: [number, number, number], roughness: number, emissiveIntensity = 1): PBRMaterial {
    const m = new PBRMaterial(name, this.scene);
    m.albedoColor = new Color3(1, 1, 1);
    m.emissiveColor = new Color3(emissive[0], emissive[1], emissive[2]);
    m.emissiveIntensity = emissiveIntensity;
    m.metallic = 0;
    m.roughness = roughness;
    m.environmentIntensity = 0.8;
    this.materials.push(m);
    return m;
  }

  private push(b: ColorBatch, mat: PBRMaterial): Mesh {
    const m = new Mesh(mat.name + "." + this.meshes.length, this.scene);
    applyMeshData(m, b.md);
    m.setVerticesData(VertexBuffer.ColorKind, b.colors, false, 4);
    m.material = mat;
    this.register(m);
    return m;
  }

  private register(m: Mesh): void {
    m.parent = this.parent;
    m.isPickable = false;
    m.metadata = { isGround: true, isEnvironment: true };
    m.freezeWorldMatrix();
    m.doNotSyncBoundingInfo = true;
    this.meshes.push(m);
    this.triangles += m.getTotalIndices() / 3;
  }

  stats(): { meshes: number; triangles: number } {
    return { meshes: this.meshes.length, triangles: this.triangles };
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose(false, false);
    for (const m of this.materials) m.dispose(false, false);
    for (const t of this.textures) t.dispose();
  }
}
