"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Building2, Layers, MapPin, Wrench, CornerDownLeft, FileText } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { NAV } from "./nav";
import { programBase, instituteHref } from "@/lib/portfolio";
import { scoreColor } from "@/config";

interface Item { id: string; group: string; label: string; sub?: string; icon: typeof Search; color?: string; run: () => void; score?: number | null }

/** Ctrl/⌘ K — jump to any programme, page or institute, or filter by district/trade. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, scope, toggle } = useDash();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);

  const all = useMemo<Item[]>(() => {
    const items: Item[] = [];
    for (const n of NAV) {
      if (scope.mode === "program" && n.portfolioOnly) continue;
      items.push({ id: `page${n.path}`, group: "Pages", label: n.label, sub: scope.label, icon: n.icon, run: () => router.push(scope.href(n.path)) });
    }
    items.push({ id: "prog-all", group: "Programmes", label: "All Programmes", sub: "Combined portfolio", icon: Layers, run: () => router.push("/") });
    for (const p of data.programs)
      items.push({ id: `prog-${p.slug}`, group: "Programmes", label: p.name, sub: `${p.family} · ${p.instituteCount} institutes`, icon: Layers, color: p.color, run: () => router.push(programBase(p.slug)) });
    for (const i of data.institutes) {
      const p = data.programBySlug.get(i.p)!;
      items.push({
        id: `inst-${i.p}-${i.instituteKey}`, group: "Institutes", label: i.instituteName,
        sub: `${p.short} · ${i.district} · ID ${i.instituteId ?? "—"}`, icon: Building2, color: p.color, score: i.score,
        run: () => router.push(instituteHref(programBase(i.p), i)),
      });
    }
    const districts = [...new Set(data.rows.map((r) => r.district))].sort();
    for (const d of districts) items.push({ id: `d-${d}`, group: "Filter by district", label: d, icon: MapPin, run: () => toggle("district", d) });
    const trades = [...new Set(data.rows.map((r) => r.tradeNorm))];
    for (const t of trades) items.push({ id: `t-${t}`, group: "Filter by trade", label: data.tradeName(t), icon: Wrench, run: () => toggle("trade", t) });
    return items;
  }, [data, scope, router, toggle]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all.filter((i) => i.group === "Pages" || i.group === "Programmes");
    const toks = s.split(/\s+/);
    const hits = all.filter((i) => toks.every((t) => `${i.label} ${i.sub ?? ""}`.toLowerCase().includes(t)));
    // Cap each group so districts and trades are not buried under 60 institutes.
    const per = new Map<string, number>();
    return hits.filter((i) => { const n = per.get(i.group) ?? 0; per.set(i.group, n + 1); return n < (i.group === "Institutes" ? 12 : 6); });
  }, [q, all]);

  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;
  const choose = (i: Item | undefined) => { if (!i) return; i.run(); onClose(); };

  let lastGroup = "";
  return (
    <div className="no-print fixed inset-0 z-[90] flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div className="rise w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
          <Search size={16} className="text-[var(--text-muted)]" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search programmes, institutes, districts, trades, pages…"
            aria-label="Command search"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => Math.min(v + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)); }
              if (e.key === "Enter") choose(results[sel]);
              if (e.key === "Escape") onClose();
            }}
            className="h-12 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none" />
          <kbd className="rounded border border-[var(--border)] px-1.5 text-[10px] text-[var(--text-muted)]">Esc</kbd>
        </div>
        <div className="max-h-[56vh] overflow-y-auto p-1.5">
          {results.length === 0 && <div className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">No matches</div>}
          {results.map((i, idx) => {
            const head = i.group !== lastGroup ? i.group : null;
            lastGroup = i.group;
            const Icon = i.icon ?? FileText;
            return (
              <div key={i.id}>
                {head && <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{head}</div>}
                <button onMouseEnter={() => setSel(idx)} onClick={() => choose(i)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs ${idx === sel ? "bg-brand-50 dark:bg-brand-700/25" : ""}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ background: (i.color ?? "#64748b") + "1f", color: i.color ?? "var(--text-muted)" }}><Icon size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.label}</span>
                    {i.sub && <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{i.sub}</span>}
                  </span>
                  {i.score !== undefined && <span className="num text-xs font-bold" style={{ color: scoreColor(i.score) }}>{i.score?.toFixed(1) ?? "—"}</span>}
                  {idx === sel && <CornerDownLeft size={12} className="text-[var(--text-muted)]" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
