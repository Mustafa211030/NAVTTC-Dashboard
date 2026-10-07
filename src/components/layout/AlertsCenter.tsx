"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { Bell, X, ShieldAlert, TrendingDown, Database, CheckCheck, Crosshair, ChevronRight } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { Overlay } from "../Overlay";
import { IconButton, Seg, Button } from "../ui";
import { useAlerts, type AlertKind, type DashAlert } from "./useAlerts";
import { scoreColor } from "@/config";

const KEY = "navttc-alerts-seen";
const KIND: Record<AlertKind, { label: string; icon: typeof Bell; color: string }> = {
  integrity: { label: "Integrity", icon: ShieldAlert, color: "#ef4444" },
  decline: { label: "Declines", icon: TrendingDown, color: "#f59e0b" },
  quality: { label: "Data", icon: Database, color: "#8b5cf6" },
};

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as string[]); } catch { return new Set(); }
}

/** Header bell + slide-over drawer. Read state is remembered per browser. */
export function AlertsCenter() {
  const alerts = useAlerts();
  const { data, patch } = useDash();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | AlertKind>("all");
  const [seen, setSeen] = useState<Set<string>>(new Set());
  useEffect(() => setSeen(readSeen()), []);

  const unread = useMemo(() => alerts.filter((a) => !seen.has(a.id)).length, [alerts, seen]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: alerts.length, integrity: 0, decline: 0, quality: 0 };
    for (const a of alerts) c[a.kind]++;
    return c;
  }, [alerts]);
  const shown = useMemo(() => (tab === "all" ? alerts : alerts.filter((a) => a.kind === tab)), [alerts, tab]);

  const markAll = useCallback(() => {
    const next = new Set([...seen, ...alerts.map((a) => a.id)]);
    setSeen(next);
    try { window.localStorage.setItem(KEY, JSON.stringify([...next].slice(-3000))); } catch { /* ignore */ }
  }, [alerts, seen]);
  const markOne = (id: string) => {
    if (seen.has(id)) return;
    const next = new Set(seen); next.add(id); setSeen(next);
    try { window.localStorage.setItem(KEY, JSON.stringify([...next].slice(-3000))); } catch { /* ignore */ }
  };

  const go = (a: DashAlert) => { markOne(a.id); setOpen(false); router.push(a.href); };
  const focus = (a: DashAlert) => { if (!a.globalKey) return; markOne(a.id); setOpen(false); patch({ institute: [a.globalKey] }); };

  return (
    <>
      <IconButton label={`Alerts${unread ? ` — ${unread} unread` : ""}`} onClick={() => setOpen(true)} className="relative">
        <Bell size={16} />
        <AnimatePresence>
          {unread > 0 && (
            <m.span key="badge" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="num absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-[var(--surface)]">
              {unread > 99 ? "99+" : unread}
            </m.span>
          )}
        </AnimatePresence>
      </IconButton>

      <Overlay open={open} onClose={() => setOpen(false)} variant="right" label="Alerts"
        className="flex h-full w-[min(440px,100vw)] flex-col border-l border-[var(--border)] bg-[var(--elevated)] shadow-[var(--shadow-pop)]">
        <div className="border-b border-[var(--border)] px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold">Alerts</h2>
              <p className="text-[11px] text-[var(--text-muted)]">{alerts.length} findings in view · {unread} unread</p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="xs" variant="ghost" onClick={markAll} disabled={!unread}><CheckCheck size={12} /> Mark all read</Button>
              <IconButton label="Close alerts" onClick={() => setOpen(false)}><X size={16} /></IconButton>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <Seg value={tab} onChange={setTab} label="Alert type" options={[
              { value: "all", label: `All ${counts.all}` },
              { value: "integrity", label: `Integrity ${counts.integrity}` },
              { value: "decline", label: `Declines ${counts.decline}` },
              { value: "quality", label: `Data ${counts.quality}` },
            ]} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-2">
          {shown.length === 0 && (
            <div className="grid place-items-center px-6 py-16 text-center">
              <CheckCheck size={22} className="text-emerald-500" />
              <p className="mt-2 text-sm font-medium">Nothing here</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">No findings of this type in the programmes in view.</p>
            </div>
          )}
          <ul className="space-y-1">
            {shown.slice(0, 250).map((a, i) => {
              const k = KIND[a.kind];
              const Icon = k.icon;
              const p = data.programBySlug.get(a.program);
              const isNew = !seen.has(a.id);
              return (
                <m.li key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.018, duration: 0.25 }}
                  className="group relative rounded-xl transition-colors hover:bg-[var(--surface-3)]">
                  <button type="button" onClick={() => go(a)} className="flex w-full items-start gap-3 rounded-xl p-2.5 pr-10 text-left">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${k.color} 14%, transparent)`, color: k.color }}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {isNew && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-label="unread" />}
                        <span className="truncate text-[12.5px] font-semibold">{a.title}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-[var(--text-muted)]">{a.detail}</span>
                      <span className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                        <span className={`rounded-full px-1.5 py-px font-semibold ${a.severity === "high" ? "bg-red-500/12 text-red-600 dark:text-red-300" : "bg-amber-500/12 text-amber-700 dark:text-amber-300"}`}>{a.severity}</span>
                        {p && <span className="inline-flex items-center gap-1 text-[var(--text-muted)]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />{p.short}</span>}
                        {a.score !== undefined && a.score !== null && <span className="num font-semibold" style={{ color: scoreColor(a.score) }}>{a.score.toFixed(1)}</span>}
                      </span>
                    </span>
                    <ChevronRight size={14} className="mt-2 shrink-0 text-[var(--text-subtle)] transition-transform group-hover:translate-x-0.5" />
                  </button>
                  {a.globalKey && (
                    <button type="button" onClick={() => focus(a)} title="Focus the dashboard on this institute" aria-label={`Focus on ${a.title}`}
                      className="ctl absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] opacity-0 hover:bg-[var(--surface)] hover:text-brand-600 focus-visible:opacity-100 group-hover:opacity-100">
                      <Crosshair size={13} />
                    </button>
                  )}
                </m.li>
              );
            })}
          </ul>
          {shown.length > 250 && <p className="px-3 py-3 text-center text-[11px] text-[var(--text-muted)]">Showing the 250 most severe of {shown.length}.</p>}
        </div>
      </Overlay>
    </>
  );
}
