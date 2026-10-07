"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import { Building2, Users, UserCheck, Gauge, Award, AlertTriangle, Layers, ShieldCheck, TrendingDown, GitCompareArrows, ArrowRight } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KPICard, type KpiBreakdown } from "@/components/dashboard/KPICard";
import { useBatchTrend } from "@/components/dashboard/useBatchTrend";
import { ProgramCard, RankPanel, FlaggedPanel, SectionTitle } from "@/components/dashboard/widgets";
import { ChartCard } from "@/components/charts/ChartCard";
import { RankedBars, GradeMix, HeatmapCard, CategoryProfile, FunnelCard, SpreadCard, DistributionCard, ScatterCard } from "@/components/charts/blocks";
import { ComponentBars } from "@/components/charts/ComponentBars";
import { PakistanMap } from "@/components/charts/PakistanMap";
import { Card, EmptyState, Badge, Seg } from "@/components/ui";
import { statOf, groupBy } from "@/lib/aggregate";
import { fmtInt, fmtPct, fmtCompact, fmtMonth, fmtDate, REGION_COLORS, scoreColor, CHART_PALETTE } from "@/config";
import type { Program } from "@/types";

export function OverviewModule() {
  const { scope } = useDash();
  return scope.mode === "program" ? <ProgramOverview program={scope.program!} /> : <PortfolioOverview />;
}

/* ================================================================== portfolio */

