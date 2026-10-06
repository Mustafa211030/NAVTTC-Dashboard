"use client";
import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { CategoryProfile, SpreadCard, DistributionCard, ScatterCard, RankedBars } from "@/components/charts/blocks";
import { ComponentBars, ComponentMatrix } from "@/components/charts/ComponentBars";
import { SectionTitle } from "@/components/dashboard/widgets";
import { Card, EmptyState, ProgressBar, MiniSelect } from "@/components/ui";
import { drivers, categoryMeans, CATEGORY_KEYS } from "@/lib/aggregate";
import { truncate } from "@/config";
import type { AssessmentRow, Program } from "@/types";

export function PerformanceModule() {
  const { rows, institutes, isEmpty, reset, scope } = useDash();
  if (isEmpty) return (<><PageHeader page="Performance" title="Performance Analysis" /><Card><EmptyState onClear={reset} /></Card></>);
  const program = scope.program;

  return (
    <>
      <PageHeader page="Performance" title="Performance Analysis"
        description={program ? `How ${program.name}'s ${program.rubric.components.length}-criteria score is earned, and where it is lost.` : "Where each programme earns and loses its score, compared on the six shared rubric categories."} />

      {program ? <ProgramStrengths rows={rows} program={program} /> : <CategoryStrengths rows={rows} />}

      <SectionTitle>Rubric</SectionTitle>
      {program ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <ComponentBars rows={rows} program={program} />
          <div className="grid gap-3">
            <CategoryProfile rows={rows} seriesDims={["region", "package", "tradeCategory", "duration"]} />
            <DriversCard rows={rows} program={program} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          <ComponentMatrix className="lg:col-span-3" rows={rows} programs={scope.programs.filter((p) => rows.some((r) => r.p === p.slug))} />
          <div className="grid gap-3 lg:col-span-2">
            <CategoryProfile rows={rows} seriesDims={["program", "family", "region"]} defaultView="bars" />
            <DriversCard rows={rows} />
          </div>
        </div>
      )}

      <SectionTitle>Distribution</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <SpreadCard rows={rows} institutes={institutes} dims={program ? ["region", "package", "district", "tradeCategory", "duration"] : ["program", "family", "region"]} />
        <DistributionCard rows={rows} institutes={institutes} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ScatterCard institutes={institutes} />
        <RankedBars title="Who misses on attendance" rows={rows} dims={program ? ["district", "region", "trade", "tradeCategory"] : ["program", "region", "district", "trade"]}
          defaultDim={program ? "district" : "program"} defaultMetric="attendance" metrics={["attendance", "presence", "verification", "dropout", "utilization"]} accent="#059669" />
      </div>
    </>
  );
}

function CategoryStrengths({ rows }: { rows: AssessmentRow[] }) {
  const { data } = useDash();
  const means = categoryMeans(rows);
  const list = data.raw.categories.map((c) => ({ ...c, v: means[c.key] })).filter((c) => c.v !== null) as { key: string; label: string; v: number }[];
  list.sort((a, b) => b.v - a.v);
  return (
    <div className="mb-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {list.map((c, i) => (
        <Card key={c.key} className="p-3.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <span className="truncate">{c.label}</span><span>#{i + 1}</span>
          </div>
          <div className="num mt-1.5 text-xl font-bold" style={{ color: c.v >= 0.8 ? "#10b981" : c.v >= 0.55 ? "#2563eb" : c.v >= 0.3 ? "#d97706" : "#dc2626" }}>{(c.v * 100).toFixed(0)}%</div>
          <div className="mt-1.5"><ProgressBar value={c.v * 100} max={100} color={c.v >= 0.8 ? "#10b981" : c.v >= 0.55 ? "#2563eb" : c.v >= 0.3 ? "#d97706" : "#dc2626"} /></div>
          <div className="mt-1 text-[10px] text-[var(--text-muted)]">mean achievement, all rubrics</div>
        </Card>
      ))}
    </div>
  );
}

