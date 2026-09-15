"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Printer, FileStack, Loader2, AlertTriangle } from "lucide-react";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InstituteOnePager } from "@/components/reports/InstituteOnePager";
import { Letterhead } from "@/components/reports/Letterhead";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
import { meta } from "@/lib/dataset";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS, gradeOf } from "@/config";
import type { AssessmentRow } from "@/types";

/**
 * Bulk report generator.
 *
 * Produces one A4 sheet per institute in a single print job — 184 institutes
 * becomes a 184-page document, each page self-contained and identical in
 * layout to that institute's individual one-pager.
 *
 * The sheets are only mounted once the user asks for them. Rendering every
 * institute's full component matrix eagerly would put roughly 4,000 table rows
 * into the DOM on navigation and stall the page for no reason, since most
 * visits here are to set filters rather than to print immediately.
 */
export default function ReportsPage() {
  const { institutes, rows, filters, hasFilters, reset, isEmpty } = useFilters();
  const [ready, setReady] = useState(false);
  const [building, setBuilding] = useState(false);

  // Any filter change invalidates an already-built batch.
  useEffect(() => { setReady(false); }, [filters]);

  /** Assessment rows grouped by institute, so each sheet gets exactly its own records. */
  const rowsByInstitute = useMemo(() => {
    const m = new Map<number, AssessmentRow[]>();
    for (const r of rows) {
      if (!m.has(r.instituteId)) m.set(r.instituteId, []);
      m.get(r.instituteId)!.push(r);
    }
    return m;
  }, [rows]);

  const ordered = useMemo(() => [...institutes].sort((a, b) => a.rank - b.rank), [institutes]);

  const build = useCallback(async (thenPrint: boolean) => {
    setBuilding(true);
    // Yield twice so the spinner paints before the main thread commits the sheets.
    await new Promise((r) => setTimeout(r, 0));
    setReady(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    setBuilding(false);
    if (thenPrint) window.print();
  }, []);

  const scope = hasFilters ? "the current filter selection" : "every institute in the dataset";

  if (isEmpty) {
    return (
      <>
        <PageHeader page="Bulk_Reports" title="Bulk Reports" printHeader={false} />
        <Card className="screen-only"><EmptyState onClear={reset} /></Card>
      </>
    );
  }

  return (
    <>
      <div className="screen-only">
        <PageHeader
          page="Bulk_Reports"
          title="Bulk Reports"
          description="Generate a one-page verification report for every institute in a single print job."
          printHeader={false}
          printLabel={ready ? `Print ${ordered.length} pages` : "Print"}
        />

        <Card className="mb-4 p-4">
          <Letterhead variant="screen" />
        </Card>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Pages to print" value={fmtInt(ordered.length)} note="one sheet per institute" />
          <Stat label="Assessment rows" value={fmtInt(rows.length)} note="all included across the batch" />
          <Stat label="Trainees registered" value={fmtInt(rows.reduce((s, r) => s + r.biometricRegistered, 0))} note="within this scope" />
          <Stat label="Scope" value={hasFilters ? "Filtered" : "Complete"} note={hasFilters ? "current filters applied" : "no filters active"} />
        </div>

        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                {ready ? `${ordered.length} report pages ready` : `Generate ${ordered.length} report pages`}
              </h2>
              <p className="mt-0.5 max-w-xl text-xs text-[var(--text-muted)]">
                Covers {scope}, ordered by rank. Each page carries the government letterhead, the
                institute&apos;s category profile, every trade row and all 16 score components per trade —
                the same layout as the individual one-pager.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {!ready && (
                <Button variant="primary" onClick={() => build(true)} disabled={building}>
                  {building ? <Loader2 size={14} className="animate-spin" /> : <FileStack size={14} />}
                  {building ? "Building…" : `Generate & print ${ordered.length} pages`}
                </Button>
              )}
              {ready && (
                <>
                  <Button onClick={() => build(false)} disabled={building}><FileStack size={14} /> Rebuild</Button>
                  <Button variant="primary" onClick={() => window.print()}>
                    <Printer size={14} /> Print {ordered.length} pages
                  </Button>
                </>
              )}
            </div>
          </div>

          {ordered.length > 120 && !ready && (
            <div className="mt-3 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/40">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed">
                {ordered.length} pages is a large job. Building takes a few seconds and the browser&apos;s
                print preview will take longer still. To print a smaller run, set a Region or District
                filter first — the batch always follows the active filters.
              </p>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
            In the print dialog choose <strong>Save as PDF</strong> for a single file and enable
            <strong> Background graphics</strong> so the logos and chart fills render. The browser&apos;s own
            date, title and URL stamps are already suppressed by the print stylesheet; page numbers are
            rendered by the report itself, one sheet per institute.
          </p>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-[13px] font-semibold">Pages in this batch</h3>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">In print order, by rank.</p>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--surface-2)]">
                <tr>
                  {["Page", "Rank", "Institute", "District", "Trades", "Registered", "Attendance", "Grade", "Score"].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((i, idx) => {
                  const g = gradeOf(i);
                  return (
                    <tr key={i.instituteId} className="border-b border-[var(--border)] last:border-0">
                      <td className="num px-3 py-1.5 text-[var(--text-muted)]">{idx + 1}</td>
                      <td className="num px-3 py-1.5">{i.rank}</td>
                      <td className="max-w-[300px] truncate px-3 py-1.5 font-medium">{i.instituteName}</td>
                      <td className="px-3 py-1.5">{i.district}</td>
                      <td className="num px-3 py-1.5">{i.assessments}</td>
                      <td className="num px-3 py-1.5">{fmtInt(i.biometricRegistered)}</td>
                      <td className="num px-3 py-1.5">{fmtPct(i.attendanceRate)}</td>
                      <td className="px-3 py-1.5"><Badge color={GRADE_COLORS[g]}>{g}</Badge></td>
                      <td className="num px-3 py-1.5 font-bold">{fmtScore(i.score, 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* The print document itself: one sheet per institute, hidden on screen. */}
      {ready && (
        <div className="onepager-batch">
          {ordered.map((i, idx) => (
            <InstituteOnePager
              key={i.instituteId}
              inst={i}
              rows={rowsByInstitute.get(i.instituteId) ?? []}
              pageNumber={idx + 1}
              pageCount={ordered.length}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="p-3.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="num mt-1.5 text-xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] text-[var(--text-muted)]">{note}</div>
    </Card>
  );
}
