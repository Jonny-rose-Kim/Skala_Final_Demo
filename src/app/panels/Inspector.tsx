import { Crosshair, EyeOff, Focus, Link2, RotateCcw, Activity, MapPin, Radio } from "lucide-react";
import { describeDataStatus, type InstrumentDef, type MeasurementChannelDefV2, type MeasurementPointDefV2 } from "../../domain/measurement";
import { getBundle, measurementIndex } from "../../domain/registry";
import { recipeById, ROUTES } from "../../domain/materialFlow";
import { PLASMA_RENDER_SOURCE } from "../../plasma/plasmaVolume";
import { getScenario } from "../../presentation/scenarioRegistry";
import { usePresentationStore, type SelectedMeasurement } from "../../presentation/store";
import { Badge, Button, Section, mmText } from "../components/ui";

const KIND_LABEL: Record<string, string> = { point: "Point", region: "Region", optical_path: "Optical path", line_reference: "Line reference", axis_reference: "Axis reference" };
const STATUS_LABEL: Record<string, string> = { installed: "Installed", planned: "Planned", not_installed: "Not installed", candidate: "설치 후보 / Not installed" };
const HOLDER_LABEL: Record<string, string> = { carrier_slot: "FOUP slot", internal_transfer: "Internal transfer (simplified)", process_stage: "Process stage", cmp_head: "CMP carrier head", load_cup: "Load cup", clean_module: "Clean / rinse module", dry_module: "Dry module" };