function PortfolioOverview() {
  const { data, rows, institutes, kpis, isEmpty, reset, scope, toggle } = useDash();
  const series = useBatchTrend();

  const perProgram = useMemo(() => scope.programs.map((p) => {
    const pr = rows.filter((r) => r.p === p.slug);
    const pi = institutes.filter((i) => i.p === p.slug);
    const sc = pi.filter((i) => i.score !== null);
    return {
      p, st: statOf(p.slug, pr), insts: pi.length,
      mean: sc.length ? sc.reduce((s, i) => s + (i.score as number), 0) / sc.length : null,
      exc: pi.length ? pi.filter((i) => i.grade === "Excellent").length / pi.length : null,
      flagged: pi.filter((i) => i.flagged).length,
    };
  }).filter((x) => x.st.assessments > 0), [scope.programs, rows, institutes]);

  const bd = (val: (x: (typeof perProgram)[number]) => number | null, disp: (v: number) => string): KpiBreakdown[] =>
    perProgram.map((x) => ({ label: x.p.code, color: x.p.color, value: val(x) ?? 0, display: val(x) === null ? "—" : disp(val(x) as number), onClick: () => toggle("program", x.p.slug) }));

  const top = useMemo(() => institutes.filter((i) => i.score !== null).slice(0, 10), [institutes]);
  const bottom = useMemo(() => [...institutes].filter((i) => i.score !== null).sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 10), [institutes]);

  const multi = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const i of institutes) { if (!m.has(i.globalKey)) m.set(i.globalKey, new Set()); m.get(i.globalKey)!.add(i.p); }
    return [...m.values()].filter((s) => s.size > 1).length;
  }, [institutes]);

  if (isEmpty) {
    return (<><PageHeader page="Overview" title="Portfolio Overview" /><Card><EmptyState onClear={reset} /></Card></>);
  }

  const span = (() => {
    const ds = scope.programs.flatMap((p) => [p.period?.from, p.period?.to, p.assessmentDate]).filter(Boolean).sort() as string[];
    return ds.length ? `${fmtMonth(ds[0])} – ${fmtMonth(ds[ds.length - 1])}` : "";
  })();

  return (
    <>
      <PageHeader page="Portfolio_Overview" title="Portfolio Overview"
        description="Third-party monitoring results for every NAVTTC programme in one place. Each programme is scored on its own rubric; programmes are compared on shared, normalised measures." />

      {/* Hero */}
      <section className="hero-surface rise relative mb-4 overflow-hidden rounded-[18px] p-5 text-white sm:p-6">
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <div className="t-eyebrow inline-flex items-center gap-2 text-white/60"><span className="live-dot text-emerald-400" /> NAVTTC skills programmes · {span}</div>
            <div className="t-display mt-2.5">
              <span className="num">{fmtInt(kpis.enrolled)}</span> trainees across <span className="num text-accent-grad [--brand-500:#a5b4fc] [--brand-2:#67e8f9]">{fmtInt(kpis.uniqueInstitutes)}</span> institute{kpis.uniqueInstitutes === 1 ? "" : "s"}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65">
              {kpis.programs} programme{kpis.programs === 1 ? "" : "s"} · {fmtInt(kpis.assessments)} trade assessments · {kpis.trades} trade{kpis.trades === 1 ? "" : "s"} · {kpis.districts} district{kpis.districts === 1 ? "" : "s"} in {kpis.regions} region{kpis.regions === 1 ? "" : "s"}.
              {multi > 0 && <> {multi === 1 ? "1 institute was" : `${multi} institutes were`} assessed in more than one programme.</>}
            </p>
          </div>
          <div className="stagger grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-3 xl:grid-cols-6">
            {perProgram.map((x) => (
              <Link key={x.p.slug} href={`/p/${x.p.slug}`}
                className="group relative overflow-hidden rounded-xl bg-white/[.06] px-3 py-2.5 ring-1 ring-inset ring-white/10 backdrop-blur-md transition-[background-color,transform,box-shadow] duration-300 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:bg-white/[.11] hover:shadow-[0_10px_30px_-10px_rgb(0_0_0/.6)]">
                <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] opacity-80" style={{ background: x.p.color }} />
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/70"><span className="h-1.5 w-1.5 rounded-full" style={{ background: x.p.color }} />{x.p.short}</div>
                <div className="num mt-1 text-xl font-bold leading-none">{x.mean?.toFixed(1) ?? "—"}</div>
                <div className="num mt-1 text-[9.5px] text-white/50">{x.insts} inst · {fmtCompact(x.st.enrolled)}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="stagger mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Institutes" {...series(k => k.institutes, "count")} value={kpis.institutes} format={(n) => fmtInt(n)} icon={Building2} accent="#2563eb"
          sub={<>{fmtInt(kpis.uniqueInstitutes)} unique · {fmtInt(kpis.assessments)} trade assessments</>}
          breakdown={bd((x) => x.insts, (v) => fmtInt(v))}
          methodology={<><strong>Programme-institutes</strong><br />An institute assessed in two programmes counts once per programme. &ldquo;Unique&rdquo; links the same institute across programmes by Institute ID (or name where no ID was recorded).</>} />
        <KPICard label="Trainees enrolled" {...series(k => k.enrolled, "count")} value={kpis.enrolled} format={(n) => fmtCompact(n)} icon={Users} accent="#0891b2"
          sub={<>of {fmtInt(kpis.approvedCapacity)} approved seats · {fmtPct(kpis.utilizationRate)} filled</>}
          breakdown={bd((x) => x.st.enrolled, (v) => fmtCompact(v))}
          methodology={<><strong>Enrolled</strong><br />Σ Enrolled across programmes. PMYSDP B-III records trainees registered on the biometric device in this column.</>} />
        <KPICard label="Attendance" {...series(k => k.attendanceRate, "rate")} value={(kpis.attendanceRate ?? 0) * 100} format={(n) => n.toFixed(1) + "%"} icon={UserCheck} accent="#059669"
          gauge={kpis.attendanceRate} sub={<>{fmtPct(kpis.presenceRate)} present of enrolled</>}
          breakdown={bd((x) => x.st.attendanceRate, (v) => fmtPct(v, 0))} breakdownMode="scale" scaleMax={1}
          methodology={<><strong>Attendance (programme rules)</strong><br />Pooled Σ numerator ÷ Σ denominator, each programme using the rule in its own Scoring Criteria sheet: CNIC ÷ Approved (B-II, B-III), Present ÷ Approved (B-I), CNIC ÷ Enrolled (cluster programmes).</>} />
        <KPICard label="Mean institute score" {...series(k => k.meanInstituteScore, "score")} value={kpis.meanInstituteScore ?? 0} format={(n) => n.toFixed(1)} icon={Gauge} accent="#7c3aed"
          gauge={(kpis.meanInstituteScore ?? 0) / 100} sub="out of 100, on each programme's own rubric"
          breakdown={bd((x) => x.mean, (v) => v.toFixed(1))} breakdownMode="scale" scaleMax={100}
          methodology={<><strong>Mean institute score</strong><br />Each institute scores the mean of its trade scores; this is the mean across institutes. Rubrics differ by programme (11, 15 or 16 criteria), each totalling 100.</>} />
        <KPICard label="Excellent institutes" {...series(k => k.excellent, "count")} value={kpis.excellent} format={(n) => fmtInt(n)} icon={Award} accent="#10b981"
          sub={<>{fmtPct(kpis.excellentShare)} of institutes score 80+</>}
          breakdown={bd((x) => x.exc, (v) => fmtPct(v, 0))} breakdownMode="scale" scaleMax={1}
          methodology={<><strong>Excellent</strong><br />Institute score of 80 or above, per the grade bands in every programme&apos;s Scoring Criteria sheet.</>} />
        <KPICard label="CNIC verified" {...series(k => k.verificationRate, "rate")} value={(kpis.verificationRate ?? 0) * 100} format={(n) => n.toFixed(1) + "%"} icon={ShieldCheck} accent="#0d9488"
          gauge={kpis.verificationRate} sub={<>{fmtInt(kpis.cnicVerified)} verified of approved seats</>}
          breakdown={bd((x) => x.st.verificationRate, (v) => fmtPct(v, 0))} breakdownMode="scale" scaleMax={1}
          methodology={<><strong>CNIC verified ÷ approved capacity</strong><br />The one attendance measure computed identically in every programme — use it for strict like-for-like comparison.</>} />
        <KPICard label="Dropout" {...series(k => k.dropoutRate, "rate", { invert: true })} value={(kpis.dropoutRate ?? 0) * 100} format={(n) => n.toFixed(2) + "%"} icon={TrendingDown} accent="#d97706"
          sub={<>{fmtInt(kpis.droppedOut)} trainees dropped out</>}
          breakdown={bd((x) => x.st.dropoutRate, (v) => fmtPct(v, 1))} breakdownMode="scale"
          methodology={<><strong>Dropout</strong><br />Σ Dropped Out ÷ Σ Enrolled.</>} />
        <KPICard label="Flagged institutes" {...series(k => k.flagged, "count", { invert: true })} value={kpis.flagged} format={(n) => fmtInt(n)} icon={AlertTriangle} accent="#dc2626"
          sub={<>{kpis.belowAverage} graded Poor or Closed</>}
          breakdown={bd((x) => x.flagged, (v) => fmtInt(v))} breakdownMode="scale"
          methodology={<><strong>Flagged</strong><br />Institutes with a written monitor note or a workbook grade override (fake, non-functional, closed, critical).</>} />
      </div>

      <SectionTitle hint="Click a card's filter button to focus the whole portfolio">Programmes</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...perProgram].sort((a, b) => a.p.order - b.p.order).map((x) => <ProgramCard key={x.p.slug} program={x.p} />)}
      </div>

      <SectionTitle>Comparison</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <RankedBars title="Programme comparison" rows={rows} dims={["program", "family", "region"]} defaultDim="program"
          metrics={["score", "attendance", "verification", "presence", "utilization", "dropout", "excellent", "enrolled", "capacity", "institutes"]} />
        <GradeMix title="Grade mix by programme" institutes={institutes} defaultDim="program" dims={["program", "region", "package"]} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <TimelineCard className="lg:col-span-3" programs={perProgram.map((x) => x.p)} />
        <CategoryProfile className="lg:col-span-2" rows={rows} seriesDims={["program", "family", "region"]} />
      </div>

      <SectionTitle>Reach & attendance</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <FunnelCard rows={rows} />
        <HeatmapCard title="Region × programme" rows={rows} rowDims={["region", "district", "trade"]} colDims={["program", "family", "region"]} defaultRow="region" defaultCol="program" />
      </div>
      <div className="mt-3"><PakistanMap /></div>

      <SectionTitle>Distribution</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <DistributionCard rows={rows} institutes={institutes} />
        <SpreadCard rows={rows} institutes={institutes} />
      </div>
      <div className="mt-3"><ScatterCard institutes={institutes} /></div>

      <SectionTitle>Institutes</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <RankPanel title="Top institutes across all programmes" items={top} tone="good" showProgram viewAll="/institutions" />
        <RankPanel title="Institutes requiring attention" items={bottom} tone="bad" showProgram viewAll="/institutions" />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2"><FlaggedPanel institutes={institutes} showProgram /></div>
        <Card className="flex flex-col justify-between p-4">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold"><GitCompareArrows size={15} className="text-brand-600" /> Institute journeys</div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
              <strong className="text-[var(--text)]">{multi}</strong> institutes in the current view were assessed in two or more programmes —
              mostly across PMYSDP Batches I, II and III. Track whether each one improved, held or slipped between rounds.
            </p>
          </div>
          <Link href="/journey" className="ctl bg-accent-grad mt-3 inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
            Open journeys <ArrowRight size={13} />
          </Link>
        </Card>
      </div>
      <p className="mt-6 text-[11px] text-[var(--text-muted)]">Data: {data.raw.meta.rowCount.toLocaleString()} rows from {data.programs.length} workbooks · generated {fmtDate(data.raw.meta.generatedAt.slice(0, 10))}.</p>
    </>
  );
}

