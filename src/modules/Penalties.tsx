"use client";
import { useMemo } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import type { ColumnDef } from "@tanstack/react-table";
import { Scale, TrendingDown, Building2, ArrowDownRight, ShieldAlert } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { SectionTitle } from "@/components/dashboard/widgets";
import { ChartCard } from "@/components/charts/ChartCard";
import { DataTable } from "@/components/tables/DataTable";
import { FocusButton } from "@/components/filters/InstitutePicker";
import { Card, EmptyState, Badge } from "@/components/ui";
import { bandOf, fmtDate, fmtInt, fmtPct, fmtScore, scoreColor, GRADE_COLORS, REGION_COLORS, CHART_PALETTE } from "@/config";
import { instituteHref, programBase } from "@/lib/portfolio";
import type { AssessmentRow } from "@/types";

/**
 * NAVTTC penalties, from the programme-wise VTT report.
 *
 * The report deducts a percentage of the VTT score when a minimum is not met
 * (e.g. Trainer below 5: −20%). The final NAVTTC score drives grades and ranks
 * everywhere in the dashboard; this page shows what the deductions cost, why
 * they were applied, and who was affected.
 */
export function PenaltiesModule() {
  const { data, scope, rows, institutes, isEmpty, reset } = useDash();

  const covered = useMemo(() => rows.filter((r) => r.penaltyPct !== null && r.scored), [rows]);
  const penalised = useMemo(() => covered.filter((r) => (r.penaltyPct ?? 0) > 0), [covered]);
  const instCovered = useMemo(() => institutes.filter((i) => i.vttScore !== null), [institutes]);
  const instHit = useMemo(() => instCovered.filter((i) => i.penalisedTrades > 0), [instCovered]);
  const gradeDrops = useMemo(() => instHit.filter((i) => !i.gradeOverride && bandOf(i.vttScore) !== bandOf(i.score)), [instHit]);
  const lost = (r: AssessmentRow) => (r.vttScore ?? 0) - (r.tradeScore ?? 0);
  const meanLost = penalised.length ? penalised.reduce((s, r) => s + lost(r), 0) / penalised.length : 0;

  /** Each combined reason ("A; B") counts once per rule it contains. */
  const reasons = useMemo(() => {
    const m = new Map<string, { n: number; pct: Set<string> }>();
    for (const r of penalised) {
      for (const part of (r.penaltyReason ?? "Reason not stated").split(/;\s*/)) {
        const rule = part.replace(/\s*\((?:−|-)\d+%\)\s*$/, "").trim();
        const pct = part.match(/\((?:−|-)(\d+)%\)/)?.[1];
        if (!m.has(rule)) m.set(rule, { n: 0, pct: new Set() });
        m.get(rule)!.n++;
        if (pct) m.get(rule)!.pct.add(`−${pct}%`);
      }
    }
    return [...m.entries()].map(([rule, v]) => ({ rule, n: v.n, pct: [...v.pct].join(", ") })).sort((a, b) => b.n - a.n);
  }, [penalised]);

  const byGroup = useMemo(() => {
    const key = (r: AssessmentRow) => (scope.mode === "portfolio" ? r.p : r.region);
    const m = new Map<string, { all: number; hit: number; lost: number }>();
    for (const r of covered) {
      const k = key(r);
      if (!m.has(k)) m.set(k, { all: 0, hit: 0, lost: 0 });
      const g = m.get(k)!;
      g.all++;
      if ((r.penaltyPct ?? 0) > 0) { g.hit++; g.lost += lost(r); }
    }
    return [...m.entries()].map(([k, g]) => ({
      k, label: scope.mode === "portfolio" ? data.programBySlug.get(k)?.short ?? k : k,
      color: scope.mode === "portfolio" ? data.programBySlug.get(k)?.color ?? "#64748b" : REGION_COLORS[k] ?? CHART_PALETTE[0],
      ...g, share: g.all ? g.hit / g.all : 0,
    })).sort((a, b) => b.share - a.share);
  }, [covered, scope.mode, data]);

  const pctMix = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of penalised) m.set(r.penaltyPct!, (m.get(r.penaltyPct!) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [penalised]);

  const columns = useMemo<ColumnDef<AssessmentRow, unknown>[]>(() => [
    ...(scope.mode === "portfolio" ? [{
      id: "p", header: "Programme", accessorFn: (r: AssessmentRow) => data.programBySlug.get(r.p)?.short ?? r.p,
      cell: (c: { row: { original: AssessmentRow }; getValue: () => unknown }) => <span className="text-[11px] font-semibold" style={{ color: data.programBySlug.get(c.row.original.p)?.color }}>{c.getValue() as string}</span>,
    } as ColumnDef<AssessmentRow, unknown>] : []),
    {
      id: "inst", header: "Institute", accessorKey: "instituteName",
      cell: (c) => {
        const r = c.row.original;
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <FocusButton globalKey={r.globalKey} />
            <Link href={instituteHref(programBase(r.p), r)} className="max-w-[260px] truncate font-medium hover:underline">{r.instituteName}</Link>
          </span>
        );
      },
    },
    { id: "id", header: "TSP ID", accessorKey: "instituteId", cell: (c) => <span className="num">{(c.getValue() as number | null) ?? "—"}</span> },
    { id: "trade", header: "Trade", accessorKey: "tradeName", cell: (c) => <span className="block max-w-[220px] truncate">{c.getValue() as string}</span> },
    { id: "batch", header: "Batch", accessorKey: "batch", cell: (c) => <span className="num">{(c.getValue() as number | null) ?? "—"}</span> },
    { id: "vtt", header: "VTT score", accessorKey: "vttScore", cell: (c) => <span className="num">{fmtScore(c.getValue() as number | null, 2)}</span> },
    { id: "pct", header: "Penalty", accessorKey: "penaltyPct", cell: (c) => <span className="num font-semibold text-red-600">−{c.getValue() as number}%</span> },
    {
      id: "final", header: "Final score", accessorKey: "tradeScore",
      cell: (c) => <span className="num font-bold" style={{ color: scoreColor(c.getValue() as number) }}>{fmtScore(c.getValue() as number | null, 2)}</span>,
    },
    { id: "lost", header: "Points lost", accessorFn: (r) => lost(r), cell: (c) => <span className="num">−{(c.getValue() as number).toFixed(2)}</span> },
    {
      id: "grade", header: "Grade", accessorFn: (r) => bandOf(r.tradeScore),
      cell: (c) => {
        const r = c.row.original; const before = bandOf(r.vttScore), after = bandOf(r.tradeScore);
        return before === after ? <Badge color={GRADE_COLORS[after ?? ""]}>{after}</Badge>
          : <span className="flex items-center gap-1 text-[11px]"><span className="text-[var(--text-muted)] line-through">{before}</span><ArrowDownRight size={11} className="text-red-500" /><Badge color={GRADE_COLORS[after ?? ""]}>{after}</Badge></span>;
      },
    },
    { id: "reason", header: "Reason", accessorKey: "penaltyReason", cell: (c) => <span title={(c.getValue() as string | null) ?? undefined} className="block max-w-[380px] truncate text-[11px]">{(c.getValue() as string | null) ?? "—"}</span> },
  ], [scope.mode, data]);

  const reportDate = scope.program?.reportDate ?? data.programs.find((p) => p.reportDate)?.reportDate ?? null;
  if (isEmpty) return (<><PageHeader page="Penalties" title="NAVTTC Penalties" /><Card><EmptyState onClear={reset} /></Card></>);

  if (!covered.length) {
    return (
      <>
        <PageHeader page="Penalties" title="NAVTTC Penalties" />
        <Card>
          <EmptyState title="No penalty data in this view"
            hint={scope.program
              ? `${scope.program.name} is not covered by the programme-wise VTT report, which is where NAVTTC penalties are recorded.`
              : "None of the records under the current filters come from the programme-wise VTT report."} />
        </Card>
      </>
    );
  }

  const reasonOption: EChartsOption = {
    grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", minInterval: 1 },
    yAxis: { type: "category", data: [...reasons].reverse().map((r) => r.rule), axisLabel: { fontSize: 10.5, width: 230, overflow: "truncate" } },
    series: [{
      type: "bar", barMaxWidth: 22,
      data: [...reasons].reverse().map((r) => ({ value: r.n, itemStyle: { color: "#dc2626" } })),
      label: { show: true, position: "right", fontSize: 10.5, fontWeight: 700 },
    }],
  };

  const groupOption: EChartsOption = {
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps: unknown) => {
        const g = byGroup[byGroup.length - 1 - (ps as { dataIndex: number }[])[0].dataIndex];
        return `<b>${g.label}</b><br/>${g.hit} of ${g.all} trades penalised (${fmtPct(g.share)})<br/>${g.lost.toFixed(1)} points deducted in total`;
      },
    },
    xAxis: { type: "value", max: 1, axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` } },
    yAxis: { type: "category", data: [...byGroup].reverse().map((g) => g.label), axisLabel: { fontSize: 10.5 } },
    series: [{
      type: "bar", barMaxWidth: 22,
      data: [...byGroup].reverse().map((g) => ({ value: Number(g.share.toFixed(4)), itemStyle: { color: g.color } })),
      label: { show: true, position: "right", fontSize: 10.5, fontWeight: 700, formatter: (p: unknown) => { const g = byGroup[byGroup.length - 1 - (p as { dataIndex: number }).dataIndex]; return `${fmtPct(g.share, 0)} · ${g.hit}/${g.all}`; } },
    }],
  };

  const scatterOption: EChartsOption = {
    grid: { left: 46, right: 18, top: 30, bottom: 40 },
    legend: { top: 0 },
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const r = (p as { data: { r: AssessmentRow } }).data.r;
        return `<b>${r.instituteName}</b><br/>${r.tradeName}<br/>VTT ${fmtScore(r.vttScore, 2)} → final ${fmtScore(r.tradeScore, 2)} (−${r.penaltyPct}%)`;
      },
    },
    xAxis: { type: "value", name: "VTT score", nameLocation: "middle", nameGap: 26, min: 0, max: 100 },
    yAxis: { type: "value", name: "Final score", min: 0, max: 100 },
    series: [
      ...pctMix.map(([pct], i) => ({
        name: `−${pct}%`, type: "scatter" as const, symbolSize: 9,
        itemStyle: { color: ["#f59e0b", "#ef4444", "#b91c1c", "#7f1d1d"][Math.min(i, 3)], opacity: 0.85 },
        data: penalised.filter((r) => r.penaltyPct === pct).map((r) => ({ value: [r.vttScore, r.tradeScore], r })),
      })),
      { name: "No change", type: "line" as const, data: [[0, 0], [100, 100]], symbol: "none", lineStyle: { type: "dashed" as const, color: "#94a3b8", width: 1 }, silent: true, tooltip: { show: false } },
    ],
  } as EChartsOption;

  return (
    <>
      <PageHeader page="Penalties" title="NAVTTC Penalties"
        description={`Deductions applied to VTT scores in the programme-wise report${reportDate ? ` of ${fmtDate(reportDate)}` : ""}. Final NAVTTC scores — used for every grade and rank in the dashboard — are the VTT score less these percentages.`} />

      <div className="stagger mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Penalised trades" value={penalised.length} format={(n) => fmtInt(n)} icon={ShieldAlert} accent="#dc2626"
          sub={<>{fmtPct(covered.length ? penalised.length / covered.length : null)} of {fmtInt(covered.length)} report rows</>}
          methodology={<><strong>Penalised trades</strong><br />Trade rows in the programme-wise VTT report with a penalty percentage above zero.</>} />
        <KPICard label="Institutes affected" value={instHit.length} format={(n) => fmtInt(n)} icon={Building2} accent="#f59e0b"
          sub={<>of {fmtInt(instCovered.length)} institutes in the report</>}
          methodology={<><strong>Institutes affected</strong><br />Institutes with at least one penalised trade.</>} />
        <KPICard label="Points lost per penalty" value={meanLost} format={(n) => n.toFixed(2)} icon={TrendingDown} accent="#7c3aed"
          sub={<>{(penalised.reduce((s, r) => s + lost(r), 0)).toFixed(1)} points deducted in total</>}
          methodology={<><strong>Points lost</strong><br />VTT score − final NAVTTC score, averaged over penalised trades.</>} />
        <KPICard label="Grade lowered" value={gradeDrops.length} format={(n) => fmtInt(n)} icon={Scale} accent="#0891b2"
          sub={<>institutes whose grade band fell because of penalties</>}
          methodology={<><strong>Grade lowered</strong><br />Institutes whose mean VTT score sits in a higher band than their mean final score.</>} />
      </div>

      <SectionTitle>Why and where</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Penalty rules applied" subtitle="Trades per rule · a row with two rules counts under both" height={Math.max(220, reasons.length * 34 + 40)}
          option={reasonOption} table={{ columns: ["Rule", "Deduction", "Trades"], rows: reasons.map((r) => [r.rule, r.pct, r.n]) }}
          methodology={<><strong>Penalty rules</strong><br />Parsed from the report&apos;s Penalty Reason column. Rules stack: two rules on one trade deduct both percentages.</>} />
        <ChartCard title={scope.mode === "portfolio" ? "Share penalised by programme" : "Share penalised by region"} subtitle="Penalised trades ÷ trades in the report" height={Math.max(220, byGroup.length * 34 + 40)}
          option={groupOption} table={{ columns: [scope.mode === "portfolio" ? "Programme" : "Region", "Trades", "Penalised", "Share", "Points deducted"], rows: byGroup.map((g) => [g.label, g.all, g.hit, fmtPct(g.share), g.lost.toFixed(2)]) }} />
      </div>
      <div className="mt-3">
        <ChartCard title="Score before and after penalty" subtitle="Each dot is a penalised trade · distance below the dashed line = points deducted" height={340}
          option={scatterOption} table={{ columns: ["Institute", "Trade", "VTT", "Penalty %", "Final"], rows: penalised.map((r) => [r.instituteName, r.tradeName, r.vttScore, r.penaltyPct, r.tradeScore]) }} />
      </div>

      <SectionTitle hint="Sorted by points lost">Penalised trades</SectionTitle>
      <DataTable<AssessmentRow> data={[...penalised].sort((a, b) => lost(b) - lost(a))} columns={columns} pageSize={25} storageKey={`penalties-${scope.program?.slug ?? "all"}`} searchable />
    </>
  );
}
