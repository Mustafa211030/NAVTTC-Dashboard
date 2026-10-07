"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { m } from "motion/react";
import { Overlay } from "../Overlay";
import { Kbd } from "../ui";
import { useRouter } from "next/navigation";
import { Search, Building2, Layers, MapPin, Wrench, CornerDownLeft, FileText, Crosshair, Settings } from "lucide-react";
import { directoryOf } from "@/lib/institutes";
import { useDash } from "../providers/FilterProvider";
import { NAV } from "./nav";
import { programBase, instituteHref } from "@/lib/portfolio";
import { scoreColor } from "@/config";

interface Item { id: string; group: string; label: string; sub?: string; icon: typeof Search; color?: string; run: () => void; score?: number | null }

/** Ctrl/⌘ K — jump to any programme, page or institute, or filter by district/trade. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, scope, toggle, patch } = useDash();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);

  const all = useMemo<Item[]>(() => {
    const items: Item[] = [];
    for (const n of NAV) {
      if (scope.mode === "program" && n.portfolioOnly) continue;
      items.push({ id: `page${n.path}`, group: "Pages", label: n.label, sub: scope.label, icon: n.icon, run: () => router.push(scope.href(n.path)) });
    }
    items.push({ id: "page-settings", group: "Pages", label: "Settings", sub: "Theme, accent, density, motion, start-up view", icon: Settings, run: () => router.push("/settings") });
    items.push({ id: "prog-all", group: "Programmes", label: "All Programmes", sub: "Combined portfolio", icon: Layers, run: () => router.push("/") });
    for (const p of data.programs)
      items.push({ id: `prog-${p.slug}`, group: "Programmes", label: p.name, sub: `${p.family} · ${p.instituteCount} institutes`, icon: Layers, color: p.color, run: () => router.push(programBase(p.slug)) });
    for (const e of directoryOf(data).list) {
      items.push({
        id: `focus-${e.key}`, group: "Focus on institute", label: e.name,
        sub: `${e.id !== null ? `ID ${e.id}` : "name-matched"} · ${e.district} · ${e.programs.map((p) => p.code).join(" → ")}`,
        icon: Crosshair, color: e.programs[e.programs.length - 1]?.color, score: e.latest.score,
        run: () => patch({ institute: [e.key] }),
      });
    }
    for (const i of data.institutes) {
      const p = data.programBySlug.get(i.p)!;
      items.push({
        id: `inst-${i.p}-${i.instituteKey}`, group: "Open institute profile", label: i.instituteName,
        sub: `${p.short} · ${i.district} · ID ${i.instituteId ?? "—"}`, icon: Building2, color: p.color, score: i.score,
        run: () => router.push(instituteHref(programBase(i.p), i)),
      });
    }
    const districts = [...new Set(data.rows.map((r) => r.district))].sort();
    for (const d of districts) items.push({ id: `d-${d}`, group: "Filter by district", label: d, icon: MapPin, run: () => toggle("district", d) });
    const trades = [...new Set(data.rows.map((r) => r.tradeNorm))];
    for (const t of trades) items.push({ id: `t-${t}`, group: "Filter by trade", label: data.tradeName(t), icon: Wrench, run: () => toggle("trade", t) });
    return items;
  }, [data, scope, router, toggle, patch]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all.filter((i) => i.group === "Pages" || i.group === "Programmes");
    const toks = s.split(/\s+/);
    const hits = all.filter((i) => toks.every((t) => `${i.label} ${i.sub ?? ""}`.toLowerCase().includes(t)));
    // Cap each group so districts and trades are not buried under 60 institutes.
    const per = new Map<string, number>();
    return hits.filter((i) => { const n = per.get(i.group) ?? 0; per.set(i.group, n + 1); return n < (i.group === "Focus on institute" ? 10 : i.group === "Open institute profile" ? 6 : 6); });
  }, [q, all]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const choose = (i: Item | undefined) => { if (!i) return; i.run(); onClose(); };

  let lastGroup = "";
  return (
    <Overlay open={open} onClose={onClose} variant="top" label="Command palette" className="pop w-[min(640px,calc(100vw-2rem))] overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4">
        <Search size={17} className="text-[var(--text-muted)]" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search programmes, institutes, IDs, districts, trades, pages…"
          aria-label="Command search" aria-controls="cmd-list" aria-activedescendant={results[sel] ? `cmd-${results[sel].id}` : undefined}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => Math.min(v + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
            if (e.key === "Enter") choose(results[sel]);
          }}
          className="h-14 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-subtle)] focus-visible:outline-none" style={{ outline: "none" }} />
        <Kbd>Esc</Kbd>
      </div>
      <div ref={listRef} id="cmd-list" role="listbox" className="max-h-[56vh] overflow-y-auto overscroll-contain p-1.5">
        {results.length === 0 && <div className="px-3 py-10 text-center text-xs text-[var(--text-muted)]">No matches for &ldquo;{q}&rdquo;</div>}
        {results.map((i, idx) => {
          const head = i.group !== lastGroup ? i.group : null;
          lastGroup = i.group;
          const Icon = i.icon ?? FileText;
          const on = idx === sel;
          return (
            <div key={i.id}>
              {head && <div className="t-eyebrow px-2.5 pb-1.5 pt-3 text-[var(--text-subtle)]">{head}</div>}
              <button type="button" id={`cmd-${i.id}`} role="option" aria-selected={on} data-idx={idx}
                onMouseMove={() => sel !== idx && setSel(idx)} onClick={() => choose(i)}
                className="relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-xs">
                {on && <m.span layoutId="cmd-sel" aria-hidden className="absolute inset-0 rounded-lg bg-[color-mix(in_oklab,var(--brand-500)_10%,var(--surface-3))] ring-1 ring-inset ring-[color-mix(in_oklab,var(--brand-500)_22%,transparent)]" transition={{ type: "spring", stiffness: 700, damping: 45 }} />}
                <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${i.color ?? "#64748b"} 14%, transparent)`, color: i.color ?? "var(--text-muted)" }}><Icon size={15} /></span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.label}</span>
                  {i.sub && <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{i.sub}</span>}
                </span>
                {i.score !== undefined && <span className="num relative text-xs font-bold" style={{ color: scoreColor(i.score) }}>{i.score?.toFixed(1) ?? "—"}</span>}
                {on && <CornerDownLeft size={12} className="relative text-[var(--text-muted)]" />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-[10.5px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
        <span className="ml-auto num">{results.length} result{results.length === 1 ? "" : "s"}</span>
      </div>
    </Overlay>
  );
}
