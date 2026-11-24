/**
 * EquipmentInstance: Babylon meshes for one equipment instance built from a template bundle's procedural
 * parts. Owns per-asset transform nodes (explode offsets), joint nodes (scripted kinematic pose),
 * section-cap meshes, cutaway regeneration, per-instance x-ray material swapping and visibility.
 * Shared materials are never mutated here. Geometry is authored in the instance frame at the rest pose;
 * parts attached to a joint are re-based onto that joint's origin once at build time.
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { PlasmaColorPreset, VisualSettings } from "../presentation/store";
import type { AngularInterval, Vec3Tuple } from "../config/geometry";
import { DEG } from "../config/geometry";
import type { EquipmentBundle } from "../domain/registry";
import type { ComponentDef, EquipmentInstanceDef, JointDef } from "../domain/types";
import type { PartGeometry } from "../geometry/chamberParts";
import { revolveCaps, translateMeshData, type MeshData } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import type { MaterialLibrary } from "../materials/materialLibrary";
import type { PlasmaVolume } from "../plasma/plasmaVolume";
import { FULL, isAzimuthRemoved, type ResolvedCutaway } from "../presentation/cutaway";
import type { InstancePreview } from "../presentation/preview";

export interface InstanceMeshMetadata {
  instanceId: string;
  assetId: string;
  templateId?: string;
  decorative: boolean;
  azimuth?: number;
  isCap?: boolean;
  isGlass?: boolean;
  isPlasma?: boolean;
  isOverlay?: boolean;
  isMarker?: boolean;
}

/** Scene-side effects of one instance (plasma volumes, overlays). Created by the effects registry. */
export interface EffectSet {
  /** Primary plasma volume when the template has one (CCP / Remote source). */
  plasma?: PlasmaVolume;
  /** All plasma volumes (primary + afterglow etc.). */
  plasmas: PlasmaVolume[];
  /** Meshes that must be excluded from the highlight stencil. */
  excludedMeshes(): Mesh[];
  /** Per-frame update from the preview state and the shared visual settings. */
  update(ctx: EffectFrameContext): void;
  /** World pose of a resolver-driven measurement point (e.g. the CMP optical footprint), if this set owns it. */
  pointPose?(pointId: string): { world: Vector3; visible: boolean } | null;
  dispose(): void;
}

export interface EffectFrameContext {
  preview: InstancePreview;
  active: boolean;
  viewMode: "assembled" | "cutaway" | "xray" | "exploded";
  overlays: Record<string, boolean>;
  /** Effect time (presentation time plus hold offset, scaled by animation speed). */
  effectTime: number;
  cut: ResolvedCutaway;
  plasmaSteps: number;
  camera: Camera;
  visual: VisualSettings;
  color: PlasmaColorPreset;
  debugDepth: boolean;
  flipDepthY: boolean;
}

interface BuiltPart {
  part: PartGeometry;
  mesh: Mesh;
  cap: Mesh | null;
  baseMaterial: Material;
  capBaseMaterial: Material | null;
  /** Translation applied to authored coordinates (joint re-base + axis offset for sector parts). */
  rebase: Vec3Tuple;
  stretchAnchor: Vec3Tuple | null;
  /** Removed by the cutaway sector (hide-in-sector parts). */
  sectorRemoved: boolean;
  /** Clipped part with nothing left inside the kept sector. */
  empty: boolean;
  /** Section cap built for the current cutaway (shown together with its part). */
  capActive: boolean;
}

