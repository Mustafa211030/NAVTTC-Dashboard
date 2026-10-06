"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { X, ExternalLink } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable } from "@/components/tables/DataTable";
import { Badge } from "@/components/ui";
import type { AssessmentRow } from "@/types";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS, scoreColor } from "@/config";
import { flattenRow } from "@/lib/export";
import { instKey } from "@/lib/filters";
import { instituteHref, programBase } from "@/lib/portfolio";

export function ExplorerModule() {
  const { rows, reset, data, scope } = useDash();
  const [detail, setDetail] = useState<AssessmentRow | null>(null);
  const program = scope.program;

  const columns = useMemo<ColumnDef<AssessmentRow, unknown>[]>(() => {
    const base: ColumnDef<AssessmentRow, unknown>[] = [];
    if (!program) base.push({
      id: "program", header: "Programme", accessorFn: (r) => data.programBySlug.get(r.p)?.short ?? r.p,
      cell: (c) => { const p = data.programBySlug.get(c.row.original.p)!; return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: p.color }}><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.short}</span>; },
    });
    base.push(
      { id: "excelRow", header: "Excel row", accessorKey: "excelRow", cell: (c) => <span className="num text-[var(--text-muted)]">{c.getValue() as number}</span> },
      { id: "instituteName", header: "Institute", accessorKey: "instituteName", cell: (c) => <span className="block max-w-[240px] truncate font-medium">{c.getValue() as string}</span> },
      { id: "instituteId", header: "Inst. ID", accessorKey: "instituteId", cell: (c) => <span className="num">{(c.getValue() as number | null) ?? "—"}</span> },
      { id: "tradeName", header: "Trade", accessorKey: "tradeName", cell: (c) => <span className="block max-w-[220px] truncate">{c.getValue() as string}</span> },
      { id: "tradeCode", header: "Trade code", accessorKey: "tradeCode", cell: (c) => <span className="num">{(c.getValue() as number | null) ?? "—"}</span> },
      { id: "tradeCategory", header: "Category", accessorKey: "tradeCategory" },
      { id: "tradeSector", header: "Sector", accessorKey: "tradeSector" },
      { id: "durationMonths", header: "Months", accessorKey: "durationMonths", cell: (c) => <span className="num">{(c.getValue() as number | null) ?? "—"}</span> },
      { id: "batch", header: "Batch", accessorKey: "batch", cell: (c) => <span className="num">{(c.getValue() as number | null) ?? "—"}</span> },
      { id: "region", header: "Region", accessorKey: "region" },
      { id: "district", header: "District", accessorKey: "district" },
      { id: "division", header: "Division", accessorKey: "division" },
      { id: "package", header: "Package", accessorKey: "package" },
      { id: "visitDate", header: "Visited", accessorKey: "visitDate", cell: (c) => <span className="num">{(c.getValue() as string | null) ?? "—"}</span> },
      { id: "approvedCapacity", header: "Capacity", accessorKey: "approvedCapacity", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
      { id: "enrolled", header: program?.enrolledLabel ?? "Enrolled", accessorKey: "enrolled", cell: (c) => <span className="num">{fmtInt(c.getValue() as number)}</span> },
      { id: "present", header: "Present", accessorKey: "present", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "absent", header: "Absent", accessorKey: "absent", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "droppedOut", header: "Dropped", accessorKey: "droppedOut", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "cnicVerified", header: "CNIC verified", accessorKey: "cnicVerified", cell: (c) => <span className="num">{c.getValue() as number}</span> },
      { id: "attendanceRate", header: "Attendance %", accessorKey: "attendanceRate", cell: (c) => <span className="num font-semibold">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "presenceRate", header: "Presence %", accessorKey: "presenceRate", cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "verificationRate", header: "Verified % seats", accessorKey: "verificationRate", cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "attendanceReported", header: "Attendance (stored)", accessorKey: "attendanceReported", cell: (c) => <span className="num text-[var(--text-muted)]">{fmtPct(c.getValue() as number | null)}</span> },
      { id: "release", header: "Release", accessorKey: "release" },
      {
        id: "tradeScore", header: "Score", accessorFn: (r) => r.tradeScore ?? -1,
        cell: (c) => <span className="num font-bold" style={{ color: scoreColor(c.row.original.tradeScore) }}>{fmtScore(c.row.original.tradeScore, 1)}</span>,
      },
      {
        id: "tradeScoreStored", header: "Score (stored)", accessorKey: "tradeScoreStored",
        cell: (c) => {
          const stored = c.getValue() as number | null; const rec = c.row.original.tradeScore;
          const diff = stored !== null && rec !== null && Math.abs(stored - rec) > 0.01;
          return <span className={`num ${diff ? "font-semibold text-amber-600" : "text-[var(--text-muted)]"}`}>{fmtScore(stored, 1)}{diff ? " ⚠" : ""}</span>;
        },
      },
    );
    if (program) {
      for (const comp of program.rubric.components) base.push({
        id: `c_${comp.key}`, header: `${comp.label} (${comp.max})`, accessorFn: (r) => r.components[comp.key],
        cell: (c) => <span className="num">{c.row.original.scored ? (c.getValue() as number).toFixed(2) : "—"}</span>,
      });
    } else {
      for (const cat of data.raw.categories) base.push({
        id: `k_${cat.key}`, header: `${cat.short} %`, accessorFn: (r) => r.categoryPct[cat.key],
        cell: (c) => <span className="num">{fmtPct(c.getValue() as number | null, 0)}</span>,
      });
    }
    return base;
  }, [program, data]);

  const hidden = [
    "package", "tradeCode", "tradeCategory", "tradeSector", "durationMonths", "division", "attendanceReported", "tradeScoreStored", "release", "visitDate", "verificationRate",
    ...(program ? program.rubric.components.map((c) => `c_${c.key}`) : data.raw.categories.map((c) => `k_${c.key}`)),
  ];

  return (
    <>
      <PageHeader page="Data_Explorer" title="Data Explorer"
        description={`Every assessment record${program ? ", every column of the workbook" : " from every programme"}. Sort, search, show hidden columns and export exactly what you see.`} />
      <DataTable<AssessmentRow> data={rows} columns={columns} pageSize={25} storageKey={`explorer-${program?.slug ?? "all"}`} searchable
        emptyAction={reset} onRowClick={setDetail} initialHidden={hidden} />
      {detail && <RecordDrawer row={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function RecordDrawer({ row, onClose }: { row: AssessmentRow; onClose: () => void }) {
  const { data } = useDash();
  const flat = flattenRow(row, data.programBySlug);
  const inst = data.instituteByKey.get(instKey(row.p, row.instituteKey));
  const p = data.programBySlug.get(row.p)!;
  return (
    <div className="no-print fixed inset-0 z-[80] flex justify-end bg-black/45" onClick={onClose}>
      <aside role="dialog" aria-label="Record detail" className="rise flex h-full w-full max-w-lg flex-col bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-1" style={{ background: p.color }} />
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: p.color }}>{p.name}</div>
            <h2 className="truncate text-sm font-bold">{row.instituteName}</h2>
            <p className="truncate text-[11px] text-[var(--text-muted)]">{row.tradeName} · Batch {row.batch ?? "—"} · Excel row {row.excelRow}</p>
            {inst && <Link href={instituteHref(programBase(row.p), inst)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline">Open institute profile <ExternalLink size={11} /></Link>}
          </div>
          {inst && <Badge color={GRADE_COLORS[inst.grade]}>{inst.grade}</Badge>}
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-[var(--surface-3)]"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {Object.entries(flat).map(([k, v]) => (
                <tr key={k} className="border-b border-[var(--border)] last:border-0">
                  <td className="w-1/2 px-4 py-1.5 align-top text-[var(--text-muted)]">{k}</td>
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
