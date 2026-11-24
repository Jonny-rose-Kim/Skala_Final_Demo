/**
 * Producer SE based twin-module PECVD bundle (current bay).
 */
import { DEG } from "../../config/geometry";
import type { EquipmentBundle } from "../../domain/registry";
import type { CameraPreset } from "../../scene/cameraPresets";
import { PRODUCER_CONFIG, PRODUCER_LAYOUT, validateProducerConfig, type ProducerLayout } from "./layout";
import { buildProducerMeasurementSeed } from "./measurement";
import { buildProducerParts } from "./parts";
import { buildProducerTemplate, PRODUCER_TEMPLATE_ID } from "./template";
import glbManifest from "../../../assets/manifests/producer_se_ccp_twin_300.glb-manifest.json";
import type { GlbManifest } from "../../domain/glbSource";

export { PRODUCER_TEMPLATE_ID };

export function producerCameraPresets(L: ProducerLayout): CameraPreset[] {
  const st = L.station;
  const gapMid = (L.waferTopY + L.faceplateBottomY) / 2;
  const tcMid = st.tc ? -(st.tc.r0 + st.tc.r1) / 2 : -0.8;
  return [
    { id: "overview", label: "Whole tool", labelKo: "장비 전체", alpha: 215 * DEG, beta: 62 * DEG, radius: 6.2, target: [-1.0, 0.1, 0.3] },
    { id: "twin-module", label: "Twin module MOD-01 (cells A / B)", labelKo: "Twin module 내부 (cell A, B)", alpha: 300 * DEG, beta: 58 * DEG, radius: 2.7, target: [0.1, 0.1, 0.52], viewMode: "cutaway", cutaway: { azimuthDeg: 265, sweepDeg: 95 } },
    { id: "side-cutaway", label: "Cell A cutaway", labelKo: "Cell A 단면", alpha: 265 * DEG, beta: 78 * DEG, radius: 1.1, target: [0, 0.14, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 265, sweepDeg: 95 } },
    { id: "wafer-closeup", label: "Wafer close-up (cell A)", labelKo: "Cell A wafer 근접", alpha: 250 * DEG, beta: 80 * DEG, radius: 0.45, target: [0.02, gapMid, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 265, sweepDeg: 95 } },
    { id: "transfer", label: "Load lock / transfer chamber", labelKo: "Load lock·transfer chamber", alpha: 70 * DEG, beta: 52 * DEG, radius: 2.2, target: [tcMid, 0.15, 0] },
    { id: "efem-robot", label: "EFEM robot / FOUP handoff", labelKo: "EFEM robot·FOUP 인계", alpha: 100 * DEG, beta: 64 * DEG, radius: 2.4, target: [st.seat[0] * 0.82, 0.35, 0] },
    { id: "exploded", label: "Exploded", labelKo: "분해 보기", alpha: 225 * DEG, beta: 60 * DEG, radius: 5.0, target: [-0.6, 0.3, 0.3], viewMode: "exploded" },
  ];
}

export const PRODUCER_BUNDLE: EquipmentBundle<ProducerLayout> = {
  template: buildProducerTemplate(PRODUCER_LAYOUT),
  layout: PRODUCER_LAYOUT,
  geometry: { geometryRevision: PRODUCER_CONFIG.geometry_revision, kind: PRODUCER_CONFIG.source.kind, note: PRODUCER_CONFIG.source.note },
  buildParts: buildProducerParts,
  cutawayKeepOuts: Object.values(PRODUCER_LAYOUT.ports).map((p) => p.keepOut),
  cutawayDefault: { azimuthDeg: 265, sweepDeg: 95 },
  cameraPresets: producerCameraPresets(PRODUCER_LAYOUT),
  overviewPresetId: "overview",
  measurement: buildProducerMeasurementSeed(PRODUCER_LAYOUT),
  validate: () => validateProducerConfig(),
  facilityInterface: (L) => ({ center: [L.tool.mod01.x1 + 0.06, L.tool.floorY + 0.75, (L.tool.mod01.z0 + L.tool.mod01.z1) / 2], normal: [1, 0, 0] }),
  plasmaLitAssets: ["showerhead_faceplate", "wafer", "edge_ring", "pedestal", "chamber_liner", "edge_insulator_ring", "pumping_baffle", "lift_pins"],
  coversAuto: "inspection",
  glb: { url: "/models/producer_se_ccp_twin_300.glb", manifest: glbManifest as unknown as GlbManifest, required: true },
};
