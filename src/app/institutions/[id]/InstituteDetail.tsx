"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card, Badge, ProgressBar, EmptyState, Tooltip } from "@/components/ui";
import { InstituteOnePager } from "@/components/reports/InstituteOnePager";
import { rows as allRows, institutes as allInstitutes, components, categories } from "@/lib/dataset";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS, gradeOf } from "@/config";

export function InstituteDetail({ id }: { id: number }) {
  const { rows } = useFilters();

  const inst = useMemo(() => allInstitutes.find((i) => i.instituteId === id), [id]);
  const instRows = useMemo(() => allRows.filter((r) => r.instituteId === id), [id]);

  // National means for the comparison series, respecting the active filters.
  const nationalComponents = useMemo(() => {
    const base = rows.length ? rows : allRows;
    return Object.fromEntries(components.map((c) => [c.key, base.reduce((s, r) => s + r.components[c.key], 0) / base.length]));
  }, [rows]);

  if (!inst) {
    return <Card><EmptyState title="Institute not found" hint="No institute in this dataset carries that ID." /></Card>;
  }

  const grade = gradeOf(inst);
  const peers = allInstitutes.filter((i) => i.district === inst.district);
  const peerMedian = peers.length
    ? [...peers].sort((a, b) => a.score - b.score)[Math.floor(peers.length / 2)].score : null;

  const stat = (label: string, value: string, note?: string) => (
    <div className="px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="num mt-0.5 text-base font-bold leading-none">{value}</div>
      {note && <div className="mt-1 text-[10px] text-[var(--text-muted)]">{note}</div>}
    </div>
  );

  return (
    <>
      <Link href="/institutions" className="screen-only no-print mb-3 inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-brand-600">
        <ArrowLeft size={13} /> All institutions
      </Link>

      <PageHeader page={`Institute_${inst.instituteId}`} title={inst.instituteName}
        description={`${inst.district}, ${inst.region} · Institute ID ${inst.instituteId} · ${inst.package ?? "—"}`}
        printHeader={false} printLabel="Print one-pager" />

      {/*
        The complete institute record on a single A4 sheet. Hidden on screen,
        and in print it replaces the screen layout entirely rather than being
        a compressed version of it.
      */}
      <InstituteOnePager inst={inst} rows={instRows} />

      <div className="screen-only">

      {inst.assessorNote && (
        <Card className="print-avoid mb-4 border-l-4 border-l-red-500 bg-red-50/60 p-3 dark:bg-red-950/30">
          <div className="flex gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <div className="text-xs font-semibold text-red-700 dark:text-red-300">Assessor note</div>
              <p className="mt-0.5 text-xs leading-relaxed">{inst.assessorNote}</p>
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Source: workbook column AK, <code>Grading</code>.</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="print-avoid mb-4 grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-4 lg:grid-cols-8 lg:divide-y-0">
        <div className="px-4 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Grade</div>
          <div className="mt-1"><Badge color={GRADE_COLORS[grade]}>{grade}</Badge></div>
          <div className="mt-1 text-[10px] text-[var(--text-muted)]">Rank {inst.rank} of {allInstitutes.length}</div>
        </div>
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            Score
            <Tooltip label={<>Mean of this institute&apos;s {inst.assessments} trade scores. Each trade score is the sum of 16 components out of 100.</>} />
          </div>
          <div className="num mt-0.5 text-base font-bold leading-none">{fmtScore(inst.score)}</div>
          <div className="mt-1"><ProgressBar value={inst.score} max={100} color={GRADE_COLORS[grade]} /></div>
        </div>
        {stat("Trades", String(inst.assessments), inst.trades.length + " distinct")}
        {stat("Capacity", fmtInt(inst.approvedCapacity))}
        {stat("Registered", fmtInt(inst.biometricRegistered), fmtPct(inst.utilizationRate) + " utilization")}
        {stat("Attendance %", fmtPct(inst.attendanceRate), `${fmtInt(inst.cnicVerified)} CNIC-verified`)}
        {stat("Presence %", fmtPct(inst.presenceRate), `${fmtInt(inst.present)} present`)}
        {stat("Dropout", fmtPct(inst.dropoutRate, 2), `${fmtInt(inst.droppedOut)} trainees`)}
      </Card>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Score components vs national mean" height={330}
          methodology={<><strong>Component comparison</strong><br />This institute&apos;s mean score on each of the 16 components, against the mean across all currently filtered assessments. Percentages are of each component&apos;s own maximum so they are comparable.</>}
          data={components.map((c) => ({ label: c.label, value: `${(inst.components[c.key] ?? 0).toFixed(2)} / ${c.max}` }))}
          option={{
            grid: { left: 8, right: 20, top: 30, bottom: 8, containLabel: true },
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
            legend: { top: 0, right: 0 },
            xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            yAxis: { type: "category", data: components.map((c) => c.label), axisLabel: { fontSize: 9.5 } },
            series: [
              { name: "This institute", type: "bar", barMaxWidth: 9, itemStyle: { borderRadius: [0, 3, 3, 0], color: "#2563eb" },
                data: components.map((c) => Number((((inst.components[c.key] ?? 0) / c.max) * 100).toFixed(1))) },
              { name: "Filtered mean", type: "bar", barMaxWidth: 9, itemStyle: { borderRadius: [0, 3, 3, 0], color: "#c2cfdd" },
                data: components.map((c) => Number((((nationalComponents[c.key] ?? 0) / c.max) * 100).toFixed(1))) },
            ],
          }} />

        <ChartCard title="Category achievement" height={330}
          methodology={<><strong>Category achievement</strong><br />The 16 components grouped into 6 categories, shown as a percentage of each category maximum. Grouping preserved from the previous dashboard.</>}
          data={categories.map((c) => ({ label: c.label, value: `${(inst.categoryScores[c.key] ?? 0).toFixed(2)} / ${c.max}` }))}
          option={{
            radar: {
              indicator: categories.map((c) => ({ name: c.label, max: 100 })),
              radius: "64%", axisName: { fontSize: 10 },
              splitArea: { areaStyle: { color: ["transparent"] } },
            },
            tooltip: { trigger: "item" },
            legend: { top: 0, right: 0 },
            series: [{
              type: "radar", symbolSize: 4,
              data: [
                { name: "This institute", value: categories.map((c) => Number((((inst.categoryScores[c.key] ?? 0) / c.max) * 100).toFixed(1))),
                  areaStyle: { color: "rgba(37,99,235,.20)" }, lineStyle: { color: "#2563eb", width: 2 }, itemStyle: { color: "#2563eb" } },
                { name: "District median", value: categories.map(() => (peerMedian ?? 0)),
                  lineStyle: { color: "#c2cfdd", width: 1.5, type: "dashed" }, itemStyle: { color: "#c2cfdd" } },
              ],
            }],
          }} />
      </div>

      <Card className="print-avoid overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-[13px] font-semibold">Trade-level assessments</h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {instRows.length} row{instRows.length === 1 ? "" : "s"} in the workbook for this institute
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                {["Trade", "Batch", "Capacity", "Registered", "Present", "Absent", "Dropped", "CNIC verified", "Attendance %", "Presence %", "Score"].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instRows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="max-w-[240px] truncate px-3 py-1.5 font-medium">{r.tradeName}</td>
                  <td className="num px-3 py-1.5">{r.batch ?? "—"}</td>
                  <td className="num px-3 py-1.5">{r.approvedCapacity}</td>
                  <td className="num px-3 py-1.5">{r.biometricRegistered}</td>
                  <td className="num px-3 py-1.5">{r.present}</td>
                  <td className="num px-3 py-1.5">{r.absent}</td>
                  <td className="num px-3 py-1.5">{r.droppedOut}</td>
                  <td className="num px-3 py-1.5">{r.cnicVerified}</td>
                  <td className="num px-3 py-1.5 font-semibold">{fmtPct(r.attendanceRate)}</td>
                  <td className="num px-3 py-1.5 text-[var(--text-muted)]">{fmtPct(r.presenceRate)}</td>
                  <td className="num px-3 py-1.5 font-bold">{fmtScore(r.tradeScore, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
    </>
  );
}
