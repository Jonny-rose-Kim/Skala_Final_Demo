/**
 * Rotary STI CMP bundle: template + layout + parts + measurement seed + camera presets.
 */
import { DEG } from "../../config/geometry";
import type { EquipmentBundle } from "../../domain/registry";
import type { CameraPreset } from "../../scene/cameraPresets";
import { CMP_CONFIG, CMP_LAYOUT, validateCmpConfig, type CmpLayout } from "./layout";
import { buildCmpMeasurementSeed } from "./measurement";
import { buildCmpParts } from "./parts";
import { buildCmpTemplate, CMP_TEMPLATE_ID } from "./template";

export { CMP_TEMPLATE_ID };

export function cmpCameraPresets(L: CmpLayout): CameraPreset[] {
  const hx = L.head.polishX;
  const cut = { azimuthDeg: 270, sweepDeg: 100 };
  return [
    { id: "overview", label: "Polishing module overview", labelKo: "Polishing module 전체", alpha: 230 * DEG, beta: 62 * DEG, radius: 3.0, target: [-0.3, 0.95, 0.1] },
    { id: "contact-cutaway", label: "Wafer / head / pad contact cutaway", labelKo: "Wafer–head–pad 접촉 단면", alpha: 268 * DEG, beta: 76 * DEG, radius: 0.75, target: [hx, L.padTopY + 0.03, 0], viewMode: "cutaway", cutaway: cut },
    { id: "head-exploded", label: "Head membrane / retaining ring exploded", labelKo: "Head membrane·retaining ring 분해", alpha: 250 * DEG, beta: 70 * DEG, radius: 1.3, target: [hx, 1.15, 0], viewMode: "exploded" },
    { id: "conditioner-slurry", label: "Conditioner & slurry close-up", labelKo: "Conditioner·slurry 근접", alpha: 300 * DEG, beta: 55 * DEG, radius: 1.2, target: [0.1, L.padTopY, 0.05] },
    { id: "optical-window", label: "Optical window / path", labelKo: "Optical window·path", alpha: 275 * DEG, beta: 72 * DEG, radius: 0.6, target: [hx, L.padTopY, 0], viewMode: "cutaway", cutaway: cut },
    { id: "clean-dry", label: "Clean / dry boundary", labelKo: "Clean/Dry 경계", alpha: 120 * DEG, beta: 60 * DEG, radius: 2.2, target: [-0.8, 0.95, 0.5] },
    { id: "station", label: "Load port / dry loading", labelKo: "Load port와 dry loading", alpha: 150 * DEG, beta: 66 * DEG, radius: 2.6, target: [-1.1, 0.8, 0] },
  ];
}

export const CMP_BUNDLE: EquipmentBundle<CmpLayout> = {
  template: buildCmpTemplate(CMP_LAYOUT),
  layout: CMP_LAYOUT,
  geometry: { geometryRevision: CMP_CONFIG.geometry_revision, kind: CMP_CONFIG.source.kind, note: CMP_CONFIG.source.note },
  buildParts: buildCmpParts,
  cutawayKeepOuts: [],
  cutawayDefault: { azimuthDeg: 270, sweepDeg: 100 },
  cameraPresets: cmpCameraPresets(CMP_LAYOUT),
  overviewPresetId: "overview",
  measurement: buildCmpMeasurementSeed(CMP_LAYOUT),
  validate: () => validateCmpConfig(CMP_CONFIG),
};
