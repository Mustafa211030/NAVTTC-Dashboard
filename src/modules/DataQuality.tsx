"use client";
import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { AlertTriangle, AlertCircle, Info, Wrench, CheckCircle2, ClipboardList } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { SectionTitle } from "@/components/dashboard/widgets";
import { Card, Button, Seg } from "@/components/ui";
import { fmtInt, SEVERITY_COLORS, SEVERITY_TEXT, truncate } from "@/config";
import type { QualityIssue } from "@/types";

const CODE_LABELS: Record<string, { label: string; why: string }> = {
  ATTENDANCE_MISMATCH: { label: "Present + Absent ≠ Enrolled", why: "The three headcount columns do not reconcile, so there is no single consistent enrolment model on these rows." },
  VERIFIED_EXCEEDS_PRESENT: { label: "CNIC Verified exceeds Present", why: "More trainees were CNIC-verified than were present on the visit day. One of the two counts is wrong." },
  OVER_CAPACITY: { label: "Enrolled exceeds Approved Capacity", why: "More trainees enrolled than the sanctioned seat count allows." },
  ZERO_ENROLLED: { label: "No trainees enrolled", why: "A trade was approved but nobody enrolled. Real signal, not corruption — kept in the dataset." },
  ZERO_CAPACITY: { label: "Approved Capacity is zero", why: "Every rate with capacity as denominator returns blank on these rows rather than dividing by zero." },
  BATCH_ZERO: { label: "Batch recorded as 0", why: "Zero is not a valid batch number; treated as missing." },
  BATCH_UNPARSED: { label: "Unrecognised batch value", why: "The batch cell holds something that is not a batch number." },
  COMPONENT_OVER_MAX: { label: "Score exceeds its stated maximum", why: "A criterion scored above the ceiling printed in its own column header — most likely a value typed into the wrong column." },
  COMPONENT_MISSING: { label: "Score component missing", why: "Treated as 0 for the sum, and flagged rather than silently dropped." },
  COMPONENT_NEGATIVE: { label: "Negative score", why: "Scores cannot be negative." },
  NON_NUMERIC: { label: "Non-numeric value in a numeric column", why: "Text where a number was expected." },
  TRADE_NAME_VARIANTS: { label: "Trade spelled multiple ways", why: "The same trade appears under several spellings. Aggregation keys on the code or normalised name; the most common spelling is displayed." },
  TOTAL_SCORE_MISMATCH: { label: "Stored Total Score disagrees with its trade rows", why: "The workbook's Total Score does not equal the mean of the institute's trade scores. The dashboard recomputes it." },
  TRADE_SCORE_MISMATCH: { label: "Stored Trade Score ≠ sum of criteria", why: "The stored Trade Wise Score does not equal the sum of its own criteria. The dashboard recomputes it." },
  AMBIGUOUS_INSTITUTE: { label: "Institute ID carries more than one name", why: "Institute identity is ambiguous, which affects ranking and the institute profile." },
  GRADE_MISMATCH: { label: "Workbook grade ≠ score band", why: "The Grading cell contradicts the official band for the institute's own score." },
  ATTENDANCE_PCT_MISMATCH: { label: "Stored Attendance % ≠ programme rule", why: "The stored Attendance % cell does not reproduce the programme's attendance formula; it is recomputed." },
  SCORE_OVER_100: { label: "Trade score above 100", why: "A criterion is over its own ceiling, pushing the row total past the 100-point maximum." },
  SPACER_ROW: { label: "Empty row with a stray value", why: "Excluded from all totals so it cannot add a phantom zero-score trade." },
  UNSCORED_ROW: { label: "Trade row without scores", why: "Kept in headcounts, excluded from score averages (e.g. a closed institute)." },
  NO_INSTITUTE_ID: { label: "Institute ID not recorded", why: "The institute is identified by name instead; cross-programme matching falls back to the name." },
  INSTITUTE_MULTI_DISTRICT: { label: "Institute in several districts", why: "An institute's trade rows carry different districts." },
  UNMAPPED_SCORE_COLUMN: { label: "Score column not in rubric", why: "A score column was not recognised by the programme's rubric and was ignored." },
  RUBRIC_NOT_100: { label: "Rubric does not total 100", why: "The configured criteria maxima do not add up to 100." },
};
const ICONS = { high: AlertTriangle, medium: AlertCircle, low: Info };

type Tagged = QualityIssue & { p: string };

