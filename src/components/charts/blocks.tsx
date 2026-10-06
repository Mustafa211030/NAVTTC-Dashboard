"use client";
/**
 * Reusable, self-contained interactive chart blocks.
 *
 * Every block carries its own per-chart controls — group by, metric, Top-N,
 * sort and a chart-only programme filter — on top of the global filters, shows
 * values on the marks, and pushes clicks back into the global filter state.
 * Pages compose these instead of hand-writing ECharts options, so a chart
 * behaves identically wherever it appears and in whichever scope.
 */
import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useRouter } from "next/navigation";
import { ChartCard } from "./ChartCard";
import { Seg, MiniSelect, MultiSelect } from "../ui";
import { useDash } from "../providers/FilterProvider";
import type { AssessmentRow, Institute } from "@/types";
import { groupBy, statOf, crossTab, METRICS, metricByKey, fmtMetric, plotValue, boxStats, histogram, funnel, CATEGORY_KEYS, type MetricDef } from "@/lib/aggregate";
import { makeDims, availableDims, type Dim } from "@/lib/dims";
import { GRADE_COLORS, GRADE_ORDER, scoreColor, truncate, fmtInt, fmtPct, CHART_PALETTE, REGION_COLORS } from "@/config";
import { instituteHref, programBase } from "@/lib/portfolio";

/* ------------------------------------------------------------------ shared */

function useDims() {
  const { data } = useDash();
  return useMemo(() => makeDims(data), [data]);
}

/** Chart-only programme filter, offered in portfolio scope. */
function useLocalPrograms(rows: AssessmentRow[]) {
  const { data, scope } = useDash();
  const [local, setLocal] = useState<string[]>([]);
  const present = useMemo(() => new Set(rows.map((r) => r.p)), [rows]);
  const options = data.programs.filter((p) => present.has(p.slug)).map((p) => ({ value: p.slug, label: p.short, color: p.color }));
  const filtered = useMemo(() => (local.length ? rows.filter((r) => local.includes(r.p)) : rows), [rows, local]);
  const control = scope.mode === "portfolio" && options.length > 1
    ? <MultiSelect label="Chart: programmes" width="w-36" selected={local} onChange={setLocal} options={options} />
    : null;
  return { rows: filtered, control, local };
}

const TOP_OPTIONS = [
  { value: 10, label: "Top 10" }, { value: 15, label: "Top 15" }, { value: 20, label: "Top 20" }, { value: 25, label: "Top 25" },
  { value: 50, label: "Top 50" }, { value: 9999, label: "All" },
];

const axisFmt = (m: MetricDef) => (m.kind === "rate" ? "{value}%" : "{value}");

/* ================================================================== RankedBars */

export interface RankedBarsProps {
  title: string;
  subtitle?: string;
  rows: AssessmentRow[];
  dims?: string[];
  defaultDim?: string;
  metrics?: string[];
  defaultMetric?: string;
  defaultTop?: number;
  /** Groups with fewer assessments than this are hidden (unstable means). */
  minAssessments?: number;
  methodology?: React.ReactNode;
  className?: string;
  maxHeight?: number;
  accent?: string;
  vertical?: boolean;
}

