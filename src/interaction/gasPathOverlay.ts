/**
 * Optional explanatory overlays: schematic gas path (thin tubes + moving arrow cones that follow
 * presentation time) and a concept sheath region. These are drawings, not CFD or sheath physics.
 * Paths are routed through real openings (feed tube bore, faceplate, pedestal edge, baffle slots,
 * exhaust port) and never through solid metal.
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { ChamberLayout } from "../config/geometry";
import { DEG } from "../config/geometry";
import { revolveProfile, roundPolyline, tubeAlongPath, type Vec3 } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";

interface PathDef {
  id: string;
  points: Vec3[];
  color: Color3;
  arrows: number;
  speed: number; // path lengths per second
}

export function gasPaths(L: ChamberLayout): PathDef[] {
  const cfg = L.cfg;
  const gp = cfg.peripherals;
  const gapMid = (L.waferTopY + L.faceplateBottomY) / 2;
  const ex = L.ports.exhaust;
  const exAz = ex.azimuth;
  const feed = new Color3(0.35, 0.85, 1.0);
  const exhaust = new Color3(1.0, 0.65, 0.3);
  const top = L.gasTubeTopY;
  const supply: PathDef = {
    id: "supply",
    color: feed,
    arrows: 6,
    speed: 0.12,
    points: [
      [0, gp.gas_panel_center[1] + gp.gas_panel_size[1] / 2 + 0.01, gp.gas_panel_center[2]],
      [0, top + 0.06, gp.gas_panel_center[2]],
      [0, top + 0.06, 0],
      [0, L.plenumTopY - 0.004, 0],
    ],
  };
  const branches: PathDef[] = [];
  for (const az of [238 * DEG, 292 * DEG]) {
    const dir: Vec3 = [Math.cos(az), 0, Math.sin(az)];
    const r1 = 0.09;
    const r2 = L.rPedestal + 0.006;
    const p = (r: number, y: number): Vec3 => [dir[0] * r, y, dir[2] * r];
    branches.push({
      id: `branch_${Math.round(az / DEG)}`,
      color: feed,
      arrows: 5,
      speed: 0.14,
      points: [p(0.02, L.plenumTopY - 0.004), p(r1, L.plenumTopY - 0.005), p(r1, L.faceplateTopY + 0.002), p(r1, gapMid), p(r2, gapMid), p(r2, L.baffle.y1 + 0.004), p((L.baffle.rIn + L.baffle.rOut) / 2, L.baffle.y0 - 0.004), p((L.baffle.rIn + L.baffle.rOut) / 2, ex.centerY)],
    });
  }
  const sP = L.rOuter + cfg.ports.exhaust.stub_length + cfg.exhaust_line.throttle_valve_body_length + 0.08;
  const pumpTopY = cfg.exhaust_line.pump_center_y + cfg.exhaust_line.pump_size[1] / 2;
  const exP = (r: number, y: number): Vec3 => [Math.cos(exAz) * r, y, Math.sin(exAz) * r];
  const exhaustPath: PathDef = {
    id: "exhaust",
    color: exhaust,
    arrows: 7,
    speed: 0.1,
    points: [exP((L.baffle.rIn + L.baffle.rOut) / 2, ex.centerY), exP(L.rInner - 0.01, ex.centerY), exP(sP, ex.centerY), exP(sP, pumpTopY + 0.03)],
  };
  // connect branch ends to the exhaust path start with an arc in the exhaust plenum
  for (const b of branches) {
    const last = b.points[b.points.length - 1];
    const azStart = Math.atan2(last[2], last[0]);
    let d = exAz - azStart;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const n = 8;
    const r = (L.baffle.rIn + L.baffle.rOut) / 2;
    for (let i = 1; i <= n; i++) {
      const a = azStart + (d * i) / n;
      b.points.push([Math.cos(a) * r, ex.centerY, Math.sin(a) * r]);
    }
  }
  return [supply, ...branches, exhaustPath];
}

interface ArrowSet {
  meshes: Mesh[];
  samples: Vector3[];
  cum: number[];
  total: number;
  speed: number;
}

export class GasPathOverlay {
  readonly root: TransformNode;
  private readonly tubes: Mesh[] = [];
  private readonly arrowSets: ArrowSet[] = [];
  private readonly materials: PBRMaterial[] = [];
  private visible = false;

  constructor(scene: Scene, parent: TransformNode, L: ChamberLayout, instanceId: string) {
    this.root = new TransformNode(`${instanceId}::gas_overlay`, scene);
    this.root.parent = parent;
    for (const p of gasPaths(L)) {
      const mat = new PBRMaterial(`${instanceId}::gas_mat_${p.id}`, scene);
      mat.unlit = true;
      mat.albedoColor = p.color;
      mat.alpha = 0.85;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      mat.backFaceCulling = false;
      this.materials.push(mat);
      const smooth = roundPolyline(p.points, 0.02, 5);
      const tube = new Mesh(`${instanceId}::gas_tube_${p.id}`, scene);
      applyMeshData(tube, tubeAlongPath(smooth, 0.0018, { segments: 8, caps: true }));
      tube.material = mat;
      tube.parent = this.root;
      tube.isPickable = false;
      tube.receiveShadows = false;
      tube.metadata = { instanceId, assetId: "gas_overlay", decorative: true, isOverlay: true };
      this.tubes.push(tube);
      // arrows
      const cum: number[] = [0];
      const samples = smooth.map((q) => new Vector3(q[0], q[1], q[2]));
      for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Vector3.Distance(samples[i - 1], samples[i]));
      const total = cum[cum.length - 1];
      const coneMd = revolveProfile(
        [
          [0, 0],
          [0.0075, 0],
          [0, 0.02],
        ],
        { segments: 12 },
      );
      const meshes: Mesh[] = [];
      for (let k = 0; k < p.arrows; k++) {
        const cone = new Mesh(`${instanceId}::gas_arrow_${p.id}_${k}`, scene);
        applyMeshData(cone, coneMd);
        cone.material = mat;
        cone.parent = this.root;
        cone.isPickable = false;
        cone.receiveShadows = false;
        cone.rotationQuaternion = Quaternion.Identity();
        cone.metadata = { instanceId, assetId: "gas_overlay", decorative: true, isOverlay: true };
        meshes.push(cone);
      }
      this.arrowSets.push({ meshes, samples, cum, total, speed: p.speed });
    }
    this.setVisible(false);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.setEnabled(v);
  }

  /** Deterministic arrow placement from presentation time. */
  update(timeSec: number): void {
    if (!this.visible) return;
    const up = Vector3.Up();
    const q = new Quaternion();
    for (const set of this.arrowSets) {
      const n = set.meshes.length;
      for (let k = 0; k < n; k++) {
        let s = ((timeSec * set.speed + k / n) % 1 + 1) % 1;
        s *= set.total;
        // find segment
        let i = 1;
        while (i < set.cum.length - 1 && set.cum[i] < s) i++;
        const a = set.samples[i - 1];
        const b = set.samples[i];
        const segLen = Math.max(set.cum[i] - set.cum[i - 1], 1e-6);
        const t = (s - set.cum[i - 1]) / segLen;
        const pos = Vector3.Lerp(a, b, t);
        const dir = b.subtract(a).normalize();
        Quaternion.FromUnitVectorsToRef(up, dir, q);
        const m = set.meshes[k];
        m.position.copyFrom(pos);
        m.rotationQuaternion!.copyFrom(q);
      }
    }
  }

  dispose(): void {
    for (const s of this.arrowSets) for (const m of s.meshes) m.dispose(false, false);
    for (const t of this.tubes) t.dispose(false, false);
    for (const m of this.materials) m.dispose(true, false);
    this.root.dispose();
  }
}

