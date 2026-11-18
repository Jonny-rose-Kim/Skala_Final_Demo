import { Pause, Play, PowerOff, RotateCcw } from "lucide-react";
import { releasePointSec } from "../../presentation/scenario";
import { availableScenarios, getScenario } from "../../presentation/scenarioRegistry";
import { usePresentationStore } from "../../presentation/store";
import type { SceneHost } from "../../scene/sceneHost";
import { Button, SELECT_CLASS, Toggle } from "../components/ui";

const EQUIPMENT_TONE: Record<string, string> = {
  ccp: "border-[#7c5cc4] bg-[#f3effc] text-[#4b2f91]",
  remote: "border-[#b4529a] bg-[#fcf0f8] text-[#7d2766]",
  cmp: "border-[#2f8f62] bg-[#ecf8f1] text-[#1a5e3e]",
  oht: "border-[#c26a06] bg-warn-soft text-warn",
  carrier: "border-accent bg-accent-soft text-accent-strong",
  external: "border-control bg-subtle text-ink-muted",
};

export function Timeline({ host }: { host: SceneHost | null }) {
  const t = usePresentationStore((s) => s.timeline);
  const scenarioId = usePresentationStore((s) => s.scenarioId);
  const setScenario = usePresentationStore((s) => s.setScenario);
  const instances = usePresentationStore((s) => s.instances);
  const followPhase = usePresentationStore((s) => s.followPhase);
  const setFollowPhase = usePresentationStore((s) => s.setFollowPhase);
  const clock = host?.clock;
  const def = getScenario(scenarioId) ?? getScenario(t.scenarioId);
  const scenario = def?.scenario;
  const dur = scenario?.durationSec ?? t.durationSec;
  const releaseAt = scenario ? releasePointSec(scenario) : null;
  const heldPhase = scenario?.phases.find((p) => p.holdUntilRelease);
  const canRelease = releaseAt !== null && heldPhase !== undefined && t.phase === heldPhase.id;
  const options = availableScenarios(instances);
  return (
    <footer className="flex h-16 shrink-0 items-center gap-3 border-t border-line bg-canvas px-3" data-testid="timeline">
      <div className="flex items-center gap-1">
        <select
          aria-label="Scenario"
          className={`max-w-[230px] ${SELECT_CLASS}`}
          value={scenarioId}
          onChange={(e) => setScenario(e.target.value)}
          title={def ? `${def.titleKo} · scripted presentation (설명용 scenario 초기화)` : ""}
          data-testid="scenario-select"
        >
          {options.length === 0 && <option value={scenarioId}>{scenarioId}</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.kind === "linked" ? "▶ " : ""}
              {o.title}
            </option>
          ))}
        </select>
        <Button onClick={() => clock?.toggle()} title={t.playing ? "Pause (효과 시간 정지, 카메라 조작 가능)" : "Play"} testId="timeline-play">
          {t.playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          {t.playing ? "Pause" : "Play"}
        </Button>
        <Button onClick={() => clock?.restart()} title="Restart illustration: 설명용 시퀀스를 처음부터 (Visual demonstration만 재시작)" testId="timeline-restart">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restart
        </Button>
        {heldPhase && (
          <Button
            onClick={() => releaseAt !== null && clock?.release(releaseAt)}
            disabled={!canRelease}
            title={`${def?.releaseLabel ?? "Release"}: 유지 중인 단계를 끝내고 다음 연출로 진행 (해당 단계에서만 사용 가능)`}
            testId="timeline-extinguish"
          >
            <PowerOff className="h-3.5 w-3.5" aria-hidden /> {def?.releaseLabel ?? "Release"}
          </Button>
        )}
        <select aria-label="Playback speed" className={SELECT_CLASS} value={t.speed} onChange={(e) => clock?.setSpeed(parseFloat(e.target.value))}>
          {[0.25, 0.5, 1, 2, 4].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="relative h-5">
          {(scenario?.phases ?? []).map((p) => (
            <button
              key={p.id + p.start}
              type="button"
              className={`absolute top-0 h-5 truncate rounded-sm border px-1 text-left text-[13px] hover:brightness-95 ${EQUIPMENT_TONE[p.equipment ?? "external"] ?? EQUIPMENT_TONE.external} ${t.phase === p.id ? "ring-2 ring-accent" : ""}`}
              style={{ left: `${(p.start / dur) * 100}%`, width: `calc(${((p.end - p.start) / dur) * 100}% - 2px)` }}
              title={`${p.label} (${p.labelKo}) ${p.start.toFixed(1)}–${p.end.toFixed(1)} s · ${p.equipment ?? ""} · scripted presentation`}
              onClick={() => clock?.scrub(p.start + 0.001)}
              data-testid={`phase-${p.id}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="range"
          className="w-full"
          min={0}
          max={dur}
          step={0.01}
          value={Math.min(t.playheadSec, dur)}
          aria-label="Timeline scrub"
          data-testid="timeline-scrub"
          onChange={(e) => clock?.scrub(parseFloat(e.target.value))}
        />
      </div>
      <div className="w-60 shrink-0 text-right text-[13px] text-ink-muted">
        <div>
          <span className="tabular-nums text-ink">{t.playheadSec.toFixed(2)} s</span> / {dur.toFixed(0)} s · <span className="text-ink" data-testid="timeline-phase">{t.holding ? `${t.phaseLabelKo} 유지 중` : t.phaseLabelKo}</span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <span>presentation_time · {def?.kind === "linked" ? "linked demo" : "illustrative sequence"}</span>
          {def?.kind === "linked" && (
            <span className="inline-flex items-center gap-1" title="단계가 바뀌면 해당 장비로 선택·카메라를 이동">
              <Toggle label="Follow" checked={followPhase} onChange={setFollowPhase} testId="follow-phase" />
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
