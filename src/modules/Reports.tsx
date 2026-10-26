"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Printer, FileStack, Loader2, AlertTriangle, Download, X, CheckCircle2 } from "lucide-react";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { InstituteOnePager } from "@/components/reports/InstituteOnePager";
import { Letterhead } from "@/components/reports/Letterhead";
import { Card, Button, Badge, EmptyState } from "@/components/ui";
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
export function ReportsModule() {
  const { institutes, rows, filters, hasFilters, reset, isEmpty, data, scope } = useFilters();
  const [ready, setReady] = useState(false);
  const [building, setBuilding] = useState(false);

  const [pdf, setPdf] = useState<{ state: "idle" | "building" | "done" | "error"; done: number; total: number; msg?: string; ms?: number; mb?: number }>({ state: "idle", done: 0, total: 0 });
  const abort = useRef<AbortController | null>(null);

  // Any filter change invalidates an already-built batch.
  useEffect(() => { setReady(false); setPdf({ state: "idle", done: 0, total: 0 }); abort.current?.abort(); }, [filters]);
  useEffect(() => () => abort.current?.abort(), []);

  /** Assessment rows grouped by institute, so each sheet gets exactly its own records. */
  const rowsByInstitute = useMemo(() => {
    const m = new Map<string, AssessmentRow[]>();
    for (const r of rows) {
      const k = `${r.p}|${r.instituteKey}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [rows]);

  // Grouped by programme (portfolio order), then by rank within each programme.
  const ordered = useMemo(() => [...institutes].sort((a, b) =>
    (data.programBySlug.get(a.p)!.order - data.programBySlug.get(b.p)!.order) || ((b.score ?? -1) - (a.score ?? -1))), [institutes, data]);

  const build = useCallback(async (thenPrint: boolean) => {
    setBuilding(true);
    // Yield twice so the spinner paints before the main thread commits the sheets.
    await new Promise((r) => setTimeout(r, 0));
    setReady(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    setBuilding(false);
    if (thenPrint) window.print();
  }, []);

  /**
   * One PDF file for the whole batch, drawn page by page without building
   * the sheets in the DOM. See lib/report-pdf.ts for why printing 600+
   * one-pagers through the browser runs out of memory.
   */
  const downloadPdf = useCallback(async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const t0 = performance.now();
    setPdf({ state: "building", done: 0, total: ordered.length });
    try {
      const { buildReportsPdf, saveBlob } = await import("@/lib/report-pdf");
      const items = ordered.map((i) => ({ inst: i, program: data.programBySlug.get(i.p)!, rows: rowsByInstitute.get(`${i.p}|${i.instituteKey}`) ?? [], standing: data.standings.get(`${i.p}|${i.instituteKey}`) }));
      const blob = await buildReportsPdf(items, { signal: ctrl.signal, onProgress: (done, total) => setPdf((p) => ({ ...p, done, total })) });
      const stamp = new Date().toISOString().slice(0, 10);
      const who = (scope.program?.short ?? "All-Programmes").replace(/[^\w-]+/g, "-");
      saveBlob(blob, `NAVTTC_Institute_Reports_${who}${hasFilters ? "_filtered" : ""}_${ordered.length}-institutes_${stamp}.pdf`);
      setPdf({ state: "done", done: ordered.length, total: ordered.length, ms: performance.now() - t0, mb: blob.size / 1048576 });
    } catch (e) {
      if ((e as Error).name === "AbortError") setPdf({ state: "idle", done: 0, total: 0 });
      else setPdf({ state: "error", done: 0, total: 0, msg: String((e as Error).message ?? e) });
    }
  }, [ordered, data, rowsByInstitute, scope.program, hasFilters]);

  const scopeText = `${hasFilters ? "the current filter selection" : "every institute"} in ${scope.label}`;

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
          <Stat label="Trainees enrolled" value={fmtInt(rows.reduce((s, r) => s + r.enrolled, 0))} note="within this scope" />
          <Stat label="Scope" value={hasFilters ? "Filtered" : "Complete"} note={hasFilters ? "current filters applied" : "no filters active"} />
        </div>

        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">
                {ready ? `${ordered.length} report pages ready` : `Generate ${ordered.length} report pages`}
              </h2>
              <p className="mt-0.5 max-w-xl text-xs text-[var(--text-muted)]">
                Covers {scopeText}, ordered by {scope.mode === "portfolio" ? "programme, then score" : "rank"}. Each page carries the government letterhead, the
                institute&apos;s category profile, every trade row and every rubric criterion per trade —
                the same layout as the individual one-pager.
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              {pdf.state === "building" ? (
                <Button onClick={() => abort.current?.abort()}><X size={14} /> Cancel</Button>
              ) : (
                <Button variant="primary" onClick={downloadPdf}>
                  <Download size={14} /> Download PDF · {ordered.length} institute{ordered.length === 1 ? "" : "s"}
                </Button>
              )}
              {!ready ? (
                <Button onClick={() => build(true)} disabled={building || pdf.state === "building"} title="Builds every sheet in the page and opens the print dialog — fine for small batches">
                  {building ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                  {building ? "Building…" : "Print instead"}
                </Button>
              ) : (
                <>
                  <Button onClick={() => build(false)} disabled={building}><FileStack size={14} /> Rebuild</Button>
                  <Button onClick={() => window.print()}><Printer size={14} /> Print {ordered.length} pages</Button>
                </>
              )}
            </div>
          </div>

          {pdf.state === "building" && (
            <div className="mt-3" role="status" aria-live="polite">
              <div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
                <span>Writing PDF… institute {pdf.done} of {pdf.total}</span>
                <span className="num">{pdf.total ? Math.round((pdf.done / pdf.total) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div className="bg-accent-grad h-full origin-left rounded-full transition-transform duration-300" style={{ transform: `scaleX(${pdf.total ? pdf.done / pdf.total : 0})` }} />
              </div>
            </div>
          )}
          {pdf.state === "done" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={14} /> Downloaded {pdf.total} institute reports as one PDF ({pdf.mb?.toFixed(1)} MB, {((pdf.ms ?? 0) / 1000).toFixed(1)} s). Check your Downloads folder.
            </p>
          )}
          {pdf.state === "error" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600"><AlertTriangle size={14} /> Could not create the PDF: {pdf.msg}</p>
          )}

          {ordered.length > 80 && !ready && pdf.state !== "building" && (
            <div className="mt-3 flex gap-2 rounded-lg border border-amber-300/70 bg-amber-50/70 p-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-xs leading-relaxed">
                For {ordered.length} institutes use <strong>Download PDF</strong>. <em>Print instead</em> puts every sheet into the page
                at once and the browser&apos;s print preview needs several GB of memory for a batch this size, which is why large
                print jobs stall or fail on most PCs.
              </p>
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
            <strong>Download PDF</strong> writes one file with a sheet per institute (a sheet with many trades continues onto a
            second page) and numbers the pages itself; it never loads the sheets into the page, so memory stays flat.
            <strong> Print instead</strong> uses the browser&apos;s print dialog — choose <em>Save as PDF</em> and enable
            <em> Background graphics</em>.
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
                  {["Page", "Programme", "Rank", "Institute", "District", "Trades", "Enrolled", "Attendance", "Grade", "Score"].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((i, idx) => {
                  const g = gradeOf(i);
                  return (
                    <tr key={`${i.p}-${i.instituteKey}`} className="border-b border-[var(--border)] last:border-0">
                      <td className="num px-3 py-1.5 text-[var(--text-muted)]">{idx + 1}</td>
                      <td className="px-3 py-1.5 text-[11px] font-semibold" style={{ color: data.programBySlug.get(i.p)?.color }}>{data.programBySlug.get(i.p)?.short}</td>
                      <td className="num px-3 py-1.5">{(() => { const st = data.standings.get(`${i.p}|${i.instituteKey}`); return st?.rank != null ? `${st.tiedWith ? "=" : ""}${st.rank}` : "—"; })()}</td>
                      <td className="max-w-[300px] truncate px-3 py-1.5 font-medium">{i.instituteName}</td>
                      <td className="px-3 py-1.5">{i.district}</td>
                      <td className="num px-3 py-1.5">{i.assessments}</td>
                      <td className="num px-3 py-1.5">{fmtInt(i.enrolled)}</td>
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
              key={`${i.p}-${i.instituteKey}`}
              inst={i}
              program={data.programBySlug.get(i.p)!}
              rows={rowsByInstitute.get(`${i.p}|${i.instituteKey}`) ?? []}
              standing={data.standings.get(`${i.p}|${i.instituteKey}`)}
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