/** Programmes in chronological order: enrolment bars with score and attendance lines. */
function TimelineCard({ programs, className }: { programs: Program[]; className?: string }) {
  const { rows, institutes, scope } = useDash();
  const [range, setRange] = useState<"1" | "2" | "all">("all");
  const sorted = useMemo(() => [...programs].sort((a, b) => {
    const da = a.period?.to ?? a.assessmentDate ?? "9999"; const db = b.period?.to ?? b.assessmentDate ?? "9999";
    return da === db ? a.order - b.order : da.localeCompare(db);
  }).map((p) => {
    const st = statOf(p.slug, rows.filter((r) => r.p === p.slug));
    const pi = institutes.filter((i) => i.p === p.slug && i.score !== null);
    const mean = pi.length ? pi.reduce((s, i) => s + (i.score as number), 0) / pi.length : null;
    const when = p.period ? fmtMonth(p.period.to) : p.assessmentDate ? fmtMonth(p.assessmentDate) : "undated";
    return { p, st, mean, when };
  }), [programs, rows, institutes]);
  void scope;
  // Range: the latest dated batch, the last two, or every programme (undated ones last).
  const items = useMemo(() => {
    if (range === "all") return sorted;
    const dated = sorted.filter((x) => x.p.period || x.p.assessmentDate);
    return dated.slice(-Number(range));
  }, [sorted, range]);

  const option: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 52, right: 52, top: 36, bottom: 50 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: items.map((x) => `${x.p.short}\n${x.when}`), axisLabel: { fontSize: 10, interval: 0, lineHeight: 14 } },
    yAxis: [
      { type: "value", name: "Enrolled", nameTextStyle: { fontSize: 10 }, axisLabel: { formatter: (v: number) => fmtCompact(v) } },
      { type: "value", name: "Score / %", max: 100, splitLine: { show: false }, nameTextStyle: { fontSize: 10 } },
    ],
    series: [
      {
        name: "Enrolled", type: "bar", barMaxWidth: 46,
        data: items.map((x) => ({ value: x.st.enrolled, itemStyle: { color: x.p.color, opacity: 0.85, borderRadius: [6, 6, 0, 0] } })),
        label: { show: true, position: "insideTop", color: "#fff", fontSize: 10, fontWeight: 700, formatter: (p: unknown) => fmtCompact((p as { value: number }).value) },
      },
      {
        name: "Mean score", type: "line", yAxisIndex: 1, symbolSize: 9, lineStyle: { width: 3, color: "#7c3aed" }, itemStyle: { color: "#7c3aed" },
        label: { show: true, position: "top", fontSize: 10, fontWeight: 700, color: "#7c3aed", formatter: (p: unknown) => (p as { value: number }).value?.toFixed(1) },
        data: items.map((x) => (x.mean === null ? null : Number(x.mean.toFixed(2)))),
      },
      {
        name: "Attendance %", type: "line", yAxisIndex: 1, symbolSize: 7, lineStyle: { width: 2, type: "dashed", color: "#059669" }, itemStyle: { color: "#059669" },
        label: { show: true, position: "bottom", fontSize: 9.5, color: "#059669", formatter: (p: unknown) => `${(p as { value: number }).value?.toFixed(0)}%` },
        data: items.map((x) => (x.st.attendanceRate === null ? null : Number((x.st.attendanceRate * 100).toFixed(1)))),
      },
    ],
  } as EChartsOption;

  return (
    <ChartCard title="Programme timeline" className={className}
      actions={<Seg value={range} onChange={setRange} label="Time range" options={[{ value: "1", label: "Latest", title: "Latest dated batch" }, { value: "2", label: "Last 2", title: "Last two dated batches" }, { value: "all", label: "All", title: "Every programme" }]} />}
      subtitle="Chronological where visit dates exist · bars = enrolment, lines = mean score & attendance"
      height={330}
      methodology={<><strong>Timeline</strong><br />Programmes are ordered by their latest visit date (PMYSDP B-I: Mar–May 2024, B-II: Apr–May 2025, B-III: May 2026). Workbooks without dates are placed after, in registry order.</>}
      table={{ columns: ["Programme", "When", "Institutes", "Enrolled", "Mean score", "Attendance %"], rows: items.map((x) => [x.p.name, x.when, x.st.institutes, x.st.enrolled, x.mean?.toFixed(2) ?? null, fmtPct(x.st.attendanceRate)]) }}
      option={option} />
  );
}

