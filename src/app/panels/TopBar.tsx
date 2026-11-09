import { Box, Layers, Scissors, Eye, Grid3x3, Camera, RotateCcw, Crosshair, PanelLeft, PanelRight, PanelBottom, Sun, Lightbulb } from "lucide-react";
import { usePresentationStore, type ViewMode, type QualityPreset } from "../../presentation/store";
import { cameraPresets } from "../../scene/cameraPresets";
import { CHAMBER_LAYOUT } from "../../config/geometry";
import { MODES } from "../../providers/modes";
import { Badge, Button } from "../components/ui";

const VIEW_MODES: { id: ViewMode; label: string; icon: typeof Box; title: string }[] = [
  { id: "assembled", label: "Assembled", icon: Box, title: "정상 조립 상태. 외장과 viewport를 통해 내부를 본다." },
  { id: "cutaway", label: "Cutaway", icon: Scissors, title: "가상 단면(sector). 실제 chamber open 상태가 아니다." },
  { id: "xray", label: "X-ray", icon: Eye, title: "외장 반투명 관찰 모드. 실제 재질 변경이 아니다." },
  { id: "exploded", label: "Exploded", icon: Layers, title: "주요 assembly 분해 표시. Plasma는 숨겨진다." },
];

export function TopBar() {
  const viewMode = usePresentationStore((s) => s.viewMode);
  const setViewMode = usePresentationStore((s) => s.setViewMode);
  const quality = usePresentationStore((s) => s.qualityPreset);
  const effective = usePresentationStore((s) => s.effectiveQuality);
  const setQuality = usePresentationStore((s) => s.setQualityPreset);
  const renderer = usePresentationStore((s) => s.renderer);
  const timeline = usePresentationStore((s) => s.timeline);
  const perf = usePresentationStore((s) => s.perf);
  const panels = usePresentationStore((s) => s.panels);
  const togglePanel = usePresentationStore((s) => s.togglePanel);
  const cameraPresetId = usePresentationStore((s) => s.cameraPresetId);
  const setCameraPreset = usePresentationStore((s) => s.setCameraPreset);
  const requestResetCamera = usePresentationStore((s) => s.requestResetCamera);
  const requestFocusSelected = usePresentationStore((s) => s.requestFocusSelected);
  const selected = usePresentationStore((s) => s.selectedAssetId);
  const lighting = usePresentationStore((s) => s.lightingPreset);
  const setLighting = usePresentationStore((s) => s.setLightingPreset);
  const appMode = usePresentationStore((s) => s.appMode);
  const mode = MODES.find((m) => m.id === appMode)!;
  const presets = cameraPresets(CHAMBER_LAYOUT);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-3" data-testid="topbar">
      <div className="flex items-center gap-2">
        <Grid3x3 className="h-4 w-4 text-sky-400" aria-hidden />
        <span className="text-[13px] font-semibold tracking-wide">PECVD FAB Twin</span>
        <Badge tone="info" title={mode.summaryKo}>
          {mode.label}
        </Badge>
        <Badge tone="neutral" title="설명용 재생 상태. 센서/설비 상태가 아니다.">
          {timeline.playing ? "Playing" : "Paused"} · {timeline.phaseLabelKo}
        </Badge>
      </div>
      <div className="mx-1 h-6 w-px bg-slate-800" />
      <nav className="flex items-center gap-1" aria-label="관찰 모드">
        {VIEW_MODES.map((m) => (
          <Button key={m.id} active={viewMode === m.id} onClick={() => setViewMode(m.id)} title={m.title} testId={`viewmode-${m.id}`}>
            <m.icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
          </Button>
        ))}
      </nav>
      <div className="mx-1 h-6 w-px bg-slate-800" />
      <div className="flex items-center gap-1">
        <Camera className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        <select
          aria-label="Camera preset"
          className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[12px]"
          value={cameraPresetId ?? ""}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            if (!p) return;
            if (p.viewMode) setViewMode(p.viewMode);
            setCameraPreset(p.id);
          }}
          data-testid="camera-preset"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <Button onClick={requestResetCamera} title="Reset camera: 기본 overview 시점으로 복귀 (관찰 모드는 유지)" testId="reset-camera">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset camera
        </Button>
        <Button onClick={requestFocusSelected} disabled={!selected} title="선택한 부품으로 카메라 이동" testId="focus-selected">
          <Crosshair className="h-3.5 w-3.5" aria-hidden /> Focus
        </Button>
        <Button active={lighting === "inspection"} onClick={() => setLighting(lighting === "inspection" ? "exterior" : "inspection")} title="Inspection lighting: 내부 부품을 읽기 쉽게 카메라 headlamp와 환경광을 보강" testId="lighting-toggle">
          {lighting === "inspection" ? <Lightbulb className="h-3.5 w-3.5" aria-hidden /> : <Sun className="h-3.5 w-3.5" aria-hidden />} {lighting === "inspection" ? "Inspection light" : "Exterior light"}
        </Button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1 text-[12px] text-slate-300">
          Quality
          <select aria-label="Quality" className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[12px]" value={quality} onChange={(e) => setQuality(e.target.value as QualityPreset)} data-testid="quality-select">
            <option value="auto">Auto ({effective})</option>
            <option value="high">High</option>
            <option value="balanced">Balanced</option>
          </select>
        </label>
        <Badge
          tone={renderer.status === "ready" ? "ok" : renderer.status === "fallback" ? "warn" : renderer.status === "error" ? "warn" : "neutral"}
          title={[renderer.gpu ?? "", renderer.fallbackReason ?? "", renderer.forceWebGL2 ? "Force WebGL2 활성" : ""].filter(Boolean).join("\n") || "렌더러 상태"}
        >
          {renderer.backend ? renderer.backend.toUpperCase() : renderer.status === "initializing" ? "Init…" : "No renderer"}
          {renderer.status === "fallback" ? " (fallback)" : ""}
        </Badge>
        {perf && (
          <Badge tone="neutral" title={`${perf.renderWidth}×${perf.renderHeight} @ DPR ${perf.dpr.toFixed(2)} · active meshes ${perf.activeMeshes}`}>
            {perf.fps.toFixed(0)} fps · {perf.frameMs.toFixed(1)} ms
          </Badge>
        )}
        <div className="mx-1 h-6 w-px bg-slate-800" />
        <Button active={panels.tree} onClick={() => togglePanel("tree")} title="Component tree 열기/닫기" testId="toggle-tree">
          <PanelLeft className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button active={panels.inspector} onClick={() => togglePanel("inspector")} title="Inspector 열기/닫기" testId="toggle-inspector">
          <PanelRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button active={panels.timeline} onClick={() => togglePanel("timeline")} title="Timeline 열기/닫기" testId="toggle-timeline">
          <PanelBottom className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