function fmtJoint(unit: "rad" | "m", v: number): string {
  if (unit === "rad") {
    const deg = (v * 180) / Math.PI;
    const wrapped = ((deg % 360) + 360) % 360;
    return Math.abs(deg) >= 360 ? `${wrapped.toFixed(1)}° (${(deg / 360).toFixed(1)} rev)` : `${deg.toFixed(1)}°`;
  }
  return `${(v * 1000).toFixed(0)} mm`;
}

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
  const instances = usePresentationStore((s) => s.instances);
  const selectedMeasurement = usePresentationStore((s) => s.selectedMeasurement);
  const selectMeasurement = usePresentationStore((s) => s.selectMeasurement);
  const preview = usePresentationStore((s) => s.preview);
  const scenarioId = usePresentationStore((s) => s.scenarioId);
  const info = instances.find((i) => i.instanceId === instanceId);
  const bundle = info ? getBundle(info.templateId) : undefined;
  const index = info ? measurementIndex(info.templateId) : undefined;
  const comp = selected && bundle ? bundle.template.components.find((c) => c.assetId === selected) : undefined;
  const ip = preview?.instances[instanceId];

  if (!bundle || !info) {
    return (
      <div className="px-3 py-3 text-[12px] text-slate-400" data-testid="inspector-empty">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Component inspector</div>
        <p>장비를 불러오는 중입니다. Effects: illustrative</p>
      </div>
    );
  }

  if (!comp) {
    const t = bundle.template;
    const def = getScenario(scenarioId);
    const carrier = preview?.carriers[instanceId];
    return (
      <div data-testid="inspector-empty">
        <Section title="Equipment" right={<Badge tone="neutral" title={`Geometry source: ${bundle.geometry.kind}`}>geometry: {bundle.geometry.kind}</Badge>}>
          <h2 className="text-[14px] font-semibold text-slate-100">{info.displayName}</h2>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {instanceId} · {t.displayName} · template {t.templateId} rev {t.templateRevision}
          </div>
          <p className="mt-1 text-[12px] text-slate-300">{t.title}</p>
          <p className="mt-2 text-[12px] text-slate-400">3D 화면 또는 좌측 tree에서 부품을 선택하면 역할·재질·소속·대표 치수·연결·계측을 표시합니다.</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Geometry: <span className="text-slate-300">{bundle.geometry.geometryRevision}</span> ({bundle.geometry.kind}) · Effects: <span className="text-slate-300">{PLASMA_RENDER_SOURCE}</span>
          </p>
          {hidden.length > 0 || isolated ? (
            <Button className="mt-3" onClick={showAll} testId="show-all">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Show all ({hidden.length} hidden{isolated ? ", isolated" : ""})
            </Button>
          ) : null}
        </Section>
        {t.facts.length > 0 && (
          <Section title="Representative configuration">
            <table className="w-full text-[12px]">
              <tbody>
                {t.facts.map((f) => (
                  <tr key={f.label} className="border-t border-slate-800/60 align-top">
                    <td className="py-0.5 pr-2 text-slate-400">{f.label}</td>
                    <td className="py-0.5 text-right text-slate-100" title={f.note}>
                      {f.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {t.facts.some((f) => f.note) && <div className="mt-1 text-[11px] text-slate-500">값 위에 마우스를 올리면 근거/주의 메모가 보입니다.</div>}
          </Section>
        )}
        {t.station && (
          <Section title="Carrier interface (station)">
            <div className="text-[12px] text-slate-200">Station LP.{instanceId}</div>
            <div className="text-[11px] text-slate-400">{t.station.noteKo}</div>
            <div className="mt-1 text-[11px] text-slate-500">Simplified internal transfer: enclosure는 불투명하게 유지되고, wafer holder는 FOUP slot → internal transfer → stage 순으로 바뀝니다.</div>
          </Section>
        )}
        {carrier && (
          <Section title="Carrier state (presented · scripted)">
            <div className="text-[12px] text-slate-200">
              presented_holder: <span className="text-sky-200">{carrier.holder.kind === "station" ? `station ${carrier.holder.id}` : `gripper (${carrier.holder.id})`}</span>
            </div>
            <div className="text-[11px] text-slate-400">
              door {carrier.doorOpen ? "open" : "closed"} · {carrier.docked ? "docked" : "not docked"}
            </div>
            <ul className="mt-1 text-[11px] text-slate-400">
              {Object.entries(carrier.slots).map(([slot, w]) => (
                <li key={slot}>
                  {slot}: {w ?? "empty"}
                </li>
              ))}
            </ul>
            <div className="mt-1 text-[11px] text-slate-500">Carrier ID는 반송 중 유지됩니다. Holder는 scripted presentation이며 E84/E87 신호가 아닙니다.</div>
          </Section>
        )}
        {preview && Object.values(preview.wafers).length > 0 && (
          <Section title="Wafers (presented · scripted)">
            {Object.values(preview.wafers).map((w) => (
              <div key={w.waferId} className="mb-1 text-[11px] text-slate-400">
                <span className="text-slate-200">{w.waferId}</span> · holder {HOLDER_LABEL[w.holder.kind] ?? w.holder.kind}
                {w.holder.instanceId ? ` @ ${w.holder.instanceId}` : w.holder.carrierId ? ` @ ${w.holder.carrierId}/${w.holder.slotId}` : ""} · reserved {w.reservedSlot.carrierId}/{w.reservedSlot.slotId} · film {w.film.status}
              </div>
            ))}
          </Section>
        )}
        {def && (
          <Section title="Scenario">
            <div className="text-[12px] text-slate-200">{def.title}</div>
            <div className="text-[11px] text-slate-400">{def.titleKo}</div>
            {def.routeId && (
              <div className="mt-1 text-[11px] text-slate-500">
                {ROUTES.find((r) => r.routeId === def.routeId)?.noteKo}
                <ul className="mt-1 list-disc pl-4">
                  {ROUTES.find((r) => r.routeId === def.routeId)?.steps.map((st) => {
                    const r = st.recipeId ? recipeById(st.recipeId) : undefined;
                    return (
                      <li key={st.stepId}>
                        {st.labelKo}
                        {r ? ` · ${r.validationStatus === "assumed_demo" ? "Illustrative / Not process-qualified" : r.validationStatus}` : st.kind === "external" ? " · External step" : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {ip && <div className="mt-1 text-[11px] text-slate-500">이 장비의 현재 단계: {ip.phaseLabelKo}</div>}
          </Section>
        )}
      </div>
    );
  }

  const assembly = bundle.template.assemblies.find((a) => a.id === comp.assembly);
  const dims = comp.dimensions(bundle.layout);
  const conns = bundle.template.connections.filter((c) => c.from.assetId === comp.assetId || c.to.assetId === comp.assetId);
  const installations = index ? index.installationsOn(comp.assetId) : [];
  const points = index ? index.pointsOn(comp.assetId) : [];
  const isHidden = hidden.includes(comp.assetId);
  const isEffect = comp.kind === "effect";
  const joint = comp.jointId ? bundle.template.joints.find((j) => j.jointId === comp.jointId) : undefined;
  const jointValue = joint && ip ? ip.joints[joint.jointId] : undefined;
  const isWaferPresentation = bundle.template.station?.waferPresentationAssetId === comp.assetId;
  const presentedWafer = isWaferPresentation && ip?.presentedWaferId && preview ? preview.wafers[ip.presentedWaferId] : undefined;

  const measurementRow = (sel: SelectedMeasurement, label: string, sub: string, icon: typeof MapPin, extra?: React.ReactNode) => {
    const active = selectedMeasurement && selectedMeasurement.kind === sel.kind && selectedMeasurement.id === sel.id;
    const Icon = icon;
    return (
      <button
        type="button"
        key={`${sel.kind}:${sel.id}`}
        className={`mb-1 flex w-full items-start gap-1.5 rounded border px-1.5 py-1 text-left ${active ? "border-sky-500 bg-sky-500/15" : "border-slate-800 hover:border-slate-600"}`}
        onClick={() => selectMeasurement(active ? null : sel)}
        data-testid={`measurement-${sel.kind}-${sel.id}`}
      >
        <Icon className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-slate-200">{label}</div>
          <div className="text-[11px] text-slate-500">{sub}</div>
          {extra}
        </div>
      </button>
    );
  };

  const channelLine = (ch: MeasurementChannelDefV2) => {
    const pts = index ? index.pointsOfChannel(ch.channelId) : [];
    const status = index ? index.dataStatus(ch.channelId) : "unbound";
    return (
      <li key={ch.channelId} className="flex items-center justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate text-slate-300" title={`${ch.channelRole} · ${ch.dataShape}${ch.referenceNoteKo ? ` · ${ch.referenceNoteKo}` : ""}`}>
          {ch.name} <span className="text-slate-500">[{ch.canonicalUnit}]</span>
          {pts.length ? <span className="text-slate-500"> → {pts.map((p) => p.name).join(", ")}</span> : <span className="text-amber-400"> · no point</span>}
        </span>
        <span className="shrink-0 tabular-nums text-slate-400" title={describeDataStatus(status)}>
          — <Badge tone="neutral">{status === "unbound" ? "Data unbound" : "Data bound"}</Badge>
        </span>
      </li>
    );
  };

  const instrumentCard = (inst: InstrumentDef) => {
    const ins = index?.installationOf(inst.instrumentId);
    const chans = index ? index.channelsOf(inst.instrumentId) : [];
    return measurementRow(
      { kind: "instrument", id: inst.instrumentId },
      inst.name,
      `${inst.type} · ${inst.principle} · ${STATUS_LABEL[inst.installationStatus] ?? inst.installationStatus}`,
      Radio,
      <div className="mt-0.5">
        {ins && (
          <div className="text-[11px] text-slate-500">
            Mount: {ins.mountedOnAssetId}
            {ins.mountFrameJointId ? ` (frame ${ins.mountFrameJointId})` : ""} · basis {ins.placementBasis} · {ins.revision}
          </div>
        )}
        <ul className="mt-0.5 space-y-0.5">{chans.map(channelLine)}</ul>
      </div>,
    );
  };

  const pointCard = (p: MeasurementPointDefV2) => {
    const chans = index ? index.channelsObserving(p.pointId) : [];
    const notInstalled = index ? index.isNotInstalled(p.pointId) : true;
    return measurementRow(
      { kind: "point", id: p.pointId },
      p.name,
      `${KIND_LABEL[p.pointKind] ?? p.pointKind} · ${p.quantity}${p.reference.pressureReference ? ` (${p.reference.pressureReference})` : ""}${p.reference.flowStandard ? ` · ${p.reference.flowStandard}` : ""}${p.reference.positionHome ? ` · home: ${p.reference.positionHome}` : ""}`,
      MapPin,
      <div className="mt-0.5 text-[11px] text-slate-500">
        <div>Coverage: {p.coverageKo}</div>
        <div>{p.noteKo}</div>
        {p.frameJointId && <div>Frame: {p.frameJointId} (moving)</div>}
        {notInstalled ? (
          <Badge tone="warn">설치 후보 / Not installed</Badge>
        ) : (
          <ul className="mt-0.5 space-y-0.5">
            {chans.map((ch) => (
              <li key={ch.channelId} className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-300">
                  {ch.name} <span className="text-slate-500">({ch.instrumentId ? index?.instrumentsById.get(ch.instrumentId)?.name : "derived"})</span>
                </span>
                <Badge tone="neutral">Point linked · Data unbound</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>,
    );
  };

  return (
    <div data-testid="inspector" data-asset={comp.assetId}>
      <Section
        title="Component inspector"
        right={
          <Badge tone={isEffect ? "warn" : "neutral"} title={isEffect ? "설명용 시각 효과" : `Geometry source: ${bundle.geometry.kind}`}>
            {isEffect ? "render_source: illustrative" : `geometry: ${bundle.geometry.kind}`}
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
          {comp.alwaysOpaque && <span className="ml-1 text-amber-300">· Simplified internal transfer (opaque)</span>}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{comp.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button onClick={requestFocus} title="카메라를 이 부품으로 이동" testId="inspector-focus">
            <Crosshair className="h-3.5 w-3.5" aria-hidden /> Focus
          </Button>
          {!isEffect && (
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
      {(joint || presentedWafer || isWaferPresentation) && (
        <Section title="Preview status (scripted)">
          {joint && (
            <div className="text-[12px] text-slate-300" data-testid="preview-joint">
              {joint.name}: <span className="tabular-nums text-slate-100">{jointValue === undefined ? "—" : fmtJoint(joint.unit, jointValue)}</span>
              <div className="text-[11px] text-slate-500">
                {joint.kind} · home: {joint.homeNote} · Scripted pose이며 encoder/feedback 측정값이 아니다.
                {joint.freezeInCutaway ? " Cutaway 모드에서는 sector가 부품과 함께 돌지 않도록 회전 표시를 0으로 고정한다." : ""}
              </div>
            </div>
          )}
          {isWaferPresentation && (
            <div className="mt-1 text-[12px] text-slate-300" data-testid="presented-wafer">
              {presentedWafer ? (
                <>
                  Presenting <span className="text-sky-200">{presentedWafer.waferId}</span> · holder {HOLDER_LABEL[presentedWafer.holder.kind]} · frontside normal (local) [{presentedWafer.frontsideNormalLocal.join(", ")}] · film {presentedWafer.film.status}
                </>
              ) : (
                <>
                  No wafer presented here now{ip && preview ? ` (wafer holder: ${Object.values(preview.wafers).map((w) => `${w.waferId} → ${HOLDER_LABEL[w.holder.kind]}${w.holder.instanceId ? " @ " + w.holder.instanceId : ""}`).join("; ")})` : ""}
                </>
              )}
            </div>
          )}
        </Section>
      )}
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
                  <td className="py-0.5 text-right tabular-nums text-slate-100">{d.label === "Slots" || d.label === "Convolutions" || d.label.startsWith("Count") || d.label.endsWith("(count)") ? d.valueM : mmText(d.valueM)}</td>
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
              const otherComp = bundle.template.components.find((x) => x.assetId === other.assetId);
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
      {(installations.length > 0 || points.length > 0) && (
        <Section title="Sensing & measurement" right={<Activity className="h-3.5 w-3.5 text-slate-500" aria-hidden />}>
          <div className="mb-1 text-[11px] text-slate-500">Instrument body(mount) · MeasurementPoint(coverage) · Channel · Data binding은 서로 다른 상태입니다. 값이 없으면 —로 표시합니다.</div>
          {installations.length > 0 && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Instruments mounted here</div>}
          {installations.map((ins) => {
            const inst = index?.instrumentsById.get(ins.instrumentId);
            return inst ? instrumentCard(inst) : null;
          })}
          {points.length > 0 && <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Measurement points on this component</div>}
          {points.map(pointCard)}
        </Section>
      )}
      {(comp.assumptions?.length || comp.structuralBasis || isEffect) && (
        <Section title="Assumptions & sources">
          {comp.structuralBasis && (
            <div className="mb-1 text-[11px] text-slate-300">
              <span className="text-slate-500">Structural basis:</span> {comp.structuralBasis}
            </div>
          )}
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-slate-400">
            {comp.assumptions?.map((a) => <li key={a}>{a}</li>)}
            {isEffect && (
              <>
                <li>Sequence: {getScenario(scenarioId)?.title ?? scenarioId} — scripted presentation, not computed ignition/transient physics.</li>
                <li>Shader: bounded-cylinder ray marching with opaque-depth termination; GLSL (WebGL2) / WGSL (WebGPU) with identical uniforms.</li>
              </>
            )}
            <li>
              Geometry revision {bundle.geometry.geometryRevision} — {bundle.geometry.note}
            </li>
          </ul>
        </Section>
      )}
    </div>
  );
}
