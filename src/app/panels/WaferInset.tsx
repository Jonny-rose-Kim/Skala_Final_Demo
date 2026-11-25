import type { ReactElement } from "react";
import { usePresentationStore } from "../../presentation/store";
import type { IllustrativeFilmState, WaferWetState } from "../../presentation/preview";

/**
 * Concept cross-section of the demonstration wafer (exaggerated vertical scale, illustrative): substrate,
 * deposited oxide, mask lines, the exposed spaces the etch thins, schematic residue, and the liquid film
 * during the wet clean. Below it the trace context of the demonstration (ids are demo ids; the run id and
 * the plant event time are not bound). Values are drawn from IllustrativeFilmState, never from a measurement.
 */
const W = 288;
const H = 112;
const LINES = 4;

const STATUS_KO: Record<string, string> = {
  incoming: "입고 (bare Si)",
  depositing: "증착 중",
  deposited: "증착 완료",
  masked: "외부 노광: mask 있음",
  etching: "식각 중 (노출 영역)",
  etched: "식각 완료",
  stripped: "외부 strip: mask 제거",
  cleaning: "세정 중",
  rinsing: "Rinse 중",
  drying: "건조 중",
  complete: "완료",
};

const WET_KO: Record<WaferWetState, string> = { dry: "dry", wet_dirty: "wet", wet_clean: "wet", wet_chemical: "약액 wet", wet_rinse: "UPW wet", drying: "건조 중" };

function Section({ film, wet }: { film: IllustrativeFilmState; wet: WaferWetState }) {
  const ox = film.layers.find((l) => l.role === "target_oxide")?.presentFraction ?? 0;
  const res = film.layers.find((l) => l.role === "residue")?.presentFraction ?? 0;
  const p = film.pattern;
  const siTop = 82;
  const oxH = 34 * ox;
  const maskH = 16;
  const pitch = W / LINES;
  const lineW = pitch * 0.5;
  const exposedH = oxH * (p ? p.exposedOxideRemaining : 1);
  const parts: ReactElement[] = [];
  for (let i = 0; i < LINES; i++) {
    const x0 = i * pitch;
    // oxide under the mask line (kept), and in the exposed space (thinned by the etch only)
    if (oxH > 0.2) {
      parts.push(<rect key={`ol${i}`} x={x0} y={siTop - oxH} width={lineW} height={oxH} fill="oklch(78% 0.07 250)" />);
      if (exposedH > 0.2) parts.push(<rect key={`oe${i}`} x={x0 + lineW} y={siTop - exposedH} width={pitch - lineW} height={exposedH} fill="oklch(78% 0.07 250)" />);
    }
    if (p?.mask === "retained") parts.push(<rect key={`m${i}`} x={x0} y={siTop - oxH - maskH} width={lineW} height={maskH} fill={p.maskKind === "photoresist" ? "oklch(62% 0.11 40)" : "oklch(55% 0.02 260)"} />);
    if (res > 0.02) for (let k = 0; k < 3; k++) parts.push(<circle key={`r${i}${k}`} cx={x0 + lineW + (pitch - lineW) * (0.25 + 0.25 * k)} cy={siTop - exposedH - 2.5} r={2 * res + 0.6} fill="oklch(55% 0.01 90)" />);
  }
  const liquid = wet === "wet_chemical" ? "oklch(80% 0.08 265 / 0.55)" : wet === "wet_rinse" || wet === "wet_clean" || wet === "wet_dirty" ? "oklch(88% 0.04 230 / 0.55)" : wet === "drying" ? "oklch(90% 0.03 160 / 0.35)" : null;
  const topY = siTop - oxH - (p?.mask === "retained" ? maskH : 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="웨이퍼 개념 단면">
      {liquid && <rect x={0} y={topY - 12} width={W} height={siTop - topY + 12} fill={liquid} />}
      <rect x={0} y={siTop} width={W} height={H - siTop} fill="oklch(45% 0.02 260)" />
      {parts}
    </svg>
  );
}

export function WaferInset() {
  const preview = usePresentationStore((s) => s.preview);
  const show = usePresentationStore((s) => s.overlays.waferSection);
  const wafer = preview ? Object.values(preview.wafers)[0] : undefined;
  if (!show || !wafer || !preview?.trace) return null;
  const f = wafer.film;
  const t = preview.trace;
  const wet = wafer.wetState ?? "dry";
  return (
    <div className="pointer-events-auto w-80 rounded-lg border border-line bg-canvas/95 p-3 text-meta shadow-sm" data-testid="wafer-inset">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">{wafer.waferId} 개념 단면</span>
        <span className="text-ink-muted">비례 과장, 설명용</span>
      </div>
      <Section film={f} wet={wet} />
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink-muted">
        <span>상태</span>
        <span className="text-ink" data-testid="wafer-status">
          {STATUS_KO[f.status] ?? f.status}, {WET_KO[wet]}
        </span>
        <span>Mask</span>
        <span className="text-ink">{f.pattern ? `${f.pattern.maskKind === "photoresist" ? "photoresist" : "hard mask"}, ${f.pattern.mask === "retained" ? "있음" : f.pattern.mask === "removed" ? `제거 (${f.pattern.maskRemovedByStepId ?? "외부 단계"})` : "없음"}` : "없음"}</span>
        <span>잔여물</span>
        <span className="text-ink">{f.pattern ? (f.pattern.residue === "none" ? "없음" : f.pattern.residue === "present" ? "있음 (종류 미정)" : "감소") : "없음"}</span>
        <span>추적</span>
        <span className="text-ink" data-testid="wafer-trace">
          {t.lotId}, {t.carrierId} {t.slotId}, {t.stepId ?? "-"}
        </span>
        <span>Run id</span>
        <span>미연결 (demo provenance, eventTime 없음)</span>
      </div>
    </div>
  );
}

export function RouteCardOverlay() {
  const card = usePresentationStore((s) => s.preview?.routeCard);
  if (!card) return null;
  return (
    <div className="pointer-events-auto max-w-md rounded-lg border border-accent-line bg-canvas p-3 text-meta shadow-md" data-testid="route-card">
      <div className="mb-1 font-semibold text-accent-strong">{card.titleKo}</div>
      <div className="text-ink">{card.bodyKo}</div>
    </div>
  );
}
