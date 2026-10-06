"use client";
import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { ChartCard } from "./ChartCard";
import { Seg, MiniSelect } from "../ui";
import { useDash } from "../providers/FilterProvider";
import type { AssessmentRow, Program } from "@/types";
import { REGION_COLORS, CHART_PALETTE, truncate } from "@/config";

/** Achievement on each criterion of ONE programme's rubric, optionally split by region. */
export function ComponentBars({ rows, program, className, title }: { rows: AssessmentRow[]; program: Program; className?: string; title?: string }) {
  const [sort, setSort] = useState<"pct" | "rubric">("pct");
  const [split, setSplit] = useState<"none" | "region">("none");
  const [measure, setMeasure] = useState<"pct" | "full" | "zero">("pct");
  const scored = useMemo(() => rows.filter((r) => r.scored && r.p === program.slug), [rows, program.slug]);

  const stats = useMemo(() => {
    const out = program.rubric.components.map((c, idx) => {
      const vals = scored.map((r) => r.components[c.key] ?? 0);
      const mean = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
      return {
        ...c, idx, mean, pct: c.max ? (mean / c.max) * 100 : 0,
        full: vals.filter((v) => v >= c.max - 1e-9).length / (vals.length || 1) * 100,
        zero: vals.filter((v) => v === 0).length / (vals.length || 1) * 100,
      };
    });
    return sort === "pct" ? [...out].sort((a, b) => a.pct - b.pct) : out;
  }, [scored, program, sort]);

  const regions = useMemo(() => [...new Set(scored.map((r) => r.region))].sort(), [scored]);
  const val = (s: (typeof stats)[number]) => (measure === "pct" ? s.pct : measure === "full" ? s.full : s.zero);
  const color = (v: number) => measure === "zero" ? (v > 50 ? "#dc2626" : v > 20 ? "#d97706" : "#10b981") : v >= 80 ? "#10b981" : v >= 55 ? "#2563eb" : v >= 30 ? "#d97706" : "#dc2626";

  const option: EChartsOption = split === "none" ? {
    grid: { left: 8, right: 52, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (p: unknown) => {
        const s = stats[(p as { dataIndex: number }[])[0].dataIndex];
        return `<b>${s.label}</b> (max ${s.max})<br/>Mean ${s.mean.toFixed(2)} → <b>${s.pct.toFixed(1)}%</b><br/>${s.full.toFixed(0)}% of trades at full marks · ${s.zero.toFixed(0)}% at zero`;
      },
    },
    xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", inverse: true, data: stats.map((s) => `${truncate(s.label, 26)} (${s.max})`), axisLabel: { fontSize: 10 } },
    series: [{
      type: "bar", barMaxWidth: 14,
      label: { show: true, position: "right", fontSize: 9.5, fontWeight: 600, formatter: (p: unknown) => `${Number((p as { value: number }).value).toFixed(0)}%` },
      data: stats.map((s) => ({ value: Number(val(s).toFixed(1)), itemStyle: { borderRadius: [0, 4, 4, 0], color: color(val(s)) } })),
    }],
  } as EChartsOption : {
    legend: { top: 0 },
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => `${v}%` },
    xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", inverse: true, data: stats.map((s) => truncate(s.label, 24)), axisLabel: { fontSize: 10 } },
    series: regions.map((rg, i) => ({
      name: rg, type: "bar", barMaxWidth: 7, itemStyle: { color: REGION_COLORS[rg] ?? CHART_PALETTE[i], borderRadius: [0, 3, 3, 0] },
      data: stats.map((s) => {
        const vs = scored.filter((r) => r.region === rg).map((r) => r.components[s.key] ?? 0);
        if (!vs.length) return null;
        const m = vs.reduce((a, b) => a + b, 0) / vs.length;
        if (measure === "pct") return Number(((m / s.max) * 100).toFixed(1));
        if (measure === "full") return Number(((vs.filter((v) => v >= s.max - 1e-9).length / vs.length) * 100).toFixed(1));
        return Number(((vs.filter((v) => v === 0).length / vs.length) * 100).toFixed(1));
      }),
    })),
  } as EChartsOption;

  return (
    <ChartCard
      title={title ?? `Rubric criteria · ${program.rubric.components.length} components`} className={className}
      subtitle={measure === "pct" ? "Mean achievement as % of each criterion's maximum" : measure === "full" ? "% of trade assessments earning full marks" : "% of trade assessments scoring zero"}
      height={Math.max(300, stats.length * (split === "none" ? 24 : 34) + 40)}
      empty={!scored.length}
      methodology={<><strong>{program.rubric.label}</strong><br />Each criterion as a percentage of its own maximum so differently-weighted criteria compare. Maximum shown in brackets.</>}
      table={{ columns: ["Criterion", "Max", "Mean points", "Achievement %", "Full marks %", "Zero %"], rows: stats.map((s) => [s.label, s.max, s.mean.toFixed(2), s.pct.toFixed(1) + "%", s.full.toFixed(0) + "%", s.zero.toFixed(0) + "%"]) }}
      controls={<>
        <Seg value={measure} onChange={setMeasure} label="Measure" options={[{ value: "pct", label: "Achievement" }, { value: "full", label: "Full marks" }, { value: "zero", label: "Zeros" }]} />
        <Seg value={sort} onChange={setSort} label="Order" options={[{ value: "pct", label: "Weakest first" }, { value: "rubric", label: "Rubric order" }]} />
        {regions.length > 1 && <MiniSelect label="Split" value={split} onChange={setSplit} options={[{ value: "none", label: "None" }, { value: "region", label: "By region" }]} />}
      </>}
      option={option}
    />
  );
}

