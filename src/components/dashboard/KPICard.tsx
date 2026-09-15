"use client";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, Tooltip } from "../ui";

/** Counts a value up on mount. Presentation only — the underlying number never changes. */
function useCountUp(target: number, run: boolean, ms = 650) {
  const [v, setV] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (!run) { setV(target); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / ms, 1);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, run, ms]);
  return v;
}

export interface KPICardProps {
  label: string;
  value: number;
  /** Turns the animated raw number into its display string. */
  format: (n: number) => string;
  sub?: string;
  icon: LucideIcon;
  accent?: string;
  methodology: React.ReactNode;
  animate?: boolean;
}

export function KPICard({ label, value, format, sub, icon: Icon, accent = "#2563eb", methodology, animate = true }: KPICardProps) {
  const shown = useCountUp(value, animate);
  return (
    <Card className="card-hover print-avoid rise p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {label}
          <Tooltip label={methodology} />
        </span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: accent + "18", color: accent }}>
          <Icon size={14} strokeWidth={2.2} />
        </span>
      </div>
      <div className="num mt-2 text-[26px] font-bold leading-none">{format(shown)}</div>
      {sub && <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">{sub}</div>}
    </Card>
  );
}
