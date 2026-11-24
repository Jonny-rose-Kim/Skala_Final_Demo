/**
 * PresentationState (Zustand): selection, observation settings and display state.
 * Nothing in here is a simulation state, a sensor value or a backend command. Per-frame values
 * (playhead, fps, preview snapshot) are published at low frequency from the renderer.
 */
import { create } from "zustand";
import type { PreviewState } from "./preview";

export type ViewMode = "assembled" | "cutaway" | "xray" | "exploded";
export type QualityPreset = "auto" | "high" | "balanced";
export type EffectiveQuality = "high" | "balanced";
export type LightingPreset = "exterior" | "inspection";
export type RendererBackend = "webgpu" | "webgl2";
export type AppMode = "visual-inspection" | "simulation" | "replay";
/** Inspection cover display: auto = removed on the active tool outside the bay overview. Display only, never a door state. */
export type CoverMode = "auto" | "closed" | "removed";

export interface EnvironmentSettings {
  /** Fab environment (floor, ceiling grid, walls, utilities) shown. */
  visible: boolean;
  /** Ceiling grid / FFU panels (auto-hidden when the camera is above them). */
  ceiling: boolean;
  /** Bay walls (auto-hidden when the camera is outside them). */
  walls: boolean;
}

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
  /** Remote source: weak afterglow in the transport section (illustrative, separate from the main glow). */
  afterglowIntensity: number; // 0..1
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
  afterglowIntensity: 0.25,
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
  /** Parked at the end of the held phase, waiting for the viewer to release (e.g. Extinguish). */
  holding: boolean;
  speed: number;
  durationSec: number;
  phase: string;
  phaseLabelKo: string;
  intensity: number;
  scenarioId: string;
  /** Equipment the current phase is about (linked demonstrations). */
  phaseEquipment: string | null;
  phaseFocusInstanceId: string | null;
}

export interface OverlaySettings {
  gasPath: boolean;
  labels: boolean;
  sheath: boolean;
  /** Remote: downstream transport trace (schematic). */
  transport: boolean;
  /** Remote: precursor injection trace (schematic). */
  precursor: boolean;
  /** Remote: weak afterglow in the transport section. */
  afterglow: boolean;
  /** CMP: slurry supply / film overlay. */
  slurry: boolean;
  /** CMP: optical endpoint path and footprint. */
  opticalPath: boolean;
  /** Measurement markers (instrument body / mount / point / path). */
  markers: boolean;
  /** OHT: rail / hoist reference frames and station regions. */
  railFrames: boolean;
  /** Current route: concept cross-section of the demonstration wafer (UI inset). */
  waferSection: boolean;
}

export type OverlayKey = keyof OverlaySettings;

export interface SelectedMeasurement {
  kind: "instrument" | "point" | "channel";
  id: string;
}

export interface LoadedInstanceInfo {
  instanceId: string;
  templateId: string;
  displayName: string;
  familyLabel: string;
  mobile: boolean;
}

