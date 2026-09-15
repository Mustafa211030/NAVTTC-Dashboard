"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Building2, Users, UserCheck, TrendingDown, Gauge, Layers } from "lucide-react";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { KPICard } from "@/components/dashboard/KPICard";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card, EmptyState, Badge } from "@/components/ui";
import { groupBy, histogram, funnel } from "@/lib/aggregate";
import { categories } from "@/lib/dataset";
import { fmtInt, fmtPct, fmtScore, fmtCompact, GRADE_COLORS, GRADE_ORDER, gradeOf } from "@/config";

export default function OverviewPage() {
  const { rows, institutes, kpis, isEmpty, reset, patch, filters } = useFilters();

  const gradeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of institutes) {
      const g = gradeOf(i);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return GRADE_ORDER.filter((g) => m.has(g)).map((g) => ({ name: g, value: m.get(g)!, itemStyle: { color: GRADE_COLORS[g] } }));
  }, [institutes]);

  const regionStats = useMemo(() => groupBy(rows, (r) => r.region).sort((a, b) => b.meanScore - a.meanScore), [rows]);
  const bins = useMemo(() => histogram(institutes.map((i) => i.score)), [institutes]);
  const topInstitutes = useMemo(() => institutes.slice(0, 8), [institutes]);
  const attention = useMemo(
    () => [...institutes].sort((a, b) => a.score - b.score).slice(0, 8), [institutes]);

  const funnelStages = useMemo(() => funnel(rows), [rows]);

  const categoryMeans = useMemo(
    () => categories.map((c) => ({
      ...c,
      value: institutes.length ? institutes.reduce((s, i) => s + (i.categoryScores[c.key] ?? 0), 0) / institutes.length : 0,
    })), [institutes]);

  if (isEmpty) {
    return (
      <>
        <PageHeader page="Overview" title="Executive Overview" description="National picture of PMYSDP Batch III institute performance." />
        <Card><EmptyState onClear={reset} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        page="Overview"
        title="Executive Overview"
        description="Third-party verification of PMYSDP Batch III training provider institutes. Single assessment round — this dashboard compares, it does not trend."
      />

      {/* Tier 1 — critical KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard label="Institutes" value={kpis.institutes} format={(n) => fmtInt(Math.round(n))} icon={Building2} accent="#2563eb"
          sub={`${fmtInt(kpis.assessments)} trade-batch assessments`}
          methodology={<><strong>Total Institutes</strong><br />Distinct <code>Institute ID</code> values in the filtered rows.<br /><em>Source: column F.</em></>} />

        <KPICard label="Registered" value={kpis.registered} format={(n) => fmtCompact(Math.round(n))} icon={Users} accent="#0891b2"
          sub={`of ${fmtInt(kpis.approvedCapacity)} approved seats`}
          methodology={<><strong>Registered Trainees</strong><br />Sum of trainees registered on the biometric device per the PMS portal list.<br /><em>Source: column M.</em></>} />

        <KPICard label="Attendance" value={(kpis.attendanceRate ?? 0) * 100} format={(n) => n.toFixed(1) + "%"} icon={UserCheck} accent="#059669"
          sub={`${fmtInt(kpis.cnicVerified)} CNIC-verified of ${fmtInt(kpis.approvedCapacity)} seats`}
          methodology={<><strong>Attendance Rate</strong><br />Σ CNIC Verified ÷ Σ Approved Capacity, pooled across rows rather than averaged.<br /><em>Source: columns Q and L. This is the basis the 35-point Attendance Score is banded on. Physical presence (Present ÷ Registered) is reported separately.</em></>} />

        <KPICard label="Dropout" value={(kpis.dropoutRate ?? 0) * 100} format={(n) => n.toFixed(2) + "%"} icon={TrendingDown} accent="#d97706"
          sub={`${fmtInt(kpis.droppedOut)} trainees dropped out`}
          methodology={<><strong>Dropout Rate</strong><br />Σ Dropped Out ÷ Σ Registered.<br /><em>Source: columns N and M.</em></>} />

        <KPICard label="Mean Score" value={kpis.meanInstituteScore ?? 0} format={(n) => n.toFixed(1)} icon={Gauge} accent="#7c3aed"
          sub="out of 100, institute level"
          methodology={<><strong>Mean Institute Score</strong><br />Each institute scores the mean of its trade scores; each trade score is the sum of 16 components (max 100). This figure is the mean across institutes.<br /><em>Source: columns S–AH, recomputed.</em></>} />

        <KPICard label="Presence" value={(kpis.presenceRate ?? 0) * 100} format={(n) => n.toFixed(1) + "%"} icon={Layers} accent="#db2777"
          sub={`${fmtInt(kpis.present)} present · ${fmtPct(kpis.utilizationRate)} seats filled`}
          methodology={<><strong>Physical Presence</strong><br />Σ Present ÷ Σ Registered — how many enrolled trainees were physically in the room. Distinct from Attendance %, which is CNIC-verified against sanctioned seats.<br /><em>Source: columns O and M.</em></>} />
      </div>

      {/* Tier 2 — composition and comparison */}
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <ChartCard
          title="Performance grades"
          subtitle={`${institutes.length} institutes · click a segment to filter`}
          height={286}
          methodology={<><strong>Grade distribution</strong><br />Grades are read from the workbook&apos;s <code>Grading</code> column (column AK), which is the declared source of truth. The old dashboard used a ≥85 threshold rule instead, which yields a different split — both are shown on the Methodology page.</>}
          data={gradeCounts.map((g) => ({ label: g.name, value: g.value }))}
          onEvent={{ type: "click", handler: (p) => { const name = (p as { name: string }).name; patch({ grade: filters.grade.includes(name) ? filters.grade.filter((x) => x !== name) : [...filters.grade, name] }); } }}
          option={{
            tooltip: { trigger: "item", formatter: (p: unknown) => { const q = p as { name: string; value: number; percent: number }; return `${q.name}<br/><b>${q.value}</b> institutes (${q.percent.toFixed(1)}%)`; } },
            legend: { type: "scroll", bottom: 0, left: "center" },
            series: [{
              type: "pie", radius: ["52%", "76%"], center: ["50%", "44%"],
              avoidLabelOverlap: true, padAngle: 2, itemStyle: { borderRadius: 5 },
              label: { show: false }, emphasis: { scaleSize: 6 },
              data: gradeCounts,
            }],
          }}
        />

        <ChartCard
          title="Region comparison"
          subtitle="Mean trade score and attendance by region"
          height={310}
          className="lg:col-span-2"
          methodology={<><strong>Region comparison</strong><br />Bars: mean of trade scores for all assessments in the region. Line: Σ Present ÷ Σ Registered pooled across the region.<br /><em>Only four regions appear in this dataset — Sindh, KP and Balochistan are not covered.</em></>}
          data={regionStats.map((r) => ({ label: r.key, value: `${r.meanScore.toFixed(1)} · ${fmtPct(r.attendanceRate)}` }))}
          onEvent={{ type: "click", handler: (p) => { const name = (p as { name: string }).name; patch({ region: filters.region.includes(name) ? filters.region.filter((x) => x !== name) : [...filters.region, name] }); } }}
          option={{
            // Legend sits below the plot: with two y-axes there is no room for it
            // beside the right-hand axis name without the two overlapping.
            grid: { left: 54, right: 58, top: 30, bottom: 54 },
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
            legend: { bottom: 0, left: "center", itemGap: 20, padding: [4, 0, 0, 0] },
            xAxis: { type: "category", data: regionStats.map((r) => r.key), axisLabel: { margin: 12 } },
            yAxis: [
              { type: "value", name: "Score", max: 100, nameGap: 14, nameTextStyle: { fontSize: 10, align: "right" } },
              { type: "value", name: "Attendance %", max: 100, nameGap: 14, axisLabel: { formatter: "{value}%" }, splitLine: { show: false }, nameTextStyle: { fontSize: 10, align: "left" } },
            ],
            series: [
              {
                name: "Mean score", type: "bar", barMaxWidth: 46, itemStyle: { borderRadius: [5, 5, 0, 0], color: "#2563eb" },
                data: regionStats.map((r) => Number(r.meanScore.toFixed(2))),
                label: { show: true, position: "top", fontSize: 10, distance: 6, formatter: "{c}" },
              },
              {
                name: "Attendance %", type: "line", yAxisIndex: 1, smooth: true, symbolSize: 7,
                lineStyle: { width: 2.5, color: "#d97706" }, itemStyle: { color: "#d97706" },
                data: regionStats.map((r) => (r.attendanceRate === null ? null : Number((r.attendanceRate * 100).toFixed(1)))),
              },
            ],
          }}
        />
      </div>

      <ChartCard
        title="Enrolment funnel"
        subtitle="Sanctioned seats through to verified attendance"
        height={230}
        className="mb-4"
        methodology={<><strong>Enrolment funnel</strong><br />Each stage is a straight sum over the filtered rows: Approved Capacity (L), Registered on biometric device (M), Present (O), CNIC Verified (Q). Percentages are of approved capacity.<br /><em>The stages are cumulative counts, not survival — a trainee can be registered and absent.</em></>}
        data={funnelStages.map((f) => ({ label: f.stage, value: `${fmtInt(f.value)} (${f.pctOfCapacity?.toFixed(1)}%)` }))}
        option={{
          grid: { left: 118, right: 90, top: 8, bottom: 8 },
          tooltip: {
            trigger: "axis", axisPointer: { type: "shadow" },
            formatter: (p: unknown) => {
              const a = (p as { dataIndex: number }[])[0]; const f = funnelStages[a.dataIndex];
              return `<b>${f.stage}</b><br/>${fmtInt(f.value)} trainees (${f.pctOfCapacity?.toFixed(1)}% of capacity)<br/>${f.note}`;
            },
          },
          xAxis: { type: "value", max: funnelStages[0]?.value ?? 100, show: false },
          yAxis: { type: "category", data: funnelStages.map((f) => f.stage), axisLabel: { fontSize: 11 }, axisTick: { show: false } },
          series: [{
            type: "bar", barMaxWidth: 30,
            label: {
              show: true, position: "right", fontSize: 10.5,
              formatter: (p: unknown) => {
                const q = p as { dataIndex: number; value: number };
                return `${q.value.toLocaleString()}  ·  ${funnelStages[q.dataIndex].pctOfCapacity?.toFixed(1)}%`;
              },
            },
            data: funnelStages.map((f, i) => ({
              value: f.value,
              itemStyle: { borderRadius: [0, 5, 5, 0], color: ["#c2cfdd", "#2563eb", "#0891b2", "#059669"][i] },
            })),
          }],
        }}
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <ChartCard
          title="Score distribution"
          subtitle="Institutes per ten-point band"
          height={252}
          methodology={<><strong>Score distribution</strong><br />Count of institutes whose mean trade score falls in each ten-point band. Shows spread rather than a single average.</>}
          data={bins.map((b) => ({ label: b.label, value: b.count }))}
          option={{
            grid: { left: 40, right: 14, top: 16, bottom: 30 },
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p: unknown) => { const a = p as { name: string; value: number }[]; return `Score ${a[0].name}<br/><b>${a[0].value}</b> institutes`; } },
            xAxis: { type: "category", data: bins.map((b) => b.label), axisLabel: { fontSize: 10, rotate: 30 } },
            yAxis: { type: "value", name: "Institutes", nameTextStyle: { fontSize: 10 } },
            series: [{
              type: "bar", barMaxWidth: 38, data: bins.map((b) => b.count),
              itemStyle: { borderRadius: [4, 4, 0, 0], color: "#0891b2" },
            }],
          }}
        />

        <ChartCard
          title="Category performance"
          subtitle="Mean achievement against each category maximum"
          height={252}
          methodology={<><strong>Category performance</strong><br />The 16 score components group into 6 categories whose maxima sum to 100. Shown as percentage of each category&apos;s own maximum so they are comparable.<br /><em>Grouping preserved from the previous dashboard.</em></>}
          data={categoryMeans.map((c) => ({ label: c.label, value: `${c.value.toFixed(2)} / ${c.max}` }))}
          option={{
            radar: {
              indicator: categoryMeans.map((c) => ({ name: c.label, max: 100 })),
              radius: "66%", splitNumber: 4,
              axisName: { fontSize: 10, color: "#64798f" },
              splitArea: { areaStyle: { color: ["transparent"] } },
            },
            tooltip: {
              trigger: "item",
              formatter: () => categoryMeans.map((c) => `${c.label}: <b>${c.value.toFixed(2)}</b> / ${c.max}`).join("<br/>"),
            },
            series: [{
              type: "radar", symbolSize: 5,
              areaStyle: { color: "rgba(37,99,235,.18)" },
              lineStyle: { width: 2, color: "#2563eb" }, itemStyle: { color: "#2563eb" },
              data: [{ value: categoryMeans.map((c) => Number(((c.value / c.max) * 100).toFixed(1))), name: "Mean achievement %" }],
            }],
          }}
        />
      </div>

      {/* Tier 3 — rankings */}
      <div className="grid gap-3 lg:grid-cols-2">
        <RankPanel title="Top performing institutes" tone="good" items={topInstitutes} />
        <RankPanel title="Institutions requiring attention" tone="bad" items={attention} />
      </div>
    </>
  );
}

function RankPanel({ title, items, tone }: { title: string; tone: "good" | "bad"; items: ReturnType<typeof useFilters>["institutes"] }) {
  return (
    <Card className="print-avoid overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <Link href="/institutions" className="no-print text-[11px] font-medium text-brand-600 hover:underline">View all →</Link>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {items.map((i) => {
          const g = gradeOf(i);
          return (
            <Link key={i.instituteId} href={`/institutions/${i.instituteId}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-3)]">
              <span className={`num grid h-6 w-6 shrink-0 place-items-center rounded text-[10px] font-bold ${
                tone === "good" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
                {i.rank}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium leading-tight">{i.instituteName}</div>
                <div className="truncate text-[10px] text-[var(--text-muted)]">
                  {i.district}, {i.region} · {i.assessments} trade{i.assessments === 1 ? "" : "s"} · {fmtInt(i.biometricRegistered)} trainees
                </div>
              </div>
              <Badge color={GRADE_COLORS[g]}>{g}</Badge>
              <span className="num w-11 shrink-0 text-right text-xs font-bold">{fmtScore(i.score, 1)}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
