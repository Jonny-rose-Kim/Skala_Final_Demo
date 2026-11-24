/**
 * Visual-only fab bay surroundings: raised floor tiles (solid in the aisle and the service chase,
 * perforated around the tools), aisle floor markings, ceiling grid with FFU and light panels, bay walls
 * and the rear utility chase (cable tray, process piping, exhaust duct, drops to each tool's facility
 * interface). Built once from `config/environment/fab-bay-v1.json`; nothing here is equipment, picking
 * target, measurement or DB entity. The ceiling hides itself when the camera is above it and each wall
 * when the camera is on its outer side, so inspection views are never blocked.
 */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import envConfig from "../../config/environment/fab-bay-v1.json";
import envConfigV2 from "../../config/environment/fab-bay-v2.json";
import type { Vec3Tuple } from "../config/geometry";
import { chamferedBox, createMeshData, mergeMeshData, pushTriangleFacing, pushVertex, revolveProfile, rectProfile, translateMeshData, tubeAlongPath, type MeshData, type Vec3 } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import type { MaterialLibrary } from "../materials/materialLibrary";
import type { EnvironmentSettings } from "../presentation/store";

export type FabEnvironmentConfig = typeof envConfig;
export const FAB_ENVIRONMENT_CONFIG: FabEnvironmentConfig = envConfig;
/** Environment configs by name (instances.json `environments`): v2 = current bay, v1 = legacy V1 bay. */
export const FAB_ENVIRONMENTS: Record<string, FabEnvironmentConfig> = { "fab-bay-v1": envConfig, "fab-bay-v2": envConfigV2 };

/** Facility interface of a placed tool in world coordinates: plate center and outward normal. */
export interface FacilityDrop {
  instanceId: string;
  center: Vec3Tuple;
  normal: Vec3Tuple;
}

/** Horizontal floor quad with tile-space UVs (one texture repeat per tile). */
function floorQuad(x0: number, x1: number, z0: number, z1: number, y: number, tile: number): MeshData {
  const md = createMeshData();
  const n: Vec3 = [0, 1, 0];
  const uv = (x: number, z: number): [number, number] => [x / tile, z / tile];
  const a = pushVertex(md, [x0, y, z0], n, uv(x0, z0));
  const b = pushVertex(md, [x1, y, z0], n, uv(x1, z0));
  const c = pushVertex(md, [x1, y, z1], n, uv(x1, z1));
  const d = pushVertex(md, [x0, y, z1], n, uv(x0, z1));
  pushTriangleFacing(md, a, b, c, n);
  pushTriangleFacing(md, a, c, d, n);
  return md;
}

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, chamfer = 0.002): MeshData {
  return chamferedBox([x1 - x0, y1 - y0, z1 - z0], chamfer, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
}

/** Cylinder along Z (pipes, duct). */
function pipeZ(r: number, x: number, y: number, z0: number, z1: number, seg = 16): MeshData {
  return tubeAlongPath([[x, y, z0], [x, y, z1]], r, { segments: seg, caps: true });
}

/** Tile albedo: flat color, darker seam at the border, optional perforation dots. */
function tileTexture(scene: Scene, name: string, base: [number, number, number], perforated: boolean): Texture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const seam = 3;
  const holes = 14;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let k = 1;
      if (x < seam || y < seam || x >= size - seam || y >= size - seam) k = 0.55;
      else if (perforated) {
        const cell = (size - 2 * seam - 24) / holes;
        const fx = (x - seam - 12) / cell;
        const fy = (y - seam - 12) / cell;
        if (fx > 0 && fy > 0 && fx < holes && fy < holes) {
          const dx = fx - Math.floor(fx) - 0.5;
          const dy = fy - Math.floor(fy) - 0.5;
          if (dx * dx + dy * dy < 0.09) k = 0.42;
        }
      }
      const i = (y * size + x) * 4;
      data[i] = Math.round(base[0] * k * 255);
      data[i + 1] = Math.round(base[1] * k * 255);
      data[i + 2] = Math.round(base[2] * k * 255);
      data[i + 3] = 255;
    }
  }
  const tex = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  tex.name = name;
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

