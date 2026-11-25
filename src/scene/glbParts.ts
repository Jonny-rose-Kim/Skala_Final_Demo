/**
 * GLB geometry source: loads a Blender-built equipment GLB and turns its semantic nodes into PartGeometry
 * entries, so imported parts go through the same instance pipeline as the procedural ones (asset nodes,
 * joint rebasing, picking metadata, highlight, Focus bounds, cover / LOD / x-ray / cutaway visibility).
 *
 * Binding is explicit: a mesh becomes a part only when its glTF `extras` carry assetId + partKey AND the
 * manifest (assets/manifests/<templateId>.glb-manifest.json) lists that partKey with the same assetId.
 * Names are never parsed. The template must own the assetId (and the joint, if any).
 *
 * Frame: the glTF loader's __root__ performs the only handedness / up-axis conversion; this adapter bakes
 * each mesh's world matrix (which includes __root__) into instance-frame vertices once (the mirrored
 * glTF winding is then Babylon's clockwise front face) and adds no other rotation or scale. Imported AnimationGroups are stopped and
 * disposed: poses come only from the PreviewState / visual clock.
 *
 * Ownership: the asset container is disposed after the copy; its materials and textures move to the scene
 * and are owned by GlbLibrary (one set per template, shared by that template's instances: highlight uses a
 * layer and x-ray uses cloned variants, so no instance mutates a shared material).
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import type { PartGeometry } from "../geometry/chamberParts";
import { mergeMeshData, type MeshData } from "../geometry/meshlib/types";
import type { EquipmentTemplate, MaterialRef } from "../domain/types";
import type { GlbSourceSpec } from "../domain/glbSource";

export type { GlbManifest, GlbManifestNode, GlbSourceSpec } from "../domain/glbSource";

export type GlbLoadStatus = { state: "ready"; parts: number; triangles: number } | { state: "error"; message: string };

interface Extras {
  assetId?: string;
  partKey?: string;
}

function extrasOf(m: AbstractMesh): Extras | null {
  const md = m.metadata as { gltf?: { extras?: Extras } } | null;
  return md?.gltf?.extras ?? null;
}

/** Copy the mesh's vertex data into the instance frame (world matrix baked, winding fixed for mirrors). */
export function bakeToMeshData(m: AbstractMesh): MeshData {
  m.computeWorldMatrix(true);
  const W = m.getWorldMatrix();
  const pos = m.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const nor = m.getVerticesData(VertexBuffer.NormalKind) ?? [];
  const uv = m.getVerticesData(VertexBuffer.UVKind) ?? [];
  const idx = m.getIndices() ?? [];
  const positions: number[] = new Array(pos.length);
  const normals: number[] = new Array(pos.length);
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.length; i += 3) {
    Vector3.TransformCoordinatesFromFloatsToRef(pos[i], pos[i + 1], pos[i + 2], W, p);
    positions[i] = p.x;
    positions[i + 1] = p.y;
    positions[i + 2] = p.z;
    if (nor.length) {
      Vector3.TransformNormalFromFloatsToRef(nor[i], nor[i + 1], nor[i + 2], W, n);
      n.normalize();
      normals[i] = n.x;
      normals[i + 1] = n.y;
      normals[i + 2] = n.z;
    } else normals[i] = normals[i + 1] = normals[i + 2] = 0;
  }
  // glTF triangles are counter-clockwise in a right-handed frame. The mirror in __root__ (det < 0) turns them
  // clockwise in the left-handed instance frame, which is Babylon's front face there (the loader marks its
  // own meshes ClockWise for the same reason), so the baked winding is kept as is.
  const indices = Array.from(idx);
  const uvs = uv.length ? Array.from(uv) : new Array((pos.length / 3) * 2).fill(0);
  return { positions, normals, uvs, indices };
}

export class GlbLibrary {
  private readonly materials: Material[] = [];
  private readonly textures: BaseTexture[] = [];
  private disposed = false;

