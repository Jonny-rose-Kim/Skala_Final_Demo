/**
 * OHT scene effects: reference-frame overlay (travel 0 m mark, station seating regions and gripper
 * approach points, hoist home). Drawings only; scripted preview values are never observations.
 */
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { chamferedBox, revolveProfile, tubeAlongPath, rectProfile, type Vec3 } from "../../geometry/meshlib";
import { applyMeshData } from "../../geometry/meshlib/toBabylon";
import type { EffectFrameContext, EffectSet } from "../../scene/equipmentInstance";
import type { EffectFactoryContext } from "../../scene/effectsRegistry";
import type { OhtLayout } from "./layout";

export interface OhtStationMarker {
  s: number;
  seatY: number;
  label: string;
}

export function createOhtEffects(ctx: EffectFactoryContext, stations: OhtStationMarker[] = []): EffectSet {
  const { scene, instance } = ctx;
  const L = instance.bundle.layout as OhtLayout;
  const id = instance.def.instanceId;
  const root = new TransformNode(`${id}::rail_frames`, scene);
  root.parent = instance.root;
  const mat = new PBRMaterial(`${id}::rail_frames_mat`, scene);
  mat.unlit = true;
  mat.albedoColor = new Color3(1.0, 0.75, 0.25);
  mat.alpha = 0.5;
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  const meshes: Mesh[] = [];
  const mk = (name: string, md: ReturnType<typeof chamferedBox>) => {
    const m = new Mesh(`${id}::${name}`, scene);
    applyMeshData(m, md);
    m.material = mat;
    m.parent = root;
    m.isPickable = false;
    m.receiveShadows = false;
    m.metadata = { instanceId: id, assetId: "rail_frames_overlay", decorative: true, isOverlay: true };
    meshes.push(m);
    return m;
  };
  // travel reference mark at the rail start
  mk("travel_zero", chamferedBox([0.3, 0.02, 0.02], 0.002, [0, L.rail.bottomY - 0.05, L.rail.z0]));
  // stations: seating region box + vertical approach line up to the retracted gripper bottom
  for (const st of stations) {
    const z = L.rail.z0 + st.s;
    mk(`seat_${st.label}`, chamferedBox([0.36, 0.01, 0.36], 0.001, [0, st.seatY + 0.005, z]));
    const line: Vec3[] = [
      [0, st.seatY + L.foup.seatToFlangeTop + 0.01, z],
      [0, L.hoist.fingerBottomY, z],
    ];
    const m = new Mesh(`${id}::approach_${st.label}`, scene);
    applyMeshData(m, tubeAlongPath(line, 0.004, { segments: 8 }));
    m.material = mat;
    m.parent = root;
    m.isPickable = false;
    m.metadata = { instanceId: id, assetId: "rail_frames_overlay", decorative: true, isOverlay: true };
    meshes.push(m);
    const ring = new Mesh(`${id}::approach_ring_${st.label}`, scene);
    applyMeshData(ring, revolveProfile(rectProfile(0.06, 0.07, L.hoist.fingerBottomY - 0.005, L.hoist.fingerBottomY + 0.005), { segments: 32 }));
    ring.material = mat;
    ring.parent = root;
    ring.position.set(0, 0, z);
    ring.isPickable = false;
    ring.metadata = { instanceId: id, assetId: "rail_frames_overlay", decorative: true, isOverlay: true };
    meshes.push(ring);
  }
  root.setEnabled(false);
  return {
    plasmas: [],
    excludedMeshes: () => meshes,
    update(f: EffectFrameContext) {
      root.setEnabled(f.active && !!f.overlays.railFrames && f.viewMode !== "exploded");
    },
    dispose() {
      for (const m of meshes) m.dispose(false, false);
      mat.dispose(true, false);
      root.dispose();
    },
  };
}
