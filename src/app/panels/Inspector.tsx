import { Crosshair, EyeOff, Focus, Link2, RotateCcw } from "lucide-react";
import { CHAMBER_LAYOUT, GEOMETRY_CONFIG } from "../../config/geometry";
import { connectionsFor, getAssembly, getComponent } from "../../domain/ccpChamberTemplate";
import { measurementPointsFor, sensorsMountedOn } from "../../domain/sensors";
import { PLASMA_RENDER_SOURCE } from "../../plasma/plasmaVolume";
import { DEFAULT_SCENARIO } from "../../presentation/scenario";
import { usePresentationStore } from "../../presentation/store";
import { Badge, Button, Section, mmText } from "../components/ui";

export function Inspector() {
  const selected = usePresentationStore((s) => s.selectedAssetId);
  const select = usePresentationStore((s) => s.select);
  const isolated = usePresentationStore((s) => s.isolatedAssetId);
  const isolate = usePresentationStore((s) => s.isolate);
  const hidden = usePresentationStore((s) => s.hiddenAssets);
  const setHidden = usePresentationStore((s) => s.setHidden);
  const showAll = usePresentationStore((s) => s.showAll);
  const requestFocus = usePresentationStore((s) => s.requestFocusSelected);
  const instanceId = usePresentationStore((s) => s.activeInstanceId);
  const comp = selected ? getComponent(selected) : undefined;

  if (!comp) {
    return (
      <div className="px-3 py-3 text-[12px] text-slate-400" data-testid="inspector-empty">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Component inspector</div>
        <p>3D 화면 또는 좌측 tree에서 부품을 선택하면 역할·재질·소속·대표 치수·연결을 표시합니다.</p>
        <p className="mt-2 text-slate-500">
          Geometry: <span className="text-slate-300">{GEOMETRY_CONFIG.geometry_revision}</span> ({GEOMETRY_CONFIG.source.kind}) · Effects: <span className="text-slate-300">{PLASMA_RENDER_SOURCE}</span>
        </p>
        {hidden.length > 0 || isolated ? (
          <Button className="mt-3" onClick={showAll} testId="show-all">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Show all ({hidden.length} hidden{isolated ? ", isolated" : ""})
          </Button>
        ) : null}
      </div>
    );
  }

  const assembly = getAssembly(comp.assembly);
  const dims = comp.dimensions(CHAMBER_LAYOUT);
  const conns = connectionsFor(comp.assetId);
  const sensors = sensorsMountedOn(comp.assetId);
  const points = measurementPointsFor(comp.assetId, CHAMBER_LAYOUT);
  const isHidden = hidden.includes(comp.assetId);
  const isPlasma = comp.assetId === "plasma_volume";

  return (
    <div data-testid="inspector" data-asset={comp.assetId}>
      <Section
        title="Component inspector"
        right={
          <Badge tone={isPlasma ? "warn" : "neutral"} title={isPlasma ? "설명용 시각 효과" : `Geometry source: ${GEOMETRY_CONFIG.source.kind}`}>
            {isPlasma ? "render_source: illustrative" : `geometry: ${GEOMETRY_CONFIG.source.kind}`}
          </Badge>
        }
      >
        <h2 className="text-[14px] font-semibold text-slate-100" data-testid="inspector-name">
          {comp.name}
        </h2>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {comp.assetId} · {comp.nodeKey} · {instanceId}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          Assembly: <span className="text-slate-200">{assembly?.name}</span> · Kind: <span className="text-slate-200">{comp.kind}</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{comp.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button onClick={requestFocus} title="카메라를 이 부품으로 이동" testId="inspector-focus">
            <Crosshair className="h-3.5 w-3.5" aria-hidden /> Focus
          </Button>
          {!isPlasma && (
            <>
              <Button active={isolated === comp.assetId} onClick={() => isolate(isolated === comp.assetId ? null : comp.assetId)} title="이 부품만 표시" testId="inspector-isolate">
                <Focus className="h-3.5 w-3.5" aria-hidden /> Isolate
              </Button>
              <Button active={isHidden} onClick={() => setHidden(comp.assetId, !isHidden)} title="이 부품 숨기기/표시" testId="inspector-hide">
                <EyeOff className="h-3.5 w-3.5" aria-hidden /> {isHidden ? "Show" : "Hide"}
              </Button>
            </>
          )}
          {(hidden.length > 0 || isolated) && (
            <Button onClick={showAll} title="숨김/isolate 모두 해제">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Show all
            </Button>
          )}
        </div>
      </Section>
      <Section title="Material">
        <div className="text-[12px] text-slate-200">{comp.materialRef === "none" ? "-" : comp.materialRef}</div>
        <div className="text-[11px] text-slate-400">{comp.materialNote}</div>
      </Section>
      {dims.length > 0 && (
        <Section title="Representative dimensions (assumed)">
          <table className="w-full text-[12px]">
            <tbody>
              {dims.map((d) => (
                <tr key={d.label} className="border-t border-slate-800/60">
                  <td className="py-0.5 pr-2 text-slate-400">{d.label}</td>
                  <td className="py-0.5 text-right tabular-nums text-slate-100">{d.label === "Slots" || d.label === "Convolutions" ? d.valueM : mmText(d.valueM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      {conns.length > 0 && (
        <Section title="Connections">
          <ul className="space-y-1 text-[12px]">
            {conns.map((c) => {
              const other = c.from.assetId === comp.assetId ? c.to : c.from;
              const otherComp = getComponent(other.assetId);
              const dir = c.from.assetId === comp.assetId ? "→" : "←";
              return (
                <li key={c.connectionId} className="flex items-start gap-1.5">
                  <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                  <div>
                    <button type="button" className="text-sky-300 hover:underline" onClick={() => select(other.assetId)}>
                      {dir} {otherComp?.name ?? other.assetId}
                    </button>
                    <span className="ml-1 text-[11px] text-slate-500">[{c.kind}]</span>
                    <div className="text-[11px] text-slate-400">{c.description}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {(sensors.length > 0 || points.length > 0) && (
        <Section title="Sensing">
          {sensors.map((s) => (
            <div key={s.sensorId} className="mb-2">
              <div className="text-[12px] text-slate-200">{s.name}</div>
              <div className="text-[11px] text-slate-500">{s.principle}</div>
              <ul className="mt-1 space-y-0.5">
                {s.channels.map((ch) => (
                  <li key={ch.channelId} className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-300">
                      {ch.name} <span className="text-slate-500">[{ch.unit}]</span>
                    </span>
                    <Badge tone="neutral" title="V1에는 연결된 데이터 소스가 없다. 값·단위·시간을 임의로 채우지 않는다.">
                      Unbound / 연결된 데이터 없음
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {points.map((p) => (
            <div key={p.pointId} className="mt-1 text-[11px] text-slate-400">
              <span className="text-slate-300">Measurement point:</span> {p.name} — {p.note}
            </div>
          ))}
        </Section>
      )}
      {(comp.assumptions?.length || isPlasma) && (
        <Section title="Assumptions & sources">
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-slate-400">
            {comp.assumptions?.map((a) => <li key={a}>{a}</li>)}
            {isPlasma && (
              <>
                <li>Sequence: {DEFAULT_SCENARIO.title} ({DEFAULT_SCENARIO.id}) — scripted presentation, not computed ignition/transient physics.</li>
                <li>Shader: bounded-cylinder ray marching with opaque-depth termination; GLSL (WebGL2) / WGSL (WebGPU) with identical uniforms.</li>
              </>
            )}
            <li>Geometry revision {GEOMETRY_CONFIG.geometry_revision} — {GEOMETRY_CONFIG.source.note}</li>
          </ul>
        </Section>
      )}
    </div>
  );
}