function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export class EquipmentInstance {
  readonly root: TransformNode;
  readonly jointNodes = new Map<string, TransformNode>();
  readonly assetNodes = new Map<string, TransformNode>();
  readonly meshesByAsset = new Map<string, Mesh[]>();
  readonly allMeshes: Mesh[] = [];
  readonly templateId: string;
  readonly components: ComponentDef<unknown>[];
  readonly joints: JointDef[];
  /** Cumulative joint origin in the instance frame at the rest pose. */
  readonly jointRestOrigin = new Map<string, Vec3Tuple>();
  effects: EffectSet | null = null;
  jointValues: Record<string, number> = {};
  private readonly built: BuiltPart[] = [];
  private currentKept: AngularInterval[] = FULL;
  private xrayOn = false;
  private cutawayKeyCache = "";
  private readonly shellAssets: Set<string>;
  private readonly hiddenWhenExploded: Set<string>;
  private hidden = new Set<string>();
  private previewHidden = new Set<string>();
  private isolated: string | null = null;
  private exploded = false;
  private frozenJoints: Record<string, number> | null = null;
  /** Last value written to each joint node (revolute / prismatic). */
  private readonly appliedJoints = new Map<string, number>();
  /** Inspection: removable cover panels hidden (display only; never a scripted door state). */
  private coversRemoved = false;
  /** Distance LOD: fine details (fasteners, labels, cable ties) shown. */
  private fineVisible = true;
  /** Presence keys currently presented (e.g. occupied carrier slots); keyed parts outside it stay hidden. */
  private presentKeys = new Set<string>();
  private readonly waferUvCenter = new Map<string, [number, number]>();
  private waferSurface: Material | null = null;
  readonly hasCovers: boolean;

  constructor(
    readonly scene: Scene,
    readonly def: EquipmentInstanceDef,
    readonly bundle: EquipmentBundle<unknown>,
    private readonly materials: MaterialLibrary,
    shadow?: ShadowGenerator,
    /** Parts from the bundle's GLB source (already validated against the template). */
    extraParts: PartGeometry[] = [],
  ) {
    const template = bundle.template;
    this.templateId = template.templateId;
    this.components = template.components;
    this.joints = template.joints;
    this.shellAssets = new Set(template.components.filter((c) => c.shell).map((c) => c.assetId));
    // connection-like parts that read badly when displaced: hidden in the exploded view
    this.hiddenWhenExploded = new Set(template.components.filter((c) => c.assetId === "gas_line" || c.assetId === "rf_strap" || c.assetId === "precursor_line" || c.assetId === "source_gas_line" || c.assetId === "slurry_line").map((c) => c.assetId));

    this.root = new TransformNode(`${def.instanceId}::root`, scene);
    this.root.position.set(def.position[0], def.position[1], def.position[2]);
    this.root.rotation.y = def.rotationYDeg * DEG;
    this.root.metadata = { instanceId: def.instanceId, templateId: template.templateId };

    // joint tree (parents before children)
    const pending = template.joints.slice();
    let guard = 0;
    while (pending.length && guard++ < 1000) {
      const j = pending.shift()!;
      if (j.parentJointId && !this.jointNodes.has(j.parentJointId)) {
        pending.push(j);
        continue;
      }
      const node = new TransformNode(`${def.instanceId}::joint::${j.jointId}`, scene);
      node.parent = j.parentJointId ? this.jointNodes.get(j.parentJointId)! : this.root;
      node.position.set(j.origin[0], j.origin[1], j.origin[2]);
      node.rotationQuaternion = Quaternion.Identity();
      node.metadata = { instanceId: def.instanceId, jointId: j.jointId };
      this.jointNodes.set(j.jointId, node);
      const parentOrigin = j.parentJointId ? this.jointRestOrigin.get(j.parentJointId)! : ([0, 0, 0] as Vec3Tuple);
      this.jointRestOrigin.set(j.jointId, add(parentOrigin, j.origin));
    }

    for (const c of template.components) {
      const node = new TransformNode(`${def.instanceId}::${c.assetId}`, scene);
      node.parent = c.jointId ? (this.jointNodes.get(c.jointId) ?? this.root) : this.root;
      node.metadata = { instanceId: def.instanceId, assetId: c.assetId };
      this.assetNodes.set(c.assetId, node);
      this.meshesByAsset.set(c.assetId, []);
    }

    const componentById = new Map(template.components.map((c) => [c.assetId, c]));
    const parts = [...bundle.buildParts(bundle.layout), ...extraParts];
    for (const part of parts) {
      const node = this.assetNodes.get(part.assetId);
      if (!node) continue;
      const comp = componentById.get(part.assetId)!;
      const jointId = part.jointId ?? comp.jointId;
      const restOrigin = jointId ? (this.jointRestOrigin.get(jointId) ?? [0, 0, 0]) : ([0, 0, 0] as Vec3Tuple);
      const axis = part.cutaway === "sector" ? (part.axisXZ ?? comp.axisXZ ?? [0, 0]) : [0, 0];
      const rebase: Vec3Tuple = [axis[0] - restOrigin[0], -restOrigin[1], axis[1] - restOrigin[2]];
      let stretchAnchor: Vec3Tuple | null = null;
      if (part.stretch) {
        const so = part.stretch.anchor ?? this.jointRestOrigin.get(part.stretch.jointId) ?? [0, 0, 0];
        stretchAnchor = [so[0] - restOrigin[0], so[1] - restOrigin[1], so[2] - restOrigin[2]];
      }
      const mesh = new Mesh(`${def.instanceId}::${part.assetId}::${part.key}`, scene);
      applyMeshData(mesh, this.rebased(part.build(FULL), part, rebase, stretchAnchor));
      mesh.parent = node;
      if (stretchAnchor) mesh.position.set(stretchAnchor[0], stretchAnchor[1], stretchAnchor[2]);
      const material = (part.glbMaterial as Material | undefined) ?? materials.get(part.materialRef);
      mesh.material = material;
      mesh.isPickable = part.pickable;
      mesh.receiveShadows = !part.isGlass;
      const meta: InstanceMeshMetadata = { instanceId: def.instanceId, assetId: part.assetId, templateId: template.templateId, decorative: !part.pickable, azimuth: part.azimuth, isGlass: part.isGlass };
      mesh.metadata = meta;
      if (shadow && part.castShadow && !part.isGlass) shadow.addShadowCaster(mesh, false);
      let cap: Mesh | null = null;
      let capMaterial: Material | null = null;
      if (part.capProfile || part.capBuild) {
        cap = new Mesh(`${def.instanceId}::${part.assetId}::${part.key}::cap`, scene);
        cap.parent = node;
        capMaterial = part.materialRef === "quartz" ? materials.glass() : materials.sectionCap(part.materialRef);
        cap.material = capMaterial;
        cap.isPickable = part.pickable;
        cap.receiveShadows = true;
        cap.metadata = { ...meta, isCap: true } as InstanceMeshMetadata;
        cap.setEnabled(false);
        // caps are rebased like the mesh, so a stretch part's cap sits on the same anchor and scales with it
        if (stretchAnchor) cap.position.set(stretchAnchor[0], stretchAnchor[1], stretchAnchor[2]);
      }
      this.built.push({ part, mesh, cap, baseMaterial: material, capBaseMaterial: capMaterial, rebase, stretchAnchor, sectorRemoved: false, empty: false, capActive: false });
      this.meshesByAsset.get(part.assetId)!.push(mesh);
      if (cap) this.meshesByAsset.get(part.assetId)!.push(cap);
      this.allMeshes.push(mesh);
      if (cap) this.allMeshes.push(cap);
    }
    this.hasCovers = this.built.some((b) => b.part.cover);
  }

  private rebased(md: MeshData, part: PartGeometry, rebase: Vec3Tuple, stretchAnchor: Vec3Tuple | null): MeshData {
    const needs = part.cutaway === "sector" ? true : rebase[0] !== 0 || rebase[1] !== 0 || rebase[2] !== 0;
    if (needs) translateMeshData(md, rebase[0], rebase[1], rebase[2]);
    if (stretchAnchor) translateMeshData(md, -stretchAnchor[0], -stretchAnchor[1], -stretchAnchor[2]);
    if (part.materialRef === "wafer_front") this.planarWaferUv(md, `${part.assetId}::${part.key}`);
    return md;
  }

  /**
   * Wafer front faces get planar UVs over the 300 mm disc (u, v in 0..1 across the wafer) so the film-state
   * pattern maps flat. The centre is taken once from the full (uncut) mesh and reused for sector rebuilds.
   */
  private planarWaferUv(md: MeshData, key: string): void {
    let c = this.waferUvCenter.get(key);
    if (!c) {
      let sx = 0;
      let sz = 0;
      const n = md.positions.length / 3;
      for (let i = 0; i < md.positions.length; i += 3) {
        sx += md.positions[i];
        sz += md.positions[i + 2];
      }
      c = [sx / Math.max(1, n), sz / Math.max(1, n)];
      this.waferUvCenter.set(key, c);
    }
    const uvs: number[] = new Array((md.positions.length / 3) * 2);
    for (let i = 0, j = 0; i < md.positions.length; i += 3, j += 2) {
      uvs[j] = (md.positions[i] - c[0]) / 0.3 + 0.5;
      uvs[j + 1] = (md.positions[i + 2] - c[1]) / 0.3 + 0.5;
    }
    md.uvs = uvs;
  }

  /** Film-state material of the wafer front faces (null restores the library material). */
  setWaferSurface(material: Material | null): void {
    if (material === this.waferSurface) return;
    this.waferSurface = material;
    for (const b of this.built) if (b.part.materialRef === "wafer_front") b.mesh.material = material ?? b.baseMaterial;
  }

  /** Primary plasma volume (CCP / Remote); undefined for templates without one. */
  get plasma(): PlasmaVolume | undefined {
    return this.effects?.plasma;
  }

  /** Regenerate sector geometry and hide azimuth-attached parts for the resolved cutaway. */
  applyCutaway(cut: ResolvedCutaway): void {
    const key = cut.enabled && cut.removed ? `${cut.removed.start.toFixed(5)}:${cut.removed.sweep.toFixed(5)}` : "full";
    if (key === this.cutawayKeyCache) return;
    this.cutawayKeyCache = key;
    this.currentKept = cut.kept;
    for (const b of this.built) {
      const p = b.part;
      if (p.cutaway === "sector") {
        if (p.sectorDependent) {
          const md = this.rebased(p.build(cut.kept), p, b.rebase, b.stretchAnchor);
          // a clipped part can lie completely inside the removed sector: keep its last mesh, disabled
          b.empty = md.indices.length === 0;
          if (!b.empty) applyMeshData(b.mesh, md);
        }
        b.capActive = false;
        if (b.cap && cut.enabled && (p.capBuild || p.capProfile)) {
          const md = this.rebased(p.capBuild ? p.capBuild(cut.kept) : revolveCaps(p.capProfile!, cut.kept), p, b.rebase, b.stretchAnchor);
          if (md.indices.length > 0) {
            applyMeshData(b.cap, md);
            b.capActive = true;
          }
        }
      } else if (p.cutaway === "hide-in-sector") {
        b.sectorRemoved = p.azimuth !== undefined && isAzimuthRemoved(p.azimuth, cut);
      }
    }
    this.refreshVisibility();
  }

  applyVisibility(hidden: Set<string>, isolated: string | null, exploded: boolean): void {
    this.hidden = hidden;
    this.isolated = isolated;
    this.exploded = exploded;
    this.refreshVisibility();
  }

  /** Presence-keyed parts to show (e.g. the occupied slots of a carrier); every other keyed part is hidden. */
  setPresentKeys(keys: Set<string>): void {
    let same = keys.size === this.presentKeys.size;
    if (same) for (const k of keys) if (!this.presentKeys.has(k)) { same = false; break; }
    if (same) return;
    this.presentKeys = keys;
    this.refreshVisibility();
  }

  /** Preview-driven visibility (e.g. wafer presentation asset shown only while a wafer is presented). */
  setPreviewHidden(assetIds: Set<string>): void {
    let same = assetIds.size === this.previewHidden.size;
    if (same) for (const a of assetIds) if (!this.previewHidden.has(a)) { same = false; break; }
    if (same) return;
    this.previewHidden = assetIds;
    this.refreshVisibility();
  }

  private refreshVisibility(): void {
    for (const [assetId, node] of this.assetNodes) {
      if (assetId === "plasma_volume" || assetId === "source_plasma_volume") continue;
      let visible = !this.hidden.has(assetId) && !this.previewHidden.has(assetId);
      if (this.isolated && this.isolated !== assetId) visible = false;
      if (this.exploded && this.hiddenWhenExploded.has(assetId)) visible = false;
      if (node.isEnabled() !== visible) node.setEnabled(visible);
    }
    for (const b of this.built) {
      const p = b.part;
      let on = !b.sectorRemoved && !b.empty;
      if (p.hideWhenExploded && this.exploded) on = false;
      if (p.cover && this.coversRemoved) on = false;
      if (p.lod === "fine" && !this.fineVisible) on = false;
      if (p.presenceKey && !this.presentKeys.has(p.presenceKey)) on = false;
      if (b.mesh.isEnabled() !== on) b.mesh.setEnabled(on);
      // a section cap belongs to its part: hidden with it (covers, LOD, empty slots)
      const capOn = on && b.capActive;
      if (b.cap && b.cap.isEnabled() !== capOn) b.cap.setEnabled(capOn);
    }
  }

  /** Inspection cover removal (display only): hides parts flagged as removable covers. */
  setCoversRemoved(removed: boolean): void {
    if (removed === this.coversRemoved) return;
    this.coversRemoved = removed;
    this.refreshVisibility();
  }

  get coversAreRemoved(): boolean {
    return this.coversRemoved;
  }

  /** Distance LOD for fine details; geometry is never regenerated. */
  setFineDetailVisible(visible: boolean): void {
    if (visible === this.fineVisible) return;
    this.fineVisible = visible;
    this.refreshVisibility();
  }

  get fineDetailVisible(): boolean {
    return this.fineVisible;
  }

  /** World positions of the path joints (a vehicle on its rail); distance LOD measures from them as well. */
  pathJointPositions(): Vector3[] {
    const out: Vector3[] = [];
    for (const j of this.joints) {
      if (j.kind !== "path") continue;
      const node = this.jointNodes.get(j.jointId);
      if (node) out.push(node.getAbsolutePosition());
    }
    return out;
  }

  /** Display-only explode offsets; the geometry itself is unchanged. Joint poses freeze while exploded. */
  applyExplode(amount: number, enabled: boolean): void {
    const a = enabled ? amount : 0;
    if (enabled && !this.frozenJoints) this.frozenJoints = { ...this.jointValues };
    if (!enabled) this.frozenJoints = null;
    for (const c of this.components) {
      const node = this.assetNodes.get(c.assetId);
      if (!node) continue;
      if (a <= 0 || c.explode.distance <= 0) {
        node.position.set(0, 0, 0);
        continue;
      }
      let dir: Vector3;
      if (c.explode.dir === "radial") {
        const az = (c.azimuthDeg ?? 0) * DEG;
        dir = new Vector3(Math.cos(az), 0, Math.sin(az));
      } else dir = new Vector3(c.explode.dir[0], c.explode.dir[1], c.explode.dir[2]);
      node.position.copyFrom(dir.scale(c.explode.distance * a));
    }
  }

  /**
   * Apply scripted joint values (rad / m) to the joint nodes. Path joints are positioned by the caller
   * through `setPathPose`. While exploded, the pose at entry stays frozen so the display offsets stay readable.
   */
  applyJoints(values: Record<string, number>): void {
    const use = this.frozenJoints ?? values;
    this.jointValues = values;
    for (const j of this.joints) {
      const node = this.jointNodes.get(j.jointId);
      if (!node) continue;
      const v = use[j.jointId] ?? 0;
      // writing a node transform marks its subtree dirty even for the same value: skip joints that did not move
      if (this.appliedJoints.get(j.jointId) === v) continue;
      this.appliedJoints.set(j.jointId, v);
      if (j.kind === "revolute") {
        Quaternion.RotationAxisToRef(new Vector3(j.axis[0], j.axis[1], j.axis[2]), v, node.rotationQuaternion!);
        node.position.set(j.origin[0], j.origin[1], j.origin[2]);
      } else if (j.kind === "prismatic") {
        node.position.set(j.origin[0] + j.axis[0] * v, j.origin[1] + j.axis[1] * v, j.origin[2] + j.axis[2] * v);
      }
    }
    for (const b of this.built) {
      if (!b.part.stretch) continue;
      const ext = use[b.part.stretch.jointId] ?? 0;
      const k = Math.max(0.001, (b.part.stretch.baseLength + (b.part.stretch.sign ?? 1) * ext) / b.part.stretch.baseLength);
      if (Math.abs(b.mesh.scaling.y - k) > 1e-6) {
        b.mesh.scaling.y = k;
        if (b.cap) b.cap.scaling.y = k;
      }
    }
  }

  /** Pose of a path joint (vehicle on a rail): position in the parent frame and yaw about +Y. */
  setPathPose(jointId: string, position: Vec3Tuple, yawRad: number): void {
    const node = this.jointNodes.get(jointId);
    if (!node) return;
    if (this.frozenJoints) return;
    node.position.set(position[0], position[1], position[2]);
    Quaternion.RotationAxisToRef(Vector3.Up(), yawRad, node.rotationQuaternion!);
  }

  /** Swap shell meshes to transparent per-instance material variants. */
  applyXray(enabled: boolean, opacity: number): void {
    this.xrayOn = enabled;
    for (const b of this.built) {
      if (!this.shellAssets.has(b.part.assetId) || b.part.isGlass || b.part.alwaysOpaque) continue;
      if (enabled) {
        b.mesh.material = this.materials.xrayVariant(b.baseMaterial as PBRMaterial, opacity);
        if (b.cap && b.capBaseMaterial) b.cap.material = this.materials.xrayVariant(b.capBaseMaterial as PBRMaterial, opacity);
      } else {
        b.mesh.material = b.baseMaterial;
        if (b.cap && b.capBaseMaterial) b.cap.material = b.capBaseMaterial;
      }
    }
    if (enabled) this.materials.setXrayOpacity(opacity);
  }

  get isXray(): boolean {
    return this.xrayOn;
  }

  get kept(): AngularInterval[] {
    return this.currentKept;
  }

  /** World-space position of a point authored in the instance frame at rest, following a joint if given. */
  worldPoint(local: Vec3Tuple, jointId?: string, assetId?: string): Vector3 {
    let node: TransformNode = this.root;
    let p = new Vector3(local[0], local[1], local[2]);
    if (assetId && this.assetNodes.has(assetId)) {
      node = this.assetNodes.get(assetId)!;
      const comp = this.components.find((c) => c.assetId === assetId);
      jointId = jointId ?? comp?.jointId;
      if (jointId) {
        const o = this.jointRestOrigin.get(jointId) ?? [0, 0, 0];
        p = new Vector3(local[0] - o[0], local[1] - o[1], local[2] - o[2]);
      }
    } else if (jointId && this.jointNodes.has(jointId)) {
      node = this.jointNodes.get(jointId)!;
      const o = this.jointRestOrigin.get(jointId) ?? [0, 0, 0];
      p = new Vector3(local[0] - o[0], local[1] - o[1], local[2] - o[2]);
    }
    node.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(p, node.getWorldMatrix());
  }

  /** World-space bounding center of an asset's enabled meshes (for labels and camera focus). */
  worldBounds(assetId: string): { min: Vector3; max: Vector3; center: Vector3 } | null {
    const meshes = this.meshesByAsset.get(assetId);
    if (!meshes || !meshes.length) return null;
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    let any = false;
    for (const m of meshes) {
      if (!m.isEnabled() || m.getTotalVertices() === 0) continue;
      m.computeWorldMatrix(true);
      const bi = m.getBoundingInfo();
      bi.update(m.getWorldMatrix());
      min.minimizeInPlace(bi.boundingBox.minimumWorld);
      max.maximizeInPlace(bi.boundingBox.maximumWorld);
      any = true;
    }
    if (!any) return null;
    return { min, max, center: min.add(max).scale(0.5) };
  }

  /** World bounds of the whole instance (enabled meshes). */
  worldBoundsAll(): { min: Vector3; max: Vector3; center: Vector3 } | null {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    let any = false;
    for (const m of this.allMeshes) {
      if (!m.isEnabled() || m.getTotalVertices() === 0) continue;
      m.computeWorldMatrix(true);
      const bi = m.getBoundingInfo();
      bi.update(m.getWorldMatrix());
      min.minimizeInPlace(bi.boundingBox.minimumWorld);
      max.maximizeInPlace(bi.boundingBox.maximumWorld);
      any = true;
    }
    if (!any) return null;
    return { min, max, center: min.add(max).scale(0.5) };
  }

  /** Meshes to highlight for an asset (enabled, non-decorative first; falls back to all). */
  highlightMeshes(assetId: string): Mesh[] {
    const meshes = this.meshesByAsset.get(assetId) ?? [];
    return meshes.filter((m) => m.isEnabled() && m.getTotalVertices() > 0);
  }

  dispose(): void {
    this.effects?.dispose();
    this.effects = null;
    for (const m of this.allMeshes) m.dispose(false, false);
    for (const n of this.assetNodes.values()) n.dispose();
    for (const n of this.jointNodes.values()) n.dispose();
    this.root.dispose();
  }
}
