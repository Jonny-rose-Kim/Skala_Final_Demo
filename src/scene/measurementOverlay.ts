/**
 * Measurement markers for the active instance: instrument body (sphere, amber), mount link, measurement
 * point (diamond, cyan), region (translucent sphere/box), optical / line reference (thin tube + footprint).
 * Markers are drawings that identify positions and coverage; they are not the sensor's shape. They follow
 * the asset node of their mount / target component so moving parts and exploded display offsets apply.
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Vec3Tuple } from "../config/geometry";
import type { MeasurementIndex, MeasurementPointDefV2, InstrumentInstallationDef } from "../domain/measurement";
import { revolveProfile, tubeAlongPath, chamferedBox, type MeshData, type Vec3 } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import type { SelectedMeasurement } from "../presentation/store";
import type { EquipmentInstance } from "./equipmentInstance";

interface MarkerEntry {
  kind: "instrument" | "point";
  id: string;
  node: TransformNode;
  meshes: Mesh[];
  pointDef?: MeasurementPointDefV2;
  /** Dynamic points (resolver) are repositioned each frame by the effect set. */
  dynamic: boolean;
}

function sphereMd(r: number): MeshData {
  const pts: [number, number][] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    pts.push([Math.max(0, r * Math.cos(a)), r * Math.sin(a)]);
  }
  return revolveProfile(pts, { segments: 24, caps: false });
}

function diamondMd(r: number): MeshData {
  return revolveProfile(
    [
      [0, -r * 1.4],
      [r, 0],
      [0, r * 1.4],
    ],
    { segments: 8, caps: false },
  );
}

function discMd(r: number, y0: number, y1: number): MeshData {
  return revolveProfile(
    [
      [0, y0],
      [r, y0],
      [r, y1],
      [0, y1],
    ],
    { segments: 48 },
  );
}

