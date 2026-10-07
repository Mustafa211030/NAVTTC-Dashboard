"use client";
import React, { useState, useRef, useEffect, useId, useLayoutEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "motion/react";
import { Info, X, Check, ChevronDown, SearchX, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

/* ================================================================== *
 * UI PRIMITIVES
 * Every interactive element here has explicit default, hover, pressed
 * (.ctl → scale .97), focus-visible (global ring) and disabled states.
 * Radius scale: cards xl (14px) · inner lg (10px) · inputs md (8px).
 * ================================================================== */

export function Card({ className = "", children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={`card ${className}`}>{children}</div>;
}

type BtnVariant = "default" | "primary" | "ghost" | "danger" | "subtle";
type BtnSize = "xs" | "sm" | "md";

const BTN_BASE = "ctl inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium";
const BTN_SIZE: Record<BtnSize, string> = {
  xs: "h-6 rounded-md px-2 text-[11px]",
  sm: "h-8 rounded-lg px-2.5 text-xs",
  md: "h-9 rounded-lg px-3.5 text-[13px]",
};
const BTN_VARIANT: Record<BtnVariant, string> = {
  default: "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-xs)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]",
  primary: "bg-accent-grad text-white shadow-[0_1px_0_rgb(255_255_255/.2)_inset,0_4px_14px_-4px_color-mix(in_oklab,var(--brand-500)_60%,transparent)] hover:brightness-110 hover:shadow-[var(--glow)]",
  ghost: "text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]",
  subtle: "bg-[var(--surface-3)] text-[var(--text)] hover:bg-[color-mix(in_oklab,var(--surface-3)_70%,var(--border-strong))]",
  danger: "border border-red-300/70 bg-red-50/60 text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20",
};

export function Button({
  variant = "default", size = "md", className = "", children, ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; ref?: React.Ref<HTMLButtonElement> }) {
  return <button type="button" {...p} className={`${BTN_BASE} ${BTN_SIZE[size]} ${BTN_VARIANT[variant]} ${className}`}>{children}</button>;
}

/** Square icon button used in toolbars and card headers. */
export function IconButton({ label, className = "", children, active, size = "md", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: "sm" | "md" }) {
  return (
    <button type="button" aria-label={label} title={label} {...p}
      className={`ctl grid ${size === "sm" ? "h-7 w-7" : "h-8 w-8"} shrink-0 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] ${active ? "bg-[var(--surface-3)] text-[var(--text)]" : ""} ${className}`}>
      {children}
    </button>
  );
}

export function Badge({ color, children, className = "" }: { color?: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={color ? { background: `color-mix(in oklab, ${color} 14%, transparent)`, color, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 22%, transparent)` } : undefined}>
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-1 font-sans text-[10px] font-medium text-[var(--text-muted)] shadow-[inset_0_-1px_0_var(--border)]">{children}</kbd>;
}

/* ------------------------------------------------------------------ *
 * Floating layer helper. Portals to <body> and positions with fixed
 * coordinates, so cards with overflow:hidden or content-visibility never
 * clip a tooltip or a menu.
 * ------------------------------------------------------------------ */
function useAnchorPosition(open: boolean, anchor: React.RefObject<HTMLElement | null>, placement: "top" | "bottom-start" | "bottom-end", width: number, gap = 8) {
  const [pos, setPos] = useState<{ left: number; top: number; flip: boolean; w: number } | null>(null);
  const measure = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    if (!a) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    let left = placement === "top" ? a.left + a.width / 2 - w / 2 : placement === "bottom-end" ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    if (placement === "top") {
      const flip = a.top < 120;
      setPos({ left, top: flip ? a.bottom + gap : a.top - gap, flip, w });
    } else {
      const flip = vh - a.bottom < 280 && a.top > vh - a.bottom;
      setPos({ left, top: flip ? a.top - gap : a.bottom + gap, flip, w });
    }
  }, [anchor, placement, width, gap]);
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => { window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
  }, [open, measure]);
  return pos;
}

function Portal({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.body), []);
  return el ? createPortal(children, el) : null;
}

/** Accessible tooltip — every KPI and chart methodology note uses it. */
export function Tooltip({ label, children, width = 272 }: { label: React.ReactNode; children?: React.ReactNode; width?: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const pos = useAnchorPosition(open, ref, "top", width);
  return (
    <span className="relative inline-flex">
      <button ref={ref}
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label="Show calculation details"
        className="rounded-full text-[var(--text-subtle)] transition-colors hover:text-brand-600"
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
      >
        {children ?? <Info size={13} strokeWidth={2.2} />}
      </button>
      <Portal>
        <AnimatePresence>
          {open && pos && (
            <m.span role="tooltip" id={id}
              initial={{ opacity: 0, y: pos.flip ? -4 : 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.w, translate: pos.flip ? "0 0" : "0 -100%" }}
              className="pop pointer-events-none z-[120] block p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-[var(--text)]">
              {label}
            </m.span>
          )}
        </AnimatePresence>
      </Portal>
    </span>
  );
}

export function EmptyState({ title, hint, onClear }: { title?: string; hint?: string; onClear?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-3)] text-[var(--text-muted)] shadow-[var(--highlight)]">
        <SearchX size={20} />
      </div>
      <div className="text-sm font-semibold">{title ?? "No data available for the selected filters."}</div>
      <p className="max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">
        {hint ?? "No assessment records match this combination. Try removing one of the active filters."}
      </p>
      {onClear && <Button size="sm" variant="primary" className="no-print mt-2" onClick={onClear}>Clear filters</Button>}
    </div>
  );
}

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={`skeleton ${className}`} style={style} />;
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={`spinner inline-block ${className}`} />;
}

/** Dropdown panel shared by MultiSelect and other menus. */
export function Popover({ open, anchor, onClose, width = 288, placement = "bottom-start", children, className = "", role = "dialog", label }: {
  open: boolean; anchor: React.RefObject<HTMLElement | null>; onClose: () => void; width?: number;
  placement?: "bottom-start" | "bottom-end"; children: React.ReactNode; className?: string; role?: string; label?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const pos = useAnchorPosition(open, anchor, placement, width, 6);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { onClose(); anchor.current?.focus(); } };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open, onClose, anchor]);
  return (
    <Portal>
      <AnimatePresence>
        {open && pos && (
          <m.div ref={panel} role={role} aria-label={label}
            initial={{ opacity: 0, y: pos.flip ? 6 : -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: pos.flip ? 4 : -4, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.w, translate: pos.flip ? "0 -100%" : undefined, transformOrigin: pos.flip ? "bottom" : "top" }}
            className={`pop z-[110] overflow-hidden ${className}`}>
            {children}
          </m.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/** Multi-select popover backed by checkboxes; keyboard reachable and searchable. */
export function MultiSelect({
  label, options, selected, onChange, width = "w-56",
}: {
  label: string;
  options: { value: string; label: string; count?: number; color?: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => { if (!open) setQ(""); }, [open]);
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const on = selected.length > 0;

  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-haspopup="listbox"
        className={`ctl flex h-8 ${width} items-center justify-between gap-2 rounded-lg border px-2.5 text-xs ${
          on ? "border-[color-mix(in_oklab,var(--brand-500)_45%,var(--border))] bg-[color-mix(in_oklab,var(--brand-500)_8%,var(--surface))]"
             : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"} ${open ? "ring-2 ring-[color-mix(in_oklab,var(--brand-500)_25%,transparent)]" : ""}`}>
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className={on ? "font-medium text-[var(--text)]" : "text-[var(--text-muted)]"}>{label}</span>
          {on && <span className="num grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9.5px] font-bold text-white">{selected.length}</span>}
        </span>
        <ChevronDown size={13} className={`shrink-0 text-[var(--text-subtle)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <Popover open={open} anchor={ref} onClose={close} role="listbox" label={label}>
        {options.length > 8 && (
          <div className="border-b border-[var(--border)] p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`}
              className="h-8 w-full rounded-md bg-[var(--surface-2)] px-2.5 text-xs outline-none ring-1 ring-[var(--border)] focus:ring-2 focus:ring-brand-500" />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
          {shown.length === 0 && <div className="px-2 py-5 text-center text-xs text-[var(--text-muted)]">No matches</div>}
          {shown.map((o) => {
            const sel = selected.includes(o.value);
            return (
              <button key={o.value} type="button" role="option" aria-selected={sel} onClick={() => toggle(o.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface-3)]">
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-colors ${sel ? "border-transparent bg-brand-600 text-white" : "border-[var(--border-strong)]"}`}>
                  {sel && <Check size={11} strokeWidth={3} />}
                </span>
                {o.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color }} />}
                <span className={`flex-1 truncate ${o.count === 0 ? "opacity-45" : ""}`}>{o.label}</span>
                {o.count !== undefined && <span className="num text-[10px] text-[var(--text-subtle)]">{o.count}</span>}
              </button>
            );
          })}
        </div>
        {on && (
          <div className="border-t border-[var(--border)] p-1">
            <button type="button" onClick={() => onChange([])} className="w-full rounded-md px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
              Clear {label.toLowerCase()}
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}

export function Chip({ children, onRemove, color }: { children: React.ReactNode; onRemove: () => void; color?: string }) {
  return (
    <m.span layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] pl-2 pr-0.5 text-[11px] font-medium shadow-[var(--shadow-xs)]">
      <span className="h-2 w-2 rounded-full" style={{ background: color ?? "var(--brand-500)" }} />
      <span className="max-w-[220px] truncate">{children}</span>
      <button type="button" onClick={onRemove} aria-label="Remove filter" className="ctl grid h-5 w-5 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
        <X size={11} strokeWidth={2.6} />
      </button>
    </m.span>
  );
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
      <div className="h-full origin-left rounded-full transition-transform duration-700 ease-[var(--ease-out-expo)]" style={{ width: "100%", transform: `scaleX(${pct / 100})`, background: color }} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Compact controls used inside chart headers (per-chart filters).
 * ------------------------------------------------------------------ */

/** Segmented control with a spring-animated selection pill. */
export function Seg<T extends string | number>({
  value, onChange, options, label, size = "sm",
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string; title?: string }[]; label?: string; size?: "sm" | "md" }) {
  const id = useId();
  const md = size === "md";
  return (
    <div role="radiogroup" aria-label={label}
      className={`relative inline-flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5 ${md ? "gap-0.5" : ""}`}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const n = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
        onChange(n.value);
        (e.currentTarget.querySelector(`[data-v="${String(n.value)}"]`) as HTMLElement | null)?.focus();
      }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} title={o.title ?? o.label} data-v={String(o.value)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`relative whitespace-nowrap rounded-md font-medium transition-colors ${md ? "px-3 py-1.5 text-xs" : "px-2 py-[3px] text-[10.5px]"} ${
              on ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
            {on && (
              <m.span layoutId={`seg-${id}`} aria-hidden
                className="absolute inset-0 rounded-md bg-[var(--surface)] shadow-[0_1px_2px_rgb(0_0_0/.08),0_0_0_1px_var(--border)] dark:bg-[var(--surface-3)]"
                transition={{ type: "spring", stiffness: 600, damping: 42 }} />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Tiny native select, styled to sit in a chart header. */
export function MiniSelect<T extends string | number>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <label className="inline-flex shrink-0 items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <span className="relative">
        <select value={String(value)} aria-label={label}
          onChange={(e) => {
            const o = options.find((x) => String(x.value) === e.target.value);
            if (o) onChange(o.value);
          }}
          className="ctl h-[26px] appearance-none rounded-md border border-[var(--border)] bg-[var(--surface)] py-0 pl-2 pr-6 text-[10.5px] font-medium text-[var(--text)] outline-none hover:border-[var(--border-strong)] focus:border-brand-500">
          {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
        <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
      </span>
    </label>
  );
}

/** Accessible switch. */
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-[13px] font-medium">{label}</label>
        {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`ctl relative h-6 w-11 shrink-0 rounded-full p-0.5 ${checked ? "bg-accent-grad" : "bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--border-strong)]"}`}>
        <m.span layout transition={{ type: "spring", stiffness: 700, damping: 38 }}
          className={`block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/.25)] ${checked ? "ml-auto" : ""}`} />
      </button>
    </div>
  );
}

/** Horizontal stacked share bar (e.g. grade mix) with an accessible title. */
export function StackBar({ parts, height = 8 }: { parts: { label: string; value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="flex w-full gap-px overflow-hidden rounded-full bg-[var(--surface-3)]" style={{ height }}
      title={parts.map((p) => `${p.label}: ${p.value}`).join(" · ")}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <div key={p.label} className="transition-[width] duration-700 ease-[var(--ease-out-expo)]" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}

/** Small "delta vs reference" pill — green/red tint, neutral when flat. */
export function Delta({ value, digits = 1, suffix = "", invert = false }: { value: number | null; digits?: number; suffix?: string; invert?: boolean }) {
  if (value === null || Number.isNaN(value)) return <span className="text-[10px] text-[var(--text-muted)]">—</span>;
  const zero = Math.abs(value) < 10 ** -digits / 2;
  const good = invert ? value < 0 : value > 0;
  const Icon = zero ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`num inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset ${
      zero ? "bg-[var(--surface-3)] text-[var(--text-muted)] ring-[var(--border)]"
        : good ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300"
          : "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300"}`}>
      <Icon size={11} strokeWidth={2.6} />{Math.abs(value).toFixed(digits)}{suffix}
    </span>
  );
}

/**
 * Inline SVG sparkline. Pure SVG: no chart library, ~0 cost per card.
 * The last point is emphasised; `highlight` marks a specific index.
 */
export const Sparkline = memo(function Sparkline({ values, color, width = 84, height = 28, highlight, labels, max, min }: {
  values: (number | null)[]; color: string; width?: number; height?: number; highlight?: number; labels?: string[]; max?: number; min?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null) as { v: number; i: number }[];
  if (pts.length < 2) return null;
  const lo = min ?? Math.min(...pts.map((p) => p.v)), hi = max ?? Math.max(...pts.map((p) => p.v));
  const span = hi - lo || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${line}L${x(pts[pts.length - 1].i).toFixed(1)},${height}L${x(pts[0].i).toFixed(1)},${height}Z`;
  const hl = highlight ?? pts[pts.length - 1].i;
  const hp = pts.find((p) => p.i === hl);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" role="img"
      aria-label={labels ? values.map((v, i) => `${labels[i]}: ${v === null ? "n/a" : v.toFixed(1)}`).join(", ") : undefined}>
      <defs>
        <linearGradient id={`sg${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="spark-line" pathLength={1} />
      {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p.i === hl ? 0 : 1.6} fill={color} opacity=".55" />)}
      {hp && <circle cx={x(hp.i)} cy={y(hp.v)} r="3.2" fill="var(--surface)" stroke={color} strokeWidth="2" />}
    </svg>
  );
});
