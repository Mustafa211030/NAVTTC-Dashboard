"use client";
import React, { useState, useRef, useEffect, useId } from "react";
import { Info, X } from "lucide-react";

export function Card({ className = "", children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={`card ${className}`}>{children}</div>;
}

export function Button({
  variant = "default", size = "md", className = "", children, ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const base = "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap";
  const sizes = { sm: "text-xs px-2.5 py-1.5", md: "text-sm px-3 py-2" };
  const variants = {
    default: "border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-3)]",
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    ghost: "hover:bg-[var(--surface-3)]",
    danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950",
  };
  return <button {...p} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>{children}</button>;
}

export function Badge({ color, children, className = "" }: { color?: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={color ? { background: color + "1f", color } : undefined}>
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

/** Accessible tooltip. Used for every KPI methodology note (§17, §60). */
export function Tooltip({ label, children }: { label: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label="Show calculation details"
        className="text-[var(--text-muted)] hover:text-brand-600 transition-colors"
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
      >
        {children ?? <Info size={13} strokeWidth={2.2} />}
      </button>
      {open && (
        <span role="tooltip" id={id}
          className="absolute left-1/2 bottom-full z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-left text-xs font-normal leading-relaxed text-[var(--text)] shadow-lg">
          {label}
        </span>
      )}
    </span>
  );
}

export function EmptyState({ title, hint, onClear }: { title?: string; hint?: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="text-sm font-semibold">{title ?? "No data available for the selected filters."}</div>
      <p className="max-w-sm text-xs text-[var(--text-muted)]">
        {hint ?? "No assessment records match this combination. Try removing one of the active filters."}
      </p>
      {onClear && <Button size="sm" variant="primary" className="mt-1 no-print" onClick={onClear}>Clear filters</Button>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Multi-select popover backed by checkboxes; keyboard reachable and searchable. */
export function MultiSelect({
  label, options, selected, onChange, width = "w-56",
}: {
  label: string;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (v: string[]) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);

  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-haspopup="listbox"
        className={`flex ${width} items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs transition-colors hover:bg-[var(--surface-3)]`}>
        <span className="truncate">
          <span className="text-[var(--text-muted)]">{label}</span>
          {selected.length > 0 && <span className="ml-1.5 font-semibold text-brand-600">{selected.length}</span>}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0 opacity-50">
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div role="listbox" className="absolute left-0 top-full z-50 mt-1 max-h-80 w-72 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
          {options.length > 8 && (
            <div className="border-b border-[var(--border)] p-1.5">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full rounded bg-[var(--surface-2)] px-2 py-1.5 text-xs outline-none" />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            {shown.length === 0 && <div className="px-2 py-4 text-center text-xs text-[var(--text-muted)]">No matches</div>}
            {shown.map((o) => (
              <label key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--surface-3)]">
                <input type="checkbox" className="accent-brand-600" checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.count !== undefined && <span className="num text-[10px] text-[var(--text-muted)]">{o.count}</span>}
              </label>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-[var(--border)] p-1.5">
              <button onClick={() => onChange([])} className="w-full rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-3)]">
                Clear {label.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="rise inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-brand-700 dark:border-brand-700 dark:bg-brand-700/20 dark:text-brand-100">
      {children}
      <button onClick={onRemove} aria-label="Remove filter" className="rounded-full p-0.5 hover:bg-brand-600/15">
        <X size={11} strokeWidth={2.6} />
      </button>
    </span>
  );
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
