"use client";
import { useMemo } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, Badge } from "@/components/ui";
import { institutes, components, categories, meta, dimensions } from "@/lib/dataset";
import { computedTier, GRADE_COLORS, GRADE_ORDER, TIER_SOURCE, TIER_RUBRIC, fmtInt } from "@/config";

export default function MethodologyPage() {
  // Side-by-side comparison of the two grading models (see docs/AUDIT_FINDINGS.md §2.1)
  const comparison = useMemo(() => {
    const reported = new Map<string, number>();
    const computed = new Map<string, number>();
    for (const i of institutes) {
      const r = i.gradeReported ?? "—";
      reported.set(r, (reported.get(r) ?? 0) + 1);
      const c = computedTier(i.score).label;
      computed.set(c, (computed.get(c) ?? 0) + 1);
    }
    const keys = [...new Set([...reported.keys(), ...computed.keys()])]
      .sort((a, b) => GRADE_ORDER.indexOf(a as never) - GRADE_ORDER.indexOf(b as never));
    return keys.map((k) => ({ grade: k, reported: reported.get(k) ?? 0, computed: computed.get(k) ?? 0 }));
  }, []);

  return (
    <>
      <PageHeader page="Methodology" title="Methodology & Data Sources"
        description="Where every number on this dashboard comes from, and which judgement calls were made." />

      <Section title="Source">
        <Row k="Workbook" v={meta.sourceFile} />
        <Row k="Worksheet" v={meta.sheet} />
        <Row k="Assessment date" v={meta.assessmentDate} />
        <Row k="Programme" v={meta.program} />
        <Row k="Rows × columns" v={`${fmtInt(meta.rowCount)} × ${meta.columnCount}`} />
        <Row k="Row grain" v="One row = one institute × trade × batch assessment" />
        <Row k="Institutes / trades / districts / regions" v={`${meta.instituteCount} / ${dimensions.trades.length} / ${dimensions.districts.length} / ${dimensions.regions.length}`} />
        <Row k="Data generated" v={`${meta.generatedAt.slice(0, 10)} ${meta.generatedAt.slice(11, 19)} UTC`} />
      </Section>

      <Card className="print-avoid mb-4 border-l-4 border-l-amber-500 p-4">
        <h3 className="text-[13px] font-bold">Two grading models exist, and they disagree</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
          The workbook&apos;s <code>Grading</code> column (AK) was assigned by assessors; the previous HTML dashboard
          classified institutes with a threshold rule instead. This dashboard now uses the{" "}
          <strong>{TIER_SOURCE === "computed" ? "score-derived threshold rule" : "workbook Grading column"}</strong>.
          The workbook column was set aside because it contradicts the scores it is supposed to describe — institute
          21520 scores 30.35 and is graded &ldquo;Good&rdquo;, and the bands overlap (Very Good reaches 80.58 while
          Excellent starts at 80.38), so it cannot be reproduced as a rule. A published ranking cannot rest on a grade
          that disagrees with its own score. The workbook grade is still carried on every institute, shown in the Data
          Explorer and compared below. Switching models is a one-line change to
          <code className="mx-1">TIER_SOURCE</code> in <code>src/config.ts</code>.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Grade</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Workbook column AK</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Threshold rule (in use)</th>
                <th scope="col" className="px-3 py-1.5 text-right text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Difference</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((c) => (
                <tr key={c.grade} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-1.5"><Badge color={GRADE_COLORS[c.grade] ?? "#64798f"}>{c.grade}</Badge></td>
                  <td className="num px-3 py-1.5 text-right font-semibold">{c.reported}</td>
                  <td className="num px-3 py-1.5 text-right">{c.computed}</td>
                  <td className={`num px-3 py-1.5 text-right ${c.reported !== c.computed ? "font-semibold text-amber-600" : "text-[var(--text-muted)]"}`}>
                    {c.reported - c.computed > 0 ? "+" : ""}{c.reported - c.computed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">
          Official rubric: {Object.entries(TIER_RUBRIC).map(([g, band]) => `${g} ${band}`).join("  ·  ")}
        </p>
      </Card>

      <Card className="print-avoid mb-4 border-l-4 border-l-red-500 p-4">
        <h3 className="text-[13px] font-bold">Attendance is measured on CNIC-verified trainees</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
          <strong>Attendance % = CNIC Verified ÷ Approved Capacity.</strong> A trainee counts towards attendance only
          once their CNIC has been verified against the sanctioned seat list, which is the standard the 35-point
          Attendance Score is banded on and the formula the workbook itself uses wherever a live formula survives in
          column R.
          <br /><br />
          The stored column R is <em>not</em> read, because it is unreliable: 653 of 698 cells are hard-typed rather
          than calculated and 207 match no reproducible formula at all. The rate is recomputed from columns Q and L on
          every row, and the stored value is kept visible in the Data Explorer for audit.
          <br /><br />
          <strong>Presence % = Present ÷ Registered</strong> answers a different question — how many enrolled trainees
          were physically in the room — and is reported alongside rather than merged into attendance.
        </p>
      </Card>

      <Section title="Calculation registry">
        <Calc name="Total Institutes" src="Column F — Institute ID" formula="distinct count over filtered rows" />
        <Calc name="Registered Trainees" src="Column M" formula="Σ biometric_registered" />
        <Calc name="Attendance %" src="Columns Q ÷ L — CNIC Verified, Approved Capacity" formula="Σ CNIC Verified ÷ Σ Approved Capacity × 100 — pooled, never an average of row percentages" />
        <Calc name="Presence %" src="Columns O ÷ M" formula="Σ Present ÷ Σ Registered × 100 — physical presence, reported separately from attendance" />
        <Calc name="Dropout Rate" src="Columns N ÷ M" formula="Σ Dropped Out ÷ Σ Registered × 100" />
        <Calc name="Capacity Utilization" src="Columns M ÷ L" formula="Σ Registered ÷ Σ Approved Capacity × 100" />
        <Calc name="Trade Score" src="Columns S–AH" formula="Σ of 16 components, max 100 — recomputed after repairing 5 text-typed cells" />
        <Calc name="Institute Score" src="Trade Score" formula="mean of the institute's trade scores. The workbook's own Total Score column (AJ) is not used: it has five inconsistent formulas and disagrees with its own rows on 10 institutes" />
        <Calc name="Category Score" src="Grouped components" formula="Σ of member components, shown as a percentage of the category maximum" />
        <Calc name="Grade" src={TIER_SOURCE === "reported" ? "Column AK" : "Institute Score"} formula={TIER_SOURCE === "reported" ? "read from the workbook; free-text assessor commentary split into a separate note field" : "threshold bands applied to the institute score"} />
      </Section>

      <Section title="Score components">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {["Component", "Category", "Max", "Excel column"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{h}</th>))}
              </tr>
            </thead>
            <tbody>
              {components.map((c, i) => {
                const cat = categories.find((k) => k.members.includes(c.key));
                return (
                  <tr key={c.key} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-3 py-1.5 font-medium">{c.label}</td>
                    <td className="px-3 py-1.5 text-[var(--text-muted)]">{cat?.label ?? "—"}</td>
                    <td className="num px-3 py-1.5">{c.max}</td>
                    <td className="num px-3 py-1.5 text-[var(--text-muted)]">{columnLetter(18 + i)}</td>
                  </tr>
                );
              })}
              <tr className="bg-[var(--surface-2)] font-bold">
                <td className="px-3 py-1.5">Total</td><td /><td className="num px-3 py-1.5">100</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Card className="print-avoid mb-4 border-l-4 border-l-blue-500 p-4">
        <h3 className="text-[13px] font-bold">Package and Region are the same dimension</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
          The two packages do not overlap geographically. <strong>Package-03 is Punjab and only Punjab</strong> (434
          rows); <strong>Package-02 is AJK, Gilgit-Baltistan and ICT</strong> (264 rows). Comparing packages is therefore
          the same act as comparing Punjab against everywhere else, and any difference between them is confounded with
          region. The dashboard keeps Package as a filter because it exists in the workbook, but does not present it as
          an independent explanatory variable.
        </p>
      </Card>

      <Section title="What this dashboard deliberately does not show">
        <Row k="Trends over time" v="The workbook contains no date column. This is a single assessment snapshot, so no trend, time series or calendar view is possible." />
        <Row k="Gender or age analytics" v="No demographic field exists. Inferring gender from institute names would be fabrication." />
        <Row k="A national choropleth" v="Only 4 regions and 25 districts are covered. Sindh, KP and Balochistan are absent, so a Pakistan map would render mostly empty." />
        <Row k="Certification or employment outcomes" v="Not present in this dataset." />
        <Row k="Programme comparison" v="Program Name is populated on only 264 of 698 rows and holds a single value. It is left blank rather than backfilled." />
      </Section>
    </>
  );
}

const columnLetter = (i: number): string => {
  let s = ""; let n = i;
  while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
  return s;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="print-avoid mb-4 overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-[13px] font-semibold">{title}</h2></div>
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
      <div className="w-full shrink-0 text-xs font-medium sm:w-64">{k}</div>
      <div className="text-xs leading-relaxed text-[var(--text-muted)]">{v}</div>
    </div>
  );
}

function Calc({ name, src, formula }: { name: string; src: string; formula: string }) {
  return (
    <div className="px-4 py-2.5">
      <div className="text-xs font-semibold">{name}</div>
      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]"><strong>Source:</strong> {src}</div>
      <div className="text-[11px] text-[var(--text-muted)]"><strong>Formula:</strong> {formula}</div>
    </div>
  );
}
