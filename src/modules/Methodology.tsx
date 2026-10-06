"use client";
import { useMemo } from "react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, Badge } from "@/components/ui";
import { GRADE_COLORS, GRADE_ORDER, TIER_RUBRIC, fmtInt, fmtDate, bandOf } from "@/config";
import type { Program } from "@/types";

const colLetter = (i: number) => { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export function MethodologyModule() {
  const { scope } = useDash();
  return scope.program ? <ProgramMethod program={scope.program} /> : <PortfolioMethod />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="print-avoid mb-4 overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3"><h3 className="text-[13px] font-semibold">{title}</h3></div>
      <div className="p-4 text-xs leading-relaxed">{children}</div>
    </Card>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex gap-3 border-b border-[var(--border)] py-1.5 last:border-0"><span className="w-56 shrink-0 text-[var(--text-muted)]">{k}</span><span className="font-medium">{v}</span></div>;
}

const DEFINITIONS = (
  <ul className="list-disc space-y-1.5 pl-4">
    <li><strong>Trade score</strong> = sum of the programme&apos;s criteria for one trade × batch row (max 100). Recomputed from the criteria; the workbook&apos;s stored value is kept for audit.</li>
    <li><strong>Institute score</strong> = mean of the institute&apos;s trade scores. Rows without any scores (closed institutes) are excluded from the mean but kept in headcounts.</li>
    <li><strong>Grade</strong> = band of the institute score (80 / 70 / 60 / 50), unless the workbook records a Grade Override (Poor for fake / non-functional, Closed) — exactly as the workbook&apos;s own Grading formula.</li>
    <li><strong>Attendance %</strong> = Σ numerator ÷ Σ denominator under the programme&apos;s own rule (see table). Pooled, never an average of percentages.</li>
    <li><strong>Presence %</strong> = Σ Present ÷ Σ Enrolled. <strong>CNIC verified % of seats</strong> = Σ CNIC Verified ÷ Σ Approved Capacity — identical in every programme, so the strict like-for-like attendance comparison.</li>
    <li><strong>Dropout %</strong> = Σ Dropped Out ÷ Σ Enrolled. <strong>Utilisation %</strong> = Σ Enrolled ÷ Σ Approved Capacity.</li>
    <li><strong>Category achievement</strong> = points earned in a shared category ÷ that category&apos;s maximum under the programme&apos;s rubric. Blank where a rubric has no criterion in the category.</li>
    <li><strong>Flagged</strong> = institute with a written monitor note or a workbook grade override.</li>
  </ul>
);

function PortfolioMethod() {
  const { data } = useDash();
  const cats = data.raw.categories;
  return (
    <>
      <PageHeader page="Methodology" title="Methodology & Data Sources" description="Where every number comes from, how six programmes with three different rubrics are made comparable, and which judgement calls were made." />
      <Section title="Programme registry">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-[var(--border)]">{["Programme", "Workbook", "Rows", "Institutes", "Rubric", "Attendance rule", "Assessed"].map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{h}</th>)}</tr></thead>
            <tbody>
              {data.programs.map((p) => (
                <tr key={p.slug} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-2 py-1.5 font-semibold"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}</td>
                  <td className="px-2 py-1.5 text-[var(--text-muted)]">{p.sourceFile}</td>
                  <td className="num px-2 py-1.5">{fmtInt(p.rowCount)}</td>
                  <td className="num px-2 py-1.5">{fmtInt(p.instituteCount)}</td>
                  <td className="px-2 py-1.5">{p.rubric.label}</td>
                  <td className="px-2 py-1.5">{p.attendanceRule.label}</td>
                  <td className="px-2 py-1.5">{p.period ? `${fmtDate(p.period.from)} – ${fmtDate(p.period.to)}` : p.assessmentDate ? fmtDate(p.assessmentDate) : <span className="text-[var(--text-muted)]">not recorded</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[var(--text-muted)]">To add a programme: put its workbook at <code>data/programs/&lt;slug&gt;/source.xlsx</code>, register it in <code>scripts/programs.config.mjs</code>, and run <code>npm run data</code>. No page or chart is edited.</p>
      </Section>

      <Section title="Making rubrics comparable — the six shared categories">
        <p className="mb-3 text-[var(--text-muted)]">Each cell lists the criteria that feed the category in that programme, with the category maximum. Cross-programme charts compare achievement as a percentage of these maxima.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="border-b border-[var(--border)]"><th className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Category</th>
              {data.programs.map((p) => <th key={p.slug} className="px-2 py-1.5 text-left text-[10px] font-bold" style={{ color: p.color }}>{p.short}</th>)}</tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.key} className="border-b border-[var(--border)] align-top last:border-0">
                  <td className="px-2 py-1.5 font-semibold">{c.label}</td>
                  {data.programs.map((p) => {
                    const pc = p.rubric.categories.find((x) => x.key === c.key)!;
                    return (
                      <td key={p.slug} className="px-2 py-1.5">
                        {pc.max > 0 ? (<><div className="num font-bold">max {pc.max}</div><div className="text-[var(--text-muted)]">{pc.members.map((m) => p.rubric.components.find((k) => k.key === m)?.label).join(", ")}</div></>) : <span className="text-[var(--text-muted)]">— not scored</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Definitions">{DEFINITIONS}</Section>
      <Section title="Grade bands (identical in every programme)">
        <div className="flex flex-wrap gap-2">{Object.entries(TIER_RUBRIC).map(([g, r]) => <Badge key={g} color={GRADE_COLORS[g]}>{g}: {r}</Badge>)}<Badge color={GRADE_COLORS.Closed}>Closed: workbook override</Badge></div>
      </Section>
      <Section title="Cross-programme institute identity">
        <p>Institutes are linked across programmes on <strong>Institute ID</strong>. Where a workbook records no ID (CBI Batch II), the institute is identified by name and linked to an ID&apos;d institute only on an exact normalised-name match. {data.raw.meta.instituteCount} programme-institutes resolve to <strong>{data.raw.meta.uniqueInstitutes}</strong> unique institutes. IDs that carry different names in different programmes are listed on the Data Quality page.</p>
        <p className="mt-2">Trades are matched across programmes on their normalised name (case, spacing and punctuation ignored).</p>
      </Section>
      <Section title="What the data cannot tell you">
        <ul className="list-disc space-y-1 pl-4">
          <li>Gender, age and other demographics — no such field exists in any workbook.</li>
          <li>Certification or employment outcomes — not recorded.</li>
          <li>Sindh, Khyber Pakhtunkhwa and Balochistan — no programme in the portfolio covers them.</li>
          <li>A true time series within a programme — each workbook is one monitoring round. The timeline compares rounds, and three cluster workbooks carry no visit dates at all.</li>
        </ul>
      </Section>
    </>
  );
}

function ProgramMethod({ program }: { program: Program }) {
  const { data } = useDash();
  const insts = useMemo(() => data.institutes.filter((i) => i.p === program.slug), [data, program.slug]);
  const comparison = useMemo(() => {
    const reported = new Map<string, number>(); const computed = new Map<string, number>(); const shown = new Map<string, number>();
    for (const i of insts) {
      const r = i.gradeReported ?? "—"; reported.set(r, (reported.get(r) ?? 0) + 1);
      const c = bandOf(i.score) ?? "Unscored"; computed.set(c, (computed.get(c) ?? 0) + 1);
      shown.set(i.grade, (shown.get(i.grade) ?? 0) + 1);
    }
    const order = [...GRADE_ORDER, "Critical", "Non-Functional", "—"] as string[];
    const keys = [...new Set([...reported.keys(), ...computed.keys(), ...shown.keys()])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return keys.map((k) => ({ grade: k, reported: reported.get(k) ?? 0, computed: computed.get(k) ?? 0, shown: shown.get(k) ?? 0 }));
  }, [insts]);

  return (
    <>
      <PageHeader page="Methodology" title="Methodology & Data Sources" description={`How ${program.name} is scored, ingested and graded.`} />
      <Section title="Source">
        <Row k="Workbook" v={program.sourceFile} />
        <Row k="Worksheet" v={program.sheet} />
        <Row k="Assessment" v={program.period ? `${fmtDate(program.period.from)} – ${fmtDate(program.period.to)} (Date of Visit)` : program.assessmentDate ? fmtDate(program.assessmentDate) : "Not recorded in the workbook"} />
        <Row k="Rows × columns" v={`${fmtInt(program.rowCount)} × ${program.columnCount}`} />
        <Row k="Row grain" v="One row = one institute × trade × batch assessment" />
        <Row k="Institutes" v={fmtInt(program.instituteCount)} />
        <Row k="Enrolment column" v={program.enrolledLabel} />
        <Row k="Attendance rule" v={program.attendanceRule.label} />
        <Row k="Extra workbook fields used" v={program.extras.length ? program.extras.join(", ") : "none"} />
      </Section>

      <Section title={`Rubric — ${program.rubric.label}`}>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-[var(--border)]">{["Column", "Criterion", "Max", "Shared category"].map((h) => <th key={h} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{h}</th>)}</tr></thead>
          <tbody>
            {program.rubric.components.map((c) => (
              <tr key={c.key} className="border-b border-[var(--border)] last:border-0">
                <td className="num px-2 py-1.5 text-[var(--text-muted)]">{colLetter(c.column)}</td>
                <td className="px-2 py-1.5 font-medium">{c.label}</td>
                <td className="num px-2 py-1.5 font-bold">{c.max}</td>
                <td className="px-2 py-1.5">{data.raw.categories.find((k) => k.key === c.cat)?.label}</td>
              </tr>
            ))}
            <tr className="font-bold"><td /><td className="px-2 py-1.5">Total</td><td className="num px-2 py-1.5">{program.rubric.components.reduce((s, c) => s + c.max, 0)}</td><td /></tr>
          </tbody>
        </table>
      </Section>

      <Section title="Grades: workbook vs score bands">
        <p className="mb-2 text-[var(--text-muted)]">The dashboard grade is the score band, replaced by a Grade Override where the workbook records one.{program.slug === "pmysdp-b3" ? " B-III&apos;s Grading cell also carries assessor commentary, which is kept as a flag." : ""}</p>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-[var(--border)]">{["Grade", "Workbook Grading column", "Score band", "Shown on dashboard"].map((h) => <th key={h} className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{h}</th>)}</tr></thead>
          <tbody>{comparison.map((r) => (
            <tr key={r.grade} className="border-b border-[var(--border)] last:border-0">
              <td className="px-3 py-1.5"><Badge color={GRADE_COLORS[r.grade] ?? "#64748b"}>{r.grade}</Badge></td>
              <td className="num px-3 py-1.5">{r.reported}</td><td className="num px-3 py-1.5">{r.computed}</td><td className="num px-3 py-1.5 font-bold">{r.shown}</td>
            </tr>))}
          </tbody>
        </table>
      </Section>

      {program.notes.length > 0 && (
        <Section title="Programme-specific notes (from the workbook's Scoring Criteria sheet)">
          <ol className="list-decimal space-y-1.5 pl-4">{program.notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
        </Section>
      )}
      <Section title="Definitions">{DEFINITIONS}</Section>
    </>
  );
}
