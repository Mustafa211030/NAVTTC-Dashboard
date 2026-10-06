"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionTitle } from "@/components/dashboard/widgets";
import { RankedBars, GradeMix, CategoryProfile, SpreadCard, FunnelCard, HeatmapCard } from "@/components/charts/blocks";
import { ComponentMatrix } from "@/components/charts/ComponentBars";
import { Card, Seg, EmptyState } from "@/components/ui";
import { statOf, METRICS, fmtMetric } from "@/lib/aggregate";
import { fmtMonth, fmtInt, fmtScore } from "@/config";

export function ProgrammesModule() {
  const { rows, institutes, scope, isEmpty, reset } = useDash();
  const [view, setView] = useState<"value" | "rank">("value");
  const progs = scope.programs.filter((p) => rows.some((r) => r.p === p.slug));

  const card = useMemo(() => progs.map((p) => {
    const pr = rows.filter((r) => r.p === p.slug);
    const pi = institutes.filter((i) => i.p === p.slug);
    const sc = pi.filter((i) => i.score !== null);
    return {
      p, st: statOf(p.slug, pr), insts: pi.length,
      instMean: sc.length ? sc.reduce((s, i) => s + (i.score as number), 0) / sc.length : null,
      exc: pi.length ? pi.filter((i) => i.grade === "Excellent").length / pi.length : null,
      poor: pi.length ? pi.filter((i) => i.grade === "Poor" || i.grade === "Closed").length / pi.length : null,
      flagged: pi.filter((i) => i.flagged).length,
      districts: new Set(pr.map((r) => r.district)).size,
      trades: new Set(pr.map((r) => r.tradeNorm)).size,
      regions: [...new Set(pr.map((r) => r.region))].sort(),
    };
  }), [progs, rows, institutes]);

  if (isEmpty) return (<><PageHeader page="Compare_Programmes" title="Compare Programmes" /><Card><EmptyState onClear={reset} /></Card></>);

  type Row = { label: string; kind: "score" | "rate" | "count"; better: "high" | "low" | "none"; get: (c: (typeof card)[number]) => number | null };
  const scoreRows: Row[] = [
    { label: "Mean institute score", kind: "score", better: "high", get: (c) => c.instMean },
    ...METRICS.filter((m) => !["institutes", "assessments"].includes(m.key)).map((m) => ({ label: m.label, kind: m.kind, better: (m.kind === "count" ? "none" : m.better) as Row["better"], get: (c: (typeof card)[number]) => m.get(c.st) })),
    { label: "Institutes graded Excellent", kind: "rate", better: "high", get: (c) => c.exc },
    { label: "Institutes Poor / Closed", kind: "rate", better: "low", get: (c) => c.poor },
    { label: "Institutes", kind: "count", better: "none", get: (c) => c.insts },
    { label: "Trade assessments", kind: "count", better: "none", get: (c) => c.st.assessments },
    { label: "Districts covered", kind: "count", better: "none", get: (c) => c.districts },
    { label: "Distinct trades", kind: "count", better: "none", get: (c) => c.trades },
    { label: "Flagged institutes", kind: "count", better: "low", get: (c) => c.flagged },
  ];

  return (
    <>
      <PageHeader page="Compare_Programmes" title="Compare Programmes"
        description="Every programme side by side on the measures that are comparable across rubrics. The best value in each row is highlighted." />

      <Card className="mb-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <h3 className="text-[13px] font-semibold">Programme scorecard</h3>
            <p className="text-[11px] text-[var(--text-muted)]">Under the current filters · {view === "rank" ? "1 = best in row" : "values"}</p>
          </div>
          <Seg value={view} onChange={setView} label="Show" options={[{ value: "value", label: "Values" }, { value: "rank", label: "Ranks" }]} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--surface-2)] px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Measure</th>
                {card.map((c) => (
                  <th key={c.p.slug} className="min-w-[120px] px-3 py-2 text-right">
                    <Link href={`/p/${c.p.slug}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold hover:underline" style={{ color: c.p.color }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: c.p.color }} />{c.p.short}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scoreRows.map((r) => {
                const vals = card.map((c) => r.get(c));
                const valid = vals.filter((v): v is number => v !== null);
                const best = valid.length && r.better !== "none" ? (r.better === "high" ? Math.max(...valid) : Math.min(...valid)) : null;
                const sorted = [...valid].sort((a, b) => (r.better === "low" ? a - b : b - a));
                return (
                  <tr key={r.label} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                    <td className="sticky left-0 bg-[var(--surface)] px-4 py-1.5 font-medium">{r.label}</td>
                    {vals.map((v, i) => {
                      const isBest = v !== null && v === best && valid.length > 1;
                      return (
                        <td key={card[i].p.slug} className="num px-3 py-1.5 text-right">
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${isBest ? "bg-emerald-50 font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : ""}`}>
                            {isBest && <Trophy size={10} />}
                            {view === "rank" && v !== null && r.better !== "none" ? `#${sorted.indexOf(v) + 1}` : fmtMetric(r.kind, v)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--border)] bg-[var(--surface-2)] text-[11px]">
                <td className="sticky left-0 bg-[var(--surface-2)] px-4 py-2 font-semibold">Rubric</td>
                {card.map((c) => <td key={c.p.slug} className="px-3 py-2 text-right text-[var(--text-muted)]">{c.p.rubric.components.length} criteria</td>)}
              </tr>
              <tr className="bg-[var(--surface-2)] text-[11px]">
                <td className="sticky left-0 bg-[var(--surface-2)] px-4 py-2 font-semibold">Attendance rule</td>
                {card.map((c) => <td key={c.p.slug} className="px-3 py-2 text-right text-[var(--text-muted)]">{c.p.attendanceRule.label.replace(" ÷ ", " / ")}</td>)}
              </tr>
              <tr className="bg-[var(--surface-2)] text-[11px]">
                <td className="sticky left-0 bg-[var(--surface-2)] px-4 py-2 font-semibold">Assessed</td>
                {card.map((c) => <td key={c.p.slug} className="px-3 py-2 text-right text-[var(--text-muted)]">{c.p.period ? `${fmtMonth(c.p.period.from)} – ${fmtMonth(c.p.period.to)}` : c.p.assessmentDate ? fmtMonth(c.p.assessmentDate) : "not recorded"}</td>)}
              </tr>
              <tr className="bg-[var(--surface-2)] text-[11px]">
                <td className="sticky left-0 bg-[var(--surface-2)] px-4 py-2 font-semibold">Regions</td>
                {card.map((c) => <td key={c.p.slug} className="px-3 py-2 text-right text-[var(--text-muted)]">{c.regions.join(", ")}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <RankedBars title="Programme league table" rows={rows} dims={["program", "family"]} defaultDim="program" vertical />
        <GradeMix title="Grade mix by programme" institutes={institutes} defaultDim="program" dims={["program", "region"]} />
      </div>

      <SectionTitle>Rubric</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-5">
        <ComponentMatrix className="lg:col-span-3" rows={rows} programs={progs} />
        <div className="grid gap-3 lg:col-span-2">
          <CategoryProfile rows={rows} seriesDims={["program", "family"]} defaultView="bars" />
          <SpreadCard rows={rows} institutes={institutes} dims={["program", "family", "region"]} />
        </div>
      </div>

      <SectionTitle>Reach</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <FunnelCard rows={rows} title="Funnel by programme" />
        <HeatmapCard title="District × programme" rows={rows} rowDims={["district", "region", "trade"]} colDims={["program"]} defaultRow="district" defaultCol="program" metrics={["score", "attendance", "verification", "enrolled", "institutes"]} />
      </div>

      <SectionTitle>Programme fact sheets</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {card.map((c) => (
          <Card key={c.p.slug} className="relative overflow-hidden p-4">
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: c.p.color }} />
            <div className="text-[13px] font-bold">{c.p.fullName}</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{c.p.sourceFile}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <dt className="text-[var(--text-muted)]">Institutes</dt><dd className="num text-right font-semibold">{fmtInt(c.insts)}</dd>
              <dt className="text-[var(--text-muted)]">Trade rows</dt><dd className="num text-right font-semibold">{fmtInt(c.st.assessments)}</dd>
              <dt className="text-[var(--text-muted)]">Enrolled</dt><dd className="num text-right font-semibold">{fmtInt(c.st.enrolled)}</dd>
              <dt className="text-[var(--text-muted)]">Mean score</dt><dd className="num text-right font-semibold">{fmtScore(c.instMean, 1)}</dd>
            </dl>
            {c.p.notes.length > 0 && (
              <details className="mt-2 text-[11px]">
                <summary className="cursor-pointer font-semibold text-brand-600">{c.p.notes.length} programme-specific notes from the workbook</summary>
                <ol className="mt-1 list-decimal space-y-1 pl-4 text-[var(--text-muted)]">{c.p.notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
              </details>
            )}
            <Link href={`/p/${c.p.slug}`} className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: c.p.color }}>Open {c.p.short} dashboard <ArrowRight size={12} /></Link>
          </Card>
        ))}
      </div>
    </>
  );
}