export function RankedBars({
  title, subtitle, rows, dims: dimKeys = ["program", "region", "district", "trade"], defaultDim, metrics: metricKeys,
  defaultMetric = "score", defaultTop = 15, minAssessments = 1, methodology, className, maxHeight = 560, accent = "#2563eb", vertical,
}: RankedBarsProps) {
  const { scope, filters, toggle } = useDash();
  const allDims = useDims();
  const { rows: local, control: localControl } = useLocalPrograms(rows);
  const dims = useMemo(() => availableDims(allDims, rows, dimKeys), [allDims, rows, dimKeys]);
  const [dimKey, setDimKey] = useState(defaultDim && dims.some((d) => d.key === defaultDim) ? defaultDim : dims[0]?.key ?? "region");
  const dim: Dim = dims.find((d) => d.key === dimKey) ?? dims[0] ?? allDims.region;
  const metricList = (metricKeys ?? METRICS.map((m) => m.key)).map((k) => metricByKey.get(k)!).filter(Boolean);
  const [metricKey, setMetricKey] = useState(defaultMetric);
  const metric = metricByKey.get(metricKey) ?? metricList[0];
  const [top, setTop] = useState(defaultTop);
  const [sort, setSort] = useState<"desc" | "asc" | "name">(metric.better === "low" ? "asc" : "desc");
  const [minN, setMinN] = useState(minAssessments);

  const groups = useMemo(() => {
    const g = groupBy(local, dim.get).filter((s) => s.assessments >= minN).map((s) => ({ s, v: metric.get(s) }))
      .filter((x) => x.v !== null) as { s: ReturnType<typeof statOf>; v: number }[];
    if (sort === "name") g.sort((a, b) => (dim.order ? dim.order(a.s.key, b.s.key) : dim.name(a.s.key).localeCompare(dim.name(b.s.key))));
    else g.sort((a, b) => (sort === "desc" ? b.v - a.v : a.v - b.v));
    return g;
  }, [local, dim, metric, sort, minN]);

  const shown = groups.slice(0, top);
  const overall = metric.get(statOf("all", local));
  const filterable = Boolean(dim.filterKey) && !(dim.filterKey === "program" && scope.mode === "program");
  const selected = new Set(dim.filterKey ? (filters[dim.filterKey] as string[]) : []);
  const isCount = metric.kind === "count";

  const colorOf = (key: string, v: number) =>
    dim.color?.(key) ?? (metric.kind === "score" ? scoreColor(v) : metric.better === "low" ? (v > (overall ?? 0) ? "#dc2626" : "#10b981") : accent);

  const ordered = vertical ? shown : [...shown].reverse();
  const height = vertical ? 340 : Math.min(maxHeight, Math.max(220, shown.length * 22 + 50));

  const option: EChartsOption = {
    grid: vertical ? { left: 46, right: 16, top: 26, bottom: 70 } : { left: 8, right: 58, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (p: unknown) => {
        const a = (p as { dataIndex: number }[])[0];
        const { s, v } = ordered[a.dataIndex];
        return `<b>${dim.name(s.key)}</b><br/>${metric.label}: <b>${fmtMetric(metric.kind, v)}</b>` +
          (overall !== null ? ` <span style="opacity:.6">(overall ${fmtMetric(metric.kind, overall)})</span>` : "") +
          `<br/>${s.institutes} institutes · ${s.assessments} trade assessments` +
          `<br/>Enrolled ${fmtInt(s.enrolled)} · Mean score ${s.meanScore?.toFixed(1) ?? "—"} · Attendance ${fmtPct(s.attendanceRate)}`;
      },
    },
    [vertical ? "yAxis" : "xAxis"]: {
      type: "value", axisLabel: { formatter: axisFmt(metric) },
      max: metric.kind === "score" ? 100 : metric.kind === "rate" ? (v: { max: number }) => Math.min(100, Math.ceil(v.max / 10) * 10) : undefined,
    },
    [vertical ? "xAxis" : "yAxis"]: {
      type: "category", data: ordered.map((x) => truncate(dim.name(x.s.key), vertical ? 16 : 30)),
      axisLabel: vertical ? { fontSize: 10, rotate: ordered.length > 6 ? 35 : 0, interval: 0 } : { fontSize: 10.5 }, axisTick: { show: false },
    },
    series: [{
      type: "bar", barMaxWidth: vertical ? 42 : 16,
      label: {
        show: true, position: vertical ? "top" : "right", fontSize: 10, fontWeight: 600,
        formatter: (p: unknown) => fmtMetric(metric.kind, ordered[(p as { dataIndex: number }).dataIndex].v),
      },
      data: ordered.map(({ s, v }) => ({
        value: plotValue(metric.kind, v),
        itemStyle: {
          borderRadius: vertical ? [5, 5, 0, 0] : [0, 4, 4, 0], color: colorOf(s.key, v),
          opacity: selected.size && !selected.has(s.key) ? 0.35 : 1,
          borderColor: selected.has(s.key) ? "#111827" : undefined, borderWidth: selected.has(s.key) ? 1.5 : 0,
        },
      })),
      markLine: overall === null || isCount ? undefined : {
        symbol: "none", silent: true,
        lineStyle: { type: "dashed", color: "#64748b", width: 1.2 },
        label: { formatter: `Overall ${fmtMetric(metric.kind, overall)}`, fontSize: 9.5, color: "#64748b", position: vertical ? "insideEndTop" : "end" },
        data: [vertical ? { yAxis: plotValue(metric.kind, overall) as number } : { xAxis: plotValue(metric.kind, overall) as number }],
      },
    }],
  } as EChartsOption;

  return (
    <ChartCard
      title={title} className={className} accent={dim.key === "program" ? undefined : undefined}
      subtitle={subtitle ?? `${metric.label} by ${dim.label.toLowerCase()} · ${shown.length} of ${groups.length} shown`}
      height={height}
      methodology={methodology ?? <><strong>{metric.label}</strong><br />{metric.help}<br /><em>Dashed line: the same metric over every group shown.</em></>}
      empty={!shown.length}
      onEvent={filterable ? { type: "click", handler: (p) => toggle(dim.filterKey!, ordered[(p as { dataIndex: number }).dataIndex].s.key) } : undefined}
      table={{
        columns: [dim.label, metric.label, "Institutes", "Assessments", "Enrolled", "Mean score", "Attendance %"],
        rows: groups.map(({ s, v }) => [dim.name(s.key), fmtMetric(metric.kind, v), s.institutes, s.assessments, s.enrolled, s.meanScore?.toFixed(2) ?? null, fmtPct(s.attendanceRate)]),
      }}
      controls={<>
        {dims.length > 1 && <MiniSelect label="By" value={dim.key} onChange={setDimKey} options={dims.map((d) => ({ value: d.key, label: d.label }))} />}
        <MiniSelect label="Metric" value={metric.key} onChange={(k) => { setMetricKey(k); const m = metricByKey.get(k)!; setSort(m.better === "low" ? "asc" : "desc"); }}
          options={metricList.map((m) => ({ value: m.key, label: m.label }))} />
        <MiniSelect label="Show" value={top} onChange={setTop} options={TOP_OPTIONS} />
        <Seg value={sort} onChange={setSort} label="Sort" options={[{ value: "desc", label: "↓ High" }, { value: "asc", label: "↑ Low" }, { value: "name", label: "A–Z" }]} />
        {minAssessments >= 1 && dim.key !== "program" && (
          <MiniSelect label="Min n" value={minN} onChange={setMinN} options={[1, 3, 5, 10].map((n) => ({ value: n, label: `≥${n}` }))} />
        )}
        {dim.key !== "program" && localControl}
      </>}
      option={option}
    />
  );
}

/* ================================================================== GradeMix */

const INST_DIMS: Record<string, { label: string; get: (i: Institute) => string | null; filterKey?: "program" | "region" | "district" | "package" }> = {
  program: { label: "Programme", get: (i) => i.p, filterKey: "program" },
  region: { label: "Region", get: (i) => i.region, filterKey: "region" },
  district: { label: "District", get: (i) => i.district, filterKey: "district" },
  package: { label: "Package", get: (i) => i.package, filterKey: "package" },
};

