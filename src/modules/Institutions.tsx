"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import type { EChartsOption } from "echarts";
import { AlertTriangle } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { GradeMix, ScatterCard } from "@/components/charts/blocks";
import { FlaggedPanel } from "@/components/dashboard/widgets";
import { FocusButton } from "@/components/filters/InstitutePicker";
import { DataTable } from "@/components/tables/DataTable";
import { Badge, ProgressBar, Seg, MiniSelect } from "@/components/ui";
import type { Institute } from "@/types";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS, STATUS_COLORS, gradeOf, scoreColor, truncate } from "@/config";
import { instituteHref, programBase } from "@/lib/portfolio";

type RankMetric = "score" | "attendanceRate" | "verificationRate" | "dropoutRate" | "enrolled";
const RANK_METRICS: { value: RankMetric; label: string; rate: boolean; low?: boolean }[] = [
  { value: "score", label: "Score", rate: false },
  { value: "attendanceRate", label: "Attendance %", rate: true },
  { value: "verificationRate", label: "CNIC verified %", rate: true },
  { value: "dropoutRate", label: "Dropout %", rate: true, low: true },
  { value: "enrolled", label: "Enrolled", rate: false },
];

export function InstitutionsModule() {
  const { institutes, reset, isEmpty, data, scope } = useDash();
  const router = useRouter();
  const portfolio = scope.mode === "portfolio";

  const columns = useMemo<ColumnDef<Institute, unknown>[]>(() => {
    const cols: ColumnDef<Institute, unknown>[] = [
      { id: "rank", header: "#", accessorKey: "rank", cell: (c) => <span className="num text-[var(--text-muted)]">{c.getValue() as number}</span> },
    ];
    if (portfolio) cols.push({
      id: "program", header: "Programme", accessorFn: (r) => data.programBySlug.get(r.p)?.order ?? 0,
      cell: (c) => { const p = data.programBySlug.get(c.row.original.p)!; return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold" style={{ color: p.color }}><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.short}</span>; },
    });
    cols.push(
      { id: "name", header: "Institute", accessorKey: "instituteName", cell: (c) => <span className="flex max-w-[300px] items-center gap-1"><FocusButton globalKey={c.row.original.globalKey} /><span className="truncate font-medium">{c.getValue() as string}</span></span> },
      { id: "id", header: "ID", accessorKey: "instituteId", cell: (c) => <span className="num text-[var(--text-muted)]">{(c.getValue() as number | null) ?? "—"}</span> },
      { id: "district", header: "District", accessorKey: "district" },
      { id: "region", header: "Region", accessorKey: "region" },
      { id: "package", header: "Package", accessorKey: "package" },
      { id: "trades", header: "Trades", accessorFn: (r) => r.assessments, cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "capacity", header: "Capacity", accessorKey: "approvedCapacity", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
      { id: "enrolled", header: "Enrolled", accessorKey: "enrolled", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
      { id: "present", header: "Present", accessorKey: "present", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
      { id: "cnic", header: "CNIC verified", accessorKey: "cnicVerified", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
      { id: "attendance", header: "Attendance %", accessorKey: "attendanceRate", cell: (c) => <span className="num font-semibold">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "verification", header: "Verified % seats", accessorKey: "verificationRate", cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "presence", header: "Presence %", accessorKey: "presenceRate", cell: (c) => <span className="num text-[var(--text-muted)]">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "dropout", header: "Dropout", accessorKey: "dropoutRate", cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null, 2)}</span> },
      { id: "visit", header: "Visited", accessorKey: "visitDate", cell: (c) => <span className="num text-[var(--text-muted)]">{(c.getValue() as string | null) ?? "—"}</span> },
      { id: "status", header: "Status", accessorKey: "status", cell: (c) => { const s = c.getValue() as string; return s === "Active" ? <span className="text-[var(--text-muted)]">Active</span> : <Badge color={STATUS_COLORS[s]}>{s}</Badge>; } },
      {
        id: "grade", header: "Grade", accessorFn: (r) => gradeOf(r),
        cell: (c) => {
          const g = c.getValue() as string;
          return (
            <span className="flex items-center gap-1">
              <Badge color={GRADE_COLORS[g]}>{g}</Badge>
              {c.row.original.flagged && <span title={c.row.original.assessorNote ?? c.row.original.status} className="text-red-600"><AlertTriangle size={11} /></span>}
            </span>
          );
        },
      },
      {
        id: "score", header: "Score", accessorFn: (r) => r.score ?? -1,
        cell: (c) => {
          const v = c.row.original.score;
          return (
            <div className="w-24">
              <div className="num mb-0.5 font-bold" style={{ color: scoreColor(v) }}>{fmtScore(v, 1)}</div>
              <ProgressBar value={v ?? 0} max={100} color={scoreColor(v)} />
            </div>
          );
        },
      },
    );
    return cols;
  }, [portfolio, data]);

  return (
    <>
      <PageHeader page="Institutions" title="Institution Analysis"
        description={portfolio
          ? "Every institute in every programme, ranked on its own programme's rubric. An institute assessed in two programmes appears once per programme."
          : "All training provider institutes ranked by mean trade score. Click any row for the full assessment breakdown."} />

      {!isEmpty && (
        <>
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <InstituteRanking which="top" />
            <InstituteRanking which="bottom" />
          </div>
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            <GradeMix institutes={institutes} defaultDim={portfolio ? "program" : "region"} dims={portfolio ? ["program", "region", "district", "package"] : ["region", "district", "package"]} />
            <ScatterCard institutes={institutes} />
          </div>
          <div className="mb-4"><FlaggedPanel institutes={institutes} showProgram={portfolio} limit={20} /></div>
        </>
      )}

      <DataTable<Institute>
        data={institutes} columns={columns} pageSize={25} storageKey={`institutions-${scope.mode}`}
        initialHidden={["package", "capacity", "present", "presence", "verification", "visit", "id"]}
        emptyAction={reset} searchable
        onRowClick={(r) => router.push(instituteHref(programBase(r.p), r))}
      />
    </>
  );
}

/** Top/Bottom N institutes with a metric switch and click-through. */
function InstituteRanking({ which }: { which: "top" | "bottom" }) {
  const { institutes, data, scope } = useDash();
  const router = useRouter();
  const [metric, setMetric] = useState<RankMetric>("score");
  const [n, setN] = useState(15);
  const def = RANK_METRICS.find((m) => m.value === metric)!;
  const items = useMemo(() => {
    const val = (i: Institute) => (i[metric] as number | null);
    const list = institutes.filter((i) => val(i) !== null);
    const better = def.low ? 1 : -1;
    list.sort((a, b) => (which === "top" ? better : -better) * ((val(a) as number) - (val(b) as number)));
    return list.slice(0, n).reverse();
  }, [institutes, metric, n, which, def.low]);

  const fmt = (v: number) => (def.rate ? `${(v * 100).toFixed(1)}%` : metric === "enrolled" ? fmtInt(v) : v.toFixed(1));
  const option: EChartsOption = {
    grid: { left: 8, right: 52, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (p: unknown) => {
        const i = items[(p as { dataIndex: number }[])[0].dataIndex];
        return `<b>${i.instituteName}</b><br/>${data.programBySlug.get(i.p)?.short} · ${i.district}, ${i.region}<br/>Score <b>${fmtScore(i.score, 2)}</b> · ${i.grade}<br/>Attendance ${fmtPct(i.attendanceRate)} · ${fmtInt(i.enrolled)} enrolled<br/><i>click to open</i>`;
      },
    },
    xAxis: { type: "value", max: def.rate ? 100 : metric === "score" ? 100 : undefined, axisLabel: { formatter: def.rate ? "{value}%" : "{value}" } },
    yAxis: { type: "category", data: items.map((i) => truncate(i.instituteName, 32)), axisLabel: { fontSize: 9.5 } },
    series: [{
      type: "bar", barMaxWidth: 13,
      label: { show: true, position: "right", fontSize: 9.5, fontWeight: 600, formatter: (p: unknown) => fmt(items[(p as { dataIndex: number }).dataIndex][metric] as number) },
      data: items.map((i) => ({
        value: def.rate ? Number((((i[metric] as number) ?? 0) * 100).toFixed(2)) : Number(((i[metric] as number) ?? 0).toFixed(2)),
        itemStyle: { borderRadius: [0, 4, 4, 0], color: scope.mode === "portfolio" ? data.programBySlug.get(i.p)?.color : which === "top" ? "#10b981" : "#dc2626" },
      })),
    }],
  } as EChartsOption;

  return (
    <ChartCard
      title={which === "top" ? "Highest ranked institutes" : "Institutes requiring attention"}
      subtitle={`${which === "top" ? "Best" : "Worst"} ${n} by ${def.label.toLowerCase()}${scope.mode === "portfolio" ? " · bar colour = programme" : ""}`}
      height={Math.max(260, items.length * 20 + 30)}
      empty={!items.length}
      methodology={<><strong>Institute ranking</strong><br />Institutes ranked on the chosen measure under the current filters. Filtering by trade re-ranks on that trade alone.</>}
      onEvent={{ type: "click", handler: (p) => { const i = items[(p as { dataIndex: number }).dataIndex]; router.push(instituteHref(programBase(i.p), i)); } }}
      clickHint="click to open institute"
      table={{ columns: ["Institute", "Programme", def.label, "Score", "Grade"], rows: [...items].reverse().map((i) => [i.instituteName, data.programBySlug.get(i.p)?.short ?? i.p, fmt(i[metric] as number), fmtScore(i.score, 2), i.grade]) }}
      controls={<>
        <MiniSelect label="Rank by" value={metric} onChange={setMetric} options={RANK_METRICS.map((m) => ({ value: m.value, label: m.label }))} />
        <Seg value={n} onChange={setN} label="Count" options={[{ value: 10, label: "10" }, { value: 15, label: "15" }, { value: 25, label: "25" }]} />
      </>}
      option={option}
    />
  );
}