export interface PresentationState {
  appMode: AppMode;
  activeInstanceId: string;
  /** Instances loaded by the scene host (reported once the world is built). */
  instances: LoadedInstanceInfo[];
  /** FAB overview: whole bay framed, no cutaway / x-ray / explode applied. */
  overview: boolean;
  scenarioId: string;
  /** Linked demonstrations: active instance and camera follow the phase focus. */
  followPhase: boolean;
  selectedAssetId: string | null;
  hoveredAssetId: string | null;
  selectedMeasurement: SelectedMeasurement | null;
  viewMode: ViewMode;
  cutaway: CutawaySettings;
  xrayOpacity: number;
  explodeAmount: number;
  hiddenAssets: string[];
  isolatedAssetId: string | null;
  visual: VisualSettings;
  overlays: OverlaySettings;
  coverMode: CoverMode;
  /** FOUP section view: carriers are cut through the seat axis so slots and wafers show (display only, any active tool). */
  carrierSection: boolean;
  environment: EnvironmentSettings;
  qualityPreset: QualityPreset;
  effectiveQuality: EffectiveQuality;
  lightingPreset: LightingPreset;
  cameraPresetId: string | null;
  renderer: RendererInfo;
  perf: PerfSample | null;
  timeline: TimelineSnapshot;
  /** Low-rate snapshot of the scripted preview (poses, holders, film state) for the UI (FOUP section inset). */
  preview: PreviewState | null;
  /** Diagnosis highlight from an agent event (src/domain/agentContract.ts); null = none. */
  diagnosis: import("../domain/agentContract").DiagnosisHighlight | null;
  devWarnings: string[];
  /** `tree: false` folds the component tree into the thin rail on the left edge; `timeline: false` hides the timeline. */
  panels: { tree: boolean; timeline: boolean };
  /** Monotonic counters consumed by the scene host (one-shot requests). */
  requests: { resetCamera: number; focusSelected: number; cameraPreset: number; focusInstance: number; focusCarrier: number };

  select(assetId: string | null): void;
  hover(assetId: string | null): void;
  selectMeasurement(sel: SelectedMeasurement | null): void;
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
  setOverlay(key: OverlayKey, v: boolean): void;
  setCoverMode(m: CoverMode): void;
  setCarrierSection(v: boolean): void;
  setEnvironment(partial: Partial<EnvironmentSettings>): void;
  setQualityPreset(p: QualityPreset): void;
  reportEffectiveQuality(q: EffectiveQuality): void;
  setLightingPreset(p: LightingPreset): void;
  setCameraPreset(id: string | null): void;
  setRenderer(partial: Partial<RendererInfo>): void;
  reportPerf(p: PerfSample): void;
  reportTimeline(t: TimelineSnapshot): void;
  reportPreview(p: PreviewState): void;
  setDiagnosis(d: import("../domain/agentContract").DiagnosisHighlight | null): void;
  reportInstances(list: LoadedInstanceInfo[]): void;
  setDevWarnings(w: string[]): void;
  togglePanel(p: "tree" | "timeline"): void;
  setPanel(p: "tree" | "timeline", open: boolean): void;
  requestResetCamera(): void;
  requestFocusSelected(): void;
  requestFocusInstance(): void;
  /** Camera to the carrier from the side its section view opens to (active tool unchanged). */
  requestFocusCarrier(): void;
  setActiveInstance(id: string): void;
  setOverview(v: boolean): void;
  setScenario(id: string): void;
  setFollowPhase(v: boolean): void;
}

const DEFAULT_CUTAWAY: CutawaySettings = { azimuthDeg: 265, sweepDeg: 95, effectiveAzimuthDeg: 265, effectiveSweepDeg: 95, snapped: false };

export const DEFAULT_OVERLAYS: OverlaySettings = {
  gasPath: false,
  labels: false,
  sheath: false,
  transport: true,
  precursor: true,
  afterglow: true,
  slurry: true,
  opticalPath: true,
  markers: false,
  railFrames: false,
  waferSection: true,
};

export const DEFAULT_SCENARIO_ID = "route-dep-etch-clean-v1";

