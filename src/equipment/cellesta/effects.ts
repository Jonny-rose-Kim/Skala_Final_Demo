/**
 * CELLESTA PM-01 effects: liquid film on the wafer, the stream from the active nozzle and a faint atmosphere-
 * control envelope during drying. Colours only distinguish chemical / UPW / IPA (overlay); they are not the
 * real colour, thickness or flow of any liquid, and nothing here is a measurement.
 */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { EffectFrameContext, EffectSet } from "../../scene/equipmentInstance";
import type { EffectFactoryContext } from "../../scene/effectsRegistry";
import type { CellestaLayout } from "./layout";
import { CELLESTA_JOINTS } from "./sequence";

const CHEM = new Color3(0.55, 0.62, 0.95);
const UPW = new Color3(0.82, 0.92, 1.0);
const IPA = new Color3(0.86, 0.96, 0.9);

function overlayMaterial(name: string, scene: EffectFactoryContext["scene"]): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.backFaceCulling = false;
  m.alpha = 0;
  m.emissiveColor = UPW.clone();
  return m;
}

export function createCellestaEffects(ctx: EffectFactoryContext): EffectSet {
  const { scene, instance } = ctx;
  const L = instance.bundle.layout as CellestaLayout;
  const id = instance.def.instanceId;
  const meta = { instanceId: id, isOverlay: true, isPlasma: true };
  const root = instance.root;
  const filmMat = overlayMaterial(`${id}::film_mat`, scene);
  const film = MeshBuilder.CreateDisc(`${id}::liquid_film`, { radius: L.rWafer - 0.002, tessellation: 96, sideOrientation: 2 }, scene);
  film.rotation.x = Math.PI / 2;
  film.position.set(0, L.waferThickness + 0.0008, 0);
  film.parent = instance.assetNodes.get("liquid_film") ?? root;
  film.material = filmMat;
  const streamMat = overlayMaterial(`${id}::stream_mat`, scene);
  const top = L.pm.arm.arm_height - L.pm.arm.nozzle_drop;
  const stream = MeshBuilder.CreateCylinder(`${id}::dispense_stream`, { height: top - L.waferThickness, diameterTop: 0.003, diameterBottom: 0.006, tessellation: 10 }, scene);
  stream.parent = instance.assetNodes.get("dispense_stream") ?? root;
  stream.material = streamMat;
  const atmMat = overlayMaterial(`${id}::atm_mat`, scene);
  atmMat.emissiveColor = new Color3(0.8, 0.88, 0.95);
  const env = MeshBuilder.CreateCylinder(`${id}::atmosphere`, { height: 0.32, diameter: 0.5, tessellation: 48, cap: 0 }, scene);
  env.position.set(0, 0.17, 0);
  env.parent = instance.assetNodes.get("atmosphere_overlay") ?? root;
  env.material = atmMat;
  const meshes: Mesh[] = [film, stream, env];
  for (const m of meshes) {
    m.isPickable = false;
    m.metadata = meta;
    m.setEnabled(false);
  }
  return {
    plasmas: [],
    excludedMeshes: () => meshes,
    update(f: EffectFrameContext) {
      const e = f.preview.effects;
      const show = f.viewMode !== "exploded";
      const chem = e.liquidChem ?? 0;
      const rinse = e.liquidRinse ?? 0;
      const ipa = e.liquidIpa ?? 0;
      const total = chem + rinse + ipa;
      film.setEnabled(show && total > 0.02);
      if (total > 0.02) {
        const c = new Color3((CHEM.r * chem + UPW.r * rinse + IPA.r * ipa) / total, (CHEM.g * chem + UPW.g * rinse + IPA.g * ipa) / total, (CHEM.b * chem + UPW.b * rinse + IPA.b * ipa) / total);
        filmMat.emissiveColor.copyFrom(c);
        filmMat.alpha = Math.min(0.42, 0.12 + 0.3 * Math.min(1, total));
      }
      const disp = String(f.preview.flags.dispensing ?? "");
      const spray = (e.spray ?? 0) > 0.5 && disp !== "";
      stream.setEnabled(show && spray);
      if (spray) {
        const a = f.preview.joints[CELLESTA_JOINTS.arm] ?? 0;
        const [x, z] = L.nozzleAt(a);
        stream.position.set(x, (top + L.waferThickness) / 2, z);
        streamMat.emissiveColor.copyFrom(disp === "chemical" ? CHEM : disp === "ipa" ? IPA : UPW);
        streamMat.alpha = 0.55;
      }
      const atm = e.atmosphere ?? 0;
      env.setEnabled(show && atm > 0.05 && f.active);
      atmMat.alpha = 0.045 * atm;
    },
    dispose() {
      for (const m of meshes) m.dispose();
      filmMat.dispose();
      streamMat.dispose();
      atmMat.dispose();
    },
  };
}
