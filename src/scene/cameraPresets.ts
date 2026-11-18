import type { ChamberLayout } from "../config/geometry";
import { DEG } from "../config/geometry";

export interface CameraPreset {
  id: string;
  label: string;
  labelKo: string;
  /** ArcRotateCamera alpha (rad), beta (rad), radius (m), target in instance frame. */
  alpha: number;
  beta: number;
  radius: number;
  target: [number, number, number];
  /** Optional view-mode this preset implies. */
  viewMode?: "assembled" | "cutaway" | "xray" | "exploded";
  /** Optional cutaway sector that reads best for this preset. */
  cutaway?: { azimuthDeg: number; sweepDeg: number };
}

export function cameraPresets(L: ChamberLayout): CameraPreset[] {
  const gapMid = (L.waferTopY + L.faceplateBottomY) / 2;
  const st = L.station;
  return [
    { id: "overview", label: "Chamber overview", labelKo: "Chamber 전체", alpha: 240 * DEG, beta: 66 * DEG, radius: 1.75, target: [0, 0.12, 0] },
    { id: "side-cutaway", label: "Side cutaway", labelKo: "측면 단면", alpha: 265 * DEG, beta: 78 * DEG, radius: 1.05, target: [0, 0.14, 0], viewMode: "cutaway" },
    { id: "wafer-closeup", label: "Wafer close-up", labelKo: "Wafer 근접", alpha: 250 * DEG, beta: 80 * DEG, radius: 0.42, target: [0.02, gapMid, 0], viewMode: "cutaway" },
    { id: "showerhead-underside", label: "Showerhead underside", labelKo: "Showerhead 하면 (분해 상태)", alpha: 262 * DEG, beta: 140 * DEG, radius: 0.12, target: [0.0, L.faceplateBottomY + 0.2, 0], viewMode: "exploded" },
    { id: "exploded", label: "Exploded", labelKo: "분해 보기", alpha: 235 * DEG, beta: 64 * DEG, radius: 2.6, target: [0, 0.25, 0], viewMode: "exploded" },
    { id: "station", label: "Load port / tool shell", labelKo: "Load port와 tool shell", alpha: 150 * DEG, beta: 68 * DEG, radius: 2.6, target: [st.seat[0] * 0.6, 0.1, st.seat[2] * 0.6] },
    { id: "efem-robot", label: "EFEM robot / FOUP handoff", labelKo: "EFEM robot·FOUP 인계", alpha: 95 * DEG, beta: 66 * DEG, radius: 2.0, target: [st.seat[0] * 0.81, 0.35, st.seat[2] * 0.81] },
    { id: "load-lock", label: "Load lock / vacuum blade", labelKo: "Load lock·진공 blade", alpha: 70 * DEG, beta: 55 * DEG, radius: 1.6, target: [st.seat[0] * 0.4, 0.2, st.seat[2] * 0.4] },
  ];
}
