/**
 * OHT bundle: rail + vehicle template, layout, parts, measurement seed, camera presets, path pose and the
 * carrier attach frame used by the scene to place a carried FOUP.
 */
import { DEG } from "../../config/geometry";
import type { EquipmentBundle } from "../../domain/registry";
import type { CameraPreset } from "../../scene/cameraPresets";
import { OHT_CONFIG, OHT_LAYOUT, ohtPathPose, validateOhtConfig, type OhtLayout } from "./layout";
import { buildOhtMeasurementSeed } from "./measurement";
import { buildOhtParts } from "./parts";
import { buildOhtTemplate, OHT_TEMPLATE_ID } from "./template";

export { OHT_TEMPLATE_ID };

export function ohtCameraPresets(L: OhtLayout): CameraPreset[] {
  const zc = (L.rail.z0 + L.rail.z1) / 2;
  return [
    { id: "overview", label: "Bay + overhead rail", labelKo: "Bay와 overhead rail 전체", alpha: 200 * DEG, beta: 62 * DEG, radius: 9.5, target: [1.2, 1.2, zc] },
    { id: "vehicle", label: "Vehicle / hoist close-up", labelKo: "Vehicle·hoist 근접", alpha: 215 * DEG, beta: 70 * DEG, radius: 2.2, target: [0, L.vehicle.bodyY0, L.rail.z0 + L.vehicle.parkS] },
    { id: "vehicle-xray", label: "Vehicle / hoist (x-ray)", labelKo: "Vehicle·hoist 내부 (x-ray)", alpha: 215 * DEG, beta: 70 * DEG, radius: 1.6, target: [0, L.vehicle.bodyY0, L.rail.z0 + L.vehicle.parkS], viewMode: "xray" },
    { id: "gripper", label: "Gripper / FOUP interface", labelKo: "Gripper·FOUP handling interface", alpha: 230 * DEG, beta: 72 * DEG, radius: 1.0, target: [0, L.hoist.fingerBottomY, L.rail.z0 + L.vehicle.parkS] },
    { id: "exploded", label: "OHT exploded", labelKo: "OHT 분해 보기", alpha: 215 * DEG, beta: 66 * DEG, radius: 3.2, target: [0, L.vehicle.bodyY0 - 0.2, L.rail.z0 + L.vehicle.parkS], viewMode: "exploded" },
  ];
}

export const OHT_BUNDLE: EquipmentBundle<OhtLayout> = {
  template: buildOhtTemplate(OHT_LAYOUT),
  layout: OHT_LAYOUT,
  geometry: { geometryRevision: OHT_CONFIG.geometry_revision, kind: OHT_CONFIG.source.kind, note: OHT_CONFIG.source.note },
  buildParts: buildOhtParts,
  cutawayKeepOuts: [],
  cutawayDefault: { azimuthDeg: 270, sweepDeg: 90 },
  cameraPresets: ohtCameraPresets(OHT_LAYOUT),
  overviewPresetId: "vehicle",
  measurement: buildOhtMeasurementSeed(OHT_LAYOUT),
  validate: () => validateOhtConfig(OHT_CONFIG),
  pathPose: (L, jointId, s) => ohtPathPose(L, jointId, s),
  // seat of a carried FOUP, authored like parts: instance frame at the rest pose (vehicle at the rail start, hoist retracted)
  carrierAttach: { jointId: "hoist", seatLocal: [0, OHT_LAYOUT.hoist.originY + OHT_LAYOUT.carrierSeatInHoistFrame[1], OHT_LAYOUT.rail.z0] },
};
