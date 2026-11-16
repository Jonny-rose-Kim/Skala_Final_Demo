/**
 * CMP scene effects: slurry stream + film on the pad, optical endpoint path / footprint (only while the
 * pad window is under the wafer), rinse spray in the clean module. Drawings, not fluid or optics physics.
 */
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { rectProfile, revolveProfile, tubeAlongPath, type Vec3 } from "../../geometry/meshlib";
import { applyMeshData } from "../../geometry/meshlib/toBabylon";
import { SchematicPathOverlay } from "../../interaction/gasPathOverlay";
import type { EffectFrameContext, EffectSet } from "../../scene/equipmentInstance";
import type { EffectFactoryContext } from "../../scene/effectsRegistry";
import { opticalFootprint, type CmpLayout } from "./layout";
import { CMP_OPTICAL_POINT_ID } from "./measurement";

export function createCmpEffects(ctx: EffectFactoryContext): EffectSet {
  const { scene, instance } = ctx;
  const L = instance.bundle.layout as CmpLayout;
  const id = instance.def.instanceId;
  const root = new TransformNode(`${id}::cmp_effects`, scene);
  root.parent = instance.root;
  const mats: PBRMaterial[] = [];
  const mkMat = (name: string, color: Color3, alpha: number) => {
    const m = new PBRMaterial(`${id}::${name}`, scene);
    m.unlit = true;
    m.albedoColor = color;
    m.alpha = alpha;
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    m.backFaceCulling = false;
    m.disableDepthWrite = true;
    mats.push(m);
    return m;
  };
  const slurryMat = mkMat("slurry_mat", new Color3(0.78, 0.86, 0.95), 0.55);
  const filmMat = mkMat("slurry_film_mat", new Color3(0.8, 0.88, 0.96), 0.28);
  const rinseMat = mkMat("rinse_mat", new Color3(0.7, 0.9, 1.0), 0.4);
  const meta = { instanceId: id, assetId: "slurry_overlay", decorative: true, isOverlay: true };
  const mk = (name: string, parent: TransformNode) => {
    const m = new Mesh(`${id}::${name}`, scene);
    m.material = slurryMat;
    m.parent = parent;
    m.isPickable = false;
    m.receiveShadows = false;
    m.metadata = { ...meta };
    return m;
  };
  // stream from the nozzle tip to the pad top (thin tube)
  const tip = L.slurry.nozzleTip;
  const stream = mk("slurry_stream", root);
  applyMeshData(stream, tubeAlongPath([[tip[0], tip[1], tip[2]], [tip[0], L.padTopY + 0.0005, tip[2]]], 0.0035, { segments: 10 }));
  // film disc on the pad (follows the platen frame so it spins with it)
  const platenNode = instance.jointNodes.get("platen_spin") ?? instance.root;
  const platenOrigin = instance.jointRestOrigin.get("platen_spin") ?? [0, 0, 0];
  const film = mk("slurry_film", platenNode);
  applyMeshData(film, revolveProfile(rectProfile(L.platen.rHub + 0.01, L.pad.r - 0.004, L.padTopY + 0.0003 - platenOrigin[1], L.padTopY + 0.0009 - platenOrigin[1]), { segments: 128 }));
  film.material = filmMat;
  film.alphaIndex = 3;
  // puddle under the nozzle (slightly thicker ring, in the instance frame since the nozzle is fixed)
  const puddle = mk("slurry_puddle", root);
  applyMeshData(puddle, revolveProfile(rectProfile(0, 0.05, L.padTopY + 0.001, L.padTopY + 0.0016), { segments: 48 }));
  puddle.position.set(tip[0], 0, tip[2]);
  // slurry supply arrows along the line
  const arrows = new SchematicPathOverlay(scene, instance.root, [{ id: "slurry_feed", color: new Color3(0.78, 0.86, 0.95), arrows: 5, speed: 0.15, radius: 0.0012, points: [[L.slurry.panel[0] - 0.07, L.slurry.panel[1], L.slurry.panel[2]], [L.slurry.flowMeter[0] + 0.03, L.slurry.panel[1], L.slurry.panel[2]], [L.slurry.flowMeter[0] - 0.03, L.slurry.flowMeter[1], L.slurry.flowMeter[2]], [L.slurry.post[0] + 0.02, L.slurry.flowMeter[1], L.slurry.flowMeter[2]], [L.slurry.post[0], L.slurry.armY, L.slurry.post[2]], [tip[0], L.slurry.armY, tip[2]]] }], id, "slurry_arrows");
  // optical path: vertical segment from the optical head up to the wafer front, plus a footprint disc; positioned per frame
  const optNode = new TransformNode(`${id}::optical_path_node`, scene);
  optNode.parent = instance.root;
  const optMat = mkMat("optical_mat", new Color3(0.4, 1.0, 0.6), 0.9);
  const optLine = mk("optical_line", optNode);
  optLine.material = optMat;
  optLine.metadata = { instanceId: id, assetId: "optical_path_overlay", decorative: true, isOverlay: true };
  const headTop = L.endpoint.opticalHeadLocal[1] + L.cfg.endpoint.head_size[1] / 2;
  applyMeshData(optLine, tubeAlongPath([[0, headTop, 0], [0, L.padTopY + 0.0008, 0]], 0.0025, { segments: 8 }));
  const footprint = mk("optical_footprint", optNode);
  footprint.material = optMat;
  footprint.metadata = { instanceId: id, assetId: "optical_path_overlay", decorative: true, isOverlay: true };
  applyMeshData(footprint, revolveProfile(rectProfile(0, L.pad.window.widT / 2, L.padTopY + 0.0012, L.padTopY + 0.0018), { segments: 32 }));
  // rinse spray cone in the clean module
  const rinse = mk("rinse_spray", root);
  rinse.material = rinseMat;
  const cm = L.clean;
  const sprayPath: Vec3[] = [
    [cm.center[0] + 0.1, cm.baseY + cm.size[1] - 0.03, cm.center[2]],
    [cm.center[0] + 0.1, cm.waferY + 0.04, cm.center[2]],
  ];
  applyMeshData(rinse, tubeAlongPath(sprayPath, 0.012, { segments: 12 }));
  let lastPose = { world: new Vector3(), visible: false };
  const set = {
    plasmas: [],
    excludedMeshes: () => [stream, film, puddle, optLine, footprint, rinse, ...(arrows.root.getChildMeshes() as Mesh[])],
    update(f: EffectFrameContext) {
      const slurryFlow = f.preview.effects.slurryFlow ?? 0;
      const padWet = f.preview.effects.padWet ?? 0;
      const rinseFlow = f.preview.effects.rinseFlow ?? 0;
      const showOverlay = f.active && f.viewMode !== "exploded";
      const slurryOn = !!f.overlays.slurry && showOverlay;
      stream.setEnabled(slurryOn && slurryFlow > 0.02);
      stream.scaling.x = stream.scaling.z = 0.6 + 0.4 * slurryFlow;
      puddle.setEnabled(slurryOn && slurryFlow > 0.02);
      film.setEnabled(slurryOn && padWet > 0.02);
      filmMat.alpha = 0.3 * padWet;
      arrows.setVisible(slurryOn && slurryFlow > 0.02);
      arrows.flow = slurryFlow;
      arrows.update(f.effectTime);
      rinse.setEnabled(showOverlay && rinseFlow > 0.02 && !!f.overlays.slurry);
      // optical footprint: window position in the instance frame from the scripted platen angle
      const fp = opticalFootprint(L, f.preview.joints.platen_spin ?? 0, f.preview.joints.head_lateral ?? 0, f.preview.joints.head_lift ?? 0);
      optNode.position.set(fp.windowXZ.x, 0, fp.windowXZ.z);
      const optOn = showOverlay && !!f.overlays.opticalPath && fp.inView;
      optNode.setEnabled(optOn);
      instance.root.computeWorldMatrix(true);
      lastPose = { world: Vector3.TransformCoordinates(new Vector3(fp.windowXZ.x, L.padTopY + 0.0015, fp.windowXZ.z), instance.root.getWorldMatrix()), visible: fp.inView };
    },
    pointPose(pointId: string) {
      if (pointId !== CMP_OPTICAL_POINT_ID) return null;
      return lastPose;
    },
    dispose() {
      arrows.dispose();
      for (const m of [stream, film, puddle, optLine, footprint, rinse]) m.dispose(false, false);
      for (const m of mats) m.dispose(true, false);
      optNode.dispose();
      root.dispose();
    },
  };
  return set;
}
