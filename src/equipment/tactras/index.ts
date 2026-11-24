/**
 * Tactras based oxide etch bundle (current bay).
 */
import { DEG } from "../../config/geometry";
import type { EquipmentBundle } from "../../domain/registry";
import type { GlbManifest } from "../../domain/glbSource";
import type { CameraPreset } from "../../scene/cameraPresets";
import glbManifest from "../../../assets/manifests/tactras_oxide_ccp_rie_300.glb-manifest.json";
import { TACTRAS_CONFIG, TACTRAS_LAYOUT, tactrasKeepOuts, validateTactrasConfig, type TactrasLayout } from "./layout";
import { buildTactrasMeasurementSeed } from "./measurement";
import { buildTactrasParts } from "./parts";
import { buildTactrasTemplate, TACTRAS_TEMPLATE_ID } from "./template";

export { TACTRAS_TEMPLATE_ID };

export function tactrasCameraPresets(L: TactrasLayout): CameraPreset[] {
  const st = L.station;
  const tcMid = st.tc ? -(st.tc.r0 + st.tc.r1) / 2 : -1;
  return [
    { id: "overview", label: "Whole tool", labelKo: "장비 전체", alpha: 215 * DEG, beta: 62 * DEG, radius: 6.6, target: [-1.3, 0.2, 0] },
    { id: "pm01-cutaway", label: "PM-01 chamber cutaway", labelKo: "PM-01 chamber 단면", alpha: 268 * DEG, beta: 80 * DEG, radius: 1.0, target: [0, 0.02, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 255, sweepDeg: 110 } },
    { id: "wafer-closeup", label: "Wafer on the ESC / focus ring", labelKo: "ESC·focus ring 위 wafer 근접", alpha: 262 * DEG, beta: 78 * DEG, radius: 0.42, target: [0.05, 0.01, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 255, sweepDeg: 110 } },
    { id: "lower-electrode", label: "Lower electrode feeds (RF / He / coolant)", labelKo: "하부 전극 RF·He·냉각 feed", alpha: 262 * DEG, beta: 95 * DEG, radius: 1.2, target: [0, -0.4, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 255, sweepDeg: 110 } },
    { id: "transfer", label: "Transfer chamber / load lock", labelKo: "Transfer chamber·load lock", alpha: 70 * DEG, beta: 52 * DEG, radius: 2.6, target: [tcMid, 0.15, 0] },
    { id: "efem-robot", label: "EFEM robot / FOUP handoff", labelKo: "EFEM robot·FOUP 인계", alpha: 100 * DEG, beta: 64 * DEG, radius: 2.4, target: [st.seat[0] * 0.82, 0.35, 0] },
    { id: "exploded", label: "Exploded", labelKo: "분해 보기", alpha: 230 * DEG, beta: 64 * DEG, radius: 2.6, target: [0, 0.0, 0], viewMode: "exploded" },
  ];
}

export const TACTRAS_BUNDLE: EquipmentBundle<TactrasLayout> = {
  template: buildTactrasTemplate(TACTRAS_LAYOUT),
  layout: TACTRAS_LAYOUT,
  geometry: { geometryRevision: TACTRAS_CONFIG.geometry_revision, kind: TACTRAS_CONFIG.source.kind, note: TACTRAS_CONFIG.source.note },
  buildParts: buildTactrasParts,
  cutawayKeepOuts: tactrasKeepOuts(TACTRAS_LAYOUT),
  cutawayDefault: { azimuthDeg: 255, sweepDeg: 110 },
  cameraPresets: tactrasCameraPresets(TACTRAS_LAYOUT),
  overviewPresetId: "overview",
  measurement: buildTactrasMeasurementSeed(TACTRAS_LAYOUT),
  validate: () => validateTactrasConfig(),
  facilityInterface: (L) => ({ center: [L.tool.pm01.x1 + 0.06, L.floorY + 0.75, (L.tool.pm01.z0 + L.tool.pm01.z1) / 2], normal: [1, 0, 0] }),
  plasmaLitAssets: ["upper_electrode_plate", "wafer", "focus_ring", "esc_puck", "chamber_liner", "upper_shield_ring"],
  coversAuto: "inspection",
  glb: { url: "/models/tactras_oxide_ccp_rie_300.glb", manifest: glbManifest as unknown as GlbManifest, required: true },
};
