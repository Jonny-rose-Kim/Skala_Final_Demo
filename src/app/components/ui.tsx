import type { ReactNode } from "react";

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-slate-800/80 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Slider({ label, value, min, max, step, onChange, format, title }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; title?: string }) {
  return (
    <label className="mb-2 block" title={title}>
      <div className="mb-0.5 flex justify-between text-[12px]">
        <span className="text-slate-300">{label}</span>
        <span className="tabular-nums text-slate-400">{format ? format(value) : value.toFixed(2)}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

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

export function Select<T extends string>({ label, value, options, onChange, title }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; title?: string }) {
  return (
    <label className="mb-2 flex items-center justify-between gap-2 text-[12px]" title={title}>
      <span className="text-slate-300">{label}</span>
      <select aria-label={label} className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-slate-100" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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

export function mmText(valueM: number): string {
  if (!Number.isFinite(valueM)) return "-";
  const mm = valueM * 1000;
  if (Math.abs(mm) < 1) return `${(mm * 1000).toFixed(0)} µm`;
  return `${mm.toFixed(mm % 1 === 0 ? 0 : mm < 10 ? 2 : 1)} mm`;
}