interface WallEntry {
  mesh: Mesh;
  /** Hidden when dot(camera - point, outward) > 0. */
  point: Vec3Tuple;
  outward: Vec3Tuple;
}

export class FabEnvironment {
  readonly root: TransformNode;
  private readonly floor: Mesh[] = [];
  private readonly ceiling: Mesh[] = [];
  private readonly walls: WallEntry[] = [];
  private readonly utilities: Mesh[] = [];
  private readonly ownMaterials: PBRMaterial[] = [];
  private readonly textures: Texture[] = [];
  private readonly ceilingY: number;
  private triangles = 0;

  constructor(
    private readonly scene: Scene,
    materials: MaterialLibrary,
    floorY: number,
    drops: FacilityDrop[],
    cfg: FabEnvironmentConfig = FAB_ENVIRONMENT_CONFIG,
  ) {
    this.root = new TransformNode("fab-environment", scene);
    this.ceilingY = floorY + cfg.ceiling.height;
    const f = cfg.floor;
    const yTop = floorY + 0.004;
    // ---------------------------------------------------------------- floor (three tile zones) + aisle markings
    const solid = this.tileMaterial("env.tile.solid", [0.62, 0.63, 0.64], false, 0.75);
    const perf = this.tileMaterial("env.tile.perforated", [0.5, 0.52, 0.54], true, 0.7);
    const chase = this.tileMaterial("env.tile.chase", [0.42, 0.43, 0.45], false, 0.8);
    const xa0 = cfg.aisle.x0;
    const xa1 = cfg.aisle.x1;
    const xs0 = cfg.service.x0;
    const slab = mergeMeshData([box(f.x0, f.x1, floorY - f.thickness, floorY + 0.002, f.z0, f.z1, 0.004)]);
    this.add(this.floor, "env.floor.slab", slab, materials.get("painted_dark"), { receiveShadows: true });
    this.add(this.floor, "env.floor.front", floorQuad(f.x0, xa1, f.z0, f.z1, yTop, f.tile), solid, { receiveShadows: true });
    this.add(this.floor, "env.floor.tools", floorQuad(xa1, xs0, f.z0, f.z1, yTop, f.tile), perf, { receiveShadows: true });
    this.add(this.floor, "env.floor.chase", floorQuad(xs0, f.x1, f.z0, f.z1, yTop, f.tile), chase, { receiveShadows: true });
    const sw = cfg.aisle.stripe_width;
    const stripes = mergeMeshData([box(xa1 - sw, xa1, yTop, yTop + 0.003, f.z0 + 0.3, f.z1 - 0.3, 0.0005), box(xa0, xa0 + sw, yTop, yTop + 0.003, f.z0 + 0.3, f.z1 - 0.3, 0.0005)]);
    this.add(this.floor, "env.floor.aisle_marking", stripes, materials.get("safety_marking"), { receiveShadows: true });
    // ---------------------------------------------------------------- ceiling grid, FFU and light panels
    const c = cfg.ceiling;
    const [mx, mz] = c.module;
    const tb = c.tbar_width;
    const cy = this.ceilingY;
    // grid lines every module from the bay corner, closed at the far edges; the last row / column of modules is
    // cut to the bay size and gets plain panels
    const lines = (a0: number, a1: number, m: number) => {
      const out: number[] = [];
      for (let a = a0; a < a1 - 1e-6; a += m) out.push(a);
      out.push(a1);
      return out;
    };
    const gx = lines(f.x0, f.x1, mx);
    const gz = lines(f.z0, f.z1, mz);
    const grid: MeshData[] = [];
    for (const x of gx) grid.push(box(x - tb / 2, x + tb / 2, cy, cy + c.tbar_depth, f.z0, f.z1, 0.002));
    for (const z of gz) grid.push(box(f.x0, f.x1, cy + 0.002, cy + c.tbar_depth - 0.002, z - tb / 2, z + tb / 2, 0.002));
    this.add(this.ceiling, "env.ceiling.grid", mergeMeshData(grid), materials.get("painted_offwhite"));
    const ffu: MeshData[] = [];
    const ffuFace: MeshData[] = [];
    const lights: MeshData[] = [];
    for (let ix = 0; ix < gx.length - 1; ix++) {
      const x = gx[ix];
      const xFull = gx[ix + 1] - x > mx - 1e-6;
      for (let iz = 0; iz < gz.length - 1; iz++) {
        const z = gz[iz];
        const cx0 = x + tb / 2;
        const cx1 = gx[ix + 1] - tb / 2;
        const cz0 = z + tb / 2;
        const cz1 = gz[iz + 1] - tb / 2;
        const full = xFull && gz[iz + 1] - z > mz - 1e-6;
        if (!full) ffuFace.push(floorQuad(cx0, cx1, cz0, cz1, cy + 0.008, 0.6));
        else if (iz % c.light_every === 1) lights.push(box(cx0 + 0.02, cx1 - 0.02, cy + 0.004, cy + 0.02, cz0 + 0.18, cz1 - 0.18, 0.002));
        else if (c.ffu_pattern[ix % c.ffu_pattern.length]) {
          ffu.push(box(cx0, cx1, cy + c.tbar_depth, cy + c.tbar_depth + 0.12, cz0, cz1, 0.006));
          ffuFace.push(floorQuad(cx0, cx1, cz0, cz1, cy + 0.006, 0.3));
        } else ffuFace.push(floorQuad(cx0, cx1, cz0, cz1, cy + 0.008, 0.6));
      }
    }
    // the face quads point up; the ceiling is seen from below, so flip them
    const faces = mergeMeshData(ffuFace);
    for (let i = 0; i < faces.normals.length; i += 3) faces.normals[i + 1] = -faces.normals[i + 1];
    for (let i = 0; i < faces.indices.length; i += 3) {
      const t = faces.indices[i + 1];
      faces.indices[i + 1] = faces.indices[i + 2];
      faces.indices[i + 2] = t;
    }
    this.add(this.ceiling, "env.ceiling.ffu_housing", mergeMeshData(ffu), materials.get("painted_housing"));
    this.add(this.ceiling, "env.ceiling.panels", faces, this.tileMaterial("env.ffu.face", [0.86, 0.87, 0.88], true, 0.6));
    const lightMat = new PBRMaterial("env.light", scene);
    lightMat.albedoColor = new Color3(0.9, 0.9, 0.88);
    lightMat.emissiveColor = new Color3(0.95, 0.96, 0.92);
    lightMat.emissiveIntensity = 0.9;
    lightMat.metallic = 0;
    lightMat.roughness = 0.5;
    this.ownMaterials.push(lightMat);
    this.add(this.ceiling, "env.ceiling.lights", mergeMeshData(lights), lightMat);
    // ---------------------------------------------------------------- walls (hidden from their outer side)
    const w = cfg.walls;
    const wy0 = floorY;
    const wy1 = floorY + w.height;
    const wallMat = materials.get("painted_offwhite");
    const kick = materials.get("painted_dark");
    const t = w.thickness;
    const mkWall = (name: string, md: MeshData, base: MeshData, point: Vec3Tuple, outward: Vec3Tuple) => {
      const m = this.add([], name, md, wallMat);
      const b = this.add([], `${name}.base`, base, kick);
      b.parent = m;
      this.walls.push({ mesh: m, point, outward });
    };
    const seamsX = (x: number, z0: number, z1: number) => {
      const out: MeshData[] = [];
      for (let z = z0 + 1.2; z < z1 - 0.1; z += 1.2) out.push(box(x - 0.003, x + 0.003, wy0 + w.base_height, wy1, z - 0.004, z + 0.004, 0.001));
      return out;
    };
    mkWall("env.wall.back", mergeMeshData([box(w.back_x, w.back_x + t, wy0, wy1, w.z0, w.z1), ...seamsX(w.back_x - 0.001, w.z0, w.z1)]), box(w.back_x - 0.01, w.back_x, wy0, wy0 + w.base_height, w.z0, w.z1), [w.back_x, 0, 0], [1, 0, 0]);
    mkWall("env.wall.front", box(w.front_x - t, w.front_x, wy0, wy1, w.z0, w.z1), box(w.front_x, w.front_x + 0.01, wy0, wy0 + w.base_height, w.z0, w.z1), [w.front_x, 0, 0], [-1, 0, 0]);
    mkWall("env.wall.south", box(w.front_x - t, w.back_x + t, wy0, wy1, w.z0 - t, w.z0), box(w.front_x, w.back_x, wy0, wy0 + w.base_height, w.z0, w.z0 + 0.01), [0, 0, w.z0], [0, 0, -1]);
    mkWall("env.wall.north", box(w.front_x - t, w.back_x + t, wy0, wy1, w.z1, w.z1 + t), box(w.front_x, w.back_x, wy0, wy0 + w.base_height, w.z1 - 0.01, w.z1), [0, 0, w.z1], [0, 0, 1]);
    // ---------------------------------------------------------------- rear utility chase
    const u = cfg.utilities;
    const tz0 = f.z0 + 0.3;
    const tz1 = f.z1 - 0.3;
    const trayY = floorY + u.tray.height;
    const tw = u.tray.width / 2;
    const tray = mergeMeshData([
      box(u.tray.x - tw, u.tray.x + tw, trayY - 0.004, trayY, tz0, tz1, 0.001),
      box(u.tray.x - tw, u.tray.x - tw + 0.004, trayY, trayY + u.tray.depth, tz0, tz1, 0.001),
      box(u.tray.x + tw - 0.004, u.tray.x + tw, trayY, trayY + u.tray.depth, tz0, tz1, 0.001),
    ]);
    const hangers: MeshData[] = [];
    for (let z = tz0 + 0.4; z < tz1; z += 1.2) {
      for (const sx of [-1, 1]) hangers.push(translateMeshData(revolveProfile(rectProfile(0, 0.008, trayY - 0.03, cy), { segments: 8 }), u.tray.x + sx * (tw + 0.015), 0, z));
      hangers.push(box(u.tray.x - tw - 0.03, u.tray.x + tw + 0.03, trayY - 0.03, trayY - 0.004, z - 0.02, z + 0.02, 0.002));
    }
    const ductY = floorY + u.duct.height;
    const pipeY = floorY + u.pipes.height;
    this.add(this.utilities, "env.util.tray", tray, materials.get("aluminum_anodized"));
    this.add(this.utilities, "env.util.hangers", mergeMeshData(hangers), materials.get("dark_steel"));
    this.add(this.utilities, "env.util.pipes", mergeMeshData(u.pipes.x.map((x) => pipeZ(u.pipes.radius, x, pipeY, tz0, tz1, 12))), materials.get("stainless"));
    this.add(this.utilities, "env.util.duct", pipeZ(u.duct.radius, u.duct.x, ductY, tz0, tz1, 32), materials.get("aluminum_anodized"));
    // drops: cable (tray), gas (pipes), exhaust (duct) to each facility interface plate
    const cables: MeshData[] = [];
    const gas: MeshData[] = [];
    const exhaust: MeshData[] = [];
    for (const d of drops) {
      const [cx, cyy, cz] = d.center;
      const [nx, , nz] = d.normal;
      // lateral tangent on the plate (horizontal, perpendicular to the normal)
      const tx = -nz;
      const tzv = nx;
      const sources: [number, number, MeshData[], number][] = [
        [u.tray.x, trayY + 0.02, cables, u.drops.radius[0]],
        [u.pipes.x[1], pipeY, gas, u.drops.radius[1]],
        [u.duct.x, ductY, exhaust, u.drops.radius[2]],
      ];
      sources.forEach(([hx, hy, out, r], k) => {
        const lat = u.drops.lateral[k];
        const ex = cx + nx * 0.01 + tx * lat;
        const ez = cz + nz * 0.01 + tzv * lat;
        const ey = cyy + 0.1 - 0.1 * k;
        const ox = cx + nx * (0.28 + 0.06 * k) + tx * lat;
        const oz = cz + nz * (0.28 + 0.06 * k) + tzv * lat;
        const routeY = hy - 0.12 - 0.05 * k;
        const path: Vec3[] = [[hx, hy, oz], [hx, routeY, oz], [ox, routeY, oz], [ox, ey, oz], [ex, ey, ez]];
        out.push(tubeAlongPath(path, r, { segments: 12, cornerRadius: Math.min(0.12, 4 * r) }));
      });
    }
    if (cables.length) this.add(this.utilities, "env.util.drops.cable", mergeMeshData(cables), materials.get("rubber_membrane"));
    if (gas.length) this.add(this.utilities, "env.util.drops.gas", mergeMeshData(gas), materials.get("stainless"));
    if (exhaust.length) this.add(this.utilities, "env.util.drops.exhaust", mergeMeshData(exhaust), materials.get("aluminum_anodized"));
  }