export function GradeMix({ title = "Grade mix", institutes, dims: dimKeys = ["program", "region", "package"], defaultDim, className, height }: {
  title?: string; institutes: Institute[]; dims?: string[]; defaultDim?: string; className?: string; height?: number;
}) {
  const { data, scope, toggle, filters } = useDash();
  const dimsAvail = dimKeys.filter((k) => new Set(institutes.map((i) => INST_DIMS[k].get(i))).size > 1 || k === defaultDim);
  const [dimKey, setDimKey] = useState(defaultDim ?? dimsAvail[0] ?? "region");
  const dim = INST_DIMS[dimKey] ?? INST_DIMS.region;
  const [mode, setMode] = useState<"pct" | "count">("pct");
  const name = (k: string) => (dimKey === "program" ? data.programBySlug.get(k)?.short ?? k : k);

  const { keys, grades, matrix } = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const i of institutes) {
      const k = dim.get(i);
      if (!k) continue;
      if (!m.has(k)) m.set(k, new Map());
      m.get(k)!.set(i.grade, (m.get(k)!.get(i.grade) ?? 0) + 1);
    }
    let keys = [...m.keys()];
    if (dimKey === "program") keys.sort((a, b) => (data.programBySlug.get(a)?.order ?? 0) - (data.programBySlug.get(b)?.order ?? 0));
    else {
      const exc = (k: string) => { const t = [...m.get(k)!.values()].reduce((s, x) => s + x, 0); return (m.get(k)!.get("Excellent") ?? 0) / t; };
      keys.sort((a, b) => exc(b) - exc(a));
    }
    if (keys.length > 30) keys = keys.slice(0, 30);
    const present = new Set(institutes.map((i) => i.grade));
    const grades = GRADE_ORDER.filter((g) => present.has(g));
    return { keys, grades, matrix: m };
  }, [institutes, dim, dimKey, data]);

  const totals = keys.map((k) => [...(matrix.get(k)?.values() ?? [])].reduce((s, x) => s + x, 0));
  const rev = [...keys].reverse();
  const revTotals = [...totals].reverse();

  const option: EChartsOption = {
    grid: { left: 8, right: 30, top: 34, bottom: 6, containLabel: true },
    legend: { top: 0, left: "center", selectedMode: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (p: unknown) => {
        const arr = p as { seriesName: string; dataIndex: number; color: string }[];
        const k = rev[arr[0].dataIndex];
        const t = revTotals[arr[0].dataIndex];
        return `<b>${name(k)}</b> · ${t} institutes<br/>` + arr.map((a) => {
          const n = matrix.get(k)?.get(a.seriesName) ?? 0;
          return `<span style="color:${a.color}">●</span> ${a.seriesName}: <b>${n}</b> (${t ? ((n / t) * 100).toFixed(1) : 0}%)`;
        }).join("<br/>");
      },
    },
    xAxis: { type: "value", max: mode === "pct" ? 100 : undefined, axisLabel: { formatter: mode === "pct" ? "{value}%" : "{value}" } },
    yAxis: { type: "category", data: rev.map((k) => truncate(name(k), 26)), axisLabel: { fontSize: 10.5 } },
    series: grades.map((g) => ({
      name: g, type: "bar", stack: "g", barMaxWidth: 22,
      itemStyle: { color: GRADE_COLORS[g], opacity: filters.grade.length && !filters.grade.includes(g) ? 0.35 : 1 },
      label: {
        show: true, fontSize: 9.5, color: "#fff", fontWeight: 600,
        formatter: (p: unknown) => {
          const q = p as { value: number; dataIndex: number };
          const n = matrix.get(rev[q.dataIndex])?.get(g) ?? 0;
          if (!n) return "";
          const share = n / revTotals[q.dataIndex];
          return share < 0.06 ? "" : mode === "pct" ? `${Math.round(share * 100)}%` : String(n);
        },
      },
      data: rev.map((k, idx) => {
        const n = matrix.get(k)?.get(g) ?? 0;
        return mode === "pct" ? Number(((n / (revTotals[idx] || 1)) * 100).toFixed(2)) : n;
      }),
    })),
  } as EChartsOption;

  return (
    <ChartCard
      title={title} className={className}
      subtitle={`Institutes per grade by ${dim.label.toLowerCase()} · click a segment to filter by grade`}
      height={height ?? Math.max(240, keys.length * 30 + 70)}
      empty={!keys.length}
      methodology={<><strong>Grade mix</strong><br />Each institute is graded on its own programme&apos;s score bands (80 / 70 / 60 / 50). Workbook overrides (Closed, or Poor for fake / non-functional institutes) replace the band.</>}
      onEvent={{ type: "click", handler: (p) => toggle("grade", (p as { seriesName: string }).seriesName) }}
      clickHint="click to filter grade"
      table={{ columns: [dim.label, ...grades, "Total"], rows: keys.map((k, i) => [name(k), ...grades.map((g) => matrix.get(k)?.get(g) ?? 0), totals[i]]) }}
      controls={<>
        {dimsAvail.length > 1 && <MiniSelect label="By" value={dimKey} onChange={setDimKey} options={dimsAvail.map((k) => ({ value: k, label: INST_DIMS[k].label }))} />}
        <Seg value={mode} onChange={setMode} label="Scale" options={[{ value: "pct", label: "100%" }, { value: "count", label: "Count" }]} />
        {dim.filterKey && !(dim.filterKey === "program" && scope.mode === "program") && <span className="text-[10px] text-[var(--text-muted)]">{filters[dim.filterKey].length ? `${filters[dim.filterKey].length} ${dim.label.toLowerCase()} filtered` : ""}</span>}
      </>}
      option={option}
    />
  );
}

