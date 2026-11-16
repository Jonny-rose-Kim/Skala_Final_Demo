/**
 * Remote ICP PECVD bundle: template + layout + parts + measurement seed + camera presets.
 */
import { DEG } from "../../config/geometry";
import type { EquipmentBundle } from "../../domain/registry";
import type { CameraPreset } from "../../scene/cameraPresets";
import { REMOTE_CONFIG, REMOTE_LAYOUT, validateRemoteConfig, type RemoteLayout } from "./layout";
import { buildRemoteMeasurementSeed } from "./measurement";
import { buildRemoteParts } from "./parts";
import { buildRemoteTemplate, REMOTE_TEMPLATE_ID } from "./template";

export { REMOTE_TEMPLATE_ID };

export function remoteCameraPresets(L: RemoteLayout): CameraPreset[] {
  const st = L.station;
  return [
    { id: "overview", label: "Equipment overview", labelKo: "장비 전체 (source + chamber)", alpha: 240 * DEG, beta: 66 * DEG, radius: 2.4, target: [0, 0.3, 0] },
    { id: "source-cutaway", label: "Source cutaway (coil / tube)", labelKo: "Source housing 단면: coil·tube 근접", alpha: 255 * DEG, beta: 76 * DEG, radius: 0.75, target: [0, (L.tube.y0 + L.tube.y1) / 2, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 250, sweepDeg: 110 } },
    { id: "longitudinal-section", label: "Source → transport → precursor → wafer section", labelKo: "종단면: source → transport → precursor → wafer", alpha: 262 * DEG, beta: 82 * DEG, radius: 1.45, target: [0, 0.32, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 250, sweepDeg: 120 } },
    { id: "wafer-closeup", label: "Wafer / stage close-up", labelKo: "Wafer / stage 근접", alpha: 250 * DEG, beta: 80 * DEG, radius: 0.5, target: [0.02, L.waferTopY + 0.03, 0], viewMode: "cutaway", cutaway: { azimuthDeg: 250, sweepDeg: 120 } },
    { id: "exploded", label: "Exploded (source / chamber)", labelKo: "분해 보기", alpha: 235 * DEG, beta: 62 * DEG, radius: 3.4, target: [0, 0.5, 0], viewMode: "exploded" },
    { id: "station", label: "Load port / tool shell", labelKo: "Load port와 tool shell", alpha: 150 * DEG, beta: 68 * DEG, radius: 2.8, target: [st.seat[0] * 0.6, 0.15, st.seat[2] * 0.6] },
  ];
}

export const REMOTE_BUNDLE: EquipmentBundle<RemoteLayout> = {
  template: buildRemoteTemplate(REMOTE_LAYOUT),
  layout: REMOTE_LAYOUT,
  geometry: { geometryRevision: REMOTE_CONFIG.geometry_revision, kind: REMOTE_CONFIG.source.kind, note: REMOTE_CONFIG.source.note },
  buildParts: buildRemoteParts,
  cutawayKeepOuts: [...Object.values(REMOTE_LAYOUT.ports).map((p) => p.keepOut), ...REMOTE_LAYOUT.extraKeepOuts],
  cutawayDefault: { azimuthDeg: 250, sweepDeg: 120 },
  cameraPresets: remoteCameraPresets(REMOTE_LAYOUT),
  overviewPresetId: "overview",
  measurement: buildRemoteMeasurementSeed(REMOTE_LAYOUT),
  validate: () => validateRemoteConfig(REMOTE_CONFIG),
  plasmaLitAssets: ["discharge_tube", "induction_coil", "source_housing", "transport_section"],
  plasmaCenter: (L) => L.sourceGlow.center,
};
