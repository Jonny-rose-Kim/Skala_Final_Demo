import { Pause, Play, Repeat, RotateCcw } from "lucide-react";
import { DEFAULT_SCENARIO } from "../../presentation/scenario";
import { usePresentationStore } from "../../presentation/store";
import type { SceneHost } from "../../scene/sceneHost";
import { Button } from "../components/ui";

export function Timeline({ host }: { host: SceneHost | null }) {
  const t = usePresentationStore((s) => s.timeline);
  const clock = host?.clock;
  const dur = DEFAULT_SCENARIO.durationSec;
  return (
    <footer className="flex h-16 shrink-0 items-center gap-3 border-t border-slate-800 bg-slate-950/90 px-3" data-testid="timeline">
      <div className="flex items-center gap-1">
        <Button onClick={() => clock?.toggle()} title={t.playing ? "Pause (효과 시간 정지, 카메라 조작 가능)" : "Play"} testId="timeline-play">
          {t.playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
          {t.playing ? "Pause" : "Play"}
        </Button>
        <Button onClick={() => clock?.restart()} title="Restart illustration: 설명용 시퀀스를 처음부터" testId="timeline-restart">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restart
        </Button>
        <Button active={t.loop} onClick={() => clock?.setLoop(!t.loop)} title="Loop" testId="timeline-loop">
          <Repeat className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <select aria-label="Playback speed" className="rounded border border-slate-700 bg-slate-800 px-1 py-1 text-[12px]" value={t.speed} onChange={(e) => clock?.setSpeed(parseFloat(e.target.value))}>
          {[0.25, 0.5, 1, 2].map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="relative h-5">
          {DEFAULT_SCENARIO.phases.map((p) => (
            <button
              key={p.id + p.start}
              type="button"
              className="absolute top-0 h-5 truncate rounded-sm border border-slate-700/60 bg-slate-800/60 px-1 text-left text-[10px] text-slate-300 hover:bg-slate-700/60"
              style={{ left: `${(p.start / dur) * 100}%`, width: `calc(${((p.end - p.start) / dur) * 100}% - 2px)` }}
              title={`${p.label} (${p.labelKo}) ${p.start}–${p.end} s · scripted presentation`}
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
          value={t.playheadSec}
          aria-label="Timeline scrub"
          data-testid="timeline-scrub"
          onChange={(e) => clock?.scrub(parseFloat(e.target.value))}
        />
      </div>
      <div className="w-56 shrink-0 text-right text-[11px] text-slate-400">
        <div>
          <span className="tabular-nums text-slate-100">{t.playheadSec.toFixed(2)} s</span> / {dur.toFixed(0)} s · <span className="text-slate-200">{t.phaseLabelKo}</span>
        </div>
        <div>presentation_time · illustrative sequence</div>
      </div>
    </footer>
  );
}
