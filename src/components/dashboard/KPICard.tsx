"use client";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, Tooltip } from "../ui";

function useCountUp(target: number, run: boolean, ms = 650) {
  const [v, setV] = useState(target);
  const prev = useRef(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (!run || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); prev.current = target; return; }
    const from = prev.current;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / ms, 1);
      setV(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, run, ms]);
  return v;
}

export interface KpiBreakdown { label: string; color: string; value: number; display: string; onClick?: () => void }

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
}

export function KPICard({
  label, value, format, sub, icon: Icon, accent = "#2563eb", methodology, animate = true,
  breakdown, breakdownMode = "share", scaleMax, gauge,
}: KPICardProps) {
  const shown = useCountUp(value, animate);
  const total = breakdown?.reduce((s, b) => s + b.value, 0) ?? 0;
  const max = scaleMax ?? Math.max(...(breakdown?.map((b) => b.value) ?? [1]), 1);
  return (
    <Card className="card-hover print-avoid rise relative overflow-hidden p-4">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[.09]" style={{ background: accent }} />
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
          <Tooltip label={methodology} />
        </span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: accent + "1c", color: accent }}>
          <Icon size={14} strokeWidth={2.2} />
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <div className="num text-[26px] font-bold leading-none tracking-tight">{format(shown)}</div>
        {gauge !== undefined && gauge !== null && (
          <svg width="26" height="26" viewBox="0 0 36 36" className="mb-0.5 shrink-0" aria-hidden>
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="5" />
            <circle cx="18" cy="18" r="15" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(gauge, 1)) * 94.25} 94.25`} transform="rotate(-90 18 18)" />
          </svg>
        )}
      </div>
      {sub && <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{sub}</div>}
      {breakdown && breakdown.length > 1 && (
        <div className="mt-2.5 space-y-[3px] border-t border-[var(--border)] pt-2">
          {breakdown.map((b) => {
            const w = breakdownMode === "share" ? (total ? b.value / total : 0) : b.value / max;
            return (
              <button key={b.label} type="button" onClick={b.onClick} disabled={!b.onClick}
                className="group flex w-full items-center gap-1.5 text-left disabled:cursor-default" title={`${b.label}: ${b.display}`}>
                <span className="w-[62px] shrink-0 truncate text-[9.5px] text-[var(--text-muted)] group-enabled:group-hover:text-[var(--text)]">{b.label}</span>
                <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(w * 100, 1.5)}%`, background: b.color }} />
                </span>
                <span className="num w-[42px] shrink-0 text-right text-[9.5px] font-semibold">{b.display}</span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
