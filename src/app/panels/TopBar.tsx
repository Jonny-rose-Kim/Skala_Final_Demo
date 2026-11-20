import { Box, Layers, Scissors, Eye, Camera, RotateCcw, Crosshair, PanelLeft, PanelBottom, Sun, Lightbulb, Factory, PackageOpen } from "lucide-react";
import { usePresentationStore, type ViewMode, type QualityPreset } from "../../presentation/store";
import { cameraPresets } from "../../scene/cameraPresets";
import { getBundle } from "../../domain/registry";
import { CHAMBER_LAYOUT } from "../../config/geometry";
import { MODES } from "../../providers/modes";
import type { SceneHost } from "../../scene/sceneHost";
import { Badge, Brand, Button, SELECT_CLASS } from "../components/ui";

const VIEW_MODES: { id: ViewMode; label: string; icon: typeof Box; title: string }[] = [
  { id: "assembled", label: "Assembled", icon: Box, title: "정상 조립 상태. 외장과 viewport를 통해 내부를 본다." },
  { id: "cutaway", label: "Cutaway", icon: Scissors, title: "가상 단면(sector). 실제 chamber open 상태가 아니다." },
  { id: "xray", label: "X-ray", icon: Eye, title: "외장 반투명 관찰 모드. 실제 재질 변경이 아니다. Simplified transfer enclosure는 불투명하게 유지된다." },
  { id: "exploded", label: "Exploded", icon: Layers, title: "주요 assembly 분해 표시. Plasma/Slurry/Hoist motion은 정지·숨김된다." },
];