export function DataQualityModule() {
  const { data, scope } = useDash();
  const programs = scope.program ? [scope.program] : data.programs;
  const [severity, setSeverity] = useState<"all" | "high" | "medium" | "low">("all");
  const [code, setCode] = useState<string | null>(null);
  const [prog, setProg] = useState<string>("all");

  const issues = useMemo<Tagged[]>(() => programs.flatMap((p) => p.quality.issues.map((i) => ({ ...i, p: p.slug }))), [programs]);
  const shown = useMemo(() => issues.filter((i) =>
    (severity === "all" || i.severity === severity) && (code === null || i.code === code) && (prog === "all" || i.p === prog)).slice(0, 500),
    [issues, severity, code, prog]);
  const codeRows = useMemo(() => {
    const m = new Map<string, { n: number; severity: QualityIssue["severity"] }>();
    for (const i of issues) { const c = m.get(i.code) ?? { n: 0, severity: i.severity }; c.n++; m.set(i.code, c); }
    return [...m.entries()].map(([c, v]) => ({ code: c, ...v })).sort((a, b) => b.n - a.n);
  }, [issues]);

  const totals = programs.reduce((acc, p) => {
    const t = p.quality.totals;
    acc.rows += t.rows; acc.cells += t.cells; acc.filled += t.filledCells; acc.repairs += t.repairs; acc.changes += t.changeLog;
    acc.high += p.quality.bySeverity.high ?? 0; acc.medium += p.quality.bySeverity.medium ?? 0; acc.low += p.quality.bySeverity.low ?? 0;
    return acc;
  }, { rows: 0, cells: 0, filled: 0, repairs: 0, changes: 0, high: 0, medium: 0, low: 0 });
  const completeness = totals.cells ? (totals.filled / totals.cells) * 100 : 100;
  const repairs = programs.flatMap((p) => p.quality.repairs.map((r) => ({ ...r, p: p.slug })));
  const changes = programs.flatMap((p) => p.quality.changeLog.map((c) => ({ ...c, p: p.slug })));
  const [clProg, setClProg] = useState<string>("all");

  const codeOption: EChartsOption = {
    grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: [...codeRows].reverse().map((c) => truncate(CODE_LABELS[c.code]?.label ?? c.code, 34)), axisLabel: { fontSize: 9.5 } },
    series: [{
      type: "bar", barMaxWidth: 13, label: { show: true, position: "right", fontSize: 9.5, fontWeight: 600 },
      data: [...codeRows].reverse().map((c) => ({ value: c.n, itemStyle: { borderRadius: [0, 3, 3, 0], color: SEVERITY_COLORS[c.severity] } })),
    }],
  } as EChartsOption;

  const healthOption: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: programs.map((p) => p.short), axisLabel: { fontSize: 10, interval: 0 } },
    yAxis: { type: "value" },
    series: (["high", "medium", "low"] as const).map((s) => ({
      name: s, type: "bar", stack: "q", barMaxWidth: 40, itemStyle: { color: SEVERITY_COLORS[s] },
      label: { show: true, fontSize: 9, color: "#fff", formatter: (p: unknown) => ((p as { value: number }).value >= 3 ? (p as { value: number }).value.toFixed(0) : "") },
      data: programs.map((p) => Number((((p.quality.bySeverity[s] ?? 0) / Math.max(p.rowCount, 1)) * 100).toFixed(1))),
    })),
  } as EChartsOption;

  return (
    <>
      <PageHeader page="Data_Quality" title="Data Quality Center"
        description="Every defect found in the source workbooks. Nothing is deleted or silently corrected — problems are reported so they can be fixed at source." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Records" value={fmtInt(totals.rows)} sub={`${programs.length} workbook${programs.length === 1 ? "" : "s"}`} icon={CheckCircle2} color="#2563eb" />
        <Stat label="Completeness" value={completeness.toFixed(2) + "%"} sub={`${fmtInt(totals.filled)} of ${fmtInt(totals.cells)} template cells`} icon={CheckCircle2} color={completeness > 95 ? "#10b981" : "#d97706"} />
        <Stat label="Workbook change log" value={fmtInt(totals.changes)} sub="corrections documented by the author" icon={ClipboardList} color="#0891b2" />
        <Stat label="High severity" value={fmtInt(totals.high)} sub="distorts headline figures" icon={AlertTriangle} color="#dc2626" />
        <Stat label="Medium" value={fmtInt(totals.medium)} sub="affects a module" icon={AlertCircle} color="#d97706" />
        <Stat label="Low / repairs" value={`${fmtInt(totals.low)} / ${totals.repairs}`} sub="cosmetic · auto-repaired cells" icon={Wrench} color="#7c3aed" />
      </div>

      {!scope.program && (
        <Card className="mb-4 overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3"><h3 className="text-[13px] font-semibold">Workbook health by programme</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-2)]"><tr>{["Programme", "Rows", "Institutes", "Completeness", "High", "Medium", "Low", "Repairs", "Change log", "Rubric"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>)}</tr></thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.slug} className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-3)]" onClick={() => setProg(prog === p.slug ? "all" : p.slug)}>
                    <td className="px-3 py-1.5 font-semibold"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</td>
                    <td className="num px-3 py-1.5">{fmtInt(p.rowCount)}</td>
                    <td className="num px-3 py-1.5">{fmtInt(p.instituteCount)}</td>
                    <td className="num px-3 py-1.5">{(p.quality.totals.completeness * 100).toFixed(1)}%</td>
                    <td className="num px-3 py-1.5" style={{ color: SEVERITY_TEXT.high }}>{p.quality.bySeverity.high ?? 0}</td>
                    <td className="num px-3 py-1.5" style={{ color: SEVERITY_TEXT.medium }}>{p.quality.bySeverity.medium ?? 0}</td>
                    <td className="num px-3 py-1.5" style={{ color: SEVERITY_TEXT.low }}>{p.quality.bySeverity.low ?? 0}</td>
                    <td className="num px-3 py-1.5">{p.quality.totals.repairs}</td>
                    <td className="num px-3 py-1.5">{p.quality.totals.changeLog}</td>
                    <td className="px-3 py-1.5 text-[var(--text-muted)]">{p.rubric.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Issues by type" height={Math.max(260, codeRows.length * 22 + 20)} option={codeOption}
          methodology={<>Every validation rule that fired during ingest, counted. Generated by <code>scripts/build-data.mjs</code> on each build.</>}
          onEvent={{ type: "click", handler: (p) => { const c = [...codeRows].reverse()[(p as { dataIndex: number }).dataIndex]; setCode(code === c.code ? null : c.code); } }} clickHint="click to filter register"
          data={codeRows.map((c) => ({ label: CODE_LABELS[c.code]?.label ?? c.code, value: c.n }))} />
        {!scope.program ? (
          <ChartCard title="Issue density by programme" subtitle="Issues per 100 rows, by severity" height={Math.max(260, codeRows.length * 22 + 20)} option={healthOption}
            onEvent={{ type: "click", handler: (p) => { const s = programs[(p as { dataIndex: number }).dataIndex].slug; setProg(prog === s ? "all" : s); } }} clickHint="click to filter register" />
        ) : (
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-[13px] font-semibold">Repairs applied at ingest</h3>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">The only value changes the pipeline makes. Every other defect is reported, not corrected.</p>
            </div>
            {repairs.length === 0 ? <p className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">No repairs were needed for this workbook.</p> : (
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-2)]"><tr>{["Excel row", "Field", "In workbook", "Used", "Reason"].map((h) => <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>)}</tr></thead>
                <tbody>{repairs.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    <td className="num px-3 py-2">{r.row}</td><td className="px-3 py-2 font-medium">{r.field}</td>
                    <td className="px-3 py-2"><code className="text-red-700 dark:text-red-300">{r.from}</code></td>
                    <td className="num px-3 py-2"><code className="text-emerald-700 dark:text-emerald-300">{r.to}</code></td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{r.reason}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>

      <Card className="print-avoid overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-[13px] font-semibold">Issue register</h3>
          <div className="no-print ml-auto flex flex-wrap items-center gap-1.5">
            {!scope.program && (
              <select value={prog} onChange={(e) => setProg(e.target.value)} aria-label="Programme" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px]">
                <option value="all">All programmes</option>
                {programs.map((p) => <option key={p.slug} value={p.slug}>{p.short}</option>)}
              </select>
            )}
            <Seg value={severity} onChange={setSeverity} label="Severity" options={(["all", "high", "medium", "low"] as const).map((s) => ({ value: s, label: s }))} />
            {code && <Button size="sm" variant="danger" onClick={() => setCode(null)}>Clear type</Button>}
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-1.5 border-b border-[var(--border)] px-4 py-2">
          {codeRows.map((c) => (
            <button key={c.code} onClick={() => setCode(code === c.code ? null : c.code)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity ${code === c.code ? "" : "opacity-55 hover:opacity-90"}`}
              style={{ background: SEVERITY_COLORS[c.severity] + "1f", color: SEVERITY_TEXT[c.severity] }}>
              {CODE_LABELS[c.code]?.label ?? c.code} · {c.n}
            </button>
          ))}
        </div>
        {code && CODE_LABELS[code] && <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-[11px] leading-relaxed"><strong>Why this matters.</strong> {CODE_LABELS[code].why}</p>}
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--surface-2)]">
              <tr>{[...(scope.program ? [] : ["Programme"]), "Severity", "Issue", "Excel row", "Detail"].map((h) => <th key={h} className="border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((iss, i) => {
                const Icon = ICONS[iss.severity];
                const p = data.programBySlug.get(iss.p)!;
                return (
                  <tr key={i} className="border-b border-[var(--border)] last:border-0">
                    {!scope.program && <td className="whitespace-nowrap px-3 py-1.5 text-[11px] font-semibold" style={{ color: p.color }}>{p.short}</td>}
                    <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1 text-[11px] font-medium capitalize" style={{ color: SEVERITY_TEXT[iss.severity] }}><Icon size={11} /> {iss.severity}</span></td>
                    <td className="px-3 py-1.5">{iss.message}</td>
                    <td className="num px-3 py-1.5 text-[var(--text-muted)]">{iss.row ?? "—"}</td>
                    <td className="max-w-[380px] truncate px-3 py-1.5 text-[var(--text-muted)]" title={iss.detail ?? ""}>{iss.detail ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {issues.length > shown.length && <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-muted)]">Showing {shown.length} of {issues.length} issues. Narrow by programme, severity or type to see the rest.</p>}
      </Card>

      {!scope.program && data.raw.crossProgramIssues.length > 0 && (
        <>
          <SectionTitle>Cross-programme identity</SectionTitle>
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-[13px] font-semibold">Same Institute ID, different names</h3>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">These IDs are linked across programmes for the journey view. Most are spelling or rebranding; verify any that look like two different institutes.</p>
            </div>
            <table className="w-full text-xs"><tbody>
              {data.raw.crossProgramIssues.map((c) => (
                <tr key={c.id} className="border-b border-[var(--border)] last:border-0"><td className="num w-24 px-4 py-2 font-semibold">ID {c.id}</td><td className="px-4 py-2 text-[var(--text-muted)]">{c.names.join("  ·  ")}</td></tr>
              ))}
            </tbody></table>
          </Card>
        </>
      )}

      {changes.length > 0 && (
        <>
          <SectionTitle hint="From each workbook's “Change Log” sheet">Corrections documented in the workbooks</SectionTitle>
          <Card className="overflow-hidden">
            {!scope.program && (
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2">
                <select value={clProg} onChange={(e) => setClProg(e.target.value)} aria-label="Programme" className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px]">
                  <option value="all">All programmes ({changes.length})</option>
                  {programs.filter((p) => p.quality.changeLog.length).map((p) => <option key={p.slug} value={p.slug}>{p.short} ({p.quality.changeLog.length})</option>)}
                </select>
              </div>
            )}
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--surface-2)]"><tr>{[...(scope.program ? [] : ["Programme"]), "Row", "Institute", "Field", "Source value", "New value", "Reason"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>)}</tr></thead>
                <tbody>
                  {changes.filter((c) => clProg === "all" || c.p === clProg).slice(0, 400).map((c, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      {!scope.program && <td className="whitespace-nowrap px-3 py-1.5 text-[11px] font-semibold" style={{ color: data.programBySlug.get(c.p)?.color }}>{data.programBySlug.get(c.p)?.short}</td>}
                      <td className="num px-3 py-1.5">{c.row ?? "—"}</td>
                      <td className="max-w-[220px] truncate px-3 py-1.5" title={c.institute ?? ""}>{c.institute ?? "—"}</td>
                      <td className="px-3 py-1.5">{c.field ?? "—"}</td>
                      <td className="max-w-[140px] truncate px-3 py-1.5 text-red-700 dark:text-red-300" title={c.from ?? ""}>{c.from ?? "—"}</td>
                      <td className="max-w-[140px] truncate px-3 py-1.5 text-emerald-700 dark:text-emerald-300" title={c.to ?? ""}>{c.to ?? "—"}</td>
                      <td className="max-w-[320px] truncate px-3 py-1.5 text-[var(--text-muted)]" title={c.reason ?? ""}>{c.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <p className="mt-3 text-[11px] text-[var(--text-muted)]">Generated {data.raw.meta.generatedAt.slice(0, 10)} at {data.raw.meta.generatedAt.slice(11, 19)} UTC.</p>
    </>
  );
}

function Stat({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub: string; icon: React.ElementType; color: string }) {
  return (
    <Card className="print-avoid p-3.5">
      <div className="flex items-start justify-between"><span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</span><Icon size={14} style={{ color }} /></div>
      <div className="num mt-1.5 text-xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[10px] text-[var(--text-muted)]">{sub}</div>
    </Card>
  );
}
