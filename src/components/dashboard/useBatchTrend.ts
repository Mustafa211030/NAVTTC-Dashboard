"use client";
import { useMemo } from "react";
import { useDash } from "../providers/FilterProvider";
import { applyFilters } from "@/lib/filters";
import { computeKpis, institutesFromRows, type Kpis } from "@/lib/aggregate";
import type { Program } from "@/types";
import type { KpiDelta, KpiTrend } from "./KPICard";

type Kind = "count" | "rate" | "score";

const when = (p: Program) => p.period?.to ?? p.assessmentDate ?? null;

/**
 * KPI trends across the batches of one programme family (PMYSDP B-I → B-III).
 *
 * The current filters (region, trade, institute …) are applied to every batch,
 * so a sparkline always describes the same slice of data as the card's value.
 * In a programme scope the point for that programme is highlighted and the
 * pill compares it with the batch before; at the portfolio level it compares
 * the latest batch with the previous one. Families without dated batches
 * (the cluster programmes) compare with the whole portfolio instead.
 */
export function useBatchTrend() {
  const { data, scope, filters, kpis } = useDash();

  const model = useMemo(() => {
    const f = { ...filters, program: [] };
    const kpisOf = (p: Program): Kpis | null => {
      const rows = applyFilters(data.rowsByProgram.get(p.slug) ?? [], f, data.facts);
      return rows.length ? computeKpis(rows, institutesFromRows(rows, data.instituteByKey, data.programBySlug)) : null;
    };

    const dated = data.programs.filter((p) => when(p));
    const families = [...new Set(dated.map((p) => p.family))];
    const family = scope.program
      ? scope.program.family
      : families.sort((a, b) => dated.filter((p) => p.family === b).length - dated.filter((p) => p.family === a).length)[0];
    const progs = data.programs.filter((p) => p.family === family && when(p))
      .sort((a, b) => (when(a) as string).localeCompare(when(b) as string));

    if (progs.length < 2 || (scope.program && !progs.some((p) => p.slug === scope.program!.slug))) {
      // No batch history — reference is the whole (filtered) portfolio.
      if (!scope.program) return null;
      const all = applyFilters(data.rows, f, data.facts);
      const ref = all.length ? computeKpis(all, institutesFromRows(all, data.instituteByKey, data.programBySlug)) : null;
      return { mode: "reference" as const, ref };
    }
    const points = progs.map((p) => ({ p, k: kpisOf(p) }));
    const idx = scope.program ? progs.findIndex((p) => p.slug === scope.program!.slug) : progs.length - 1;
    return { mode: "series" as const, points, idx };
  }, [data, scope.program, filters]);

  /** Sparkline + delta pill for one KPI. `get` returns the raw value (rates 0–1). */
  return useMemo(() => {
    const fmtDelta = (kind: Kind, cur: number | null, prev: number | null): number | null => {
      if (cur === null || prev === null) return null;
      if (kind === "count") return prev === 0 ? null : ((cur - prev) / prev) * 100;
      if (kind === "rate") return (cur - prev) * 100;
      return cur - prev;
    };
    const suffix = (kind: Kind) => (kind === "count" ? "%" : kind === "rate" ? "pp" : "");

    return function series(get: (k: Kpis) => number | null, kind: Kind, opts: { invert?: boolean } = {}): { trend: KpiTrend | null; delta: KpiDelta | null } {
      if (!model) return { trend: null, delta: null };
      if (model.mode === "reference") {
        const cur = get(kpis), ref = model.ref ? get(model.ref) : null;
        // Counts are not comparable with a whole-portfolio total.
        if (kind === "count") return { trend: null, delta: null };
        return { trend: null, delta: { value: fmtDelta(kind, cur, ref), vs: "all programmes", suffix: suffix(kind), invert: opts.invert } };
      }
      const vals = model.points.map((x) => (x.k ? get(x.k) : null));
      const display = vals.map((v) => (v === null ? null : kind === "rate" ? v * 100 : v));
      const i = model.idx;
      const prevIdx = (() => { for (let j = i - 1; j >= 0; j--) if (vals[j] !== null) return j; return -1; })();
      const first = model.points[0].p, last = model.points[model.points.length - 1].p;
      return {
        trend: { values: display, labels: model.points.map((x) => x.p.short), highlight: i, caption: `${first.code} → ${last.code}` },
        delta: prevIdx >= 0
          ? { value: fmtDelta(kind, vals[i], vals[prevIdx]), vs: `${model.points[prevIdx].p.short}${scope.program ? "" : ` (latest: ${model.points[i].p.short})`}`, suffix: suffix(kind), invert: opts.invert }
          : null,
      };
    };
  }, [model, kpis, scope.program]);
}