export const usePresentationStore = create<PresentationState>((set) => ({
  appMode: "visual-inspection",
  activeInstanceId: "PRODUCER-01",
  instances: [],
  overview: false,
  scenarioId: DEFAULT_SCENARIO_ID,
  followPhase: true,
  selectedAssetId: null,
  hoveredAssetId: null,
  selectedMeasurement: null,
  viewMode: "assembled",
  cutaway: DEFAULT_CUTAWAY,
  xrayOpacity: 0.18,
  explodeAmount: 1,
  hiddenAssets: [],
  isolatedAssetId: null,
  visual: DEFAULT_VISUAL,
  overlays: DEFAULT_OVERLAYS,
  coverMode: "auto",
  carrierSection: false,
  environment: { visible: true, ceiling: true, walls: true },
  qualityPreset: "auto",
  effectiveQuality: "high",
  lightingPreset: "exterior",
  cameraPresetId: "overview",
  renderer: { backend: null, status: "idle", message: null, gpu: null, fallbackReason: null, forceWebGL2: false },
  perf: null,
  timeline: { playheadSec: 0, playing: true, holding: false, speed: 1, durationSec: 18, phase: "off", phaseLabelKo: "소등", intensity: 0, scenarioId: DEFAULT_SCENARIO_ID, phaseEquipment: "deposition", phaseFocusInstanceId: null },
  preview: null,
  diagnosis: null,
  devWarnings: [],
  panels: { tree: true, timeline: true },
  requests: { resetCamera: 0, focusSelected: 0, cameraPreset: 0, focusInstance: 0, focusCarrier: 0 },

  select: (assetId) => set({ selectedAssetId: assetId, selectedMeasurement: null }),
  hover: (assetId) => set((s) => (s.hoveredAssetId === assetId ? s : { hoveredAssetId: assetId })),
  selectMeasurement: (sel) => set({ selectedMeasurement: sel }),
  setViewMode: (mode) => set({ viewMode: mode, overview: false }),
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
  setCoverMode: (m) => set({ coverMode: m }),
  setCarrierSection: (v) => set({ carrierSection: v }),
  setEnvironment: (partial) => set((s) => ({ environment: { ...s.environment, ...partial } })),
  setQualityPreset: (p) => set({ qualityPreset: p }),
  reportEffectiveQuality: (q) => set((s) => (s.effectiveQuality === q ? s : { effectiveQuality: q })),
  setLightingPreset: (p) => set({ lightingPreset: p }),
  setCameraPreset: (id) => set((s) => ({ cameraPresetId: id, overview: id === "bay-overview" ? true : s.overview && id === null, requests: { ...s.requests, cameraPreset: s.requests.cameraPreset + 1 } })),
  setRenderer: (partial) => set((s) => ({ renderer: { ...s.renderer, ...partial } })),
  reportPerf: (p) => set({ perf: p }),
  reportTimeline: (t) => set({ timeline: t }),
  reportPreview: (p) => set({ preview: p }),
  setDiagnosis: (d) => set({ diagnosis: d }),
  reportInstances: (list) => set({ instances: list }),
  setDevWarnings: (w) => set({ devWarnings: w }),
  togglePanel: (p) => set((s) => ({ panels: { ...s.panels, [p]: !s.panels[p] } })),
  setPanel: (p, open) => set((s) => (s.panels[p] === open ? s : { panels: { ...s.panels, [p]: open } })),
  requestResetCamera: () => set((s) => ({ requests: { ...s.requests, resetCamera: s.requests.resetCamera + 1 } })),
  requestFocusSelected: () => set((s) => ({ requests: { ...s.requests, focusSelected: s.requests.focusSelected + 1 } })),
  requestFocusInstance: () => set((s) => ({ requests: { ...s.requests, focusInstance: s.requests.focusInstance + 1 } })),
  requestFocusCarrier: () => set((s) => ({ requests: { ...s.requests, focusCarrier: s.requests.focusCarrier + 1 } })),
  setActiveInstance: (id) => set((s) => (s.activeInstanceId === id ? s : { activeInstanceId: id, selectedAssetId: null, selectedMeasurement: null, hiddenAssets: [], isolatedAssetId: null })),
  setOverview: (v) => set((s) => ({ overview: v, cameraPresetId: v ? "bay-overview" : s.cameraPresetId, requests: v ? { ...s.requests, cameraPreset: s.requests.cameraPreset + 1 } : s.requests })),
  setScenario: (id) => set({ scenarioId: id }),
  setFollowPhase: (v) => set({ followPhase: v }),
}));

export function colorPresetById(id: string): PlasmaColorPreset {
  return PLASMA_COLOR_PRESETS.find((p) => p.id === id) ?? PLASMA_COLOR_PRESETS[0];
}