export function TopBar({ host }: { host: SceneHost | null }) {
  const viewMode = usePresentationStore((s) => s.viewMode);
  const overview = usePresentationStore((s) => s.overview);
  const setOverview = usePresentationStore((s) => s.setOverview);
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
  const setCutaway = usePresentationStore((s) => s.setCutaway);
  const requestResetCamera = usePresentationStore((s) => s.requestResetCamera);
  const requestFocusSelected = usePresentationStore((s) => s.requestFocusSelected);
  const requestFocusInstance = usePresentationStore((s) => s.requestFocusInstance);
  const selected = usePresentationStore((s) => s.selectedAssetId);
  const selectedMeasurement = usePresentationStore((s) => s.selectedMeasurement);
  const lighting = usePresentationStore((s) => s.lightingPreset);
  const setLighting = usePresentationStore((s) => s.setLightingPreset);
  const appMode = usePresentationStore((s) => s.appMode);
  const instances = usePresentationStore((s) => s.instances);
  const activeInstanceId = usePresentationStore((s) => s.activeInstanceId);
  const setActiveInstance = usePresentationStore((s) => s.setActiveInstance);
  const carrierSection = usePresentationStore((s) => s.carrierSection);
  const setCarrierSection = usePresentationStore((s) => s.setCarrierSection);
  const hasCarrier = instances.some((i) => i.mobile && getBundle(i.templateId)?.carrierSlots);
  const mode = MODES.find((m) => m.id === appMode)!;
  const presets = host ? host.presetsFor(activeInstanceId) : cameraPresets(CHAMBER_LAYOUT);

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-canvas px-5 py-3" data-testid="topbar">
      <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        <Brand />
        <Badge tone="info" title={mode.summaryKo}>
          {mode.label}
        </Badge>
        <Badge tone="neutral" title={`설명용 재생 상태. 센서/설비 상태가 아니다. 현재 단계: ${timeline.phaseLabelKo}`}>
          {!timeline.playing ? "Paused" : timeline.holding ? "Holding" : "Playing"}
        </Badge>
      </div>
      <div className="h-6 w-px shrink-0 bg-line" />
      <div className="flex shrink-0 items-center gap-1" aria-label="장비 선택">
        <Button active={overview} onClick={() => setOverview(true)} title="FAB overview: 네 장비와 OHT rail 전체 배치" testId="overview-button">
          <Factory className="h-4 w-4" aria-hidden /> Overview
        </Button>
        <select
          aria-label="Equipment instance"
          className={`max-w-[230px] truncate ${SELECT_CLASS}`}
          value={activeInstanceId}
          onChange={(e) => {
            setActiveInstance(e.target.value);
            setOverview(false);
            requestFocusInstance();
          }}
          data-testid="instance-select"
        >
          {instances.length === 0 && <option value={activeInstanceId}>{activeInstanceId}</option>}
          {instances.map((i) => (
            <option key={i.instanceId} value={i.instanceId}>
              {i.familyLabel} · {i.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="h-6 w-px shrink-0 bg-line" />
      <nav className="flex shrink-0 items-center gap-1" aria-label="관찰 모드">
        {VIEW_MODES.map((m) => (
          <Button key={m.id} active={!overview && viewMode === m.id} onClick={() => setViewMode(m.id)} title={m.title} testId={`viewmode-${m.id}`}>
            <m.icon className="h-4 w-4" aria-hidden /> {m.label}
          </Button>
        ))}
        {hasCarrier && (
          <Button active={carrierSection} onClick={() => setCarrierSection(!carrierSection)} title="FOUP 단면 보기: seat 축을 지나는 평면으로 FOUP 뒤쪽 절반을 잘라 slot과 웨이퍼를 보여 줍니다. 선택한 장비와 보기 모드는 그대로이고, 몇 장이 들었는지는 화면 왼쪽 위에 나옵니다." testId="carrier-section-button">
            <PackageOpen className="h-4 w-4" aria-hidden /> FOUP section
          </Button>
        )}
      </nav>
      <div className="h-6 w-px shrink-0 bg-line" />
      <div className="flex shrink-0 items-center gap-1">
        <Camera className="h-4 w-4 text-ink-muted" aria-hidden />
        <select
          aria-label="Camera preset"
          className={`max-w-[180px] ${SELECT_CLASS}`}
          value={cameraPresetId ?? ""}
          onChange={(e) => {
            const p = presets.find((x) => x.id === e.target.value);
            if (!p) return;
            if (p.id === "bay-overview") {
              setOverview(true);
              return;
            }
            if (p.viewMode) setViewMode(p.viewMode);
            if (p.cutaway) setCutaway(p.cutaway);
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
        <Button onClick={requestResetCamera} title="Reset camera: 현재 장비의 기본 시점으로 복귀 (관찰 모드는 유지)" testId="reset-camera">
          <RotateCcw className="h-4 w-4" aria-hidden /> Reset
        </Button>
        <Button onClick={requestFocusSelected} disabled={!selected && !selectedMeasurement} title="선택한 부품/계측 위치로 카메라 이동" testId="focus-selected">
          <Crosshair className="h-4 w-4" aria-hidden /> Focus
        </Button>
        <Button active={lighting === "inspection"} onClick={() => setLighting(lighting === "inspection" ? "exterior" : "inspection")} title={lighting === "inspection" ? "Inspection light 켜짐: 카메라 headlamp와 환경광 보강 (클릭하면 Exterior light)" : "Exterior light: 클릭하면 Inspection light (내부 부품 관찰용 headlamp)"} testId="lighting-toggle">
          {lighting === "inspection" ? <Lightbulb className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />}
        </Button>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <label className="flex items-center gap-1 whitespace-nowrap text-meta text-ink" title="Quality preset">
          Q
          <select aria-label="Quality" className={SELECT_CLASS} value={quality} onChange={(e) => setQuality(e.target.value as QualityPreset)} data-testid="quality-select">
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
        <div className="h-6 w-px shrink-0 bg-line" />
        <Button active={panels.tree} onClick={() => togglePanel("tree")} title="Component tree 펼치기/접기 (접으면 왼쪽 가장자리에 얇은 줄로 남습니다)" testId="toggle-tree">
          <PanelLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button active={panels.timeline} onClick={() => togglePanel("timeline")} title="Timeline 열기/닫기" testId="toggle-timeline">
          <PanelBottom className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
