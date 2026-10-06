"use client";
import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import type { ColumnDef } from "@tanstack/react-table";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { RankedBars, HeatmapCard } from "@/components/charts/blocks";
import { DataTable } from "@/components/tables/DataTable";
import { Card, EmptyState, Badge, MiniSelect } from "@/components/ui";
import { groupBy, type GroupStat } from "@/lib/aggregate";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS, bandOf, scoreColor } from "@/config";

interface TradeRow extends Omit<GroupStat, "programs"> { name: string; programs: string[] }

export function TradesModule() {
  const { rows, isEmpty, reset, data, scope, toggle } = useDash();
  const portfolio = scope.mode === "portfolio";

  const trades = useMemo<TradeRow[]>(() => groupBy(rows, (r) => r.tradeNorm).map((s) => ({
    ...s, name: data.tradeName(s.key),
    // replaces GroupStat.programs (a count) with the programme list
    programs: data.programs.filter((p) => rows.some((r) => r.tradeNorm === s.key && r.p === p.slug)).map((p) => p.slug),
  })).sort((a, b) => b.enrolled - a.enrolled), [rows, data]);

  const columns = useMemo<ColumnDef<TradeRow, unknown>[]>(() => [
    { id: "name", header: "Trade", accessorKey: "name", cell: (c) => <span className="block max-w-[280px] truncate font-medium">{c.getValue() as string}{c.row.original.assessments < 3 && <span className="ml-1.5 rounded bg-[var(--surface-3)] px-1 text-[9px] text-[var(--text-muted)]">low n</span>}</span> },
    ...(portfolio ? [{
      id: "programs", header: "Programmes", accessorFn: (r: TradeRow) => r.programs.length,
      cell: (c: { row: { original: TradeRow } }) => <span className="flex gap-0.5">{c.row.original.programs.map((s) => { const p = data.programBySlug.get(s)!; return <span key={s} title={p.name} className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />; })}</span>,
    } as ColumnDef<TradeRow, unknown>] : []),
    { id: "institutes", header: "Institutes", accessorKey: "institutes", cell: (c) => <span className="num">{c.getValue() as number}</span> },
    { id: "assessments", header: "Assessments", accessorKey: "assessments", cell: (c) => <span className="num">{c.getValue() as number}</span> },
    { id: "capacity", header: "Capacity", accessorKey: "capacity", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
    { id: "enrolled", header: "Enrolled", accessorKey: "enrolled", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
    { id: "present", header: "Present", accessorKey: "present", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
    { id: "verified", header: "CNIC verified", accessorKey: "verified", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
    { id: "attendance", header: "Attendance %", accessorKey: "attendanceRate", cell: (c) => <span className="num font-semibold">{fmtPct(c.getValue() as number | null)}</span> },
    { id: "dropout", header: "Dropout %", accessorKey: "dropoutRate", cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null, 2)}</span> },
    { id: "utilization", header: "Utilisation %", accessorKey: "utilizationRate", cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null)}</span> },
    { id: "score", header: "Mean score", accessorFn: (r) => r.meanScore ?? -1, cell: (c) => <span className="num font-bold" style={{ color: scoreColor(c.row.original.meanScore) }}>{fmtScore(c.row.original.meanScore, 1)}</span> },
    { id: "remark", header: "Remarks", accessorFn: (r) => bandOf(r.meanScore) ?? "", cell: (c) => { const g = c.getValue() as string; return g ? <Badge color={GRADE_COLORS[g]}>{g}</Badge> : "—"; } },
  ], [portfolio, data]);

  if (isEmpty) return (<><PageHeader page="Trades" title="Trade Analysis" /><Card><EmptyState onClear={reset} /></Card></>);

  return (
    <>
      <PageHeader page="Trades" title="Trade Analysis"
        description={`${trades.length} distinct trades. ${portfolio ? "Trades are matched across programmes on their normalised name, so the same trade offered in several programmes is compared on one row." : "Spelling variants in the workbook are merged onto a single canonical name."}`} />

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <RankedBars title="Trades ranked" rows={rows} dims={["trade", "tradeCategory", "tradeSector", "duration"]} defaultDim="trade" defaultMetric="enrolled" defaultTop={20} minAssessments={1} accent="#0891b2" />
        <TradeScatter trades={trades} />
      </div>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <HeatmapCard title={portfolio ? "Trade × programme" : "Trade × region"} rows={rows} rowDims={["trade", "tradeSector", "tradeCategory"]} colDims={portfolio ? ["program", "region"] : ["region", "package", "batch"]}
          defaultRow="trade" maxRows={25} />
        <RankedBars title="Trade portfolio mix" rows={rows} dims={["tradeSector", "tradeCategory", "duration", "program"]} defaultMetric="score" accent="#7c3aed"
          subtitle="Group trades by sector, category or course length where the workbook records them" />
      </div>

      <DataTable<TradeRow> data={trades} columns={columns} pageSize={25} storageKey={`trades-${scope.mode}`} searchable
        initialHidden={["capacity", "present", "utilization"]}
        onRowClick={(t) => toggle("trade", t.key)} />
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">Click a row to filter every module to that trade.</p>
    </>
  );
}