  private tileMaterial(name: string, base: [number, number, number], perforated: boolean, roughness: number): PBRMaterial {
    const m = new PBRMaterial(name, this.scene);
    const tex = tileTexture(this.scene, `${name}.albedo`, base, perforated);
    m.albedoTexture = tex;
    m.albedoColor = new Color3(1, 1, 1);
    m.metallic = 0;
    m.roughness = roughness;
    m.environmentIntensity = 0.6;
    this.textures.push(tex);
    this.ownMaterials.push(m);
    return m;
  }

  private add(list: Mesh[], name: string, md: MeshData, material: PBRMaterial, opts: { receiveShadows?: boolean } = {}): Mesh {
    const m = new Mesh(name, this.scene);
    applyMeshData(m, md);
    m.material = material;
    m.parent = this.root;
    m.isPickable = false;
    m.receiveShadows = !!opts.receiveShadows;
    m.metadata = { isGround: true, isEnvironment: true };
    m.freezeWorldMatrix();
    m.doNotSyncBoundingInfo = true;
    list.push(m);
    this.triangles += md.indices.length / 3;
    return m;
  }

  /** Visibility from the store settings and the camera position (auto-hide of ceiling and walls). */
  update(camera: Vector3, s: EnvironmentSettings): void {
    this.root.setEnabled(s.visible);
    if (!s.visible) return;
    const ceilingOn = s.ceiling && camera.y < this.ceilingY - 0.05;
    for (const m of this.ceiling) m.setEnabled(ceilingOn);
    for (const wl of this.walls) {
      const outside = (camera.x - wl.point[0]) * wl.outward[0] + (camera.z - wl.point[2]) * wl.outward[2] > -0.05;
      wl.mesh.setEnabled(s.walls && !outside);
    }
  }

  stats(): { meshes: number; triangles: number } {
    return { meshes: this.floor.length + this.ceiling.length + this.walls.length * 2 + this.utilities.length, triangles: this.triangles };
  }

  dispose(): void {
    this.root.dispose(false, false);
    for (const m of this.ownMaterials) m.dispose(false, false);
    for (const t of this.textures) t.dispose();
  }
}

/** World-space facility interface of a placed tool from its instance-frame definition. */
export function facilityDropFor(instanceId: string, position: Vec3Tuple, rotationYDeg: number, local: { center: Vec3Tuple; normal: Vec3Tuple }): FacilityDrop {
  const a = (rotationYDeg * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const rot = (v: Vec3Tuple): Vec3Tuple => [v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs];
  const c = rot(local.center);
  return { instanceId, center: [position[0] + c[0], position[1] + c[1], position[2] + c[2]], normal: rot(local.normal) };
}
