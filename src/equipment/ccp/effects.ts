/**
 * CCP scene effects: the original plasma volume between the electrodes plus the schematic gas-path and
 * sheath-concept overlays. Nothing here is a computed field.
 */
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ChamberLayout } from "../../config/geometry";
import { GasPathOverlay, SheathOverlay } from "../../interaction/gasPathOverlay";
import { PlasmaVolume } from "../../plasma/plasmaVolume";
import type { EffectFrameContext, EffectSet } from "../../scene/equipmentInstance";
import type { EffectFactoryContext } from "../../scene/effectsRegistry";

export function createCcpEffects(ctx: EffectFactoryContext): EffectSet {
  const { scene, instance, isWebGPU, visual } = ctx;
  const L = instance.bundle.layout as ChamberLayout;
  const id = instance.def.instanceId;
  const plasma = new PlasmaVolume(scene, L.plasma, instance.assetNodes.get("plasma_volume") ?? instance.root, id, isWebGPU, visual.haloMargin);
  const gas = new GasPathOverlay(scene, instance.root, L, id);
  const sheath = new SheathOverlay(scene, instance.root, L, id, visual.sheathFraction);
  let haloMargin = visual.haloMargin;
  return {
    plasma,
    plasmas: [plasma],
    excludedMeshes: () => [plasma.mesh, ...(gas.root.getChildMeshes() as Mesh[]), ...(sheath.root.getChildMeshes() as Mesh[])],
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
      gas.setVisible(!!f.overlays.gasPath && f.active && f.viewMode !== "exploded");
      gas.update(f.effectTime);
      sheath.setVisible(!!f.overlays.sheath && f.active && f.viewMode !== "exploded" && f.visual.plasmaVisible);
    },
    dispose() {
      plasma.dispose();
      gas.dispose();
      sheath.dispose();
    },
  };
}