/** Concept-only sheath regions near both electrodes (translucent rings; not computed boundaries). */
export class SheathOverlay {
  readonly root: TransformNode;
  private readonly meshes: Mesh[] = [];
  private readonly material: PBRMaterial;

  constructor(scene: Scene, parent: TransformNode, L: ChamberLayout, instanceId: string, sheathFraction: number) {
    this.root = new TransformNode(`${instanceId}::sheath_overlay`, scene);
    this.root.parent = parent;
    this.material = new PBRMaterial(`${instanceId}::sheath_mat`, scene);
    this.material.unlit = true;
    this.material.albedoColor = new Color3(1.0, 0.85, 0.3);
    this.material.alpha = 0.1;
    this.material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    this.material.backFaceCulling = false;
    const gap = L.plasma.topY - L.plasma.bottomY;
    const th = gap * sheathFraction;
    const r = L.plasma.radius * 0.985;
    for (const [y0, y1, key] of [
      [L.plasma.bottomY + 0.0003, L.plasma.bottomY + th, "lower"],
      [L.plasma.topY - th, L.plasma.topY - 0.0003, "upper"],
    ] as const) {
      const m = new Mesh(`${instanceId}::sheath_${key}`, scene);
      applyMeshData(
        m,
        revolveProfile(
          [
            [0, y0],
            [r, y0],
            [r, y1],
            [0, y1],
          ],
          { segments: 96 },
        ),
      );
      m.material = this.material;
      m.parent = this.root;
      m.isPickable = false;
      m.receiveShadows = false;
      m.alphaIndex = 5;
      m.metadata = { instanceId, assetId: "sheath_overlay", decorative: true, isOverlay: true };
      this.meshes.push(m);
    }
    this.root.setEnabled(false);
  }

  setVisible(v: boolean): void {
    this.root.setEnabled(v);
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose(false, false);
    this.material.dispose(true, false);
    this.root.dispose();
  }
}
