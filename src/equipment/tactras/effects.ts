/**
 * Tactras PM-01 scene effects: the illustrative glow confined to the gap between the ESC and the upper
 * electrode (same ray-marched volume as the CCP cell, its own bounds) and explanatory ion-direction arrows
 * from the glow toward the wafer during the main etch. Neither is a computed field, flux or energy.
 */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PlasmaVolume } from "../../plasma/plasmaVolume";
import type { EffectFrameContext, EffectSet } from "../../scene/equipmentInstance";
import type { EffectFactoryContext } from "../../scene/effectsRegistry";
import type { TactrasLayout } from "./layout";

export function createTactrasEffects(ctx: EffectFactoryContext): EffectSet {
  const { scene, instance, isWebGPU, visual } = ctx;
  const L = instance.bundle.layout as TactrasLayout;
  const id = instance.def.instanceId;
  const plasma = new PlasmaVolume(scene, L.plasma, instance.assetNodes.get("plasma_volume") ?? instance.root, id, isWebGPU, visual.haloMargin);
  // ion-direction arrows: thin shafts + cones on a ring above the wafer, pointing down (explanatory)
  const root = new TransformNode(`${id}::ion_arrows`, scene);
  root.parent = instance.assetNodes.get("ion_flux_overlay") ?? instance.root;
  const mat = new StandardMaterial(`${id}::ion_arrow_mat`, scene);
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(0.55, 0.62, 1.0);
  mat.alpha = 0.55;
  const arrows: Mesh[] = [];
  const yTop = L.plasma.topY - 0.012;
  const yTip = 0.006;
  for (const [r, n] of [[0, 1], [0.06, 6], [0.11, 10]] as [number, number][]) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r * 7;
      const x = r * Math.cos(a);
      const z = r * Math.sin(a);
      const shaft = MeshBuilder.CreateCylinder(`${id}::ion_shaft_${r}_${k}`, { height: yTop - yTip - 0.01, diameter: 0.0016, tessellation: 6 }, scene);
      shaft.position.set(x, (yTop + yTip + 0.01) / 2, z);
      const head = MeshBuilder.CreateCylinder(`${id}::ion_head_${r}_${k}`, { height: 0.01, diameterTop: 0, diameterBottom: 0.006, tessellation: 8 }, scene);
      head.rotation.x = Math.PI;
      head.position.set(x, yTip + 0.005, z);
      for (const m of [shaft, head]) {
        m.parent = root;
        m.material = mat;
        m.isPickable = false;
        m.metadata = { instanceId: id, isOverlay: true, isPlasma: true };
        arrows.push(m);
      }
    }
  }
  root.setEnabled(false);
  let haloMargin = visual.haloMargin;
  return {
    plasma,
    plasmas: [plasma],
    excludedMeshes: () => [plasma.mesh, ...arrows],
    update(f: EffectFrameContext) {
      if (Math.abs(f.visual.haloMargin - haloMargin) > 1e-6) {
        haloMargin = f.visual.haloMargin;
        plasma.setHaloMargin(haloMargin);
      }
      const intensity = f.preview.effects.plasmaIntensity ?? 0;
      plasma.update(f.camera, {
        time: f.effectTime,
        intensity,
        flicker: f.preview.effects.plasmaFlicker ?? 0,
        glow: f.visual.glowIntensity,
        opacity: f.visual.opacity,
        edgeSoftness: f.visual.edgeSoftness,
        variation: f.visual.variationStrength,
        sheath: f.visual.sheathFraction,
        seed: f.visual.visualSeed,
        colorCore: f.color.core,
        colorHalo: f.color.halo,
        steps: f.plasmaSteps,
        cut: f.cut,
        visible: f.visual.plasmaVisible && !(f.active && f.viewMode === "exploded"),
        debugDepth: f.debugDepth,
        flipDepthY: f.flipDepthY,
      });
      const ions = (f.preview.effects.ionArrows ?? 0) > 0.5 && f.visual.plasmaVisible && f.viewMode !== "exploded";
      root.setEnabled(ions);
      if (ions) mat.alpha = 0.35 + 0.25 * Math.min(1, intensity);
      void Vector3;
    },
    dispose() {
      plasma.dispose();
      for (const m of arrows) m.dispose();
      root.dispose();
      mat.dispose();
    },
  };
}
