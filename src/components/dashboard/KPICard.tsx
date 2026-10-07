"use client";
import { memo, useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, Tooltip, Delta, Sparkline } from "../ui";
import { usePrefs } from "../providers/ThemeProvider";

/**
 * Count-up that writes straight to the text node: no React re-render per
 * frame, so eight KPI cards animating after a filter change cost ~nothing.
 */
function CountUp({ value, format, run }: { value: number; format: (n: number) => string; run: boolean }) {
  const el = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const from = prev.current ?? 0;
    prev.current = value;
    if (!run || from === value) { node.textContent = fmt.current(value); return; }
    const t0 = performance.now(), ms = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min((t - t0) / ms, 1);
      node.textContent = fmt.current(from + (value - from) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, run]);
  return <span ref={el}>{format(value)}</span>;
}

export interface KpiBreakdown { label: string; color: string; value: number; display: string; onClick?: () => void }

export interface KpiTrend {
  values: (number | null)[];
  labels: string[];
  /** index of the point this card's value corresponds to */
  highlight?: number;
  caption?: string;
}

export interface KpiDelta { value: number | null; vs: string; digits?: number; suffix?: string; invert?: boolean }

export interface KPICardProps {
  label: string;
  value: number;
  format: (n: number) => string;
  sub?: React.ReactNode;
  icon: LucideIcon;
  accent?: string;
  methodology: React.ReactNode;
  animate?: boolean;
  /** Per-programme (or per-segment) split, drawn as mini bars under the value. */
  breakdown?: KpiBreakdown[];
  /** "share": bars proportional to the sum; "scale": bars against `scaleMax`. */
  breakdownMode?: "share" | "scale";
  scaleMax?: number;
  /** 0–1 gauge drawn as a ring next to the value. */
  gauge?: number | null;
  /** Sparkline across batches. */
  trend?: KpiTrend | null;
  /** Change pill against the previous batch (or a reference). */
  delta?: KpiDelta | null;
}

export const KPICard = memo(function KPICard({
  label, value, format, sub, icon: Icon, accent = "#6366f1", methodology, animate = true,
  breakdown, breakdownMode = "share", scaleMax, gauge, trend, delta,
}: KPICardProps) {
  const { reducedMotion } = usePrefs();
  const total = breakdown?.reduce((s, b) => s + b.value, 0) ?? 0;
  const max = scaleMax ?? Math.max(...(breakdown?.map((b) => b.value) ?? [1]), 1);
  const g = gauge === undefined || gauge === null ? null : Math.max(0, Math.min(gauge, 1));

  return (
    <Card className="card-hover print-avoid group/kpi relative flex flex-col overflow-hidden p-4" style={{ ["--a" as string]: accent }}>
      {/* accent glow, brighter on hover */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-[.10] blur-2xl transition-opacity duration-300 group-hover/kpi:opacity-25" style={{ background: accent }} />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

      <div className="relative flex min-w-0 items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset" style={{ background: `color-mix(in oklab, ${accent} 13%, transparent)`, color: accent, ["--tw-ring-color" as string]: `color-mix(in oklab, ${accent} 22%, transparent)` }}>
          <Icon size={14} strokeWidth={2.2} />
        </span>
        <span className="t-label min-w-0 truncate" title={label}>{label}</span>
        <Tooltip label={methodology} />
      </div>

      <div className="relative mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-end gap-2">
            <div className="num text-[28px] font-bold leading-none tracking-tight">
              <CountUp value={value} format={format} run={animate && !reducedMotion} />
            </div>
            {g !== null && (
              <svg width="24" height="24" viewBox="0 0 36 36" className="mb-0.5 shrink-0 -rotate-90" aria-hidden>
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="5" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" pathLength={100}
                  strokeDasharray={`${g * 100} 100`} className="transition-[stroke-dasharray] duration-700 ease-[var(--ease-out-expo)]" />
              </svg>
            )}
          </div>
          {sub && <div className="mt-1.5 text-[11px] leading-snug text-[var(--text-muted)]">{sub}</div>}
        </div>
        {(trend || (delta && delta.value !== null)) && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {delta && delta.value !== null && (
              <span title={`Change vs ${delta.vs}`}><Delta value={delta.value} digits={delta.digits ?? 1} suffix={delta.suffix ?? ""} invert={delta.invert} /></span>
            )}
            {trend && <Sparkline values={trend.values} labels={trend.labels} color={accent} highlight={trend.highlight} width={72} height={24} />}
            {trend?.caption && <div className="text-[9px] text-[var(--text-subtle)]">{trend.caption}</div>}
            {!trend && delta && <div className="text-[9px] text-[var(--text-subtle)]">vs {delta.vs}</div>}
          </div>
        )}
      </div>
      {delta && delta.value !== null && <div className="sr-only">Change versus {delta.vs}: {delta.value.toFixed(delta.digits ?? 1)}{delta.suffix}</div>}

      {breakdown && breakdown.length > 1 && (
        <div className="relative mt-3 space-y-[3px] border-t border-[var(--border)] pt-2.5">
          {breakdown.map((b) => {
            const w = breakdownMode === "share" ? (total ? b.value / total : 0) : b.value / max;
            return (
              <button key={b.label} type="button" onClick={b.onClick} disabled={!b.onClick}
                className="group/bd -mx-1 flex w-[calc(100%+.5rem)] items-center gap-1.5 rounded px-1 py-px text-left transition-colors enabled:hover:bg-[var(--surface-3)] disabled:cursor-default" title={`${b.label}: ${b.display}`}>
                <span className="w-[62px] shrink-0 truncate text-[9.5px] text-[var(--text-muted)] group-enabled/bd:group-hover/bd:text-[var(--text)]">{b.label}</span>
                <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <span className="block h-full origin-left rounded-full transition-transform duration-700 ease-[var(--ease-out-expo)]"
                    style={{ transform: `scaleX(${Math.max(w, 0.015)})`, background: b.color }} />
                </span>
                <span className="num w-[42px] shrink-0 text-right text-[9.5px] font-semibold">{b.display}</span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
});
