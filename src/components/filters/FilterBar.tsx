"use client";
import { useMemo, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { Search, RotateCcw, SlidersHorizontal, Flag } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { GRADE_COLORS, GRADE_ORDER, STATUS_COLORS } from "@/config";
import { MultiSelect, Chip, Button } from "../ui";
import type { AssessmentRow, FilterState } from "@/types";
import { InstitutePicker } from "./InstitutePicker";
import { directoryOf } from "@/lib/institutes";

function useDebounced<T>(value: T, ms = 220): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Option list with live counts: each filter counts records under every OTHER active filter. */
function useOptions(key: keyof FilterState, get: (r: AssessmentRow) => string | number | null, label?: (v: string) => string) {
  const { rowsIgnoring, scopeRows } = useDash();
  return useMemo(() => {
    const scoped = rowsIgnoring([key]);
    const counts = new Map<string, number>();
    for (const r of scoped) { const v = get(r); if (v !== null && v !== undefined && v !== "") counts.set(String(v), (counts.get(String(v)) ?? 0) + 1); }
    const universe = new Set(scopeRows.map((r) => get(r)).filter((v) => v !== null && v !== undefined && v !== "").map(String));
    return [...universe].map((v) => ({ value: v, label: label ? label(v) : v, count: counts.get(v) ?? 0 }))
      .sort((a, b) => a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsIgnoring, scopeRows, key]);
}

export function FilterBar() {
  const { data, scope, filters, patch, reset, hasFilters, activeCount, rows, scopeRows, institutes } = useDash();
  const [q, setQ] = useState(filters.search);
  const debounced = useDebounced(q);
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { if (debounced !== filters.search) patch({ search: debounced }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(filters.search); }, [filters.search]);

  const programOpts = useOptions("program", (r) => r.p, (v) => data.programBySlug.get(v)?.short ?? v);
  const regionOpts = useOptions("region", (r) => r.region);
  const districtAll = useOptions("district", (r) => r.district);
  const districtOpts = useMemo(() => {
    if (!filters.region.length) return districtAll;
    const valid = new Set(scopeRows.filter((r) => filters.region.includes(r.region)).map((r) => r.district));
    return districtAll.filter((o) => valid.has(o.value));
  }, [districtAll, filters.region, scopeRows]);
  const tradeOpts = useOptions("trade", (r) => r.tradeNorm, (v) => data.tradeName(v));
  const packageOpts = useOptions("package", (r) => r.package);
  const batchOpts = useOptions("batch", (r) => r.batch, (v) => `Batch ${v}`);

  const gradeOpts = useMemo(() => {
    const present = new Set(data.institutes.filter((i) => scope.mode === "portfolio" || i.p === scope.program?.slug).map((i) => i.grade));
    return GRADE_ORDER.filter((g) => present.has(g));
  }, [data, scope]);
  const statusOpts = useMemo(() => {
    const s = new Set(data.institutes.filter((i) => scope.mode === "portfolio" || i.p === scope.program?.slug).map((i) => i.status));
    return ["Active", "Critical", "Fake", "Non-Functional", "Closed"].filter((x) => s.has(x as never));
  }, [data, scope]);

  const dir = directoryOf(data);
  const chips: { key: string; label: string; color?: string; onRemove: () => void }[] = [
    ...filters.institute.map((v) => ({ key: `i-${v}`, label: dir.byKey.get(v)?.name ?? v, color: "#1d4ed8", onRemove: () => patch({ institute: filters.institute.filter((x) => x !== v) }) })),
    ...filters.program.map((v) => ({ key: `p-${v}`, label: data.programBySlug.get(v)?.short ?? v, color: data.programBySlug.get(v)?.color, onRemove: () => patch({ program: filters.program.filter((x) => x !== v) }) })),
    ...filters.region.map((v) => ({ key: `r-${v}`, label: v, onRemove: () => patch({ region: filters.region.filter((x) => x !== v) }) })),
    ...filters.district.map((v) => ({ key: `d-${v}`, label: v, onRemove: () => patch({ district: filters.district.filter((x) => x !== v) }) })),
    ...filters.package.map((v) => ({ key: `pk-${v}`, label: v, onRemove: () => patch({ package: filters.package.filter((x) => x !== v) }) })),
    ...filters.grade.map((v) => ({ key: `g-${v}`, label: v, color: GRADE_COLORS[v], onRemove: () => patch({ grade: filters.grade.filter((x) => x !== v) }) })),
    ...filters.status.map((v) => ({ key: `s-${v}`, label: v, color: STATUS_COLORS[v], onRemove: () => patch({ status: filters.status.filter((x) => x !== v) }) })),
    ...filters.batch.map((v) => ({ key: `b-${v}`, label: `Batch ${v}`, onRemove: () => patch({ batch: filters.batch.filter((x) => x !== v) }) })),
    ...filters.trade.map((v) => ({ key: `t-${v}`, label: data.tradeName(v), onRemove: () => patch({ trade: filters.trade.filter((x) => x !== v) }) })),
  ];
  if (filters.search.trim()) chips.push({ key: "q", label: `"${filters.search.trim()}"`, onRemove: () => patch({ search: "" }) });
  if (filters.scoreMin !== null || filters.scoreMax !== null)
    chips.push({ key: "s", label: `Score ${filters.scoreMin ?? 0}–${filters.scoreMax ?? 100}`, onRemove: () => patch({ scoreMin: null, scoreMax: null }) });
  if (filters.flaggedOnly) chips.push({ key: "f", label: "Flagged only", color: "#dc2626", onRemove: () => patch({ flaggedOnly: false }) });

  if (pathname.replace(/\/$/, "") === "/settings") return null;

  return (
    <div className="no-print filter-controls glass relative z-30 mb-4 rounded-2xl px-3 py-2.5 shadow-[var(--shadow-card)] sm:sticky sm:top-[64px] lg:top-[78px]">
      <div className="flex flex-wrap items-center gap-2">
        <InstitutePicker />
        <button type="button" onClick={() => setMobileOpen((v) => !v)} aria-expanded={mobileOpen}
          className="ctl flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs sm:hidden">
          <SlidersHorizontal size={12} /> Filters{activeCount ? <span className="num grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9.5px] font-bold text-white">{activeCount}</span> : null}
        </button>
        <div className={mobileOpen ? "contents" : "hidden sm:contents"}>
        <div className="relative min-w-[160px] flex-1 sm:max-w-[220px]">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search"
            placeholder="Text search…" aria-label="Free-text search across the dataset"
            className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-7 pr-2 text-xs outline-none transition-colors placeholder:text-[var(--text-subtle)] hover:border-[var(--border-strong)] focus:border-brand-500 focus:ring-2 focus:ring-[color-mix(in_oklab,var(--brand-500)_22%,transparent)]" />
        </div>

        {scope.mode === "portfolio" && (
          <MultiSelect label="Programme" width="w-36" selected={filters.program} onChange={(v) => patch({ program: v })}
            options={programOpts.map((o) => ({ ...o, color: data.programBySlug.get(o.value)?.color }))} />
        )}
        <MultiSelect label="Region" width="w-28" selected={filters.region} onChange={(v) => patch({ region: v })} options={regionOpts} />
        <MultiSelect label="District" width="w-32" selected={filters.district} onChange={(v) => patch({ district: v })} options={districtOpts} />
        <MultiSelect label="Trade" width="w-28" selected={filters.trade} onChange={(v) => patch({ trade: v })} options={tradeOpts} />
        <MultiSelect label="Grade" width="w-28" selected={filters.grade} onChange={(v) => patch({ grade: v })}
          options={gradeOpts.map((g) => ({ value: g, label: g, color: GRADE_COLORS[g] }))} />

        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
          className={`ctl flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${expanded ? "border-[color-mix(in_oklab,var(--brand-500)_50%,var(--border))] bg-[color-mix(in_oklab,var(--brand-500)_10%,var(--surface))] text-[var(--text)]" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"}`}>
          <SlidersHorizontal size={12} className={`transition-transform duration-300 ${expanded ? "rotate-90" : ""}`} /> More filters
        </button>
        </div>

        <span className="num ml-auto hidden items-center gap-2 text-[11px] text-[var(--text-muted)] sm:inline-flex">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
            <span className="block h-full origin-left rounded-full bg-accent-grad transition-transform duration-500 ease-[var(--ease-out-expo)]" style={{ transform: `scaleX(${scopeRows.length ? rows.length / scopeRows.length : 0})` }} />
          </span>
          <span><strong className="text-[var(--text)]">{rows.length.toLocaleString()}</strong> / {scopeRows.length.toLocaleString()} records · <strong className="text-[var(--text)]">{institutes.length}</strong> institutes</span>
        </span>

        {hasFilters && (
          <Button size="sm" variant="danger" onClick={reset}><RotateCcw size={12} /> Clear ({activeCount})</Button>
        )}
      </div>

      <AnimatePresence initial={false}>
      {expanded && (
        <m.div key="more" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2">
          {packageOpts.length > 1 && <MultiSelect label="Package" width="w-32" selected={filters.package} onChange={(v) => patch({ package: v })} options={packageOpts} />}
          {batchOpts.length > 1 && <MultiSelect label="Batch" width="w-28" selected={filters.batch.map(String)} onChange={(v) => patch({ batch: v.map(Number) })} options={batchOpts} />}
          {statusOpts.length > 1 && (
            <MultiSelect label="Status" width="w-32" selected={filters.status} onChange={(v) => patch({ status: v })}
              options={statusOpts.map((s) => ({ value: s, label: s, color: STATUS_COLORS[s] }))} />
          )}
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            Trade score
            <input type="number" min={0} max={100} value={filters.scoreMin ?? ""} placeholder="0"
              onChange={(e) => patch({ scoreMin: e.target.value === "" ? null : Number(e.target.value) })}
              className="num w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs" />
            to
            <input type="number" min={0} max={100} value={filters.scoreMax ?? ""} placeholder="100"
              onChange={(e) => patch({ scoreMax: e.target.value === "" ? null : Number(e.target.value) })}
              className="num w-14 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs" />
          </label>
          <button onClick={() => patch({ flaggedOnly: !filters.flaggedOnly })} aria-pressed={filters.flaggedOnly}
            className={`ctl flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${filters.flaggedOnly ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "border-[var(--border)] hover:bg-[var(--surface-3)]"}`}>
            <Flag size={12} /> Flagged institutes only
          </button>
          <div className="ml-auto flex flex-wrap gap-1">
            {gradeOpts.map((g) => (
              <button key={g} onClick={() => patch({ grade: filters.grade.includes(g) ? filters.grade.filter((x) => x !== g) : [...filters.grade, g] })}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-opacity ${filters.grade.includes(g) ? "ring-1 ring-current" : "opacity-55 hover:opacity-90"}`}
                style={{ background: GRADE_COLORS[g] + "20", color: GRADE_COLORS[g] }}>
                {g}
              </button>
            ))}
          </div>
        </div>
        </m.div>
      )}
      </AnimatePresence>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <AnimatePresence initial={false}>
            {chips.map((c) => <Chip key={c.key} color={c.color} onRemove={c.onRemove}>{c.label}</Chip>)}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