  constructor(private readonly scene: Scene) {}

  /**
   * Load one template's GLB and return its parts. Throws on any binding error. If the library is disposed
   * while the request is in flight (scene teardown, renderer fallback), the result is discarded and freed.
   */
  async load(spec: GlbSourceSpec, template: EquipmentTemplate<unknown>): Promise<{ parts: PartGeometry[]; status: GlbLoadStatus }> {
    const container = await LoadAssetContainerAsync(spec.url, this.scene);
    try {
      for (const g of container.animationGroups) g.stop();
      if (this.disposed) throw new Error("cancelled: scene torn down during the GLB load");
      const assets = new Set(template.components.map((c) => c.assetId));
      const joints = new Set(template.joints.map((j) => j.jointId));
      const byKey = new Map(spec.manifest.nodes.map((n) => [n.partKey, n]));
      const seen = new Set<string>();
      const parts: PartGeometry[] = [];
      let triangles = 0;
      for (const mesh of container.meshes) {
        const ex = extrasOf(mesh);
        if (!ex?.partKey) continue;
        const node = byKey.get(ex.partKey);
        if (!node) throw new Error(`${spec.url}: node ${ex.partKey} is not in the manifest`);
        if (node.assetId !== ex.assetId) throw new Error(`${spec.url}: ${ex.partKey} extras assetId ${ex.assetId} != manifest ${node.assetId}`);
        if (!assets.has(node.assetId)) throw new Error(`${spec.url}: ${ex.partKey} -> unknown asset ${node.assetId} of ${template.templateId}`);
        if (node.jointId && !joints.has(node.jointId)) throw new Error(`${spec.url}: ${ex.partKey} -> unknown joint ${node.jointId}`);
        if (seen.has(ex.partKey)) throw new Error(`${spec.url}: duplicate partKey ${ex.partKey}`);
        seen.add(ex.partKey);
        const md = bakeToMeshData(mesh);
        triangles += md.indices.length / 3;
        const mat = mesh.material;
        if (mat && !this.materials.includes(mat)) {
          this.materials.push(mat);
          this.scene.addMaterial(mat);
          for (const t of mat.getActiveTextures()) if (!this.textures.includes(t)) {
            this.textures.push(t);
            this.scene.addTexture(t);
          }
        }
        parts.push({
          key: `glb.${node.partKey}`,
          assetId: node.assetId,
          materialRef: node.materialRef as Exclude<MaterialRef, "none">,
          glbMaterial: mat ?? undefined,
          pickable: node.pickable,
          cutaway: node.cutaway,
          castShadow: node.castShadow,
          isGlass: node.isGlass,
          cover: node.cover,
          lod: node.lod === "fine" ? "fine" : undefined,
          jointId: node.jointId || undefined,
          sectorDependent: false,
          // a copy per call: EquipmentInstance rebases the returned data in place (joint rest origin)
          build: () => mergeMeshData([md]),
        });
      }
      const missing = spec.manifest.nodes.filter((n) => !seen.has(n.partKey)).map((n) => n.partKey);
      if (missing.length) throw new Error(`${spec.url}: manifest nodes missing in the GLB: ${missing.slice(0, 5).join(", ")}`);
      if (this.disposed) throw new Error("cancelled: scene torn down during the GLB load");
      return { parts, status: { state: "ready", parts: parts.length, triangles } };
    } finally {
      // geometry was copied; drop the container's meshes, nodes, skeletons and animations (materials stay)
      for (const g of container.animationGroups) g.dispose();
      for (const m of container.meshes) m.dispose(false, false);
      for (const t of container.transformNodes) t.dispose();
      if (this.disposed) this.dispose();
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const m of this.materials) m.dispose(false, false);
    for (const t of this.textures) t.dispose();
    this.materials.length = 0;
    this.textures.length = 0;
  }
}
