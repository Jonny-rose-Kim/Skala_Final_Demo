/**
 * Magnified process cross-section (STI stack) drawn from the IllustrativeFilmState of the presented wafer.
 * Schematic · Exaggerated scale · Illustrative: layer thicknesses are inset metadata and never feed
 * collision, clearance, OHT geometry or any sensor value.
 */
import { STI_INCOMING_STACK, DEMO_OVERCOAT_LAYER } from "../../domain/materialFlow";
import type { IllustrativeFilmState } from "../../presentation/preview";
import { usePresentationStore } from "../../presentation/store";

const COLORS: Record<string, string> = {
  substrate: "#5b6470",
  active: "#5b6470",
  pad_oxide: "#9fc5e8",
  stop_layer: "#d9a441",
  liner: "#bfe1f7",
  trench_fill: "#7fb3d5",
  surface_oxide: "#6aa0c8",
  overcoat: "#4d8ac0",
};

const STATUS_KO: Record<string, string> = {
  incoming: "Incoming (prepared STI, external steps)",
  depositing: "Overcoat deposition illustration",
  deposited: "Overcoat deposited (illustrative)",
  polishing: "Bulk polish illustration",
  cleared: "Clearing illustration (SiN exposed over active)",
  overpolish_illustration: "Bounded overpolish illustration",
  complete: "Visual sequence complete",
};

export function StiCrossSection({ film, width = 300, height = 150 }: { film: IllustrativeFilmState; width?: number; height?: number }) {
  const stack = STI_INCOMING_STACK;
  const nm = (id: string) => (id === DEMO_OVERCOAT_LAYER.layerId ? DEMO_OVERCOAT_LAYER.schematicThicknessNm : (stack.layers.find((l) => l.layerId === id)?.schematicThicknessNm ?? 0));
  const frac = (id: string) => film.layers.find((l) => l.layerId === id)?.presentFraction ?? 0;
  // vertical scale: nm -> px (exaggerated), horizontal: pattern metadata
  const totalNm = nm("substrate") + nm("pad_oxide") + nm("sin_stop") + nm("surface_oxide") + nm("demo_overcoat") + 40;
  const sy = height / totalNm;
  const pat = stack.pattern;
  const period = pat.trenchWidthNm + pat.activeWidthNm;
  const sx = width / (period * 2);
  const baseY = height - 10;
  const subTop = baseY - nm("substrate") * sy;
  const padTop = subTop - nm("pad_oxide") * sy;
  const sinTop = padTop - nm("sin_stop") * sy * frac("sin_stop");
  const surfH = nm("surface_oxide") * sy * frac("surface_oxide");
  const overH = nm("demo_overcoat") * sy * frac("demo_overcoat");
  const trenchDepth = pat.trenchDepthNm * sy;
  const rects: { x: number; y: number; w: number; h: number; fill: string; key: string; title: string }[] = [];
  // substrate with trenches
  for (let i = 0; i < 2; i++) {
    const x0 = i * period * sx;
    const aw = pat.activeWidthNm * sx;
    const tw = pat.trenchWidthNm * sx;
    // active region (substrate) column
    rects.push({ key: `act${i}`, x: x0, y: subTop, w: aw, h: baseY - subTop, fill: COLORS.substrate, title: "Si active region" });
    // trench floor substrate
    rects.push({ key: `trs${i}`, x: x0 + aw, y: subTop + trenchDepth, w: tw, h: baseY - subTop - trenchDepth, fill: COLORS.substrate, title: "Si substrate (trench bottom)" });
    // liner + fill in trench
    const lin = nm("trench_liner") * sy * frac("trench_liner");
    rects.push({ key: `lin${i}`, x: x0 + aw, y: subTop, w: tw, h: trenchDepth, fill: COLORS.liner, title: "Trench liner SiO2 (external)" });
    rects.push({ key: `fill${i}`, x: x0 + aw + lin, y: subTop + lin, w: tw - 2 * lin, h: trenchDepth - lin, fill: COLORS.trench_fill, title: "Trench-fill SiO2 (external, fill mode = external)" });
    // pad oxide + SiN over active only
    rects.push({ key: `pad${i}`, x: x0, y: padTop, w: aw, h: subTop - padTop, fill: COLORS.pad_oxide, title: "Pad oxide (external)" });
    if (frac("sin_stop") > 0) rects.push({ key: `sin${i}`, x: x0, y: sinTop, w: aw, h: padTop - sinTop, fill: COLORS.stop_layer, title: "SiN stop layer (external). 제거율 0인 절대 barrier가 아니다" });
    // surface oxide over active (fill overburden) and over trench top (above the fill)
    if (surfH > 0.5) {
      rects.push({ key: `so${i}`, x: x0, y: sinTop - surfH, w: aw, h: surfH, fill: COLORS.surface_oxide, title: "Surface SiO2 (incoming overburden, external)" });
      rects.push({ key: `sot${i}`, x: x0 + aw, y: subTop - surfH * 0.75, w: tw, h: surfH * 0.75, fill: COLORS.surface_oxide, title: "Surface SiO2 above trench (incoming)" });
    }
    if (overH > 0.5) {
      rects.push({ key: `oc${i}`, x: x0, y: sinTop - surfH - overH, w: aw, h: overH, fill: COLORS.overcoat, title: "Overcoat SiO2 (this project's deposition illustration)" });
      rects.push({ key: `oct${i}`, x: x0 + aw, y: subTop - surfH * 0.75 - overH, w: tw, h: overH, fill: COLORS.overcoat, title: "Overcoat SiO2 above trench (illustration)" });
    }
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="STI cross-section (schematic)">
      <rect x={0} y={0} width={width} height={height} fill="#0b0e12" />
      {rects.map((r) => (
        <rect key={r.key} x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} fill={r.fill} stroke="#0b0e12" strokeWidth={0.5}>
          <title>{r.title}</title>
        </rect>
      ))}
      {film.nitrideExposed && (
        <text x={6} y={14} fill="#d9a441" fontSize={10}>
          SiN exposed over active (illustration)
        </text>
      )}
    </svg>
  );
}

