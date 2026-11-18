import type { ReactNode } from "react";

/*
 * Control vocabulary. One height (36 px, 44 px on coarse pointers), one radius (4 px), one horizontal padding
 * (12 px). States change color instantly; only the switch thumb moves (transform).
 */

export function Toggle({ label, checked, onChange, title, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string; testId?: string }) {
  return (
    <label className="mb-2 flex cursor-pointer items-center justify-between gap-2 text-meta" title={title}>
      <span className="text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full border ${checked ? "border-accent bg-accent" : "border-control bg-sunken"}`}
      >
        <span className={`absolute left-px top-px h-4 w-4 rounded-full bg-canvas shadow-[0_1px_2px_oklch(24.5%_0.03_258/0.25)] transition-transform duration-150 ease-out ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </label>
  );
}

export const CONTROL = "inline-flex h-9 items-center gap-2 rounded border px-3 text-meta font-medium leading-none pointer-coarse:h-11";

export function Button({ children, onClick, active, title, disabled, testId, className }: { children: ReactNode; onClick?: () => void; active?: boolean; title?: string; disabled?: boolean; testId?: string; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className={`${CONTROL} disabled:cursor-not-allowed disabled:border-line disabled:bg-subtle disabled:text-ink-muted ${
        active ? "border-accent bg-accent-soft text-accent-strong" : "border-control bg-canvas text-ink hover:bg-subtle active:bg-sunken"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Filled primary action (one per surface at most). */
export function PrimaryButton({ children, type = "button", disabled, testId, onClick }: { children: ReactNode; type?: "button" | "submit"; disabled?: boolean; testId?: string; onClick?: () => void }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={`${CONTROL} border-accent bg-accent font-semibold text-canvas hover:border-accent-strong hover:bg-accent-strong disabled:cursor-not-allowed disabled:border-line disabled:bg-sunken disabled:text-ink-muted`}
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
    <span title={title} className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-meta font-medium leading-none ${cls}`}>
      {children}
    </span>
  );
}

export const SELECT_CLASS = "h-9 rounded border border-control bg-canvas px-2 text-meta text-ink hover:bg-subtle pointer-coarse:h-11 disabled:border-line disabled:bg-subtle disabled:text-ink-muted";

/** Official SK hynix logo (original proportions and colors) followed by the product name. */
export function Brand() {
  return (
    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap" data-testid="brand">
      <img src="/brand/sk-hynix-logo.png" alt="SK hynix" width={59} height={32} className="h-8 w-auto select-none" draggable={false} />
      <span className="h-5 w-px bg-line" aria-hidden />
      <span className="text-h3 font-semibold tracking-[0.04em] text-ink">JARVIS</span>
    </div>
  );
}
