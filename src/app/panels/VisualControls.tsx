import { RotateCcw } from "lucide-react";
import { PLASMA_COLOR_PRESETS, usePresentationStore } from "../../presentation/store";
import { Button, Section, Select, Slider, Toggle } from "../components/ui";

export function VisualControls() {
  const visual = usePresentationStore((s) => s.visual);
  const setVisual = usePresentationStore((s) => s.setVisual);
  const resetVisual = usePresentationStore((s) => s.resetVisual);
  const viewMode = usePresentationStore((s) => s.viewMode);
  const cutaway = usePresentationStore((s) => s.cutaway);
  const setCutaway = usePresentationStore((s) => s.setCutaway);
  const xrayOpacity = usePresentationStore((s) => s.xrayOpacity);
  const setXrayOpacity = usePresentationStore((s) => s.setXrayOpacity);
  const explodeAmount = usePresentationStore((s) => s.explodeAmount);
  const setExplodeAmount = usePresentationStore((s) => s.setExplodeAmount);
  const overlays = usePresentationStore((s) => s.overlays);
  const setOverlay = usePresentationStore((s) => s.setOverlay);

  return (
    <div data-testid="visual-controls">
      {viewMode === "cutaway" && (
        <Section title="Cutaway sector">
          <Slider label="Sector azimuth" value={cutaway.azimuthDeg} min={0} max={360} step={1} onChange={(v) => setCutaway({ azimuthDeg: v })} format={(v) => `${v.toFixed(0)}°`} title="제거되는 sector의 중심 방위각" />
          <Slider label="Sector sweep" value={cutaway.sweepDeg} min={20} max={240} step={1} onChange={(v) => setCutaway({ sweepDeg: v })} format={(v) => `${v.toFixed(0)}°`} title="제거되는 sector의 각도 폭" />
          <div className="text-[11px] text-slate-500" data-testid="cutaway-effective">
            적용: {cutaway.effectiveAzimuthDeg.toFixed(0)}° / {cutaway.effectiveSweepDeg.toFixed(0)}°{cutaway.snapped ? " (포트를 피해 경계 보정됨)" : ""} · 가상 단면이며 실제 open/vent 상태가 아닙니다.
          </div>
        </Section>
      )}
      {viewMode === "xray" && (
        <Section title="Shell transparency">
          <Slider label="Shell opacity" value={xrayOpacity} min={0.03} max={0.8} step={0.01} onChange={setXrayOpacity} title="외장(housing) 투명도. 관찰 모드이며 실제 재질 변경이 아니다." />
        </Section>
      )}
      {viewMode === "exploded" && (
        <Section title="Exploded view">
          <Slider label="Explode amount" value={explodeAmount} min={0} max={1} step={0.01} onChange={setExplodeAmount} title="표시용 분해 거리. 0에서 정확히 조립 상태로 복귀" />
          <div className="text-[11px] text-slate-500">Plasma와 Gas/RF 연결은 분해 보기에서 숨겨집니다. 설비 geometry·sensor binding은 변경되지 않습니다.</div>
        </Section>
      )}
      <Section
        title="Plasma (illustrative)"
        right={
          <Button onClick={resetVisual} title="Reset visual settings: 시각 설정만 기본값으로 (카메라/재생 위치는 유지)" testId="reset-visual">
            <RotateCcw className="h-3 w-3" aria-hidden /> Reset
          </Button>
        }
      >
        <Toggle label="Plasma visible" checked={visual.plasmaVisible} onChange={(v) => setVisual({ plasmaVisible: v })} testId="plasma-visible" />
        <Slider label="Glow intensity" value={visual.glowIntensity} min={0} max={2} step={0.02} onChange={(v) => setVisual({ glowIntensity: v })} />
        <Slider label="Opacity" value={visual.opacity} min={0} max={1} step={0.01} onChange={(v) => setVisual({ opacity: v })} />
        <Select label="Color preset" value={visual.colorPreset} options={PLASMA_COLOR_PRESETS.map((p) => ({ value: p.id, label: p.label }))} onChange={(v) => setVisual({ colorPreset: v })} title="외형 기준 색 preset. 특정 가스의 스펙트럼이 아니다." />
        <Slider label="Edge softness" value={visual.edgeSoftness} min={0.02} max={0.5} step={0.01} onChange={(v) => setVisual({ edgeSoftness: v })} />
        <Slider label="Spatial variation" value={visual.variationStrength} min={0} max={1} step={0.01} onChange={(v) => setVisual({ variationStrength: v })} />
        <Slider label="Animation speed" value={visual.animationSpeed} min={0.1} max={3} step={0.05} onChange={(v) => setVisual({ animationSpeed: v })} format={(v) => `${v.toFixed(2)}×`} />
        <Slider label="Visual seed" value={visual.visualSeed} min={0} max={99} step={1} onChange={(v) => setVisual({ visualSeed: Math.round(v) })} format={(v) => v.toFixed(0)} title="시각 효과의 결정적 seed. Simulation seed와 무관" />
        <Toggle label="Plasma light on surfaces" checked={visual.plasmaLightEnabled} onChange={(v) => setVisual({ plasmaLightEnabled: v })} title="명시적인 point light 근사. Radiative transfer 계산이 아니다." />
      </Section>
      <Section title="Overlays">
        <Toggle label="Gas path (schematic)" checked={overlays.gasPath} onChange={(v) => setOverlay("gasPath", v)} title="Showerhead → wafer 주변 → exhaust의 설명용 경로. CFD 결과가 아니다." testId="overlay-gas" />
        <Toggle label="Assembly labels" checked={overlays.labels} onChange={(v) => setOverlay("labels", v)} testId="overlay-labels" />
        <Toggle label="Sheath concept region" checked={overlays.sheath} onChange={(v) => setOverlay("sheath", v)} title="전극 근처 sheath 개념 영역. 계산된 경계·두께·전위가 아니다." testId="overlay-sheath" />
      </Section>
    </div>
  );
}
