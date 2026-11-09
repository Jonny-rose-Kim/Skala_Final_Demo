/**
 * PresentationState (Zustand): selection, observation settings and display state.
 * Nothing in here is a simulation state, a sensor value or a backend command. Per-frame values
 * (playhead, fps) are published at low frequency from the renderer.
 */
import { create } from "zustand";

export type ViewMode = "assembled" | "cutaway" | "xray" | "exploded";
export type QualityPreset = "auto" | "high" | "balanced";
export type EffectiveQuality = "high" | "balanced";
export type LightingPreset = "exterior" | "inspection";
export type RendererBackend = "webgpu" | "webgl2";
export type AppMode = "visual-inspection" | "simulation" | "replay";

export interface PlasmaColorPreset {
  id: string;
  label: string;
  core: [number, number, number];
  halo: [number, number, number];
}

/** Appearance presets: named by look, not by gas chemistry. */
export const PLASMA_COLOR_PRESETS: PlasmaColorPreset[] = [
  { id: "violet", label: "Violet (default)", core: [0.64, 0.42, 1.0], halo: [0.34, 0.18, 0.9] },
  { id: "blue-white", label: "Blue-white", core: [0.85, 0.9, 1.0], halo: [0.35, 0.55, 1.0] },
  { id: "pink", label: "Pink", core: [1.0, 0.72, 0.85], halo: [0.9, 0.35, 0.6] },
  { id: "pale-green", label: "Pale green", core: [0.78, 1.0, 0.82], halo: [0.3, 0.8, 0.5] },
];

export interface VisualSettings {
  plasmaVisible: boolean;
  glowIntensity: number; // 0..2
  opacity: number; // 0..1
  colorPreset: string;
  edgeSoftness: number; // 0.02..0.5
  variationStrength: number; // 0..1
  animationSpeed: number; // 0.1..3
  visualSeed: number; // integer
  /** developer settings (not in the user panel) */
  sheathFraction: number; // 0.05..0.4
  haloMargin: number; // meters beyond electrode radius
  plasmaLightEnabled: boolean;
}

export const DEFAULT_VISUAL: VisualSettings = {
  plasmaVisible: true,
  glowIntensity: 1.0,
  opacity: 0.35,
  colorPreset: "violet",
  edgeSoftness: 0.12,
  variationStrength: 0.45,
  animationSpeed: 1.0,
  visualSeed: 7,
  sheathFraction: 0.2,
  haloMargin: 0.012,
  plasmaLightEnabled: true,
};

export interface CutawaySettings {
  azimuthDeg: number;
  sweepDeg: number;
  /** Effective (snapped) values reported back by the scene. */
  effectiveAzimuthDeg: number;
  effectiveSweepDeg: number;
  snapped: boolean;
}

export interface RendererInfo {
  backend: RendererBackend | null;
  status: "idle" | "initializing" | "ready" | "fallback" | "error";
  message: string | null;
  gpu: string | null;
  fallbackReason: string | null;
  forceWebGL2: boolean;
}

export interface PerfSample {
  fps: number;
  frameMs: number;
  activeMeshes: number;
  renderWidth: number;
  renderHeight: number;
  dpr: number;
}

export interface TimelineSnapshot {
  playheadSec: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  durationSec: number;
  phase: string;
  phaseLabelKo: string;
  intensity: number;
}

export interface PresentationState {
  appMode: AppMode;
  activeInstanceId: string;
  selectedAssetId: string | null;
  hoveredAssetId: string | null;
  viewMode: ViewMode;
  cutaway: CutawaySettings;
  xrayOpacity: number;
  explodeAmount: number;
  hiddenAssets: string[];
  isolatedAssetId: string | null;
  visual: VisualSettings;
  overlays: { gasPath: boolean; labels: boolean; sheath: boolean };
  qualityPreset: QualityPreset;
  effectiveQuality: EffectiveQuality;
  lightingPreset: LightingPreset;
  cameraPresetId: string | null;
  renderer: RendererInfo;
  perf: PerfSample | null;
  timeline: TimelineSnapshot;
  devWarnings: string[];
  panels: { tree: boolean; inspector: boolean; timeline: boolean };
  /** Monotonic counters consumed by the scene host (one-shot requests). */
  requests: { resetCamera: number; focusSelected: number; cameraPreset: number };

  select(assetId: string | null): void;
  hover(assetId: string | null): void;
  setViewMode(mode: ViewMode): void;
  setCutaway(partial: Partial<Pick<CutawaySettings, "azimuthDeg" | "sweepDeg">>): void;
  reportCutaway(effectiveAzimuthDeg: number, effectiveSweepDeg: number, snapped: boolean): void;
  setXrayOpacity(v: number): void;
  setExplodeAmount(v: number): void;
  toggleHidden(assetId: string): void;
  setHidden(assetId: string, hidden: boolean): void;
  showAll(): void;
  isolate(assetId: string | null): void;
  setVisual(partial: Partial<VisualSettings>): void;
  resetVisual(): void;
  setOverlay(key: "gasPath" | "labels" | "sheath", v: boolean): void;
  setQualityPreset(p: QualityPreset): void;
  reportEffectiveQuality(q: EffectiveQuality): void;
  setLightingPreset(p: LightingPreset): void;
  setCameraPreset(id: string | null): void;
  setRenderer(partial: Partial<RendererInfo>): void;
  reportPerf(p: PerfSample): void;
  reportTimeline(t: TimelineSnapshot): void;
  setDevWarnings(w: string[]): void;
  togglePanel(p: "tree" | "inspector" | "timeline"): void;
  requestResetCamera(): void;
  requestFocusSelected(): void;
  setActiveInstance(id: string): void;
}