function TradeScatter({ trades }: { trades: TradeRow[] }) {
  const { toggle, scope } = useDash();
  const [min, setMin] = useState(3);
  const [y, setY] = useState<"meanScore" | "attendanceRate">("meanScore");
  const pts = trades.filter((t) => t.assessments >= min && t[y] !== null);
  const labelled = new Set([...pts].sort((a, b) => b.enrolled - a.enrolled).slice(0, 5).map((t) => t.key));
  const option: EChartsOption = {
    grid: { left: 52, right: 20, top: 20, bottom: 44 },
    tooltip: { formatter: (p: unknown) => { const t = pts[(p as { dataIndex: number }).dataIndex]; return `<b>${t.name}</b><br/>${fmtInt(t.enrolled)} enrolled · ${t.institutes} institutes<br/>Mean score ${fmtScore(t.meanScore, 1)} · Attendance ${fmtPct(t.attendanceRate)}${scope.mode === "portfolio" ? `<br/>${t.programs.length} programme(s)` : ""}`; } },
    xAxis: { type: "log", name: "Enrolled (log scale)", nameLocation: "middle", nameGap: 28, nameTextStyle: { fontSize: 10 } },
    yAxis: { type: "value", name: y === "meanScore" ? "Mean score" : "Attendance %", max: 100, nameTextStyle: { fontSize: 10 } },
    series: [{
      type: "scatter",
      symbolSize: (d: unknown) => Math.max(8, Math.min(Math.sqrt((d as number[])[2]) * 5, 36)),
      itemStyle: { opacity: 0.7, borderColor: "#fff", borderWidth: 1 },
      label: { show: true, position: "right", fontSize: 9, formatter: (p: unknown) => { const t = pts[(p as { dataIndex: number }).dataIndex]; return labelled.has(t.key) ? t.name.slice(0, 22) : ""; } },
      data: pts.map((t) => ({
        value: [Math.max(t.enrolled, 1), Number(((y === "meanScore" ? t.meanScore : (t.attendanceRate ?? 0) * 100) as number).toFixed(2)), t.institutes],
        itemStyle: { color: scoreColor(t.meanScore) },
      })),
    }],
  } as EChartsOption;
  return (
    <ChartCard title="Enrolment against performance" subtitle={`One bubble per trade · size = institutes · colour = score band · ${pts.length} trades`} height={440}
      methodology={<><strong>Enrolment vs performance</strong><br />Large, low-scoring trades (bottom right) are where improvement reaches the most trainees.</>}
      onEvent={{ type: "click", handler: (p) => toggle("trade", pts[(p as { dataIndex: number }).dataIndex].key) }}
      table={{ columns: ["Trade", "Enrolled", "Institutes", "Mean score", "Attendance %"], rows: pts.map((t) => [t.name, t.enrolled, t.institutes, fmtScore(t.meanScore, 1), fmtPct(t.attendanceRate)]) }}
      controls={<>
        <MiniSelect label="Y" value={y} onChange={setY} options={[{ value: "meanScore", label: "Mean score" }, { value: "attendanceRate", label: "Attendance %" }]} />
        <MiniSelect label="Min assessments" value={min} onChange={setMin} options={[1, 3, 5, 10].map((n) => ({ value: n, label: `≥${n}` }))} />
      </>}
      option={option} />
  );
}
