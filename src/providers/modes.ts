/**
 * Mode registry. Only Visual Inspection is implemented in V1. Simulation and Replay are described as
 * planned so the UI never presents them as working, and no backend endpoint is polled.
 */
import type { AppMode } from "../presentation/store";

export interface ModeDescriptor {
  id: AppMode;
  label: string;
  available: boolean;
  summaryKo: string;
  clock: "presentation_time" | "simulation_time" | "replay_time";
  dataSourceKo: string;
}

export const MODES: ModeDescriptor[] = [
  {
    id: "visual-inspection",
    label: "Visual Inspection",
    available: true,
    summaryKo: "Frontend 단독으로 동작하는 관찰 모드. 설명용 Plasma·Gas 효과만 표시하며 센서값·설비 상태를 만들지 않는다.",
    clock: "presentation_time",
    dataSourceKo: "Geometry: assumed (versioned config) / Effects: illustrative",
  },
  {
    id: "simulation",
    label: "Simulation",
    available: false,
    summaryKo: "후속 Operational Backend(FastAPI + FSM + SimPy + Physics)가 연결될 때 제공된다. 현재 미구현.",
    clock: "simulation_time",
    dataSourceKo: "Backend snapshot (예정)",
  },
  {
    id: "replay",
    label: "Replay",
    available: false,
    summaryKo: "기록된 Run의 Snapshot/Event를 읽는 Read-only 재생. 기록 기능과 함께 후속 단계에서 제공된다.",
    clock: "replay_time",
    dataSourceKo: "Recorded run (예정)",
  },
];
