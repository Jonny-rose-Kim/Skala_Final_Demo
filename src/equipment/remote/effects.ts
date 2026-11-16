/**
 * Remote ICP PECVD scene effects: main glow volume inside the discharge tube, optional weak afterglow in
 * the transport section, and two schematic traces (source gas → discharge → transport → wafer → exhaust;
 * precursor → ring → wafer region). Traces follow real ports and never cross metal walls.
 * Nothing here is a computed radical concentration, ion energy or emissivity.
 */
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { azimuthToXZ } from "../../config/geometry";
import { SchematicPathOverlay, type PathDef } from "../../interaction/gasPathOverlay";
import { PlasmaVolume } from "../../plasma/plasmaVolume";
import type { EffectFrameContext, EffectSet } from "../../scene/equipmentInstance";
import type { EffectFactoryContext } from "../../scene/effectsRegistry";
import type { RemoteLayout } from "./layout";

export function remoteTracePaths(L: RemoteLayout): { source: PathDef[]; precursor: PathDef[] } {
  const gp = L.cfg.peripherals;
  const sp = gp.source_gas_panel_center;
  const gf = L.gasFitting;
  const feedCol = new Color3(0.35, 0.85, 1.0);
  const activeCol = new Color3(0.75, 0.55, 1.0);
  const exhaustCol = new Color3(1.0, 0.65, 0.3);
  const precCol = new Color3(0.4, 1.0, 0.6);
  const ex = L.ports.exhaust;
  const exP = (r: number, y: number): [number, number, number] => {
    const xz = azimuthToXZ(ex.azimuth, r);
    return [xz.x, y, xz.z];
  };
  const sourceSupply: PathDef = {
    id: "source_supply",
    color: feedCol,
    arrows: 6,
    speed: 0.12,
    points: [
      [0, sp[1] + gp.source_gas_panel_size[1] / 2 + 0.01, sp[2]],
      [0, gf.y1 + 0.05, sp[2]],
      [0, gf.y1 + 0.05, 0],
      [0, gf.y0, 0],
    ],
  };
  const dischargeToWafer: PathDef = {
    id: "source_downstream",
    color: activeCol,
    arrows: 10,
    speed: 0.08,
    points: [
      [0, L.tube.y1 - 0.01, 0],
      [0, L.sourceGlow.topY, 0],
      [0, L.sourceGlow.bottomY, 0],
      [0, L.transport.y1, 0],
      [0, L.lidBottomY - 0.01, 0],
      [0.06, L.ring.y0 - 0.02, 0],
      [0.1, L.waferTopY + 0.02, 0],
    ],
  };
  const sP = L.rOuter + L.cfg.ports.exhaust.stub_length + L.cfg.exhaust_line.throttle_valve_body_length + 0.08;
  const pumpTopY = L.cfg.exhaust_line.pump_center_y + L.cfg.exhaust_line.pump_size[1] / 2;
  const exhaust: PathDef = {
    id: "exhaust",
    color: exhaustCol,
    arrows: 7,
    speed: 0.1,
    points: [
      [0.12, L.waferTopY + 0.02, 0],
      exP(L.rStage + 0.02, L.waferTopY + 0.015),
      exP(L.rStage + 0.03, ex.centerY + 0.01),
      exP(L.rInner - 0.01, ex.centerY),
      exP(sP, ex.centerY),
      exP(sP, pumpTopY + 0.03),
    ],
  };
  const pp = gp.precursor_panel_center;
  const feedXZ = azimuthToXZ(L.ring.feedAzimuth, L.ring.feedPortR);
  const ringXZ = azimuthToXZ(L.ring.feedAzimuth, (L.ring.rIn + L.ring.rOut) / 2);
  const precursor: PathDef = {
    id: "precursor",
    color: precCol,
    arrows: 7,
    speed: 0.12,
    points: [
      [pp[0], pp[1] + gp.precursor_panel_size[1] / 2 + 0.01, pp[2]],
      [pp[0], L.lidTopY + 0.11, pp[2]],
      [feedXZ.x, L.lidTopY + 0.11, feedXZ.z],
      [feedXZ.x, L.lidTopY + 0.064, feedXZ.z],
      [feedXZ.x, L.lidBottomY, feedXZ.z],
      [ringXZ.x, (L.ring.y0 + L.ring.y1) / 2, ringXZ.z],
    ],
  };
  // precursor spreading inward from the ring toward the wafer region (two branches)
  const branches: PathDef[] = [];
  for (const azDeg of [120, 240]) {
    const az = (azDeg * Math.PI) / 180;
    const a = azimuthToXZ(az, L.ring.rIn - 0.004);
    const b = azimuthToXZ(az, L.rWafer * 0.5);
    branches.push({ id: `precursor_in_${azDeg}`, color: precCol, arrows: 4, speed: 0.1, points: [[a.x, (L.ring.y0 + L.ring.y1) / 2, a.z], [b.x, L.waferTopY + 0.03, b.z]] });
  }
  return { source: [sourceSupply, dischargeToWafer, exhaust], precursor: [precursor, ...branches] };
}

