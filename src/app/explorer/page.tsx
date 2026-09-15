"use client";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable } from "@/components/tables/DataTable";
import { Card, Badge } from "@/components/ui";
import { components } from "@/lib/dataset";
import type { AssessmentRow } from "@/types";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS } from "@/config";
import { flattenRow } from "@/lib/export";

export default function ExplorerPage() {
  const { rows, reset, gradeByInstitute } = useFilters();
  const [detail, setDetail] = useState<AssessmentRow | null>(null);

  const columns = useMemo<ColumnDef<AssessmentRow, unknown>[]>(() => {
    const base: ColumnDef<AssessmentRow, unknown>[] = [
      { id: "excelRow", header: "Excel row", accessorKey: "excelRow", cell: (c) => <span className="num text-[var(--text-muted)]">{c.getValue() as number}</span> },
      { id: "instituteName", header: "Institute", accessorKey: "instituteName", cell: (c) => <span className="block max-w-[240px] truncate font-medium">{c.getValue() as string}</span> },
      { id: "instituteId", header: "Inst. ID", accessorKey: "instituteId", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "tradeName", header: "Trade", accessorKey: "tradeName", cell: (c) => <span className="block max-w-[220px] truncate">{c.getValue() as string}</span> },
      { id: "tradeCode", header: "Trade code", accessorKey: "tradeCode", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "batch", header: "Batch", accessorKey: "batch", cell: (c) => <span className="num">{(c.getValue() as number | null) ?? "—"}</span> },
      { id: "region", header: "Region", accessorKey: "region" },
      { id: "district", header: "District", accessorKey: "district" },
      { id: "package", header: "Package", accessorKey: "package" },
      { id: "programName", header: "Programme", accessorKey: "programName", cell: (c) => (c.getValue() as string | null) ?? <span className="text-[var(--text-muted)]">— blank</span> },
      { id: "approvedCapacity", header: "Capacity", accessorKey: "approvedCapacity", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
      { id: "biometricRegistered", header: "Registered", accessorKey: "biometricRegistered", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
      { id: "present", header: "Present", accessorKey: "present", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "absent", header: "Absent", accessorKey: "absent", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "droppedOut", header: "Dropped", accessorKey: "droppedOut", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "cnicVerified", header: "CNIC verified", accessorKey: "cnicVerified", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "attendanceRate", header: "Attendance % (CNIC/Cap)", accessorKey: "attendanceRate", cell: (c) => <span className="num font-semibold">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "presenceRate", header: "Presence % (Pres/Reg)", accessorKey: "presenceRate", cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "verificationRateReported", header: "Col R (reported)", accessorKey: "verificationRateReported", cell: (c) => <span className="num text-[var(--text-muted)]">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "tradeScore", header: "Score", accessorKey: "tradeScore", cell: (c) => <span className="num font-bold">{fmtScore(c.getValue() as number, 1)}</span> },
      { id: "tradeScoreStored", header: "Score (in Excel)", accessorKey: "tradeScoreStored",
        cell: (c) => {
          const stored = c.getValue() as number | null;
          const rec = c.row.original.tradeScore;
          const diff = stored !== null && Math.abs(stored - rec) > 0.001;
          return <span className={`num ${diff ? "font-semibold text-amber-600" : "text-[var(--text-muted)]"}`}>{fmtScore(stored, 1)}{diff ? " ⚠" : ""}</span>;
        } },
    ];
    for (const comp of components) {
      base.push({
        id: `c_${comp.key}`, header: comp.label,
        accessorFn: (r) => r.components[comp.key],
        cell: (c) => <span className="num">{(c.getValue() as number).toFixed(2)}</span>,
      });
    }
    return base;
  }, []);

  return (
    <>
      <PageHeader page="Data_Explorer" title="Data Explorer"
        description="Every assessment record, every column. Sort, search, hide columns and export exactly what you see." />

      <DataTable<AssessmentRow>
        data={rows} columns={columns} pageSize={25} storageKey="explorer"
        emptyAction={reset}
        onRowClick={setDetail}
        initialHidden={[
          "package", "programName", "tradeCode", "verificationRateReported", "tradeScoreStored",
          ...components.map((c) => `c_${c.key}`),
        ]}
      />

      {detail && <RecordDrawer row={detail} grade={gradeByInstitute.get(detail.instituteId)} onClose={() => setDetail(null)} />}
    </>
  );
}

/** Full-record drawer (§31) — nothing is truncated. */
function RecordDrawer({ row, grade, onClose }: { row: AssessmentRow; grade?: string; onClose: () => void }) {
  const flat = flattenRow(row);
  return (
    <div className="no-print fixed inset-0 z-[80] flex justify-end bg-black/45" onClick={onClose}>
      <aside role="dialog" aria-label="Record detail"
        className="flex h-full w-full max-w-lg flex-col bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{row.instituteName}</h2>
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              {row.tradeName} · Batch {row.batch ?? "—"} · Excel row {row.excelRow}
            </p>
          </div>
          {grade && <Badge color={GRADE_COLORS[grade]}>{grade}</Badge>}
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-[var(--surface-3)]"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {Object.entries(flat).map(([k, v]) => (
                <tr key={k} className="border-b border-[var(--border)] last:border-0">
                  <td className="w-1/2 px-4 py-1.5 text-[var(--text-muted)]">{k}</td>
                  <td className="num px-4 py-1.5 text-right font-medium">
                    {v === null || v === "" ? <span className="text-[var(--text-muted)]">—</span>
                      : typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4)) : String(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}