/** Portfolio: every programme's criteria side by side, as a heatmap. */
export function ComponentMatrix({ rows, programs, className }: { rows: AssessmentRow[]; programs: Program[]; className?: string }) {
  const { toggle } = useDash();
  const labels = useMemo(() => {
    const seen = new Map<string, { label: string; cat: string }>();
    for (const p of programs) for (const c of p.rubric.components) if (!seen.has(c.label)) seen.set(c.label, { label: c.label, cat: c.cat });
    const catOrder = ["biometricAttendance", "infrastructure", "trainer", "delivery", "industry", "feedback"];
    return [...seen.values()].sort((a, b) => catOrder.indexOf(a.cat) - catOrder.indexOf(b.cat) || a.label.localeCompare(b.label));
  }, [programs]);

  const cells: [number, number, number | null][] = [];
  programs.forEach((p, x) => {
    const pr = rows.filter((r) => r.p === p.slug && r.scored);
    labels.forEach((l, y) => {
      const c = p.rubric.components.find((k) => k.label === l.label);
      if (!c || !pr.length) return;
      const m = pr.reduce((s, r) => s + (r.components[c.key] ?? 0), 0) / pr.length;
      cells.push([x, y, Number(((m / c.max) * 100).toFixed(1))]);
    });
  });

  const option: EChartsOption = {
    grid: { left: 8, right: 12, top: 8, bottom: 58, containLabel: true },
    tooltip: {
      formatter: (p: unknown) => {
        const d = (p as { data: [number, number, number] }).data;
        const prog = programs[d[0]]; const c = prog.rubric.components.find((k) => k.label === labels[d[1]].label)!;
        return `<b>${labels[d[1]].label}</b><br/>${prog.name}<br/>Achievement <b>${d[2]}%</b> of max ${c.max}`;
      },
    },
    xAxis: { type: "category", data: programs.map((p) => p.short), axisLabel: { fontSize: 10, interval: 0 }, splitArea: { show: false } },
    yAxis: { type: "category", data: labels.map((l) => l.label), inverse: true, axisLabel: { fontSize: 10 }, splitArea: { show: false } },
    visualMap: { min: 0, max: 100, orient: "horizontal", left: "center", bottom: 0, itemHeight: 140, itemWidth: 10, calculable: true, textStyle: { fontSize: 10 }, inRange: { color: ["#ef4444", "#fde68a", "#10b981"] } },
    series: [{
      type: "heatmap", data: cells,
      label: { show: true, fontSize: 9.5, formatter: (p: unknown) => `${Math.round((p as { data: number[] }).data[2])}` },
      itemStyle: { borderColor: "rgba(255,255,255,.7)", borderWidth: 2, borderRadius: 3 },
    }],
  } as EChartsOption;

  return (
    <ChartCard title="Criteria achievement across programmes" className={className}
      subtitle="% of each criterion's maximum · blank = criterion not in that programme's rubric · click a column to filter"
      height={Math.max(360, labels.length * 22 + 100)}
      methodology={<><strong>Rubric criteria matrix</strong><br />Each programme is scored on its own rubric. Criteria with the same name are aligned in one row; weights differ, so the cell shows achievement as a share of that programme&apos;s maximum for the criterion.</>}
      onEvent={{ type: "click", handler: (p) => toggle("program", programs[(p as { data: number[] }).data[0]].slug) }}
      table={{ columns: ["Criterion", ...programs.map((p) => p.short)], rows: labels.map((l, y) => [l.label, ...programs.map((_, x) => { const c = cells.find((v) => v[0] === x && v[1] === y); return c ? `${c[2]}%` : "—"; })]) }}
      option={option} />
  );
}