export function createRemoteEffects(ctx: EffectFactoryContext): EffectSet {
  const { scene, instance, isWebGPU, visual } = ctx;
  const L = instance.bundle.layout as RemoteLayout;
  const id = instance.def.instanceId;
  const glowNode = instance.assetNodes.get("source_plasma_volume") ?? instance.root;
  const afterNode = instance.assetNodes.get("afterglow_volume") ?? instance.root;
  const glow = new PlasmaVolume(scene, L.sourceGlow, glowNode, id, isWebGPU, visual.haloMargin, "source_plasma_volume");
  const afterglow = new PlasmaVolume(scene, L.afterglow, afterNode, id, isWebGPU, visual.haloMargin * 0.5, "afterglow_volume");
  const paths = remoteTracePaths(L);
  const sourceTrace = new SchematicPathOverlay(scene, instance.root, paths.source, id, "transport_overlay");
  const precursorTrace = new SchematicPathOverlay(scene, instance.root, paths.precursor, id, "precursor_overlay");
  let haloMargin = visual.haloMargin;
  return {
    plasma: glow,
    plasmas: [glow, afterglow],
    excludedMeshes: () => [glow.mesh, afterglow.mesh, ...(sourceTrace.root.getChildMeshes() as Mesh[]), ...(precursorTrace.root.getChildMeshes() as Mesh[])],
    update(f: EffectFrameContext) {
      if (Math.abs(f.visual.haloMargin - haloMargin) > 1e-6) {
        haloMargin = f.visual.haloMargin;
        glow.setHaloMargin(haloMargin);
      }
      const intensity = f.preview.effects.plasmaIntensity ?? 0;
      const common = {
        time: f.effectTime,
        flicker: f.preview.effects.plasmaFlicker ?? 0,
        glow: f.visual.glowIntensity,
        edgeSoftness: f.visual.edgeSoftness,
        variation: f.visual.variationStrength,
        sheath: 0.06,
        seed: f.visual.visualSeed,
        colorCore: f.color.core,
        colorHalo: f.color.halo,
        steps: f.plasmaSteps,
        cut: f.cut,
        debugDepth: f.debugDepth,
        flipDepthY: f.flipDepthY,
      };
      const visibleBase = f.visual.plasmaVisible && !(f.active && f.viewMode === "exploded");
      glow.update(f.camera, { ...common, intensity, opacity: f.visual.opacity, visible: visibleBase });
      afterglow.update(f.camera, { ...common, intensity: intensity * f.visual.afterglowIntensity, opacity: f.visual.opacity * 0.6, flicker: 0, visible: visibleBase && !!f.overlays.afterglow });
      const showTraces = f.active && f.viewMode !== "exploded";
      sourceTrace.setVisible(showTraces && !!f.overlays.transport);
      sourceTrace.flow = f.preview.effects.sourceGasFlow ?? 0;
      sourceTrace.update(f.effectTime);
      precursorTrace.setVisible(showTraces && !!f.overlays.precursor && (f.preview.effects.precursorFlow ?? 0) > 0.001);
      precursorTrace.flow = f.preview.effects.precursorFlow ?? 0;
      precursorTrace.update(f.effectTime);
    },
    dispose() {
      glow.dispose();
      afterglow.dispose();
      sourceTrace.dispose();
      precursorTrace.dispose();
    },
  };
}
