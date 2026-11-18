import { Crosshair } from "lucide-react";
import { getBundle } from "../../domain/registry";
import type { CarrierPreview } from "../../presentation/preview";
import { usePresentationStore } from "../../presentation/store";
import { Button } from "../components/ui";

interface SlotLayout {
  count: number;
  slotId: (index: number) => string;
}

/** Display names of the scripted wafer holder kinds. */
const HOLDER_LABEL: Record<string, string> = {
  carrier_slot: "FOUP slot",
  internal_transfer: "Internal transfer (legacy)",
  end_effector: "Robot end effector",
  loadlock_support: "Load lock support",
  transfer_blade: "Vacuum transfer blade",
  process_stage: "Process stage",
  flip_station: "Flip station",
  cmp_head: "CMP carrier head",
  load_cup: "Load cup",
  clean_module: "Brush cleaner",
  dry_module: "Spin dryer",
};

/** Occupied slots of a carrier preview in slot order (1 = bottom). */
export function occupiedSlots(carrier: CarrierPreview | undefined, slots: SlotLayout): { index: number; waferId: string }[] {
  const out: { index: number; waferId: string }[] = [];
  if (!carrier) return out;
  for (let k = 1; k <= slots.count; k++) {
    const w = carrier.slots[slots.slotId(k)];
    if (w) out.push({ index: k, waferId: w });
  }
  return out;
}

const TICKS = [1, 5, 10, 15, 20, 25];

/**
 * Wafer count and slot map of one carrier, from the scripted carrier state (PreviewState), plus where its
 * own wafers are while they are out of their slots. Never a mapping-sensor reading.
 */
export function CarrierContents({ carrierId, templateId }: { carrierId: string; templateId: string }) {
  const preview = usePresentationStore((s) => s.preview);
  const slots = getBundle(templateId)?.carrierSlots;
  if (!slots) return null;
  const carrier = preview?.carriers[carrierId];
  const occupied = occupiedSlots(carrier, slots);
  const byIndex = new Map(occupied.map((o) => [o.index, o.waferId]));
  const away = preview ? Object.values(preview.wafers).filter((w) => w.reservedSlot.carrierId === carrierId && !(w.holder.kind === "carrier_slot" && w.holder.carrierId === carrierId)) : [];
  return (
    <div data-testid="carrier-contents">
      <div className="text-[12px] text-slate-200" data-testid="foup-wafer-count" data-count={occupied.length}>
        {carrier ? (
          <>
            웨이퍼 <span className="font-semibold text-sky-200">{occupied.length}</span>장 / {slots.count} slot
          </>
        ) : (
          "이 시나리오에는 carrier 상태가 없습니다"
        )}
      </div>
      <div className="relative mt-1.5 pb-3.5" role="img" aria-label={`slot map: ${occupied.length} / ${slots.count} occupied`} data-testid="foup-slot-map">
        <div className="flex gap-[2px]">
          {Array.from({ length: slots.count }, (_, i) => i + 1).map((k) => {
            const w = byIndex.get(k);
            return <div key={k} data-slot={k} data-occupied={w ? "1" : "0"} title={`slot ${k}: ${w ?? "empty"}`} className={`h-4 flex-1 rounded-[2px] border ${w ? "border-sky-300 bg-sky-400/85" : "border-slate-700 bg-slate-900"}`} />;
          })}
        </div>
        {TICKS.filter((k) => k <= slots.count).map((k) => (
          <span key={k} className="absolute bottom-0 -translate-x-1/2 text-[10px] tabular-nums text-slate-500" style={{ left: `${((k - 0.5) / slots.count) * 100}%` }}>
            {k}
          </span>
        ))}
      </div>
      {occupied.length > 0 && (
        <ul className="mt-1 text-[11px] text-slate-400">
          {occupied.map((o) => (
            <li key={o.index}>
              slot {o.index}: <span className="text-slate-200">{o.waferId}</span>
            </li>
          ))}
        </ul>
      )}
      {away.map((w) => (
        <div key={w.waferId} className="mt-1 text-[11px] text-slate-400" data-testid="carrier-wafer-away">
          {w.waferId}은 지금 slot 밖에 있습니다: {HOLDER_LABEL[w.holder.kind] ?? w.holder.kind}
          {w.holder.attachment ? ` (${w.holder.attachment})` : ""}
          {w.holder.instanceId ? ` @ ${w.holder.instanceId}` : ""}. 돌아올 slot은 {w.reservedSlot.slotId}입니다.
        </div>
      ))}
    </div>
  );
}

/**
 * Viewport inset while the FOUP section view is on: wafer count and slot map next to the cut FOUP, and a
 * button that brings the camera to the FOUP. Only the button takes pointer input; camera drags pass through.
 */
export function CarrierInset() {
  const on = usePresentationStore((s) => s.carrierSection);
  const instances = usePresentationStore((s) => s.instances);
  const requestFocusCarrier = usePresentationStore((s) => s.requestFocusCarrier);
  const carrier = instances.find((i) => i.mobile && getBundle(i.templateId)?.carrierSlots);
  if (!on || !carrier) return null;
  return (
    <div className="pointer-events-none w-64 rounded border border-slate-700/70 bg-slate-950/85 px-2.5 py-2" data-testid="carrier-inset">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-200">{carrier.instanceId} 단면</span>
        <Button onClick={requestFocusCarrier} title="카메라를 FOUP 단면이 열리는 쪽으로 옮깁니다. 선택한 장비와 보기 모드는 그대로입니다." testId="focus-carrier" className="pointer-events-auto">
          <Crosshair className="h-3 w-3" aria-hidden /> FOUP 보기
        </Button>
      </div>
      <CarrierContents carrierId={carrier.instanceId} templateId={carrier.templateId} />
      <div className="mt-1 text-[10px] text-amber-200/80" title="Slot map은 시나리오의 scripted carrier state이며 load port mapping sensor 값이 아닙니다.">scripted 상태 · mapping sensor 값 아님</div>
    </div>
  );
}
