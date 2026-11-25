/**
 * Human-level bay scenery (visual only), informed by public documentary footage of a memory fab:
 *  - yellow-light lithography room beyond the north wall, seen down the aisle and through a window band, with two
 *    rows of coater / developer track style cabinets (load ports with FOUPs, window bands, signal towers, monitors).
 *    It stands for the off-scene "external lithography" step of the route; it is not modelled equipment.
 *  - locker banks against the aisle wall (small doors with keypads and label cards), building columns, and numbered
 *    location markers on the aisle floor.
 * Nothing here is equipment, picking target, measurement or state. Colours inside the yellow room are pre-tinted by
 * the room light (no extra scene light), so the room glows amber like the footage without changing tool lighting.
 */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createMeshData, pushTriangleFacing, pushVertex, revolveProfile, rectProfile, translateMeshData, type MeshData } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import { boxMd, C, ColorBatch, foupDecor, type RGB } from "./fabOverhead";

export interface ZonesConfig {
  yellow_room?: {
    z0: number;
    z1: number;
    opening: number[];
    window: { x0: number; x1: number; y0: number; y1: number };
    light: number[];
    rows: { x: number; front?: number; z0: number; z1: number }[];
  };
  lockers?: { x: number; depth: number; z0: number; z1: number; height: number }[];
  columns?: { x: number; z: number; size: number }[];
  floor_marks?: { x: number; z: number[]; start: number; size: number };
}

interface WallEntry {
  meshes: Mesh[];
  point: [number, number];
  outward: [number, number];
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
  private readonly ceilingMeshes: Mesh[] = [];
  private readonly walls: WallEntry[] = [];
  private readonly materials: PBRMaterial[] = [];
  private readonly textures: DynamicTexture[] = [];
  private triangles = 0;