export function ProcessInset() {
  const preview = usePresentationStore((s) => s.preview);
  const show = usePresentationStore((s) => s.overlays.filmInset);
  const instanceId = usePresentationStore((s) => s.activeInstanceId);
  const instances = usePresentationStore((s) => s.instances);
  if (!show || !preview) return null;
  const info = instances.find((i) => i.instanceId === instanceId);
  if (info && info.mobile) return null;
  const wafers = Object.values(preview.wafers);
  if (!wafers.length) return null;
  const ip = preview.instances[instanceId];
  const w = (ip?.presentedWaferId && preview.wafers[ip.presentedWaferId]) || wafers[0];
  const film = w.film;
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 w-[322px] rounded border border-slate-700/80 bg-slate-950/85 p-2 text-[11px] text-slate-300 shadow-lg" data-testid="process-inset">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-slate-200">Process inset · {w.waferId}</span>
        <span className="text-[10px] text-amber-300" title="이 단면은 설명용이며 확대 배율과 수직 과장이 적용되어 있다. wafer collision, clearance, OHT geometry, sensor value에 반영되지 않는다.">
          {film.scaleNote}
        </span>
      </div>
      <StiCrossSection film={film} />
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
        <span>
          <i className="inline-block h-2 w-2 align-middle" style={{ background: COLORS.stop_layer }} /> SiN stop
        </span>
        <span>
          <i className="inline-block h-2 w-2 align-middle" style={{ background: COLORS.trench_fill }} /> trench fill (ext.)
        </span>
        <span>
          <i className="inline-block h-2 w-2 align-middle" style={{ background: COLORS.surface_oxide }} /> surface oxide (ext.)
        </span>
        <span>
          <i className="inline-block h-2 w-2 align-middle" style={{ background: COLORS.overcoat }} /> overcoat (demo)
        </span>
      </div>
      <div className="mt-1 text-[10px] text-slate-500" data-testid="film-status">
        {STATUS_KO[film.status] ?? film.status} · IllustrativeFilmState (measured thickness / removal rate 아님)
      </div>
    </div>
  );
}
