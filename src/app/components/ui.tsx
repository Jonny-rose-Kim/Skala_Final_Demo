import type { ReactNode } from "react";

export function Toggle({ label, checked, onChange, title, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string; testId?: string }) {
  return (
    <label className="mb-1.5 flex cursor-pointer items-center justify-between gap-2 text-[12px]" title={title}>
      <span className="text-slate-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative h-4.5 w-8 rounded-full transition-colors ${checked ? "bg-sky-500" : "bg-slate-600"}`}
      >
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? "left-4" : "left-0.5"}`} />
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
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[12px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "border-sky-500 bg-sky-500/20 text-sky-200" : "border-slate-700 bg-slate-800/70 text-slate-200 hover:border-slate-500 hover:bg-slate-700/70"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "info"; title?: string }) {
  const cls = tone === "ok" ? "border-emerald-600/60 text-emerald-300" : tone === "warn" ? "border-amber-600/60 text-amber-300" : tone === "info" ? "border-sky-600/60 text-sky-300" : "border-slate-600 text-slate-300";
  return (
    <span title={title} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none ${cls}`}>
      {children}
    </span>
  );
}