/* ================================================================== Heatmap */

export function HeatmapCard({
  title, rows, rowDims = ["region", "district", "trade"], colDims = ["program", "region"], defaultRow, defaultCol,
  metrics: metricKeys = ["score", "attendance", "verification", "dropout", "enrolled", "institutes"], defaultMetric = "score", className, maxRows = 30,
}: {
  title: string; rows: AssessmentRow[]; rowDims?: string[]; colDims?: string[]; defaultRow?: string; defaultCol?: string;
  metrics?: string[]; defaultMetric?: string; className?: string; maxRows?: number;
}) {
  const { toggle, scope } = useDash();
  const allDims = useDims();
  const rd = useMemo(() => availableDims(allDims, rows, rowDims), [allDims, rows, rowDims]);
  const cd = useMemo(() => availableDims(allDims, rows, colDims), [allDims, rows, colDims]);
  const [rk, setRk] = useState<string | undefined>(defaultRow && rd.some((d) => d.key === defaultRow) ? defaultRow : rd[0]?.key);
  const [ck, setCk] = useState<string | undefined>(defaultCol && cd.some((d) => d.key === defaultCol) ? defaultCol : cd.find((d) => d.key !== rk)?.key ?? cd[0]?.key);
  const R = rd.find((d) => d.key === rk) ?? rd[0];
  const C = cd.find((d) => d.key === ck && d.key !== R?.key) ?? cd.find((d) => d.key !== R?.key);
  const [mk, setMk] = useState(defaultMetric);
  const metric = metricByKey.get(mk)!;

  const cells = useMemo(() => (R && C ? crossTab(rows, R.get, C.get) : []), [rows, R, C]);
  const rowKeys = useMemo(() => {
    if (!R) return [];
    const tot = new Map<string, number>();
    for (const c of cells) tot.set(c.a, (tot.get(c.a) ?? 0) + c.stat.assessments);
    const ks = [...tot.keys()];
    if (R.order) ks.sort(R.order); else ks.sort((a, b) => (tot.get(b) ?? 0) - (tot.get(a) ?? 0));
    return ks.slice(0, maxRows);
  }, [cells, R, maxRows]);
  const colKeys = useMemo(() => {
    if (!C) return [];
    const ks = [...new Set(cells.map((c) => c.b))];
    return C.order ? ks.sort(C.order) : ks.sort((a, b) => C.name(a).localeCompare(C.name(b)));
  }, [cells, C]);

  if (!R || !C) return null;
  const vals: [number, number, number | null, number][] = [];
  for (const c of cells) {
    const y = rowKeys.indexOf(c.a); const x = colKeys.indexOf(c.b);
    if (y < 0 || x < 0) continue;
    vals.push([x, y, plotValue(metric.kind, metric.get(c.stat)), c.stat.assessments]);
  }
  const nums = vals.map((v) => v[2]).filter((v): v is number => v !== null);
  const min = metric.kind === "score" ? Math.min(40, ...nums) : Math.min(...nums, 0);
  const max = metric.kind === "score" ? 100 : Math.max(...nums, 1);
  const lowGood = metric.better === "low";

  const option: EChartsOption = {
    grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
    tooltip: {
      formatter: (p: unknown) => {
        const v = (p as { data: [number, number, number | null, number] }).data;
        return `<b>${R.name(rowKeys[v[1]])}</b> × <b>${C.name(colKeys[v[0]])}</b><br/>${metric.label}: <b>${v[2] === null ? "—" : metric.kind === "rate" ? v[2].toFixed(1) + "%" : v[2]}</b><br/>${v[3]} trade assessments`;
      },
    },
    xAxis: { type: "category", data: colKeys.map((k) => truncate(C.name(k), 14)), splitArea: { show: false }, axisLabel: { fontSize: 10, interval: 0, rotate: colKeys.length > 5 ? 30 : 0 } },
    yAxis: { type: "category", data: rowKeys.map((k) => truncate(R.name(k), 24)), splitArea: { show: false }, axisLabel: { fontSize: 10 }, inverse: true },
    visualMap: {
      dimension: 2, min, max, calculable: true, orient: "horizontal", left: "center", bottom: 0, itemHeight: 140, itemWidth: 10, textStyle: { fontSize: 10 },
      inRange: { color: lowGood ? ["#10b981", "#fde68a", "#ef4444"] : metric.kind === "count" ? ["#eff6ff", "#93c5fd", "#1d4ed8"] : ["#ef4444", "#fde68a", "#10b981"] },
    },
    series: [{
      type: "heatmap", data: vals,
      label: { show: true, fontSize: 9.5, formatter: (p: unknown) => { const v = (p as { data: [number, number, number | null] }).data[2]; return v === null ? "" : metric.kind === "rate" ? `${v.toFixed(0)}%` : metric.kind === "score" ? v.toFixed(0) : String(Math.round(v)); } },
      itemStyle: { borderColor: "rgba(255,255,255,.75)", borderWidth: 2, borderRadius: 3 },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,.3)" } },
    }],
  } as EChartsOption;

  const rowFilter = R.filterKey && !(R.filterKey === "program" && scope.mode === "program") ? R.filterKey : null;
  return (
    <ChartCard
      title={title} className={className}
      subtitle={`${metric.label} · ${R.label} × ${C.label}`}
      height={Math.max(260, rowKeys.length * 24 + 110)}
      empty={!vals.length}
      methodology={<><strong>Cross-tab heatmap</strong><br />{metric.help} Each cell pools the trade assessments at that intersection. Empty cells: no assessments.</>}
      onEvent={rowFilter ? { type: "click", handler: (p) => toggle(rowFilter, rowKeys[(p as { data: number[] }).data[1]]) } : undefined}
      clickHint={rowFilter ? `click to filter ${R.label.toLowerCase()}` : undefined}
      table={{ columns: [R.label, ...colKeys.map(C.name)], rows: rowKeys.map((rk2) => [R.name(rk2), ...colKeys.map((ck2) => { const c = cells.find((x) => x.a === rk2 && x.b === ck2); return c ? fmtMetric(metric.kind, metric.get(c.stat)) : null; })]) }}
      controls={<>
        <MiniSelect label="Rows" value={R.key} onChange={(v) => { setRk(v); if (v === C.key) setCk(cd.find((d) => d.key !== v)?.key); }} options={rd.map((d) => ({ value: d.key, label: d.label }))} />
        <MiniSelect label="Columns" value={C.key} onChange={setCk} options={cd.filter((d) => d.key !== R.key).map((d) => ({ value: d.key, label: d.label }))} />
        <MiniSelect label="Metric" value={metric.key} onChange={setMk} options={metricKeys.map((k) => ({ value: k, label: metricByKey.get(k)!.label }))} />
      </>}
      option={option}
    />
  );
}

