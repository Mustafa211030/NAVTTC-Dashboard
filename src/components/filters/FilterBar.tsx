"use client";
import { useMemo, useState, useEffect } from "react";
import { Search, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useFilters } from "../providers/FilterProvider";
import { dimensions, rows as allRows } from "@/lib/dataset";
import { availableDistricts, availableTrades } from "@/lib/filters";
import { GRADE_COLORS, availableGrades } from "@/config";
import { MultiSelect, Chip, Button } from "../ui";

/** Debounced search so keystrokes don't re-filter 698 rows on every character (§33). */
function useDebounced<T>(value: T, ms = 220): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function FilterBar() {
  const { filters, patch, reset, hasFilters, activeCount, rows } = useFilters();
  const [q, setQ] = useState(filters.search);
  const debounced = useDebounced(q);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { if (debounced !== filters.search) patch({ search: debounced }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(filters.search); }, [filters.search]);

  // Cascading option sets — invalid combinations disappear rather than returning zero rows (§13)
  const districtOpts = useMemo(() => {
    const valid = availableDistricts(dimensions.regionDistricts, filters.region);
    const counts = new Map<string, number>();
    for (const r of allRows) counts.set(r.district, (counts.get(r.district) ?? 0) + 1);
    return valid.map((d) => ({ value: d, label: d, count: counts.get(d) }));
  }, [filters.region]);

  const validTrades = useMemo(() => availableTrades(allRows, filters), [filters]);
  const tradeOpts = useMemo(
    () => dimensions.trades.filter((t) => validTrades.has(t.code)).map((t) => ({ value: String(t.code), label: t.name })),
    [validTrades]);

  const gradeOpts = useMemo(() => availableGrades(dimensions.grades), []);

  const regionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of allRows) m.set(r.region, (m.get(r.region) ?? 0) + 1);
    return m;
  }, []);

  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...filters.region.map((v) => ({ key: `r-${v}`, label: v, onRemove: () => patch({ region: filters.region.filter((x) => x !== v) }) })),
    ...filters.district.map((v) => ({ key: `d-${v}`, label: v, onRemove: () => patch({ district: filters.district.filter((x) => x !== v) }) })),
    ...filters.package.map((v) => ({ key: `p-${v}`, label: v, onRemove: () => patch({ package: filters.package.filter((x) => x !== v) }) })),
    ...filters.grade.map((v) => ({ key: `g-${v}`, label: v, onRemove: () => patch({ grade: filters.grade.filter((x) => x !== v) }) })),
    ...filters.batch.map((v) => ({ key: `b-${v}`, label: `Batch ${v}`, onRemove: () => patch({ batch: filters.batch.filter((x) => x !== v) }) })),
    ...filters.trade.map((v) => ({
      key: `t-${v}`,
      label: dimensions.trades.find((t) => t.code === v)?.name ?? String(v),
      onRemove: () => patch({ trade: filters.trade.filter((x) => x !== v) }),
    })),
  ];
  if (filters.search.trim()) chips.push({ key: "q", label: `"${filters.search.trim()}"`, onRemove: () => patch({ search: "" }) });
  if (filters.scoreMin !== null || filters.scoreMax !== null)
    chips.push({ key: "s", label: `Score ${filters.scoreMin ?? 0}–${filters.scoreMax ?? 100}`, onRemove: () => patch({ scoreMin: null, scoreMax: null }) });

  return (
    <div className="no-print filter-controls sticky top-0 z-30 -mx-4 mb-4 border-b border-[var(--border)] bg-[var(--surface)]/92 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[190px] flex-1 sm:max-w-xs">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} type="search"
            placeholder="Search institutes, districts, trades…" aria-label="Search the dataset"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-7 pr-2 text-xs outline-none focus:border-brand-500" />
        </div>

        <MultiSelect label="Region" width="w-32" selected={filters.region} onChange={(v) => patch({ region: v })}
          options={dimensions.regions.map((r) => ({ value: r, label: r, count: regionCounts.get(r) }))} />
        <MultiSelect label="District" width="w-36" selected={filters.district} onChange={(v) => patch({ district: v })} options={districtOpts} />
        <MultiSelect label="Trade" width="w-32" selected={filters.trade.map(String)} onChange={(v) => patch({ trade: v.map(Number) })} options={tradeOpts} />

        <button onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs hover:bg-[var(--surface-3)]">
          <SlidersHorizontal size={12} /> More
        </button>

        <span className="num ml-auto text-[11px] text-[var(--text-muted)]">
          {rows.length.toLocaleString()} of {allRows.length.toLocaleString()} records
        </span>

        {hasFilters && (
          <Button size="sm" variant="danger" onClick={reset}>
            <RotateCcw size={12} /> Clear all ({activeCount})
          </Button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2">
          <MultiSelect label="Package" width="w-36" selected={filters.package} onChange={(v) => patch({ package: v })}
            options={dimensions.packages.map((p) => ({ value: p, label: p }))} />
          <MultiSelect label="Grade" width="w-36" selected={filters.grade} onChange={(v) => patch({ grade: v })}
            options={gradeOpts.map((g) => ({ value: g, label: g }))} />
          <MultiSelect label="Batch" width="w-28" selected={filters.batch.map(String)} onChange={(v) => patch({ batch: v.map(Number) })}
            options={dimensions.batches.map((b) => ({ value: String(b), label: `Batch ${b}` }))} />
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            Score
            <input type="number" min={0} max={100} value={filters.scoreMin ?? ""} placeholder="0"
              onChange={(e) => patch({ scoreMin: e.target.value === "" ? null : Number(e.target.value) })}
              className="num w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs" />
            to
            <input type="number" min={0} max={100} value={filters.scoreMax ?? ""} placeholder="100"
              onChange={(e) => patch({ scoreMax: e.target.value === "" ? null : Number(e.target.value) })}
              className="num w-16 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-xs" />
          </label>
          <div className="ml-auto flex gap-1">
            {gradeOpts.map((g) => (
              <button key={g} onClick={() => patch({ grade: filters.grade.includes(g) ? filters.grade.filter((x) => x !== g) : [...filters.grade, g] })}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-opacity ${filters.grade.includes(g) ? "" : "opacity-45 hover:opacity-80"}`}
                style={{ background: GRADE_COLORS[g] + "20", color: GRADE_COLORS[g] }}>
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((c) => <Chip key={c.key} onRemove={c.onRemove}>{c.label}</Chip>)}
        </div>
      )}
    </div>
  );
}
