/**
 * Cleanway CLW-08v2 based OHT bundle (current bay): shared OHT mechanism parts without the procedural body and
 * obstruction sensor (the housing, end shells, face fittings and sensor windows come from the GLB), path pose and
 * carrier attach frame.
 */
import type { EquipmentBundle } from "../../domain/registry";
import type { GlbManifest } from "../../domain/glbSource";
import glbManifest from "../../../assets/manifests/clw08v2_oht.glb-manifest.json";
import { ohtPathPose, validateOhtConfig, type OhtLayout } from "../oht/layout";
import { buildOhtParts } from "../oht/parts";
import { ohtCameraPresets } from "../oht/index";
import { CLW_CONFIG, CLW_LAYOUT } from "./layout";
import { buildClwMeasurementSeed } from "./measurement";
import { buildClwTemplate, CLW_TEMPLATE_ID } from "./template";

export { CLW_TEMPLATE_ID };

/** The GLB supplies the vehicle housing and the obstruction sensor windows (placed on the end face layout). */
const GLB_ASSETS = new Set(["vehicle_body", "obstruction_sensor"]);

export function buildClwParts(L: OhtLayout) {
  return buildOhtParts(L).filter((p) => !GLB_ASSETS.has(p.assetId));
}

export const CLW_BUNDLE: EquipmentBundle<OhtLayout> = {
  template: buildClwTemplate(CLW_LAYOUT),
  layout: CLW_LAYOUT,
  geometry: { geometryRevision: CLW_CONFIG.geometry_revision, kind: CLW_CONFIG.source.kind, note: CLW_CONFIG.source.note },
  buildParts: buildClwParts,
  cutawayKeepOuts: [],
  cutawayDefault: { azimuthDeg: 270, sweepDeg: 90 },
  cameraPresets: ohtCameraPresets(CLW_LAYOUT),
  overviewPresetId: "vehicle",
  measurement: buildClwMeasurementSeed(CLW_LAYOUT),
  validate: () => {
    const r = validateOhtConfig(CLW_CONFIG);
    return { errors: r.errors.filter((e) => !e.includes("schema id")), warnings: r.warnings };
  },
  pathPose: (L, jointId, s) => ohtPathPose(L, jointId, s),
  carrierAttach: { jointId: "hoist", seatLocal: [0, CLW_LAYOUT.hoist.originY + CLW_LAYOUT.carrierSeatInHoistFrame[1], CLW_LAYOUT.rail.z0] },
  coversAuto: "inspection",
  glb: { url: "/models/clw08v2_oht.glb", manifest: glbManifest as unknown as GlbManifest, required: true },
};
