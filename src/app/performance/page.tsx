"use client";
import { useMemo } from "react";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card, EmptyState, ProgressBar } from "@/components/ui";
import { components, categories } from "@/lib/dataset";
import { boxStats, componentDrivers } from "@/lib/aggregate";
import { fmtPct, fmtScore, CHART_PALETTE } from "@/config";

export default function PerformancePage() {
  const { rows, institutes, isEmpty, reset } = useFilters();

  const compStats = useMemo(() => components.map((c) => {
    const mean = rows.length ? rows.reduce((s, r) => s + r.components[c.key], 0) / rows.length : 0;
    const full = rows.filter((r) => r.components[c.key] >= c.max).length;
    const zero = rows.filter((r) => r.components[c.key] === 0).length;
    return { ...c, mean, pct: (mean / c.max) * 100, full, zero };
  }).sort((a, b) => b.pct - a.pct), [rows]);

  const strengths = compStats.slice(0, 4);
  const gaps = [...compStats].reverse().slice(0, 4);

  const catByRegion = useMemo(() => {
    const regions = [...new Set(rows.map((r) => r.region))].sort();
    return { regions, series: categories.map((c) => ({
      name: c.label,
      data: regions.map((rg) => {
        const sub = rows.filter((r) => r.region === rg);
        const mean = sub.length ? sub.reduce((s, r) => s + r.categoryScores[c.key], 0) / sub.length : 0;
        return Number(((mean / c.max) * 100).toFixed(1));
      }),
    })) };
  }, [rows]);

  // Which components actually separate strong institutes from weak ones.
  const drivers = useMemo(() => componentDrivers(rows, components), [rows]);

  // Distribution of trade scores by region, not just the mean.
  const boxes = useMemo(() => boxStats(rows, (r) => r.region, (r) => r.tradeScore), [rows]);

  // Attendance spread across assessments (restores a chart the old dashboard had).
  const attBins = useMemo(() => {
    const bins = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, label: `${i * 10}–${i * 10 + 10}%`, count: 0 }));
    for (const r of rows) {
      if (r.attendanceRate === null) continue;
      const idx = Math.min(Math.floor(r.attendanceRate * 10), 9);
      bins[idx].count++;
    }
    return bins;
  }, [rows]);

  const noAttendanceData = useMemo(() => rows.filter((r) => r.attendanceRate === null).length, [rows]);

  const scatter = useMemo(
    () => institutes.map((i) => [
      Number(((i.attendanceRate ?? 0) * 100).toFixed(1)),
      Number(i.score.toFixed(2)),
      i.biometricRegistered, i.instituteName, i.region,
    ]), [institutes]);

  if (isEmpty) {
    return (<><PageHeader page="Performance" title="Performance Analysis" /><Card><EmptyState onClear={reset} /></Card></>);
  }

  return (
    <>
      <PageHeader page="Performance" title="Performance Analysis"
        description="How the 100-point compliance score is actually earned, and where it is lost." />

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card className="print-avoid p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">Strongest components</h3>
          <div className="space-y-3">
            {strengths.map((c) => (
              <div key={c.key}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-medium">{c.label}</span>
                  <span className="num text-[var(--text-muted)]">{c.mean.toFixed(2)} / {c.max} · <strong>{c.pct.toFixed(0)}%</strong></span>
                </div>
                <ProgressBar value={c.pct} max={100} color="#10b981" />
                <div className="mt-1 text-[10px] text-[var(--text-muted)]">{c.full} of {rows.length} assessments scored full marks</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="print-avoid p-4">
          <h3 className="mb-3 text-[13px] font-semibold text-red-700 dark:text-red-400">Weakest components</h3>
          <div className="space-y-3">
            {gaps.map((c) => (
              <div key={c.key}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-medium">{c.label}</span>
                  <span className="num text-[var(--text-muted)]">{c.mean.toFixed(2)} / {c.max} · <strong>{c.pct.toFixed(0)}%</strong></span>
                </div>
                <ProgressBar value={c.pct} max={100} color="#dc2626" />
                <div className="mt-1 text-[10px] text-[var(--text-muted)]">{c.zero} of {rows.length} assessments scored zero</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="All 16 components" subtitle="Mean achievement against each maximum" height={400}
          methodology={<><strong>Component achievement</strong><br />Mean score on each component across the filtered assessments, expressed as a percentage of that component&apos;s maximum so components with different weights are comparable.<br /><em>Source: columns S–AH.</em></>}
          data={compStats.map((c) => ({ label: c.label, value: `${c.mean.toFixed(2)} / ${c.max}` }))}
          option={{
            grid: { left: 8, right: 44, top: 8, bottom: 8, containLabel: true },
            tooltip: {
              trigger: "axis", axisPointer: { type: "shadow" },
              formatter: (p: unknown) => {
                const a = (p as { dataIndex: number }[])[0]; const c = [...compStats].reverse()[a.dataIndex];
                return `<b>${c.label}</b><br/>Mean ${c.mean.toFixed(2)} of ${c.max} (${c.pct.toFixed(1)}%)<br/>${c.full} full marks · ${c.zero} zeros`;
              },
            },
            xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            yAxis: { type: "category", data: [...compStats].reverse().map((c) => c.label), axisLabel: { fontSize: 10 } },
            series: [{
              type: "bar", barMaxWidth: 13,
              label: { show: true, position: "right", fontSize: 9.5, formatter: (p: unknown) => Number((p as { value: number }).value).toFixed(0) + "%" },
              data: [...compStats].reverse().map((c) => ({
                value: Number(c.pct.toFixed(1)),
                itemStyle: { borderRadius: [0, 3, 3, 0], color: c.pct >= 80 ? "#10b981" : c.pct >= 55 ? "#2563eb" : c.pct >= 30 ? "#d97706" : "#dc2626" },
              })),
            }],
          }} />

        <ChartCard title="Category achievement by region" subtitle="Percentage of each category maximum" height={400}
          methodology={<><strong>Category by region</strong><br />Each of the 6 categories scored as a percentage of its own maximum, split by region. Highlights whether a region&apos;s weakness is infrastructure, trainers, delivery or industry linkage.</>}
          data={categories.map((c) => ({ label: c.label, value: `max ${c.max}` }))}
          option={{
            grid: { left: 52, right: 14, top: 30, bottom: 30 },
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => `${v}%` },
            legend: { top: 0, type: "scroll" },
            xAxis: { type: "category", data: catByRegion.regions },
            yAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            series: catByRegion.series.map((s, i) => ({
              name: s.name, type: "bar", barMaxWidth: 15,
              itemStyle: { borderRadius: [3, 3, 0, 0], color: CHART_PALETTE[i % CHART_PALETTE.length] },
              data: s.data,
            })),
          }} />
      </div>

      <ChartCard title="Attendance against compliance score" subtitle="One point per institute · bubble size is enrolment" height={400}
        methodology={<><strong>Attendance vs score</strong><br />X: Σ CNIC Verified ÷ Σ Approved Capacity for the institute. Y: mean trade score. Attendance carries 35 of the 100 available points, so a strong relationship is expected — points far from the trend are worth investigating.</>}
        data={institutes.slice(0, 20).map((i) => ({ label: i.instituteName, value: `${fmtPct(i.attendanceRate)} · ${fmtScore(i.score, 1)}` }))}
        option={{
          grid: { left: 48, right: 20, top: 20, bottom: 44 },
          tooltip: {
            formatter: (p: unknown) => {
              const q = p as { data: [number, number, number, string, string] };
              return `<b>${q.data[3]}</b><br/>${q.data[4]}<br/>Attendance ${q.data[0]}%<br/>Score ${q.data[1].toFixed(1)}<br/>${q.data[2].toLocaleString()} trainees`;
            },
          },
          xAxis: { type: "value", name: "Attendance %", max: 100, nameLocation: "middle", nameGap: 27, nameTextStyle: { fontSize: 10 } },
          yAxis: { type: "value", name: "Institute score", max: 100, nameTextStyle: { fontSize: 10 } },
          series: [{
            type: "scatter",
            symbolSize: (d: unknown) => { const v = d as number[]; return Math.max(6, Math.min(Math.sqrt(v[2]) * 1.5, 26)); },
            itemStyle: { color: "#2563eb", opacity: 0.5, borderColor: "#fff", borderWidth: 0.5 },
            data: scatter,
          }],
        }} />

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="What actually drives the score" subtitle="Correlation of each component with the total"
          height={400}
          methodology={<><strong>Component discrimination</strong><br />Pearson correlation between each component and the total trade score, across the filtered assessments. A component can be worth many points and still fail to separate institutes — if everyone scores the same on it, it adds points but no information.<br /><em>Read alongside the achievement chart: high points and low correlation means the component is not discriminating.</em></>}
          data={drivers.map((d) => ({ label: d.label, value: `r = ${d.r.toFixed(3)} · max ${d.max}` }))}
          option={{
            grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
            tooltip: {
              trigger: "axis", axisPointer: { type: "shadow" },
              formatter: (p: unknown) => {
                const a = (p as { dataIndex: number }[])[0]; const c = [...drivers].reverse()[a.dataIndex];
                return `<b>${c.label}</b><br/>Correlation r = ${c.r.toFixed(3)}<br/>Mean ${c.mean.toFixed(2)} of ${c.max} (${c.pct.toFixed(0)}%)`;
              },
            },
            xAxis: { type: "value", min: 0, max: 1 },
            yAxis: { type: "category", data: [...drivers].reverse().map((d) => d.label), axisLabel: { fontSize: 10 } },
            series: [{
              type: "bar", barMaxWidth: 13,
              label: { show: true, position: "right", fontSize: 9.5, formatter: (p: unknown) => Number((p as { value: number }).value).toFixed(2) },
              data: [...drivers].reverse().map((d) => ({
                value: Number(d.r.toFixed(3)),
                itemStyle: { borderRadius: [0, 3, 3, 0], color: d.r >= 0.5 ? "#7c3aed" : d.r >= 0.3 ? "#2563eb" : "#c2cfdd" },
              })),
            }],
          }} />

        <ChartCard title="Score spread by region" subtitle="Median, quartiles and range — not just the average"
          height={400}
          methodology={<><strong>Score distribution by region</strong><br />Box shows the interquartile range with the median line; whiskers run to the minimum and maximum trade score in the region. A region can have a healthy mean and still contain failing institutes — the whisker length is where that shows up.</>}
          data={boxes.map((b) => ({ label: `${b.key} (n=${b.n})`, value: `median ${b.median.toFixed(1)} · ${b.min.toFixed(1)}–${b.max.toFixed(1)}` }))}
          option={{
            grid: { left: 46, right: 16, top: 20, bottom: 30 },
            tooltip: {
              trigger: "item",
              formatter: (p: unknown) => {
                const q = p as { dataIndex: number };
                const b = boxes[q.dataIndex];
                if (!b) return "";
                return `<b>${b.key}</b> · ${b.n} assessments<br/>Max ${b.max.toFixed(1)}<br/>Q3 ${b.q3.toFixed(1)}<br/><b>Median ${b.median.toFixed(1)}</b><br/>Q1 ${b.q1.toFixed(1)}<br/>Min ${b.min.toFixed(1)}`;
              },
            },
            xAxis: { type: "category", data: boxes.map((b) => b.key) },
            yAxis: { type: "value", name: "Trade score", min: 0, max: 100, nameTextStyle: { fontSize: 10 } },
            series: [{
              type: "boxplot", boxWidth: [12, 44],
              itemStyle: { color: "rgba(37,99,235,.16)", borderColor: "#2563eb", borderWidth: 1.6 },
              data: boxes.map((b) => [b.min, b.q1, b.median, b.q3, b.max]),
            }],
          }} />
      </div>

      <ChartCard className="mt-4" title="Attendance distribution" subtitle={`${rows.length - noAttendanceData} assessments with a computable attendance rate`}
        height={260}
        methodology={<><strong>Attendance distribution</strong><br />Count of assessments per ten-point attendance band, using CNIC Verified ÷ Approved Capacity.{noAttendanceData > 0 ? ` ${noAttendanceData} assessment${noAttendanceData === 1 ? " is" : "s are"} excluded because approved capacity is zero, so the rate is undefined rather than zero.` : ""}</>}
        data={attBins.map((b) => ({ label: b.label, value: b.count }))}
        option={{
          grid: { left: 44, right: 16, top: 16, bottom: 34 },
          tooltip: {
            trigger: "axis", axisPointer: { type: "shadow" },
            formatter: (p: unknown) => {
              const a = (p as { name: string; value: number }[])[0];
              return `Attendance ${a.name}<br/><b>${a.value}</b> assessments`;
            },
          },
          xAxis: { type: "category", data: attBins.map((b) => b.label), axisLabel: { fontSize: 10, rotate: 24 } },
          yAxis: { type: "value", name: "Assessments", nameTextStyle: { fontSize: 10 } },
          series: [{
            type: "bar", barMaxWidth: 42,
            data: attBins.map((b) => ({
              value: b.count,
              itemStyle: { borderRadius: [4, 4, 0, 0], color: b.from >= 80 ? "#10b981" : b.from >= 50 ? "#2563eb" : "#dc2626" },
            })),
          }],
        }} />
    </>
  );
}