const DEFAULT_CUTAWAY: CutawaySettings = { azimuthDeg: 265, sweepDeg: 95, effectiveAzimuthDeg: 265, effectiveSweepDeg: 95, snapped: false };

export const usePresentationStore = create<PresentationState>((set) => ({
  appMode: "visual-inspection",
  activeInstanceId: "PECVD-01.CH-A",
  selectedAssetId: null,
  hoveredAssetId: null,
  viewMode: "assembled",
  cutaway: DEFAULT_CUTAWAY,
  xrayOpacity: 0.18,
  explodeAmount: 1,
  hiddenAssets: [],
  isolatedAssetId: null,
  visual: DEFAULT_VISUAL,
  overlays: { gasPath: false, labels: false, sheath: false },
  qualityPreset: "auto",
  effectiveQuality: "high",
  lightingPreset: "exterior",
  cameraPresetId: "overview",
  renderer: { backend: null, status: "idle", message: null, gpu: null, fallbackReason: null, forceWebGL2: false },
  perf: null,
  timeline: { playheadSec: 0, playing: true, loop: true, speed: 1, durationSec: 18, phase: "off", phaseLabelKo: "소등", intensity: 0 },
  devWarnings: [],
  panels: { tree: true, inspector: true, timeline: true },
  requests: { resetCamera: 0, focusSelected: 0, cameraPreset: 0 },

  select: (assetId) => set({ selectedAssetId: assetId }),
  hover: (assetId) => set((s) => (s.hoveredAssetId === assetId ? s : { hoveredAssetId: assetId })),
  setViewMode: (mode) => set({ viewMode: mode }),
  setCutaway: (partial) => set((s) => ({ cutaway: { ...s.cutaway, ...partial } })),
  reportCutaway: (effectiveAzimuthDeg, effectiveSweepDeg, snapped) =>
    set((s) =>
      s.cutaway.effectiveAzimuthDeg === effectiveAzimuthDeg && s.cutaway.effectiveSweepDeg === effectiveSweepDeg && s.cutaway.snapped === snapped
        ? s
        : { cutaway: { ...s.cutaway, effectiveAzimuthDeg, effectiveSweepDeg, snapped } },
    ),
  setXrayOpacity: (v) => set({ xrayOpacity: Math.min(Math.max(v, 0.03), 0.8) }),
  setExplodeAmount: (v) => set({ explodeAmount: Math.min(Math.max(v, 0), 1) }),
  toggleHidden: (assetId) => set((s) => ({ hiddenAssets: s.hiddenAssets.includes(assetId) ? s.hiddenAssets.filter((a) => a !== assetId) : [...s.hiddenAssets, assetId] })),
  setHidden: (assetId, hidden) => set((s) => ({ hiddenAssets: hidden ? Array.from(new Set([...s.hiddenAssets, assetId])) : s.hiddenAssets.filter((a) => a !== assetId) })),
  showAll: () => set({ hiddenAssets: [], isolatedAssetId: null }),
  isolate: (assetId) => set({ isolatedAssetId: assetId }),
  setVisual: (partial) => set((s) => ({ visual: { ...s.visual, ...partial } })),
  resetVisual: () => set({ visual: DEFAULT_VISUAL }),
  setOverlay: (key, v) => set((s) => ({ overlays: { ...s.overlays, [key]: v } })),
  setQualityPreset: (p) => set({ qualityPreset: p }),
  reportEffectiveQuality: (q) => set((s) => (s.effectiveQuality === q ? s : { effectiveQuality: q })),
  setLightingPreset: (p) => set({ lightingPreset: p }),
  setCameraPreset: (id) => set((s) => ({ cameraPresetId: id, requests: { ...s.requests, cameraPreset: s.requests.cameraPreset + 1 } })),
  setRenderer: (partial) => set((s) => ({ renderer: { ...s.renderer, ...partial } })),
  reportPerf: (p) => set({ perf: p }),
  reportTimeline: (t) => set({ timeline: t }),
  setDevWarnings: (w) => set({ devWarnings: w }),
  togglePanel: (p) => set((s) => ({ panels: { ...s.panels, [p]: !s.panels[p] } })),
  requestResetCamera: () => set((s) => ({ requests: { ...s.requests, resetCamera: s.requests.resetCamera + 1 } })),
  requestFocusSelected: () => set((s) => ({ requests: { ...s.requests, focusSelected: s.requests.focusSelected + 1 } })),
  setActiveInstance: (id) => set({ activeInstanceId: id, selectedAssetId: null }),
}));

export function colorPresetById(id: string): PlasmaColorPreset {
  return PLASMA_COLOR_PRESETS.find((p) => p.id === id) ?? PLASMA_COLOR_PRESETS[0];
}