  constructor(
    private readonly scene: Scene,
    private readonly parent: TransformNode,
    floorY: number,
    private readonly ceilingY: number,
    cfg: ZonesConfig,
    bay: { x0: number; x1: number; wallT: number },
  ) {
    const Y = (h: number) => floorY + h;
    const base = this.material("env.zone.base", [0, 0, 0], 0.55);

    // ---------------------------------------------------------------- yellow-light lithography room
    const yr = cfg.yellow_room;
    if (yr) {
      const [lr, lg, lb] = yr.light;
      const tint: RGB = [lr, lg, lb];
      const room = this.material("env.zone.yellow", [0.3 * lr, 0.25 * lg, 0.1 * lb], 0.6);
      const lamp = this.material("env.zone.yellow.lamp", [lr, lg * 0.92, lb * 0.75], 0.5, 2.0);
      const b = new ColorBatch();
      const ceil = new ColorBatch();
      const lamps = new ColorBatch();
      const x0 = bay.x0;
      const x1 = bay.x1;
      // floor: tiles with seams
      b.add(boxMd(x0, x1, Y(-0.03), Y(0.004), yr.z0, yr.z1, 0.002), Z.floor);
      for (let x = x0 + 0.6; x < x1; x += 0.6) b.add(boxMd(x - 0.004, x + 0.004, Y(0.004), Y(0.006), yr.z0, yr.z1, 0.0005), Z.tileSeam);
      for (let z = yr.z0 + 0.6; z < yr.z1; z += 0.6) b.add(boxMd(x0, x1, Y(0.004), Y(0.006), z - 0.004, z + 0.004, 0.0005), Z.tileSeam);
      // ceiling with flush amber light panels
      ceil.add(boxMd(x0, x1, ceilingY, ceilingY + 0.03, yr.z0, yr.z1, 0.002), Z.panel);
      for (let x = x0 + 0.3; x < x1 - 0.9; x += 1.2)
        for (let z = yr.z0 + 0.3; z < yr.z1 - 0.9; z += 1.8) lamps.add(boxMd(x + 0.05, x + 1.15, ceilingY - 0.012, ceilingY, z + 0.3, z + 1.5, 0.002), [1, 1, 1]);
      // track-style cabinets in two rows facing each other across a service aisle
      const aisleX = yr.rows.reduce((s, r) => s + r.x, 0) / yr.rows.length;
      let k = 0;
      for (const row of yr.rows) {
        const f = row.front ?? (Math.sign(aisleX - row.x) || 1); // front faces a room aisle
        const d = 0.55;
        const fx = row.x + f * d;
        const h = 1.95;
        b.add(boxMd(row.x - d, row.x + d, Y(0.08), Y(h), row.z0, row.z1, 0.01), Z.white);
        b.add(boxMd(row.x - d + 0.02, row.x + d - 0.02, Y(0), Y(0.08), row.z0 + 0.02, row.z1 - 0.02, 0.004), Z.kick);
        // front: window band with frames, panel seams, signal towers, monitors, load ports with FOUPs
        const fo = (o: number) => [Math.min(fx, fx + f * o), Math.max(fx, fx + f * o)] as const;
        const [wa, wb] = fo(0.01);
        b.add(boxMd(wa, wb, Y(1.15), Y(1.65), row.z0 + 0.15, row.z1 - 0.15, 0.003), Z.glass);
        for (let z = row.z0 + 0.15; z <= row.z1 - 0.14; z += (row.z1 - row.z0 - 0.3) / 4) {
          const [sa, sb] = fo(0.016);
          b.add(boxMd(sa, sb, Y(0.1), Y(h - 0.05), z - 0.012, z + 0.012, 0.002), Z.seam);
        }
        const [ha, hb] = fo(0.014);
        b.add(boxMd(ha, hb, Y(1.1), Y(1.12), row.z0 + 0.1, row.z1 - 0.1, 0.002), Z.seam);
        const nLp = 3;
        for (let i = 0; i < nLp; i++) {
          const zc = row.z0 + 0.5 + i * 0.62;
          const [pa, pb] = fo(0.42);
          b.add(boxMd(pa, pb, Y(0), Y(0.82), zc - 0.22, zc + 0.22, 0.01), Z.white);
          const [da, db] = fo(0.46);
          b.add(boxMd(da, db, Y(0.82), Y(0.85), zc - 0.24, zc + 0.24, 0.006), Z.panel);
          // LED status row above the port opening (unlit lenses)
          const [la, lb2] = fo(0.006);
          for (let j = 0; j < 6; j++) b.add(boxMd(la - 0.002, lb2 + 0.002, Y(1.0), Y(1.016), zc - 0.12 + j * 0.045, zc - 0.105 + j * 0.045, 0.001), [Z.green, Z.green, Z.yellow, Z.yellow, Z.red, Z.screen][j]);
          if ((i + k) % 3 !== 1) foupDecor(b, fx + f * 0.24, Y(0.85), zc, -f, i % 2 ? C.handleBlue : C.handleYellow);
        }
        // signal tower and monitor arm at the row ends
        for (const ze of [row.z0 + 0.12, row.z1 - 0.12]) {
          const tx = fx - f * 0.08;
          b.add(translateMeshData(revolveProfile(rectProfile(0, 0.012, Y(h), Y(h + 0.18)), { segments: 10 }), tx, 0, ze), Z.seam);
          [Z.green, Z.yellow, Z.red].forEach((c, j) => b.add(translateMeshData(revolveProfile(rectProfile(0, 0.03, Y(h + 0.18 + j * 0.06), Y(h + 0.235 + j * 0.06)), { segments: 16 }), tx, 0, ze), c));
        }
        const [ma, mb] = fo(0.08);
        b.add(boxMd(ma, mb, Y(1.25), Y(1.55), row.z1 - 0.9, row.z1 - 0.5, 0.008), Z.dark);
        const [sa2, sb2] = fo(0.084);
        b.add(boxMd(sa2, sb2, Y(1.28), Y(1.52), row.z1 - 0.88, row.z1 - 0.52, 0.002), Z.screen);
        const [ea, eb] = fo(0.03);
        b.add(boxMd(ea, eb, Y(1.0), Y(1.08), row.z1 - 0.3, row.z1 - 0.22, 0.006), Z.stopBase);
        k++;
      }
      // room walls (north end and both sides), cream with a dark kick plate
      const wallMds: [MeshData, [number, number], [number, number]][] = [
        [boxMd(x0 - bay.wallT, x1 + bay.wallT, Y(0), ceilingY, yr.z1, yr.z1 + bay.wallT), [0, yr.z1], [0, 1]],
        [boxMd(x0 - bay.wallT, x0, Y(0), ceilingY, yr.z0, yr.z1), [x0, 0], [-1, 0]],
        [boxMd(x1, x1 + bay.wallT, Y(0), ceilingY, yr.z0, yr.z1), [x1, 0], [1, 0]],
      ];
      this.tint(b, tint);
      this.tint(ceil, tint);
      this.push(b, room);
      this.ceilingMeshes.push(this.push(ceil, room), this.push(lamps, lamp));
      for (const [md, point, outward] of wallMds) {
        const wb = new ColorBatch();
        wb.add(md, Z.white);
        this.tint(wb, tint);
        this.walls.push({ meshes: [this.push(wb, room)], point, outward });
      }
      // window band in the bay's north wall (amber-tinted glass)
      const glass = this.material("env.zone.window", [0, 0, 0], 0.08);
      glass.alpha = 0.22;
      glass.albedoColor = new Color3(0.7, 0.6, 0.35);
      const gw = new ColorBatch();
      gw.add(boxMd(yr.window.x0, yr.window.x1, Y(yr.window.y0), Y(yr.window.y1), yr.z0 - 0.06, yr.z0 - 0.05, 0.001), [1, 1, 1]);
      this.walls.push({ meshes: [this.push(gw, glass)], point: [0, yr.z0], outward: [0, 1] });
    }

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

  /** Pre-tint vertex colours by the room light. */
  private tint(b: ColorBatch, t: RGB): void {
    for (let i = 0; i < b.colors.length; i += 4) {
      b.colors[i] *= t[0];
      b.colors[i + 1] *= t[1];
      b.colors[i + 2] *= t[2];
    }
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

  /** Room ceiling hidden from above; room walls hidden from their outer side (like the bay walls). */
  update(camera: Vector3, ceiling: boolean, walls: boolean): void {
    const ceilingOn = ceiling && camera.y < this.ceilingY - 0.05;
    for (const m of this.ceilingMeshes) m.setEnabled(ceilingOn);
    for (const w of this.walls) {
      const outside = (camera.x - w.point[0]) * w.outward[0] + (camera.z - w.point[1]) * w.outward[1] > -0.05;
      for (const m of w.meshes) m.setEnabled(walls && !outside);
    }
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
