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
      <div className="text-meta text-ink" data-testid="foup-wafer-count" data-count={occupied.length}>
        {carrier ? (
          <>
            웨이퍼 <span className="font-semibold text-accent-strong">{occupied.length}</span>장 / {slots.count} slot
          </>
        ) : (
          "이 시나리오에는 carrier 상태가 없습니다"
        )}
      </div>
      <div className="relative mt-2 pb-4" role="img" aria-label={`slot map: ${occupied.length} / ${slots.count} occupied`} data-testid="foup-slot-map">
        {/* takes the pointer even inside the drag-through inset, so the per-slot tooltips show */}
        <div className="pointer-events-auto flex gap-1">
          {Array.from({ length: slots.count }, (_, i) => i + 1).map((k) => {
            const w = byIndex.get(k);
            return <div key={k} data-slot={k} data-occupied={w ? "1" : "0"} title={`slot ${k}: ${w ?? "empty"}`} className={`h-4 flex-1 rounded-[2px] border ${w ? "border-accent bg-accent" : "border-line bg-canvas"}`} />;
          })}
        </div>
        {TICKS.filter((k) => k <= slots.count).map((k) => (
          <span key={k} className="absolute bottom-0 -translate-x-1/2 text-meta tabular-nums text-ink-muted" style={{ left: `${((k - 0.5) / slots.count) * 100}%` }}>
            {k}
          </span>
        ))}
      </div>
      {occupied.length > 0 && (
        <ul className="mt-1 text-meta text-ink-muted">
          {occupied.map((o) => (
            <li key={o.index}>
              slot {o.index}: <span className="text-ink">{o.waferId}</span>
            </li>
          ))}
        </ul>
      )}
      {away.map((w) => (
        <div key={w.waferId} className="mt-1 text-meta text-ink-muted" data-testid="carrier-wafer-away">
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
 * button that brings the camera to the FOUP. Only the button, the slot strip and the note take pointer input
 * (the latter two for their tooltips); camera drags pass through the rest.
 */
export function CarrierInset() {
  const on = usePresentationStore((s) => s.carrierSection);
  const instances = usePresentationStore((s) => s.instances);
  const requestFocusCarrier = usePresentationStore((s) => s.requestFocusCarrier);
  const carrier = instances.find((i) => i.mobile && getBundle(i.templateId)?.carrierSlots);
  if (!on || !carrier) return null;
  return (
    <div className="pointer-events-none w-72 rounded-lg border border-line bg-canvas/95 px-3 py-3 shadow-sm" data-testid="carrier-inset">
      <div className="mb-1 flex items-center justify-between text-meta">
        <span className="font-semibold text-ink">{carrier.instanceId} 단면</span>
        <Button onClick={requestFocusCarrier} title="카메라를 FOUP 단면이 열리는 쪽으로 옮깁니다. 선택한 장비와 보기 모드는 그대로입니다." testId="focus-carrier" className="pointer-events-auto">
          <Crosshair className="h-3 w-3" aria-hidden /> FOUP 보기
        </Button>
      </div>
      <CarrierContents carrierId={carrier.instanceId} templateId={carrier.templateId} />
      <div className="pointer-events-auto mt-1 text-meta text-warn" title="Slot map은 시나리오의 scripted carrier state이며 load port mapping sensor 값이 아닙니다.">scripted 상태 · mapping sensor 값 아님</div>
    </div>
  );
}
