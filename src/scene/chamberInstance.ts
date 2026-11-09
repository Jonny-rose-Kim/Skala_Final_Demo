/**
 * ChamberInstance: Babylon meshes for one equipment instance built from the procedural parts.
 * Owns per-asset transform nodes (explode offsets), section-cap meshes, cutaway regeneration,
 * per-instance x-ray material swapping and visibility. Shared materials are never mutated here.
 */
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Material } from "@babylonjs/core/Materials/material";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AngularInterval, ChamberLayout } from "../config/geometry";
import { DEG } from "../config/geometry";
import { COMPONENTS, getComponent } from "../domain/ccpChamberTemplate";
import type { EquipmentInstanceDef } from "../domain/types";
import { buildChamberParts, type PartGeometry } from "../geometry/chamberParts";
import { revolveCaps } from "../geometry/meshlib";
import { applyMeshData } from "../geometry/meshlib/toBabylon";
import type { MaterialLibrary } from "../materials/materialLibrary";
import { PlasmaVolume } from "../plasma/plasmaVolume";
import { FULL, isAzimuthRemoved, type ResolvedCutaway } from "../presentation/cutaway";

export interface InstanceMeshMetadata {
  instanceId: string;
  assetId: string;
  decorative: boolean;
  azimuth?: number;
  isCap?: boolean;
  isGlass?: boolean;
  isPlasma?: boolean;
}

/** Assets treated as "shell" (housings) by the x-ray mode. */
export const SHELL_ASSETS = new Set([
  "chamber_body",
  "lid",
  "chamber_liner",
  "slit_valve",
  "exhaust_port",
  "throttle_valve",
  "isolation_valve",
  "foreline",
  "vacuum_pump",
  "matching_network",
  "gas_panel",
  "rf_generator",
  "frame",
  "viewport",
  "pressure_sensor",
]);

interface BuiltPart {
  part: PartGeometry;
  mesh: Mesh;
  cap: Mesh | null;
  baseMaterial: Material;
  capBaseMaterial: Material | null;
}

export class ChamberInstance {
  readonly root: TransformNode;
  readonly assetNodes = new Map<string, TransformNode>();
  readonly meshesByAsset = new Map<string, Mesh[]>();
  readonly allMeshes: Mesh[] = [];
  readonly plasma: PlasmaVolume;
  private readonly built: BuiltPart[] = [];
  private currentKept: AngularInterval[] = FULL;
  private xrayOn = false;
  private cutawayKeyCache = "";