/* ================================================================== programme */

function ProgramOverview({ program }: { program: Program }) {
  const { data, rows, institutes, kpis, isEmpty, reset, toggle } = useDash();
  const series = useBatchTrend();

  const regions = useMemo(() => groupBy(rows, (r) => r.region).sort((a, b) => b.enrolled - a.enrolled), [rows]);
  const bd = (val: (s: (typeof regions)[number]) => number | null, disp: (v: number) => string): KpiBreakdown[] =>
    regions.map((s, i) => ({ label: s.key, color: REGION_COLORS[s.key] ?? CHART_PALETTE[i], value: val(s) ?? 0, display: val(s) === null ? "—" : disp(val(s) as number), onClick: () => toggle("region", s.key) }));

  const top = useMemo(() => institutes.filter((i) => i.score !== null).slice(0, 10), [institutes]);
  const bottom = useMemo(() => [...institutes].filter((i) => i.score !== null).sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 10), [institutes]);

  // Portfolio context: this programme vs every programme, on the shared measures.
  const context = useMemo(() => data.programs.map((p) => {
    const pi = data.institutes.filter((i) => i.p === p.slug && i.score !== null);
    return { p, mean: pi.length ? pi.reduce((s, i) => s + (i.score as number), 0) / pi.length : null, st: statOf(p.slug, data.rowsByProgram.get(p.slug) ?? []) };
  }), [data]);

  if (isEmpty) {
    return (<><PageHeader page="Overview" title={`${program.name} — Overview`} /><Card><EmptyState onClear={reset} /></Card></>);
  }

  const when = program.period ? `${fmtDate(program.period.from)} – ${fmtDate(program.period.to)}` : program.assessmentDate ? fmtDate(program.assessmentDate) : "Visit dates not recorded in the workbook";

  return (
    <>
      <PageHeader page="Overview" title="Programme Overview"
        description={`Monitoring results for ${program.name}, scored on its own ${program.rubric.components.length}-criteria rubric.`} />

      <section className="hero-surface rise relative mb-4 overflow-hidden rounded-[18px] p-5 text-white sm:p-6" style={{ ["--hero" as string]: program.color }}>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-[.16em] text-white/70">
              <span>{program.family}</span><span>·</span><span>{when}</span>
            </div>
            <div className="t-display mt-2">{program.fullName}</div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px]">
              <span className="rounded-full bg-white/[.08] px-2.5 py-1 ring-1 ring-inset ring-white/10">Rubric: {program.rubric.label}</span>
              <span className="rounded-full bg-white/[.08] px-2.5 py-1 ring-1 ring-inset ring-white/10">Attendance: {program.attendanceRule.label}</span>
              <span className="rounded-full bg-white/[.08] px-2.5 py-1 ring-1 ring-inset ring-white/10">Source: {program.sourceFile}</span>
            </div>
          </div>
          <div className="stagger flex gap-6">
            {[["Institutes", fmtInt(kpis.institutes)], ["Trainees", fmtCompact(kpis.enrolled)], ["Mean score", kpis.meanInstituteScore?.toFixed(1) ?? "—"]].map(([k, v]) => (
              <div key={k}>
                <div className="num text-[28px] font-bold leading-none">{v}</div>
                <div className="t-eyebrow mt-1.5 text-white/55">{k}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="stagger mb-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Institutes" {...series(k => k.institutes, "count")} value={kpis.institutes} format={(n) => fmtInt(n)} icon={Building2} accent={program.color}
          sub={<>{fmtInt(kpis.assessments)} trade assessments · {kpis.trades} trades</>} breakdown={bd((s) => s.institutes, (v) => fmtInt(v))}
          methodology={<><strong>Institutes</strong><br />Distinct institutes in the filtered rows{program.slug === "cbi-b2" ? " — matched on name, because this workbook records no Institute ID" : ""}.</>} />
        <KPICard label={program.enrolledLabel} {...series(k => k.enrolled, "count")} value={kpis.enrolled} format={(n) => fmtCompact(n)} icon={Users} accent="#0891b2"
          sub={<>of {fmtInt(kpis.approvedCapacity)} approved seats · {fmtPct(kpis.utilizationRate)} filled</>} breakdown={bd((s) => s.enrolled, (v) => fmtCompact(v))}
          methodology={<><strong>{program.enrolledLabel}</strong><br />Column M of the template.</>} />
        <KPICard label="Attendance" {...series(k => k.attendanceRate, "rate")} value={(kpis.attendanceRate ?? 0) * 100} format={(n) => n.toFixed(1) + "%"} icon={UserCheck} accent="#059669"
          gauge={kpis.attendanceRate} sub={<>{program.attendanceRule.label}</>} breakdown={bd((s) => s.attendanceRate, (v) => fmtPct(v, 0))} breakdownMode="scale" scaleMax={1}
          methodology={<><strong>Attendance</strong><br />{program.attendanceRule.label}, pooled across rows — the basis this programme&apos;s Attendance Score is banded on.</>} />
        <KPICard label="Mean institute score" {...series(k => k.meanInstituteScore, "score")} value={kpis.meanInstituteScore ?? 0} format={(n) => n.toFixed(1)} icon={Gauge} accent="#7c3aed"
          gauge={(kpis.meanInstituteScore ?? 0) / 100} sub={<>Trade-level mean {kpis.meanTradeScore?.toFixed(1) ?? "—"}</>}
          breakdown={bd((s) => s.meanScore, (v) => v.toFixed(1))} breakdownMode="scale" scaleMax={100}
          methodology={<><strong>Institute score</strong><br />Mean of the institute&apos;s trade scores; each trade score is the sum of the {program.rubric.components.length} criteria (max 100).</>} />
        <KPICard label="Excellent institutes" {...series(k => k.excellent, "count")} value={kpis.excellent} format={(n) => fmtInt(n)} icon={Award} accent="#10b981"
          sub={<>{fmtPct(kpis.excellentShare)} score 80+</>} breakdown={bd((s) => s.excellentShare, (v) => fmtPct(v, 0))} breakdownMode="scale" scaleMax={1}
          methodology={<><strong>Excellent</strong><br />Institute score 80 or above. Region bars show the share of trade assessments at 80+.</>} />
        <KPICard label="Presence" {...series(k => k.presenceRate, "rate")} value={(kpis.presenceRate ?? 0) * 100} format={(n) => n.toFixed(1) + "%"} icon={Layers} accent="#db2777"
          gauge={kpis.presenceRate} sub={<>{fmtInt(kpis.present)} present of {fmtInt(kpis.enrolled)}</>} breakdown={bd((s) => s.presenceRate, (v) => fmtPct(v, 0))} breakdownMode="scale" scaleMax={1}
          methodology={<><strong>Presence</strong><br />Σ Present ÷ Σ Enrolled on the visit day.</>} />
        <KPICard label="Dropout" {...series(k => k.dropoutRate, "rate", { invert: true })} value={(kpis.dropoutRate ?? 0) * 100} format={(n) => n.toFixed(2) + "%"} icon={TrendingDown} accent="#d97706"
          sub={<>{fmtInt(kpis.droppedOut)} trainees</>} breakdown={bd((s) => s.dropoutRate, (v) => fmtPct(v, 1))} breakdownMode="scale"
          methodology={<><strong>Dropout</strong><br />Σ Dropped Out ÷ Σ Enrolled.</>} />
        <KPICard label="Flagged institutes" {...series(k => k.flagged, "count", { invert: true })} value={kpis.flagged} format={(n) => fmtInt(n)} icon={AlertTriangle} accent="#dc2626"
          sub={<>{kpis.belowAverage} graded Poor or Closed</>}
          breakdown={regions.map((s, i) => ({ label: s.key, color: REGION_COLORS[s.key] ?? CHART_PALETTE[i], value: institutes.filter((x) => x.region === s.key && x.flagged).length, display: String(institutes.filter((x) => x.region === s.key && x.flagged).length), onClick: () => toggle("region", s.key) }))} breakdownMode="scale"
          methodology={<><strong>Flagged</strong><br />Institutes with a written monitor note or a workbook grade override.</>} />
      </div>

      <SectionTitle>Performance</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <GradeMix title="Grade mix" institutes={institutes} defaultDim="region" dims={["region", "district", "package"]} />
        <RankedBars title="Regional & district comparison" rows={rows} dims={["region", "district", "package", "division", "tradeCategory", "tradeSector", "duration", "batch"]} defaultDim="region" accent={program.color} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ComponentBars rows={rows} program={program} />
        <CategoryProfile rows={rows} seriesDims={["region", "package", "tradeCategory"]} />
      </div>

      <SectionTitle>Reach & attendance</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <FunnelCard rows={rows} />
        <DistributionCard rows={rows} institutes={institutes} />
      </div>
      <div className="mt-3"><PakistanMap /></div>

      <SectionTitle>Institutes</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <RankPanel title="Top performing institutes" items={top} tone="good" viewAll={`/p/${program.slug}/institutions`} />
        <RankPanel title="Institutes requiring attention" items={bottom} tone="bad" viewAll={`/p/${program.slug}/institutions`} />
      </div>
      <div className="mt-3"><FlaggedPanel institutes={institutes} /></div>

      <SectionTitle hint="Whole programmes, unfiltered">In the portfolio</SectionTitle>
      <Card className="overflow-hidden">
        <div className="grid divide-y divide-[var(--border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
          {context.map(({ p, mean, st }) => (
            <Link key={p.slug} href={`/p/${p.slug}`} className={`block p-3 transition-colors hover:bg-[var(--surface-3)] ${p.slug === program.slug ? "bg-[var(--surface-2)]" : ""}`}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.short}
                {p.slug === program.slug && <Badge color={p.color}>this</Badge>}</div>
              <div className="num mt-1 text-xl font-bold" style={{ color: scoreColor(mean) }}>{mean?.toFixed(1) ?? "—"}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{p.instituteCount} institutes · attendance {fmtPct(st.attendanceRate, 0)}</div>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