function ProgramStrengths({ rows, program }: { rows: AssessmentRow[]; program: Program }) {
  const scored = rows.filter((r) => r.scored);
  const stats = program.rubric.components.map((c) => {
    const vals = scored.map((r) => r.components[c.key] ?? 0);
    const mean = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
    return { ...c, mean, pct: c.max ? (mean / c.max) * 100 : 0, full: vals.filter((v) => v >= c.max - 1e-9).length, zero: vals.filter((v) => v === 0).length };
  }).sort((a, b) => b.pct - a.pct);
  const block = (title: string, items: typeof stats, color: string, note: (s: (typeof stats)[number]) => string, cls: string) => (
    <Card className="print-avoid p-4">
      <h3 className={`mb-3 text-[13px] font-semibold ${cls}`}>{title}</h3>
      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.key}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium">{c.label}</span>
              <span className="num text-[var(--text-muted)]">{c.mean.toFixed(2)} / {c.max} · <strong>{c.pct.toFixed(0)}%</strong></span>
            </div>
            <ProgressBar value={c.pct} max={100} color={color} />
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">{note(c)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
  return (
    <div className="mb-2 grid gap-3 lg:grid-cols-2">
      {block("Strongest criteria", stats.slice(0, 4), "#10b981", (c) => `${c.full} of ${scored.length} assessments at full marks`, "text-emerald-700 dark:text-emerald-400")}
      {block("Weakest criteria", [...stats].reverse().slice(0, 4), "#dc2626", (c) => `${c.zero} of ${scored.length} assessments scored zero`, "text-red-700 dark:text-red-400")}
    </div>
  );
}

/** Correlation of each criterion (programme) or category (portfolio) with the total score. */
function DriversCard({ rows, program }: { rows: AssessmentRow[]; program?: Program }) {
  const { data, scope } = useDash();
  const [local, setLocal] = useState<string>("all");
  const subset = useMemo(() => (local === "all" ? rows : rows.filter((r) => r.p === local)), [rows, local]);
  const prog = program ?? (local !== "all" ? data.programBySlug.get(local) : undefined);
  const d = useMemo(() => {
    if (prog) return drivers(subset.filter((r) => r.p === prog.slug), prog.rubric.components.map((c) => ({ key: c.key, label: c.label, max: c.max, value: (r) => r.components[c.key] ?? 0 })));
    return drivers(subset, CATEGORY_KEYS.map((k) => ({ key: k, label: data.raw.categories.find((c) => c.key === k)!.label, max: 1, value: (r) => r.categoryPct[k] })));
  }, [subset, prog, data]);
  const rev = [...d].reverse();
  const option: EChartsOption = {
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p: unknown) => { const c = rev[(p as { dataIndex: number }[])[0].dataIndex]; return `<b>${c.label}</b><br/>r = ${c.r.toFixed(3)} · n = ${c.n}<br/>Mean achievement ${prog ? c.pct.toFixed(0) : (c.mean * 100).toFixed(0)}%`; } },
    xAxis: { type: "value", min: Math.min(0, ...d.map((x) => x.r)), max: 1 },
    yAxis: { type: "category", data: rev.map((x) => truncate(x.label, 26)), axisLabel: { fontSize: 10 } },
    series: [{
      type: "bar", barMaxWidth: 13,
      label: { show: true, position: "right", fontSize: 9.5, fontWeight: 600, formatter: (p: unknown) => Number((p as { value: number }).value).toFixed(2) },
      data: rev.map((x) => ({ value: Number(x.r.toFixed(3)), itemStyle: { borderRadius: [0, 3, 3, 0], color: x.r >= 0.5 ? "#7c3aed" : x.r >= 0.3 ? "#2563eb" : "#c2cfdd" } })),
    }],
  } as EChartsOption;
  return (
    <ChartCard title="What actually drives the score" subtitle={prog ? `Correlation of each ${prog.short} criterion with the trade score` : "Correlation of each shared category with the trade score"}
      height={Math.max(240, d.length * 24 + 30)} empty={!d.length}
      methodology={<><strong>Discrimination</strong><br />Pearson correlation with the total trade score. A criterion can be worth many points and still not separate institutes — if everyone scores the same, it adds points but no information.</>}
      table={{ columns: ["Factor", "r", "n"], rows: d.map((x) => [x.label, x.r.toFixed(3), x.n]) }}
      controls={!program && scope.mode === "portfolio" ? (
        <MiniSelect label="Within" value={local} onChange={setLocal} options={[{ value: "all", label: "All programmes (categories)" }, ...scope.programs.map((p) => ({ value: p.slug, label: `${p.short} (criteria)` }))]} />
      ) : undefined}
      option={option} />
  );
}