/* ================================================================== Category profile */

export function CategoryProfile({ title = "Rubric category achievement", rows, className, defaultView = "radar", seriesDims = ["program", "region", "package"] }: {
  title?: string; rows: AssessmentRow[]; className?: string; defaultView?: "radar" | "bars"; seriesDims?: string[];
}) {
  const { data } = useDash();
  const allDims = useDims();
  const sd = useMemo(() => availableDims(allDims, rows, seriesDims), [allDims, rows, seriesDims]);
  const [sk, setSk] = useState<string>(sd[0]?.key ?? "overall");
  const S = sd.find((d) => d.key === sk);
  const [view, setView] = useState<"radar" | "bars">(defaultView);
  const cats = data.raw.categories;

  const series = useMemo(() => {
    const groups = S ? groupBy(rows, S.get).map((g) => g.key) : ["Overall"];
    const ordered = S?.order ? groups.sort(S.order) : groups;
    return ordered.slice(0, 8).map((k, idx) => {
      const subset = S ? rows.filter((r) => S.get(r) === k && r.scored) : rows.filter((r) => r.scored);
      const vals = CATEGORY_KEYS.map((c) => {
        const xs = subset.map((r) => r.categoryPct[c]).filter((v): v is number => v !== null && v !== undefined);
        return xs.length ? Number(((xs.reduce((s, x) => s + x, 0) / xs.length) * 100).toFixed(1)) : null;
      });
      return { key: k, name: S ? S.name(k) : "Overall", color: S?.color?.(k) ?? CHART_PALETTE[idx % CHART_PALETTE.length], vals };
    });
  }, [rows, S]);

  const option: EChartsOption = view === "radar" ? {
    legend: { bottom: 0, type: "scroll" },
    tooltip: { trigger: "item" },
    radar: {
      indicator: cats.map((c) => ({ name: c.short, max: 100 })), radius: "62%", center: ["50%", "47%"], splitNumber: 4,
      axisName: { fontSize: 10.5, color: "#64798f" }, splitArea: { areaStyle: { color: ["transparent"] } },
    },
    series: [{
      type: "radar", symbolSize: 5,
      data: series.map((s) => ({
        name: s.name, value: s.vals.map((v) => v ?? 0),
        lineStyle: { color: s.color, width: 2 }, itemStyle: { color: s.color }, areaStyle: { color: s.color, opacity: series.length > 3 ? 0.04 : 0.12 },
        label: series.length === 1 ? { show: true, formatter: "{c}%", fontSize: 9.5 } : undefined,
      })),
    }],
  } as EChartsOption : {
    legend: { top: 0, type: "scroll" },
    grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => (v === null || v === undefined ? "n/a in rubric" : `${v}%`) },
    xAxis: { type: "category", data: cats.map((c) => c.short), axisLabel: { fontSize: 10.5, interval: 0 } },
    yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
    series: series.map((s) => ({
      name: s.name, type: "bar", barMaxWidth: 18, itemStyle: { color: s.color, borderRadius: [3, 3, 0, 0] },
      label: { show: series.length <= 4, position: "top", fontSize: 9, formatter: (p: unknown) => `${Math.round((p as { value: number }).value)}` },
      data: s.vals,
    })),
  } as EChartsOption;

  return (
    <ChartCard
      title={title} className={className}
      subtitle={`Share of each category's maximum${S ? ` · by ${S.label.toLowerCase()}` : ""}`}
      height={340}
      empty={!series.length}
      methodology={<><strong>Shared rubric categories</strong><br />Each programme&apos;s criteria are mapped into six common categories. Achievement is points earned ÷ the category&apos;s maximum under that programme&apos;s own rubric, so programmes with different weights are comparable. A category a rubric does not score (e.g. Trainer in PMYSDP B-I) is left blank, not zero.</>}
      table={{ columns: [S?.label ?? "Series", ...cats.map((c) => c.label)], rows: series.map((s) => [s.name, ...s.vals.map((v) => (v === null ? "n/a" : `${v}%`))]) }}
      controls={<>
        {sd.length > 0 && <MiniSelect label="Series" value={sk} onChange={setSk} options={[...sd.map((d) => ({ value: d.key, label: d.label })), { value: "overall", label: "Overall only" }]} />}
        <Seg value={view} onChange={setView} label="View" options={[{ value: "radar", label: "Radar" }, { value: "bars", label: "Bars" }]} />
      </>}
      option={option}
    />
  );
}

/* ================================================================== Funnel */

