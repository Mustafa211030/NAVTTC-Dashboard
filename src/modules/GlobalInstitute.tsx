"use client";
import { useMemo } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import { ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card, Badge, EmptyState, Delta } from "@/components/ui";
import { GRADE_COLORS, STATUS_COLORS, fmtInt, fmtPct, fmtScore, fmtMonth, scoreColor } from "@/config";
import { instituteHref, programBase } from "@/lib/portfolio";

/** One institute across every programme it was assessed in. */
export function GlobalInstituteModule({ globalKey }: { globalKey: string }) {
  const { data } = useDash();
  const records = useMemo(() => data.institutesByGlobal.get(globalKey) ?? [], [data, globalKey]);
  const cats = data.raw.categories;

  if (!records.length) return <Card><EmptyState title="Institute not found" hint="No programme carries this institute." /></Card>;
  const latest = records[records.length - 1];
  const names = [...new Set(records.map((r) => r.instituteName))];

  const trend: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 48, right: 48, top: 36, bottom: 40 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: records.map((r) => { const p = data.programBySlug.get(r.p)!; return `${p.short}\n${p.period ? fmtMonth(p.period.to) : p.assessmentDate ? fmtMonth(p.assessmentDate) : ""}`; }), axisLabel: { fontSize: 10, lineHeight: 14 } },
    yAxis: [{ type: "value", min: 0, max: 100, name: "Score / %", nameTextStyle: { fontSize: 10 } }, { type: "value", name: "Enrolled", splitLine: { show: false }, nameTextStyle: { fontSize: 10 } }],
    series: [
      { name: "Enrolled", type: "bar", yAxisIndex: 1, barMaxWidth: 36, data: records.map((r) => ({ value: r.enrolled, itemStyle: { color: data.programBySlug.get(r.p)!.color, opacity: 0.35, borderRadius: [5, 5, 0, 0] } })), label: { show: true, position: "insideTop", fontSize: 9.5 } },
      { name: "Score", type: "line", symbolSize: 10, lineStyle: { width: 3, color: "#7c3aed" }, itemStyle: { color: "#7c3aed" }, label: { show: true, position: "top", fontWeight: 700, formatter: (p: unknown) => (p as { value: number }).value?.toFixed(1) }, data: records.map((r) => (r.score === null ? null : Number(r.score.toFixed(2)))) },
      { name: "Attendance %", type: "line", symbolSize: 8, lineStyle: { width: 2, type: "dashed", color: "#059669" }, itemStyle: { color: "#059669" }, label: { show: true, position: "bottom", fontSize: 9.5, formatter: (p: unknown) => `${(p as { value: number }).value?.toFixed(0)}%` }, data: records.map((r) => (r.attendanceRate === null ? null : Number((r.attendanceRate * 100).toFixed(1)))) },
    ],
  } as EChartsOption;

  const radar: EChartsOption = {
    legend: { bottom: 0 },
    tooltip: { trigger: "item" },
    radar: { indicator: cats.map((c) => ({ name: c.short, max: 100 })), radius: "62%", axisName: { fontSize: 10 }, splitArea: { areaStyle: { color: ["transparent"] } } },
    series: [{
      type: "radar", symbolSize: 4,
      data: records.map((r) => { const p = data.programBySlug.get(r.p)!; return { name: p.short, value: cats.map((c) => (r.categoryPct[c.key] === null ? 0 : Number(((r.categoryPct[c.key] as number) * 100).toFixed(1)))), lineStyle: { color: p.color, width: 2 }, itemStyle: { color: p.color }, areaStyle: { color: p.color, opacity: 0.08 } }; }),
    }],
  } as EChartsOption;

  return (
    <>
      <Link href="/journey" className="no-print mb-3 inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-brand-600"><ArrowLeft size={13} /> Institute journeys</Link>
      <PageHeader page={`Institute_${globalKey}`} title={latest.instituteName}
        description={`${latest.district}, ${latest.region} · Institute ID ${latest.instituteId ?? "not recorded"} · assessed in ${records.length} programme${records.length === 1 ? "" : "s"}${names.length > 1 ? ` · also recorded as: ${names.filter((n) => n !== latest.instituteName).join("; ")}` : ""}`} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {records.map((r, idx) => {
          const p = data.programBySlug.get(r.p)!;
          const prev = idx > 0 ? records[idx - 1] : null;
          return (
            <Card key={r.p} className="card-hover relative overflow-hidden p-4">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: p.color }} />
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-bold" style={{ color: p.color }}>{p.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{r.visitDate ? `Visited ${r.visitDate}` : p.period ? fmtMonth(p.period.to) : p.assessmentDate ?? "date n/a"} · {r.assessments} trades</div>
                </div>
                <div className="text-right">
                  <div className="num text-2xl font-extrabold leading-none" style={{ color: scoreColor(r.score) }}>{fmtScore(r.score, 1)}</div>
                  {prev && <Delta value={r.score !== null && prev.score !== null ? r.score - prev.score : null} />}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge color={GRADE_COLORS[r.grade]}>{r.grade}</Badge>
                {r.status !== "Active" && <Badge color={STATUS_COLORS[r.status]}>{r.status}</Badge>}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                <div><span className="text-[var(--text-muted)]">Enrolled</span><div className="num font-semibold">{fmtInt(r.enrolled)}</div></div>
                <div><span className="text-[var(--text-muted)]">Attendance</span><div className="num font-semibold">{fmtPct(r.attendanceRate)}</div></div>
                <div><span className="text-[var(--text-muted)]">Rank</span><div className="num font-semibold">{r.rank}/{p.instituteCount}</div></div>
              </div>
              {r.assessorNote && <p className="mt-2 flex gap-1 text-[10.5px] text-red-700 dark:text-red-300"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{r.assessorNote}</p>}
              <div className="mt-2 text-[10px] text-[var(--text-muted)]">Trades: {r.trades.join(", ")}</div>
              <Link href={instituteHref(programBase(r.p), r)} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: p.color }}>Full {p.short} profile <ArrowRight size={12} /></Link>
            </Card>
          );
        })}
      </div>

      {records.length > 1 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard title="Across programmes" subtitle="Score, attendance and enrolment in each programme" height={320} option={trend}
            methodology={<>Each programme uses its own rubric and attendance rule, so changes reflect both the institute and the measurement.</>}
            table={{ columns: ["Programme", "Score", "Grade", "Attendance %", "Enrolled"], rows: records.map((r) => [data.programBySlug.get(r.p)!.name, fmtScore(r.score), r.grade, fmtPct(r.attendanceRate), r.enrolled]) }} />
          <ChartCard title="Category profile by programme" subtitle="Share of each shared category's maximum" height={320} option={radar}
            table={{ columns: ["Programme", ...cats.map((c) => c.label)], rows: records.map((r) => [data.programBySlug.get(r.p)!.short, ...cats.map((c) => fmtPct(r.categoryPct[c.key]))]) }} />
        </div>
      )}
    </>
  );
}
