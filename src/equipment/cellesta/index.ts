/**
 * CELLESTA-i MD based wet clean bundle (current bay).
 */
import { DEG } from "../../config/geometry";
import type { EquipmentBundle } from "../../domain/registry";
import type { GlbManifest } from "../../domain/glbSource";
import type { CameraPreset } from "../../scene/cameraPresets";
import glbManifest from "../../../assets/manifests/cellesta_i_md_clean_300.glb-manifest.json";
import { CELLESTA_CONFIG, CELLESTA_LAYOUT, validateCellestaConfig, type CellestaLayout } from "./layout";
import { buildCellestaMeasurementSeed } from "./measurement";
import { buildCellestaParts } from "./parts";
import { buildCellestaTemplate, CELLESTA_TEMPLATE_ID } from "./template";

export { CELLESTA_TEMPLATE_ID };

export function cellestaCameraPresets(L: CellestaLayout): CameraPreset[] {
  return [
    { id: "overview", label: "Whole tool", labelKo: "장비 전체", alpha: 215 * DEG, beta: 62 * DEG, radius: 6.4, target: [-0.6, 0.2, 0] },
    { id: "pm01-cutaway", label: "PM-01 cup / chuck / nozzle", labelKo: "PM-01 cup·chuck·nozzle 단면", alpha: 240 * DEG, beta: 62 * DEG, radius: 1.2, target: [0.05, 0.0, 0.05], viewMode: "cutaway", cutaway: { azimuthDeg: 200, sweepDeg: 110 } },
    { id: "wafer-closeup", label: "Wafer on the spin chuck", labelKo: "Spin chuck 위 wafer 근접", alpha: 235 * DEG, beta: 55 * DEG, radius: 0.6, target: [0, 0.01, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 200, sweepDeg: 110 } },
    { id: "transfer", label: "Pass station / transfer robot", labelKo: "Pass station·transfer robot", alpha: 70 * DEG, beta: 55 * DEG, radius: 2.4, target: [-1.2, 0.0, 0] },
    { id: "efem-robot", label: "EFEM robot / FOUP handoff", labelKo: "EFEM robot·FOUP 인계", alpha: 100 * DEG, beta: 64 * DEG, radius: 2.4, target: [L.seat[0] * 0.82, 0.25, 0] },
    { id: "exploded", label: "Exploded", labelKo: "분해 보기", alpha: 230 * DEG, beta: 62 * DEG, radius: 2.8, target: [0, 0.0, 0], viewMode: "exploded" },
  ];
}

export const CELLESTA_BUNDLE: EquipmentBundle<CellestaLayout> = {
  template: buildCellestaTemplate(CELLESTA_LAYOUT),
  layout: CELLESTA_LAYOUT,
  geometry: { geometryRevision: CELLESTA_CONFIG.geometry_revision, kind: CELLESTA_CONFIG.source.kind, note: CELLESTA_CONFIG.source.note },
  buildParts: buildCellestaParts,
  cutawayKeepOuts: [],
  cutawayDefault: { azimuthDeg: 200, sweepDeg: 110 },
  cameraPresets: cellestaCameraPresets(CELLESTA_LAYOUT),
  overviewPresetId: "overview",
  measurement: buildCellestaMeasurementSeed(CELLESTA_LAYOUT),
  validate: () => validateCellestaConfig(),
  facilityInterface: (L) => ({ center: [L.tool.chemical_cabinet.x1 + 0.06, L.floorY + 0.75, 0], normal: [1, 0, 0] }),
  coversAuto: "inspection",
  glb: { url: "/models/cellesta_i_md_clean_300.glb", manifest: glbManifest as unknown as GlbManifest, required: true },
};