export function FunnelCard({ rows, className, title = "Enrolment funnel" }: { rows: AssessmentRow[]; className?: string; title?: string }) {
  const allDims = useDims();
  const sd = useMemo(() => availableDims(allDims, rows, ["program", "region"]), [allDims, rows]);
  const [by, setBy] = useState<string>("total");
  const S = sd.find((d) => d.key === by);
  const stages = funnel(rows);

  let option: EChartsOption;
  let table: { columns: string[]; rows: (string | number | null)[][] };
  if (!S) {
    option = {
      grid: { left: 110, right: 110, top: 8, bottom: 8 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p: unknown) => { const f = stages[(p as { dataIndex: number }[])[0].dataIndex]; return `<b>${f.stage}</b><br/>${fmtInt(f.value)} (${f.pctOfCapacity?.toFixed(1)}% of capacity)<br/>${f.note}`; } },
      xAxis: { type: "value", max: stages[0]?.value || 1, show: false },
      yAxis: { type: "category", data: stages.map((f) => f.stage), axisLabel: { fontSize: 11 }, axisTick: { show: false }, inverse: true },
      series: [{
        type: "bar", barMaxWidth: 30,
        label: { show: true, position: "right", fontSize: 10.5, fontWeight: 600, formatter: (p: unknown) => { const q = p as { dataIndex: number; value: number }; return `${q.value.toLocaleString()} · ${stages[q.dataIndex].pctOfCapacity?.toFixed(1)}%`; } },
        data: stages.map((f, i) => ({ value: f.value, itemStyle: { borderRadius: [0, 6, 6, 0], color: ["#94a3b8", "#2563eb", "#0891b2", "#059669"][i] } })),
      }],
    } as EChartsOption;
    table = { columns: ["Stage", "Trainees", "% of capacity", "Note"], rows: stages.map((f) => [f.stage, f.value, f.pctOfCapacity?.toFixed(1) + "%", f.note]) };
  } else {
    const keys = groupBy(rows, S.get).map((g) => g.key);
    if (S.order) keys.sort(S.order);
    const per = keys.map((k) => ({ k, st: funnel(rows.filter((r) => S.get(r) === k)) }));
    option = {
      legend: { top: 0, type: "scroll" },
      grid: { left: 8, right: 16, top: 34, bottom: 8, containLabel: true },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => `${v}% of capacity` },
      xAxis: { type: "category", data: stages.map((s) => s.stage), axisLabel: { fontSize: 10.5 } },
      yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
      series: per.map(({ k, st }, i) => ({
        name: S.name(k), type: "bar", barMaxWidth: 20,
        itemStyle: { color: S.color?.(k) ?? CHART_PALETTE[i % 10], borderRadius: [3, 3, 0, 0] },
        label: { show: per.length <= 4, position: "top", fontSize: 9, formatter: (p: unknown) => `${Math.round((p as { value: number }).value)}%` },
        data: st.map((s) => (s.pctOfCapacity === null ? null : Number(s.pctOfCapacity.toFixed(1)))),
      })),
    } as EChartsOption;
    table = { columns: [S.label, ...stages.map((s) => s.stage)], rows: per.map(({ k, st }) => [S.name(k), ...st.map((s) => `${fmtInt(s.value)} (${s.pctOfCapacity?.toFixed(1)}%)`)]) };
  }

  return (
    <ChartCard
      title={title} className={className}
      subtitle={S ? `Each stage as % of approved capacity, by ${S.label.toLowerCase()}` : "Sanctioned seats through to CNIC-verified attendance"}
      height={S ? 300 : 220}
      empty={!rows.length}
      methodology={<><strong>Enrolment funnel</strong><br />Straight sums over the filtered rows: Approved Capacity, Enrolled (B-III: registered on biometric device), Present on the visit day, CNIC Verified. Percentages are of approved capacity.</>}
      table={table}
      controls={sd.length ? <Seg value={by} onChange={setBy} label="Split" options={[{ value: "total", label: "Total" }, ...sd.map((d) => ({ value: d.key, label: `By ${d.label.toLowerCase()}` }))]} /> : undefined}
      option={option}
    />
  );
}

/* ================================================================== Box plot */

