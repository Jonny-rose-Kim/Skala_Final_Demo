import type { ReactNode } from "react";

export function Toggle({ label, checked, onChange, title, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string; testId?: string }) {
  return (
    <label className="mb-1.5 flex cursor-pointer items-center justify-between gap-2 text-[13px]" title={title}>
      <span className="text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full border transition-colors ${checked ? "border-accent bg-accent" : "border-control bg-sunken"}`}
      >
        <span className={`absolute top-[1px] h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform ${checked ? "left-[17px]" : "left-[1px]"}`} />
      </button>
    </label>
  );
}

export function Button({ children, onClick, active, title, disabled, testId, className }: { children: ReactNode; onClick?: () => void; active?: boolean; title?: string; disabled?: boolean; testId?: string; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:border-line disabled:bg-subtle disabled:text-ink-muted ${
        active ? "border-accent bg-accent-soft text-accent-strong" : "border-control bg-canvas text-ink hover:bg-subtle active:bg-sunken"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "info" | "danger"; title?: string }) {
  const cls =
    tone === "ok"
      ? "border-ok/40 bg-ok-soft text-ok"
      : tone === "warn"
        ? "border-warn-line bg-warn-soft text-warn"
        : tone === "danger"
          ? "border-danger-line bg-danger-soft text-danger"
          : tone === "info"
            ? "border-accent-line bg-accent-soft text-accent-strong"
            : "border-line bg-subtle text-ink-muted";
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[13px] font-medium leading-tight ${cls}`}>
      {children}
    </span>
  );
}

export const SELECT_CLASS = "h-8 rounded-md border border-control bg-canvas px-2 text-[13px] text-ink hover:bg-subtle disabled:border-line disabled:bg-subtle disabled:text-ink-muted";

/** Official SK hynix logo (original proportions and colors) followed by the product name. */
export function Brand() {
  return (
    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap" data-testid="brand">
      <img src="/brand/sk-hynix-logo.png" alt="SK hynix" width={59} height={32} className="h-8 w-auto select-none" draggable={false} />
      <span className="h-5 w-px bg-line" aria-hidden />
      <span className="text-[19px] font-semibold leading-none tracking-[0.04em] text-ink">JARVIS</span>
    </div>
  );
}
