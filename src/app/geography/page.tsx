"use client";
import { useMemo } from "react";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card, EmptyState, Badge } from "@/components/ui";
import { PakistanMap } from "@/components/charts/PakistanMap";
import { groupBy } from "@/lib/aggregate";
import { fmtInt, fmtPct, fmtScore, CHART_PALETTE } from "@/config";

export default function GeographyPage() {
  const { rows, isEmpty, reset, patch, filters } = useFilters();

  const regions = useMemo(() => groupBy(rows, (r) => r.region).sort((a, b) => b.registered - a.registered), [rows]);
  const districts = useMemo(() => groupBy(rows, (r) => r.district).sort((a, b) => b.meanScore - a.meanScore), [rows]);

  // Region → district treemap. Replaces a choropleth: only 4 of Pakistan's
  // regions appear in this dataset, so a national map would render mostly empty.
  const treemap = useMemo(() => {
    const byRegion = new Map<string, Map<string, { registered: number; score: number; n: number }>>();
    for (const r of rows) {
      if (!byRegion.has(r.region)) byRegion.set(r.region, new Map());
      const m = byRegion.get(r.region)!;
      const cur = m.get(r.district) ?? { registered: 0, score: 0, n: 0 };
      m.set(r.district, { registered: cur.registered + r.biometricRegistered, score: cur.score + r.tradeScore, n: cur.n + 1 });
    }
    return [...byRegion.entries()].map(([region, ds], i) => ({
      name: region,
      itemStyle: { color: CHART_PALETTE[i % CHART_PALETTE.length] },
      children: [...ds.entries()].map(([d, v]) => ({
        name: d, value: v.registered, score: v.n ? v.score / v.n : 0,
      })),
    }));
  }, [rows]);

  if (isEmpty) {
    return (<><PageHeader page="Geography" title="Geographic Analysis" /><Card><EmptyState onClear={reset} /></Card></>);
  }

  return (
    <>
      <PageHeader page="Geography" title="Geographic Analysis"
        description="Coverage spans 4 regions and 25 districts. Sindh, Khyber Pakhtunkhwa and Balochistan are not part of this assessment round." />

      {/* Interactive map. Everything below it is unchanged. */}
      <PakistanMap />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {regions.map((r, i) => (
          <Card key={r.key} className="card-hover rise cursor-pointer p-3.5"
            onClick={() => patch({ region: filters.region.includes(r.key) ? filters.region.filter((x) => x !== r.key) : [...filters.region, r.key] })}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">{r.key}</span>
              <Badge color={CHART_PALETTE[i % CHART_PALETTE.length]}>{r.institutes} TPIs</Badge>
            </div>
            <div className="num mt-2 text-xl font-bold leading-none">{fmtScore(r.meanScore, 1)}</div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">mean score</div>
            <div className="mt-2 grid grid-cols-2 gap-1 border-t border-[var(--border)] pt-2 text-[10px]">
              <div><span className="text-[var(--text-muted)]">Trainees</span><div className="num font-semibold">{fmtInt(r.registered)}</div></div>
              <div><span className="text-[var(--text-muted)]">Attendance %</span><div className="num font-semibold">{fmtPct(r.attendanceRate)}</div></div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-5">
        <ChartCard className="lg:col-span-3" title="District ranking" subtitle="Mean trade score · click a bar to filter" height={Math.max(340, districts.length * 16)}
          methodology={<><strong>District ranking</strong><br />Mean of trade scores for every assessment in the district. Bar length is the score; the label shows the number of trainees registered.</>}
          data={districts.map((d) => ({ label: d.key, value: `${d.meanScore.toFixed(2)} (${fmtInt(d.registered)} trainees)` }))}
          onEvent={{ type: "click", handler: (p) => { const name = (p as { name: string }).name; patch({ district: filters.district.includes(name) ? filters.district.filter((x) => x !== name) : [...filters.district, name] }); } }}
          option={{
            grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
            tooltip: {
              trigger: "axis", axisPointer: { type: "shadow" },
              formatter: (p: unknown) => {
                const a = (p as { dataIndex: number }[])[0]; const d = [...districts].reverse()[a.dataIndex];
                return `<b>${d.key}</b><br/>Score <b>${d.meanScore.toFixed(2)}</b><br/>${d.institutes} institutes · ${fmtInt(d.registered)} trainees<br/>Attendance ${fmtPct(d.attendanceRate)}`;
              },
            },
            xAxis: { type: "value", max: 100 },
            yAxis: { type: "category", data: [...districts].reverse().map((d) => d.key), axisLabel: { fontSize: 10 } },
            series: [{
              type: "bar", barMaxWidth: 12,
              data: [...districts].reverse().map((d) => ({
                value: Number(d.meanScore.toFixed(2)),
                itemStyle: { borderRadius: [0, 3, 3, 0], color: d.meanScore >= 80 ? "#10b981" : d.meanScore >= 65 ? "#2563eb" : d.meanScore >= 50 ? "#d97706" : "#dc2626" },
              })),
              label: { show: true, position: "right", fontSize: 9.5, formatter: (p: unknown) => Number((p as { value: number }).value).toFixed(1) },
            }],
          }} />

        <ChartCard className="lg:col-span-2" title="Trainee distribution" subtitle="Region → district, sized by registered trainees" height={Math.max(340, districts.length * 16)}
          methodology={<><strong>Trainee distribution</strong><br />Treemap area is Σ Registered per district, nested inside its region. Used instead of a choropleth because only 4 regions are covered — a national map would render three provinces as empty.</>}
          data={districts.map((d) => ({ label: d.key, value: fmtInt(d.registered) }))}
          option={{
            tooltip: {
              formatter: (p: unknown) => {
                const q = p as { name: string; value: number; data: { score?: number } };
                return `<b>${q.name}</b><br/>${fmtInt(q.value)} trainees${q.data.score ? `<br/>Mean score ${q.data.score.toFixed(1)}` : ""}`;
              },
            },
            series: [{
              type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
              upperLabel: { show: true, height: 20, fontSize: 10, color: "#fff" },
              itemStyle: { borderColor: "transparent", borderWidth: 1, gapWidth: 2 },
              levels: [{ itemStyle: { gapWidth: 3 } }, { colorSaturation: [0.32, 0.62], itemStyle: { gapWidth: 1, borderColorSaturation: 0.5 } }],
              label: { fontSize: 10, formatter: "{b}" },
              data: treemap,
            }],
          }} />
      </div>

      <ChartCard title="Capacity, registration and attendance by district" height={330}
        methodology={<><strong>Capacity pipeline</strong><br />For each district: approved seats, trainees actually registered on the biometric device, and trainees present on the assessment day. The gaps between the three bars are the leakage points.</>}
        data={districts.map((d) => ({ label: d.key, value: `${fmtInt(d.capacity)} → ${fmtInt(d.registered)} → ${fmtInt(d.present)}` }))}
        option={{
          grid: { left: 52, right: 14, top: 30, bottom: 74 },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
          legend: { top: 0, right: 0 },
          xAxis: { type: "category", data: districts.map((d) => d.key), axisLabel: { fontSize: 9.5, rotate: 42 } },
          yAxis: { type: "value", name: "Trainees", nameTextStyle: { fontSize: 10 } },
          series: [
            { name: "Approved capacity", type: "bar", barMaxWidth: 16, itemStyle: { borderRadius: [3, 3, 0, 0], color: "#c2cfdd" }, data: districts.map((d) => d.capacity) },
            { name: "Registered", type: "bar", barMaxWidth: 16, itemStyle: { borderRadius: [3, 3, 0, 0], color: "#2563eb" }, data: districts.map((d) => d.registered) },
            { name: "Present", type: "bar", barMaxWidth: 16, itemStyle: { borderRadius: [3, 3, 0, 0], color: "#10b981" }, data: districts.map((d) => d.present) },
          ],
        }} />
    </>
  );
}