export function SpreadCard({ rows, institutes, className, title = "Score spread", dims: dimKeys = ["program", "region", "package", "tradeCategory"] }: {
  rows: AssessmentRow[]; institutes: Institute[]; className?: string; title?: string; dims?: string[];
}) {
  const { data } = useDash();
  const allDims = useDims();
  const dims = useMemo(() => availableDims(allDims, rows, dimKeys), [allDims, rows, dimKeys]);
  const [dk, setDk] = useState(dims[0]?.key ?? "region");
  const D = dims.find((d) => d.key === dk) ?? dims[0];
  const [level, setLevel] = useState<"inst" | "trade">("inst");

  const boxes = useMemo(() => {
    if (!D) return [];
    if (level === "trade") return boxStats(rows, D.get, (r) => (r.scored ? r.tradeScore : null));
    const instDimGet = (i: Institute) => {
      if (D.key === "program") return i.p;
      if (D.key === "region") return i.region;
      if (D.key === "package") return i.package;
      if (D.key === "district") return i.district;
      const r = data.rowsByProgram.get(i.p)?.find((x) => x.instituteKey === i.instituteKey);
      return r ? D.get(r) : null;
    };
    return boxStats(institutes, instDimGet, (i) => i.score);
  }, [rows, institutes, D, level, data]);
  if (D?.order) boxes.sort((a, b) => D.order!(a.key, b.key));

  const option: EChartsOption = {
    grid: { left: 46, right: 16, top: 20, bottom: 40 },
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const b = boxes[(p as { dataIndex: number }).dataIndex];
        if (!b) return "";
        return `<b>${D?.name(b.key)}</b> · n = ${b.n}<br/>Max ${b.max.toFixed(1)}<br/>Q3 ${b.q3.toFixed(1)}<br/><b>Median ${b.median.toFixed(1)}</b><br/>Mean ${b.mean.toFixed(1)}<br/>Q1 ${b.q1.toFixed(1)}<br/>Min ${b.min.toFixed(1)}`;
      },
    },
    xAxis: { type: "category", data: boxes.map((b) => truncate(D?.name(b.key) ?? b.key, 14)), axisLabel: { fontSize: 10, interval: 0, rotate: boxes.length > 6 ? 30 : 0 } },
    yAxis: { type: "value", name: level === "inst" ? "Institute score" : "Trade score", min: 0, max: 100, nameTextStyle: { fontSize: 10 } },
    series: [
      {
        type: "boxplot", boxWidth: [12, 46],
        data: boxes.map((b) => ({
          value: [b.min, b.q1, b.median, b.q3, b.max],
          itemStyle: { color: (D?.color?.(b.key) ?? "#2563eb") + "33", borderColor: D?.color?.(b.key) ?? "#2563eb", borderWidth: 1.8 },
        })),
      },
      {
        type: "scatter", symbol: "diamond", symbolSize: 9, z: 5,
        itemStyle: { color: "#0f172a" },
        label: { show: true, position: "right", fontSize: 9.5, formatter: (p: unknown) => (p as { value: [number, number] }).value[1].toFixed(1) },
        data: boxes.map((b, i) => [i, Number(b.median.toFixed(1))]),
        tooltip: { show: false },
      },
    ],
  } as EChartsOption;

  return (
    <ChartCard
      title={title} className={className}
      subtitle={`Median (◆), quartiles and range by ${D?.label.toLowerCase() ?? ""}`}
      height={330}
      empty={!boxes.length}
      methodology={<><strong>Distribution, not just the average</strong><br />Box = interquartile range, line = median, whiskers = minimum and maximum. A group can post a healthy mean and still contain failing institutes; the whisker length is where that shows.</>}
      table={{ columns: [D?.label ?? "Group", "n", "Min", "Q1", "Median", "Mean", "Q3", "Max"], rows: boxes.map((b) => [D?.name(b.key) ?? b.key, b.n, b.min.toFixed(1), b.q1.toFixed(1), b.median.toFixed(1), b.mean.toFixed(1), b.q3.toFixed(1), b.max.toFixed(1)]) }}
      controls={<>
        {dims.length > 1 && <MiniSelect label="By" value={D?.key ?? ""} onChange={setDk} options={dims.map((d) => ({ value: d.key, label: d.label }))} />}
        <Seg value={level} onChange={setLevel} label="Level" options={[{ value: "inst", label: "Institutes" }, { value: "trade", label: "Trade rows" }]} />
      </>}
      option={option}
    />
  );
}

/* ================================================================== Histogram */

export function DistributionCard({ rows, institutes, className, title = "Score distribution" }: {
  rows: AssessmentRow[]; institutes: Institute[]; className?: string; title?: string;
}) {
  const { data, scope, patch } = useDash();
  const [unit, setUnit] = useState<"inst" | "trade" | "attendance">("inst");
  const [bin, setBin] = useState(10);
  const stackBy: "program" | "region" = scope.mode === "portfolio" ? "program" : "region";
  const keys = stackBy === "program"
    ? data.programs.filter((p) => rows.some((r) => r.p === p.slug)).map((p) => p.slug)
    : [...new Set(rows.map((r) => r.region))].sort();
  const name = (k: string) => (stackBy === "program" ? data.programBySlug.get(k)?.short ?? k : k);
  const color = (k: string, i: number) => (stackBy === "program" ? data.programBySlug.get(k)?.color : REGION_COLORS[k]) ?? CHART_PALETTE[i % 10];

  const values = (k: string): number[] => {
    if (unit === "inst") return institutes.filter((i) => (stackBy === "program" ? i.p : i.region) === k && i.score !== null).map((i) => i.score as number);
    if (unit === "trade") return rows.filter((r) => (stackBy === "program" ? r.p : r.region) === k && r.scored).map((r) => r.tradeScore as number);
    return rows.filter((r) => (stackBy === "program" ? r.p : r.region) === k && r.attendanceRate !== null).map((r) => Math.min((r.attendanceRate as number) * 100, 99.999));
  };
  const series = keys.map((k, i) => ({ k, h: histogram(values(k), bin), color: color(k, i) }));
  const labels = series[0]?.h.map((b) => (unit === "attendance" ? `${b.from}–${b.from + bin}%` : b.label)) ?? [];
  const totals = labels.map((_, idx) => series.reduce((s, x) => s + x.h[idx].count, 0));

  const option: EChartsOption = {
    legend: { top: 0, type: "scroll" },
    grid: { left: 40, right: 12, top: 50, bottom: 34 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: labels, axisLabel: { fontSize: 10, rotate: bin < 10 ? 40 : 20 } },
    yAxis: { type: "value", name: unit === "inst" ? "Institutes" : "Assessments", nameTextStyle: { fontSize: 10 } },
    series: series.map((s, si) => ({
      name: name(s.k), type: "bar", stack: "h", barMaxWidth: 44,
      itemStyle: { color: s.color, borderRadius: si === series.length - 1 ? [4, 4, 0, 0] : 0 },
      label: si === series.length - 1 ? { show: true, position: "top", fontSize: 9.5, fontWeight: 600, formatter: (p: unknown) => String(totals[(p as { dataIndex: number }).dataIndex] || "") } : undefined,
      data: s.h.map((b) => b.count),
    })),
  } as EChartsOption;

  return (
    <ChartCard
      title={title} className={className}
      subtitle={`${unit === "attendance" ? "Attendance %" : unit === "inst" ? "Institute scores" : "Trade scores"} in ${bin}-point bands, stacked by ${stackBy} · click a band to filter`}
      height={290}
      empty={!rows.length}
      methodology={<><strong>Distribution</strong><br />Counts per band, stacked so each {stackBy}&apos;s contribution is visible. Attendance uses each programme&apos;s own attendance rule.</>}
      onEvent={unit !== "attendance" ? { type: "click", handler: (p) => { const i = (p as { dataIndex: number }).dataIndex; patch({ scoreMin: i * bin, scoreMax: i * bin + bin - 0.001 }); } } : undefined}
      clickHint="click to filter score band"
      table={{ columns: ["Band", ...series.map((s) => name(s.k)), "Total"], rows: labels.map((l, i) => [l, ...series.map((s) => s.h[i].count), totals[i]]) }}
      controls={<>
        <Seg value={unit} onChange={setUnit} label="Measure" options={[{ value: "inst", label: "Institute score" }, { value: "trade", label: "Trade score" }, { value: "attendance", label: "Attendance" }]} />
        <Seg value={bin} onChange={setBin} label="Band" options={[{ value: 10, label: "10 pt" }, { value: 5, label: "5 pt" }]} />
      </>}
      option={option}
    />
  );
}

