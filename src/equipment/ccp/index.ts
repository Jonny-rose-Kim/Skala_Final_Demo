/**
 * CCP PECVD bundle: the original V1 template, layout and procedural geometry wrapped in the shared
 * equipment registry shape. Geometry and identity are unchanged; only the station shell was added.
 */
import { CHAMBER_LAYOUT, GEOMETRY_CONFIG, validateGeometryConfig, type ChamberLayout } from "../../config/geometry";
import { CCP_CHAMBER_TEMPLATE } from "../../domain/ccpChamberTemplate";
import type { EquipmentBundle } from "../../domain/registry";
import { buildChamberParts } from "../../geometry/chamberParts";
import { cameraPresets } from "../../scene/cameraPresets";
import { buildCcpMeasurementSeed } from "./measurement";

export const CCP_TEMPLATE_ID = CCP_CHAMBER_TEMPLATE.templateId;

export const CCP_BUNDLE: EquipmentBundle<ChamberLayout> = {
  template: CCP_CHAMBER_TEMPLATE,
  layout: CHAMBER_LAYOUT,
  geometry: { geometryRevision: GEOMETRY_CONFIG.geometry_revision, kind: GEOMETRY_CONFIG.source.kind, note: GEOMETRY_CONFIG.source.note },
  buildParts: buildChamberParts,
  cutawayKeepOuts: Object.values(CHAMBER_LAYOUT.ports).map((p) => p.keepOut),
  cutawayDefault: { azimuthDeg: 265, sweepDeg: 95 },
  cameraPresets: cameraPresets(CHAMBER_LAYOUT),
  overviewPresetId: "overview",
  measurement: buildCcpMeasurementSeed(CHAMBER_LAYOUT),
  validate: () => validateGeometryConfig(GEOMETRY_CONFIG),
  plasmaLitAssets: ["showerhead_faceplate", "wafer", "edge_ring", "pedestal", "chamber_liner", "edge_insulator_ring", "pumping_baffle", "lift_pins"],
};
