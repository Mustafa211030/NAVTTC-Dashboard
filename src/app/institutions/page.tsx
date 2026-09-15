"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { DataTable } from "@/components/tables/DataTable";
import { Badge, ProgressBar, Card } from "@/components/ui";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { Institute } from "@/types";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS, gradeOf } from "@/config";

export default function InstitutionsPage() {
  const { institutes, reset, isEmpty } = useFilters();
  const router = useRouter();

  /**
   * Institutes the assessor flagged in writing. This is the highest-value field
   * in the workbook and the previous dashboard did not import it at all.
   *
   * It is deliberately separate from the "bottom 15 by score" list, because the
   * two do not agree: one flagged institute scores 65.6, above many institutes
   * graded Good. A score ranking alone would miss it.
   */
  const flagged = useMemo(
    () => institutes.filter((i) => i.assessorNote).sort((a, b) => a.score - b.score),
    [institutes]);

  const top = useMemo(() => institutes.slice(0, 15).reverse(), [institutes]);
  const bottom = useMemo(() => [...institutes].sort((a, b) => a.score - b.score).slice(0, 15).reverse(), [institutes]);

  const columns = useMemo<ColumnDef<Institute, unknown>[]>(() => [
    { id: "rank", header: "#", accessorKey: "rank", cell: (c) => <span className="num text-[var(--text-muted)]">{c.getValue() as number}</span> },
    { id: "name", header: "Institute", accessorKey: "instituteName",
      cell: (c) => <span className="block max-w-[280px] truncate font-medium">{c.getValue() as string}</span> },
    { id: "id", header: "ID", accessorKey: "instituteId", cell: (c) => <span className="num text-[var(--text-muted)]">{c.getValue() as number}</span> },
    { id: "district", header: "District", accessorKey: "district" },
    { id: "region", header: "Region", accessorKey: "region" },
    { id: "package", header: "Package", accessorKey: "package" },
    { id: "trades", header: "Trades", accessorFn: (r) => r.assessments, cell: (c) => <span className="num">{c.getValue() as number}</span> },
    { id: "registered", header: "Registered", accessorKey: "biometricRegistered", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
    { id: "capacity", header: "Capacity", accessorKey: "approvedCapacity", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
    { id: "cnic", header: "CNIC verified", accessorKey: "cnicVerified", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
    { id: "attendance", header: "Attendance %", accessorKey: "attendanceRate", cell: (c) => <span className="num font-semibold">{fmtPct(c.getValue() as number | null)}</span> },
    { id: "presence", header: "Presence %", accessorKey: "presenceRate", cell: (c) => <span className="num text-[var(--text-muted)]">{fmtPct(c.getValue() as number | null)}</span> },
    { id: "dropout", header: "Dropout", accessorKey: "dropoutRate", cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null, 2)}</span> },
    { id: "grade", header: "Grade",
      accessorFn: (r) => gradeOf(r),
      cell: (c) => {
        const g = c.getValue() as string;
        // Grades are score-derived, so an assessor's written flag would otherwise
        // be invisible here — an institute can score "Good" and still be Critical.
        const flagged = Boolean(c.row.original.assessorNote);
        return (
          <span className="flex items-center gap-1">
            <Badge color={GRADE_COLORS[g]}>{g}</Badge>
            {flagged && (
              <span title={c.row.original.assessorNote ?? ""} className="text-red-600">
                <AlertTriangle size={11} />
              </span>
            )}
          </span>
        );
      } },
    { id: "score", header: "Score", accessorKey: "score",
      cell: (c) => {
        const v = c.getValue() as number;
        return (
          <div className="w-24">
            <div className="num mb-0.5 font-bold">{fmtScore(v, 1)}</div>
            <ProgressBar value={v} max={100} color={v >= 80 ? "#10b981" : v >= 60 ? "#f59e0b" : "#dc2626"} />
          </div>
        );
      } },
  ], []);

  const rankOption = (items: Institute[], color: string) => ({
    grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis" as const, axisPointer: { type: "shadow" as const },
      formatter: (p: unknown) => {
        const a = (p as { dataIndex: number }[])[0];
        const i = items[a.dataIndex];
        return `<b>${i.instituteName}</b><br/>${i.district}, ${i.region}<br/>Score <b>${i.score.toFixed(2)}</b> · ${fmtInt(i.biometricRegistered)} trainees`;
      },
    },
    xAxis: { type: "value" as const, max: 100 },
    yAxis: {
      type: "category" as const,
      data: items.map((i) => (i.instituteName.length > 30 ? i.instituteName.slice(0, 29) + "…" : i.instituteName)),
      axisLabel: { fontSize: 9.5, width: 170, overflow: "truncate" as const },
    },
    series: [{
      type: "bar" as const, barMaxWidth: 13,
      itemStyle: { borderRadius: [0, 4, 4, 0], color },
      label: { show: true, position: "right" as const, fontSize: 9.5, formatter: (p: unknown) => Number((p as { value: number }).value).toFixed(1) },
      data: items.map((i) => Number(i.score.toFixed(2))),
    }],
  });

  return (
    <>
      <PageHeader page="Institutions" title="Institution Analysis"
        description="All training provider institutes ranked by mean trade score. Click any row for the full assessment breakdown." />

      {!isEmpty && (
        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          <ChartCard title="Top 15 institutes" subtitle="Highest mean trade score" height={400}
            methodology={<><strong>Top performers</strong><br />Institutes ranked by the mean of their trade scores. Reflects the current filters, so filtering by trade re-ranks on that trade alone.</>}
            data={[...top].reverse().map((i) => ({ label: i.instituteName, value: i.score.toFixed(2) }))}
            option={rankOption(top, "#10b981")} />
          <ChartCard title="Bottom 15 institutes" subtitle="Requiring attention" height={400}
            methodology={<><strong>Institutions requiring attention</strong><br />Lowest mean trade score under the current filters. Institutes graded Critical or Non-Functional in the workbook carry an assessor note on their profile page.</>}
            data={[...bottom].reverse().map((i) => ({ label: i.instituteName, value: i.score.toFixed(2) }))}
            option={rankOption(bottom, "#dc2626")} />
        </div>
      )}

      {flagged.length > 0 && (
        <Card className="print-avoid mb-4 overflow-hidden border-l-4 border-l-red-500">
          <div className="flex items-start gap-2 border-b border-[var(--border)] px-4 py-3">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <h3 className="text-[13px] font-semibold">Flagged by assessors</h3>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                {flagged.length} institute{flagged.length === 1 ? "" : "s"} carry a written note in the workbook&apos;s
                Grading column. These are not simply the lowest scorers — read the note, not the number.
              </p>
            </div>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {flagged.map((i) => (
              <Link key={i.instituteId} href={`/institutions/${i.instituteId}`}
                className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-3)]">
                <span className="num w-11 shrink-0 pt-0.5 text-right text-xs font-bold">{fmtScore(i.score, 1)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium leading-tight">{i.instituteName}</div>
                  <div className="truncate text-[10px] text-[var(--text-muted)]">{i.district}, {i.region}</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-red-700 dark:text-red-300">{i.assessorNote}</p>
                </div>
                <Badge color={GRADE_COLORS[gradeOf(i)]}>{gradeOf(i)}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <DataTable<Institute>
        data={institutes} columns={columns} pageSize={25} storageKey="institutions"
        initialHidden={["package", "capacity", "presence"]}
        emptyAction={reset}
        onRowClick={(r) => router.push(`/institutions/${r.instituteId}`)}
      />
    </>
  );
}