export class MeasurementOverlay {
  private readonly root: TransformNode;
  private entries: MarkerEntry[] = [];
  private readonly mats: Record<string, PBRMaterial> = {};
  private instance: EquipmentInstance | null = null;
  private visible = false;
  private selected: SelectedMeasurement | null = null;
  private builtFor = "";

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode("measurement_overlay", scene);
    const mk = (key: string, color: Color3, alpha = 1) => {
      const m = new PBRMaterial(`mat.marker.${key}`, scene);
      m.unlit = true;
      m.albedoColor = color;
      m.alpha = alpha;
      if (alpha < 1) m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      m.backFaceCulling = false;
      m.disableDepthWrite = alpha < 1;
      this.mats[key] = m;
    };
    mk("body", new Color3(1.0, 0.72, 0.2));
    mk("bodySel", new Color3(1.0, 0.9, 0.55));
    mk("point", new Color3(0.25, 0.95, 1.0));
    mk("pointSel", new Color3(0.8, 1.0, 1.0));
    mk("candidate", new Color3(0.6, 0.6, 0.65));
    mk("region", new Color3(0.25, 0.95, 1.0), 0.18);
    mk("path", new Color3(0.4, 1.0, 0.6), 0.9);
    mk("link", new Color3(1.0, 0.72, 0.2), 0.6);
  }

  /** Rebuild markers for an instance (called when the active instance changes). */
  setInstance(inst: EquipmentInstance | null, index: MeasurementIndex | null): void {
    const key = inst ? inst.def.instanceId : "";
    if (key === this.builtFor) return;
    this.builtFor = key;
    this.clear();
    this.instance = inst;
    if (!inst || !index) return;
    const seed = index.seed;
    for (const ins of seed.installations) {
      const inst0 = index.instrumentsById.get(ins.instrumentId);
      if (!inst0 || ins.installationStatus !== "installed") continue;
      const node = this.attach(inst, ins.mountedOnAssetId, ins.mountFrameJointId, ins.mountPosition);
      const body = this.mesh(`marker.body.${ins.instrumentId}`, sphereMd(0.014), this.mats.body, node);
      const meshes = [body];
      // link from body to each distinct point observed by its channels (same frame assumption for the drawing)
      const linked = new Set<string>();
      for (const ch of index.channelsOf(ins.instrumentId)) {
        for (const pt of index.pointsOfChannel(ch.channelId)) {
          if (pt.resolver || linked.has(pt.pointId)) continue;
          linked.add(pt.pointId);
          const a: Vec3 = [0, 0, 0];
          const b: Vec3 = [pt.geometry.position[0] - ins.mountPosition[0], pt.geometry.position[1] - ins.mountPosition[1], pt.geometry.position[2] - ins.mountPosition[2]];
          const len = Math.hypot(b[0], b[1], b[2]);
          if (len < 0.01 || len > 1.5) continue;
          meshes.push(this.mesh(`marker.link.${ins.instrumentId}.${pt.pointId}`, tubeAlongPath([a, b], 0.0012, { segments: 6, caps: false }), this.mats.link, node));
        }
      }
      this.entries.push({ kind: "instrument", id: ins.instrumentId, node, meshes, dynamic: false });
    }
    for (const pt of seed.points) {
      const node = this.attach(inst, pt.targetAssetId, pt.frameJointId, pt.geometry.position);
      const notInstalled = index.isNotInstalled(pt.pointId);
      const mat = notInstalled ? this.mats.candidate : this.mats.point;
      const meshes: Mesh[] = [];
      switch (pt.pointKind) {
        case "point":
          meshes.push(this.mesh(`marker.pt.${pt.pointId}`, diamondMd(0.011), mat, node));
          break;
        case "region": {
          const r = pt.geometry.radius ?? 0.03;
          meshes.push(this.mesh(`marker.pt.${pt.pointId}`, diamondMd(0.009), mat, node));
          if (pt.geometry.extent) meshes.push(this.mesh(`marker.region.${pt.pointId}`, chamferedBox([pt.geometry.extent[0] * 2, pt.geometry.extent[1] * 2, pt.geometry.extent[2] * 2], 0.002), this.mats.region, node));
          else meshes.push(this.mesh(`marker.region.${pt.pointId}`, sphereMd(r), this.mats.region, node));
          break;
        }
        case "axis_reference": {
          const ax = pt.geometry.axis ?? [0, 1, 0];
          meshes.push(this.mesh(`marker.pt.${pt.pointId}`, diamondMd(0.009), mat, node));
          meshes.push(this.mesh(`marker.axis.${pt.pointId}`, tubeAlongPath([[-ax[0] * 0.06, -ax[1] * 0.06, -ax[2] * 0.06], [ax[0] * 0.06, ax[1] * 0.06, ax[2] * 0.06]], 0.0015, { segments: 6 }), mat, node));
          break;
        }
        case "optical_path":
        case "line_reference": {
          const to = pt.geometry.pathTo ?? pt.geometry.position;
          const b: Vec3 = [to[0] - pt.geometry.position[0], to[1] - pt.geometry.position[1], to[2] - pt.geometry.position[2]];
          meshes.push(this.mesh(`marker.pt.${pt.pointId}`, diamondMd(0.009), mat, node));
          meshes.push(this.mesh(`marker.path.${pt.pointId}`, tubeAlongPath([[0, 0, 0], b], 0.0015, { segments: 6, caps: true }), pt.pointKind === "optical_path" ? this.mats.path : mat, node));
          if (pt.pointKind === "optical_path" && pt.geometry.radius) {
            const foot = new Mesh(`marker.foot.${pt.pointId}`, this.scene);
            applyMeshData(foot, discMd(pt.geometry.radius, -0.0005, 0.0005));
            foot.material = this.mats.region;
            foot.parent = node;
            foot.position.set(b[0], b[1], b[2]);
            foot.isPickable = false;
            foot.metadata = { isMarker: true, isOverlay: true };
            meshes.push(foot);
          }
          break;
        }
      }
      this.entries.push({ kind: "point", id: pt.pointId, node, meshes, pointDef: pt, dynamic: !!pt.resolver });
    }
    this.applyVisibility();
  }

  /**
   * Marker parent: the target asset node when the point lives in that asset's frame (so exploded display
   * offsets apply), otherwise the explicit joint node (moving frame), otherwise the instance root.
   */
  private attach(inst: EquipmentInstance, assetId: string, jointId: string | undefined, position: Vec3Tuple): TransformNode {
    const assetNode = inst.assetNodes.get(assetId);
    const comp = inst.components.find((c) => c.assetId === assetId);
    const assetJoint = comp?.jointId;
    const node = new TransformNode(`marker.node.${assetId}.${position.join(",")}`, this.scene);
    let parent: TransformNode = inst.root;
    let origin: Vec3Tuple = [0, 0, 0];
    if (jointId && jointId !== assetJoint && inst.jointNodes.has(jointId)) {
      parent = inst.jointNodes.get(jointId)!;
      origin = inst.jointRestOrigin.get(jointId) ?? [0, 0, 0];
    } else if (assetNode) {
      parent = assetNode;
      origin = assetJoint ? (inst.jointRestOrigin.get(assetJoint) ?? [0, 0, 0]) : [0, 0, 0];
    }
    node.parent = parent;
    node.position.set(position[0] - origin[0], position[1] - origin[1], position[2] - origin[2]);
    return node;
  }

  private mesh(name: string, md: MeshData, mat: PBRMaterial, parent: TransformNode): Mesh {
    const m = new Mesh(name, this.scene);
    applyMeshData(m, md);
    m.material = mat;
    m.parent = parent;
    m.isPickable = false;
    m.receiveShadows = false;
    m.renderingGroupId = 0;
    m.metadata = { isMarker: true, isOverlay: true };
    return m;
  }

  setVisible(visible: boolean, selected: SelectedMeasurement | null): void {
    this.visible = visible;
    this.selected = selected;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    for (const e of this.entries) {
      const sel = this.selected && this.selected.kind === e.kind && this.selected.id === e.id;
      const show = this.visible || !!sel;
      e.node.setEnabled(show);
      if (!show) continue;
      for (const m of e.meshes) {
        if (m.name.startsWith("marker.body.")) m.material = sel ? this.mats.bodySel : this.mats.body;
        else if (m.name.startsWith("marker.pt.") && m.material !== this.mats.candidate) m.material = sel ? this.mats.pointSel : this.mats.point;
        m.scaling.setAll(sel ? 1.6 : 1);
      }
    }
  }

  /** Per-frame: dynamic (resolver) points follow their effect-set pose. */
  update(resolve: (pointId: string) => { world: Vector3; visible: boolean } | null): void {
    if (!this.instance) return;
    for (const e of this.entries) {
      if (!e.dynamic || !e.node.isEnabled()) continue;
      const r = resolve(e.id);
      if (!r) continue;
      for (const m of e.meshes) m.setEnabled(r.visible);
      if (!r.visible) continue;
      const parent = e.node.parent as TransformNode;
      parent.computeWorldMatrix(true);
      const inv = parent.getWorldMatrix().clone().invert();
      e.node.position.copyFrom(Vector3.TransformCoordinates(r.world, inv));
    }
  }

  /** World position of a marker (for camera focus). */
  worldPosition(sel: SelectedMeasurement): Vector3 | null {
    const e = this.entries.find((x) => x.kind === sel.kind && x.id === sel.id);
    if (!e) return null;
    e.node.computeWorldMatrix(true);
    return e.node.getAbsolutePosition().clone();
  }

  private clear(): void {
    for (const e of this.entries) {
      for (const m of e.meshes) m.dispose(false, false);
      e.node.dispose();
    }
    this.entries = [];
  }

  dispose(): void {
    this.clear();
    for (const m of Object.values(this.mats)) m.dispose(true, false);
    this.root.dispose();
  }
}

export type { InstrumentInstallationDef };