/* ================================================================== Scatter */

export function ScatterCard({ institutes, className, title = "Attendance against score" }: { institutes: Institute[]; className?: string; title?: string }) {
  const { data, scope } = useDash();
  const router = useRouter();
  const [x, setX] = useState<"attendanceRate" | "verificationRate" | "presenceRate" | "utilizationRate">("attendanceRate");
  const colorBy: "program" | "region" = scope.mode === "portfolio" ? "program" : "region";
  const groups = colorBy === "program"
    ? data.programs.filter((p) => institutes.some((i) => i.p === p.slug)).map((p) => ({ k: p.slug, name: p.short, color: p.color }))
    : [...new Set(institutes.map((i) => i.region))].sort().map((r, idx) => ({ k: r, name: r, color: REGION_COLORS[r] ?? CHART_PALETTE[idx] }));
  const label = { attendanceRate: "Attendance % (programme rule)", verificationRate: "CNIC verified % of seats", presenceRate: "Presence %", utilizationRate: "Seat utilisation %" }[x];
  const pts = institutes.filter((i) => i.score !== null && i[x] !== null);

  const option: EChartsOption = {
    legend: { top: 0, type: "scroll" },
    grid: { left: 48, right: 20, top: 34, bottom: 44 },
    tooltip: {
      formatter: (p: unknown) => {
        const d = (p as { data: { inst: Institute } }).data.inst;
        return `<b>${d.instituteName}</b><br/>${data.programBySlug.get(d.p)?.short} · ${d.district}<br/>${label}: <b>${fmtPct(d[x])}</b><br/>Score: <b>${d.score?.toFixed(1)}</b> · ${d.grade}<br/>${fmtInt(d.enrolled)} enrolled<br/><i>click to open profile</i>`;
      },
    },
    xAxis: { type: "value", name: label, max: 100, nameLocation: "middle", nameGap: 28, nameTextStyle: { fontSize: 10 }, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "value", name: "Institute score", min: 0, max: 100, nameTextStyle: { fontSize: 10 } },
    series: groups.map((g) => ({
      name: g.name, type: "scatter",
      itemStyle: { color: g.color, opacity: 0.62, borderColor: "#fff", borderWidth: 0.6 },
      emphasis: { focus: "series", itemStyle: { opacity: 1 } },
      symbolSize: (v: unknown) => Math.max(6, Math.min(Math.sqrt((v as number[])[2]) * 1.5, 26)),
      data: pts.filter((i) => (colorBy === "program" ? i.p : i.region) === g.k).map((i) => ({
        value: [Number(((i[x] as number) * 100).toFixed(1)), Number((i.score as number).toFixed(2)), i.enrolled], inst: i,
      })),
      markLine: g === groups[0] ? {
        silent: true, symbol: "none", lineStyle: { type: "dashed", color: "#94a3b8" }, label: { fontSize: 9, color: "#94a3b8", position: "insideEndTop" },
        data: [{ yAxis: 80, label: { formatter: "Excellent 80" } }, { yAxis: 50, label: { formatter: "Poor < 50" } }],
      } : undefined,
    })),
  } as EChartsOption;

  return (
    <ChartCard
      title={title} className={className}
      subtitle={`One bubble per institute · size = enrolment · colour = ${colorBy} · click a bubble to open it`}
      height={380}
      empty={!pts.length}
      methodology={<><strong>Attendance vs score</strong><br />Attendance carries 35–50 of the 100 points depending on the rubric, so a strong relationship is expected. Institutes far from the cloud are the ones to investigate.</>}
      onEvent={{ type: "click", handler: (p) => { const i = (p as { data: { inst: Institute } }).data.inst; router.push(instituteHref(programBase(i.p), i)); } }}
      clickHint="click to open institute"
      table={{ columns: ["Institute", "Programme", label, "Score", "Enrolled"], rows: pts.slice(0, 500).map((i) => [i.instituteName, data.programBySlug.get(i.p)?.short ?? i.p, fmtPct(i[x]), i.score?.toFixed(2) ?? null, i.enrolled]) }}
      controls={<MiniSelect label="X axis" value={x} onChange={setX} options={[
        { value: "attendanceRate", label: "Attendance %" }, { value: "verificationRate", label: "CNIC verified %" },
        { value: "presenceRate", label: "Presence %" }, { value: "utilizationRate", label: "Utilisation %" },
      ]} />}
      option={option}
    />
  );
}