  constructor(
    readonly scene: Scene,
    readonly def: EquipmentInstanceDef,
    readonly layout: ChamberLayout,
    private readonly materials: MaterialLibrary,
    isWebGPU: boolean,
    haloMargin: number,
    shadow?: ShadowGenerator,
  ) {
    this.root = new TransformNode(`${def.instanceId}::root`, scene);
    this.root.position.set(def.position[0], def.position[1], def.position[2]);
    this.root.rotation.y = def.rotationYDeg * DEG;
    this.root.metadata = { instanceId: def.instanceId };

    for (const c of COMPONENTS) {
      const node = new TransformNode(`${def.instanceId}::${c.assetId}`, scene);
      node.parent = this.root;
      node.metadata = { instanceId: def.instanceId, assetId: c.assetId };
      this.assetNodes.set(c.assetId, node);
      this.meshesByAsset.set(c.assetId, []);
    }

    const parts = buildChamberParts(layout);
    for (const part of parts) {
      const node = this.assetNodes.get(part.assetId);
      if (!node) continue;
      const mesh = new Mesh(`${def.instanceId}::${part.assetId}::${part.key}`, scene);
      applyMeshData(mesh, part.build(FULL));
      mesh.parent = node;
      const material = materials.get(part.materialRef);
      mesh.material = material;
      mesh.isPickable = part.pickable;
      mesh.receiveShadows = !part.isGlass;
      const meta: InstanceMeshMetadata = { instanceId: def.instanceId, assetId: part.assetId, decorative: !part.pickable, azimuth: part.azimuth, isGlass: part.isGlass };
      mesh.metadata = meta;
      if (shadow && part.castShadow && !part.isGlass) shadow.addShadowCaster(mesh, false);
      let cap: Mesh | null = null;
      let capMaterial: Material | null = null;
      if (part.capProfile) {
        cap = new Mesh(`${def.instanceId}::${part.assetId}::${part.key}::cap`, scene);
        cap.parent = node;
        capMaterial = part.materialRef === "quartz" ? materials.glass() : materials.sectionCap(part.materialRef);
        cap.material = capMaterial;
        cap.isPickable = part.pickable;
        cap.receiveShadows = true;
        cap.metadata = { ...meta, isCap: true } as InstanceMeshMetadata;
        cap.setEnabled(false);
      }
      this.built.push({ part, mesh, cap, baseMaterial: material, capBaseMaterial: capMaterial });
      this.meshesByAsset.get(part.assetId)!.push(mesh);
      if (cap) this.meshesByAsset.get(part.assetId)!.push(cap);
      this.allMeshes.push(mesh);
      if (cap) this.allMeshes.push(cap);
    }

    this.plasma = new PlasmaVolume(scene, layout, this.assetNodes.get("plasma_volume") ?? this.root, def.instanceId, isWebGPU, haloMargin);
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
        if (p.sectorDependent) applyMeshData(b.mesh, p.build(cut.kept));
        if (b.cap) {
          if (cut.enabled && p.capProfile) {
            applyMeshData(b.cap, revolveCaps(p.capProfile, cut.kept));
            b.cap.setEnabled(true);
          } else {
            b.cap.setEnabled(false);
          }
        }
        b.mesh.setEnabled(true);
      } else if (p.cutaway === "hide-in-sector") {
        const removed = p.azimuth !== undefined && isAzimuthRemoved(p.azimuth, cut);
        b.mesh.setEnabled(!removed);
      }
    }
    this.refreshVisibility();
  }

  private hidden = new Set<string>();
  private isolated: string | null = null;
  private exploded = false;

  applyVisibility(hidden: Set<string>, isolated: string | null, exploded: boolean): void {
    this.hidden = hidden;
    this.isolated = isolated;
    this.exploded = exploded;
    this.refreshVisibility();
  }

  private refreshVisibility(): void {
    for (const [assetId, node] of this.assetNodes) {
      if (assetId === "plasma_volume") continue;
      const comp = getComponent(assetId);
      let visible = !this.hidden.has(assetId);
      if (this.isolated && this.isolated !== assetId) visible = false;
      if (this.exploded && comp && (assetId === "gas_line" || assetId === "rf_strap")) visible = false;
      if (node.isEnabled() !== visible) node.setEnabled(visible);
    }
    for (const b of this.built) {
      if (!b.part.hideWhenExploded) continue;
      const removedBySector = b.part.cutaway === "hide-in-sector" && b.part.azimuth !== undefined && !b.mesh.isEnabled() && !this.exploded;
      if (removedBySector) continue;
      b.mesh.setEnabled(!this.exploded);
    }
  }

  /** Display-only explode offsets; the geometry itself is unchanged. */
  applyExplode(amount: number, enabled: boolean): void {
    const a = enabled ? amount : 0;
    for (const c of COMPONENTS) {
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

  /** Swap shell meshes to transparent per-instance material variants. */
  applyXray(enabled: boolean, opacity: number): void {
    this.xrayOn = enabled;
    for (const b of this.built) {
      if (!SHELL_ASSETS.has(b.part.assetId) || b.part.isGlass) continue;
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

  /** Meshes to highlight for an asset (enabled, non-decorative first; falls back to all). */
  highlightMeshes(assetId: string): Mesh[] {
    const meshes = this.meshesByAsset.get(assetId) ?? [];
    return meshes.filter((m) => m.isEnabled() && m.getTotalVertices() > 0);
  }

  dispose(): void {
    this.plasma.dispose();
    for (const m of this.allMeshes) m.dispose(false, false);
    for (const n of this.assetNodes.values()) n.dispose();
    this.root.dispose();
  }
}
