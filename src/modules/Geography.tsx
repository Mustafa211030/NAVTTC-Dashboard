"use client";
import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { RankedBars, HeatmapCard } from "@/components/charts/blocks";
import { PakistanMap } from "@/components/charts/PakistanMap";
import { Card, EmptyState, Badge, MiniSelect, Seg } from "@/components/ui";
import { groupBy, METRICS, metricByKey, fmtMetric } from "@/lib/aggregate";
import { fmtInt, fmtPct, fmtScore, REGION_COLORS, CHART_PALETTE, scoreColor } from "@/config";

export function GeographyModule() {
  const { rows, isEmpty, reset, toggle, filters, scope, data } = useDash();
  const regions = useMemo(() => groupBy(rows, (r) => r.region).sort((a, b) => b.enrolled - a.enrolled), [rows]);
  const districts = useMemo(() => groupBy(rows, (r) => r.district), [rows]);
  const portfolio = scope.mode === "portfolio";

  if (isEmpty) return (<><PageHeader page="Geography" title="Geographic Analysis" /><Card><EmptyState onClear={reset} /></Card></>);

  return (
    <>
      <PageHeader page="Geography" title="Geographic Analysis"
        description={`${regions.length} regions and ${districts.length} districts in view. Click any region, district or province to filter every module.`} />

      <PakistanMap />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {regions.map((r, i) => {
          const on = filters.region.includes(r.key);
          const progMix = portfolio ? groupBy(rows.filter((x) => x.region === r.key), (x) => x.p) : [];
          return (
            <Card key={r.key} className={`card-hover rise cursor-pointer p-3.5 ${on ? "ring-2 ring-brand-500" : ""}`} onClick={() => toggle("region", r.key)}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{r.key}</span>
                <Badge color={REGION_COLORS[r.key] ?? CHART_PALETTE[i]}>{r.institutes} institutes</Badge>
              </div>
              <div className="num mt-2 text-xl font-bold leading-none" style={{ color: scoreColor(r.meanScore) }}>{fmtScore(r.meanScore, 1)}</div>
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">mean trade score</div>
              <div className="mt-2 grid grid-cols-3 gap-1 border-t border-[var(--border)] pt-2 text-[10px]">
                <div><span className="text-[var(--text-muted)]">Enrolled</span><div className="num font-semibold">{fmtInt(r.enrolled)}</div></div>
                <div><span className="text-[var(--text-muted)]">Attend.</span><div className="num font-semibold">{fmtPct(r.attendanceRate, 0)}</div></div>
                <div><span className="text-[var(--text-muted)]">Dropout</span><div className="num font-semibold">{fmtPct(r.dropoutRate, 1)}</div></div>
              </div>
              {progMix.length > 1 && (
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" title="Enrolment by programme">
                  {progMix.sort((a, b) => (data.programBySlug.get(a.key)?.order ?? 0) - (data.programBySlug.get(b.key)?.order ?? 0)).map((g) => (
                    <div key={g.key} style={{ width: `${(g.enrolled / (r.enrolled || 1)) * 100}%`, background: data.programBySlug.get(g.key)?.color }} />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-5">
        <RankedBars className="lg:col-span-3" title="District ranking" rows={rows} dims={["district", "division", "region"]} defaultDim="district" defaultTop={50} />
        <TreemapCard className="lg:col-span-2" />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <PipelineCard />
        <HeatmapCard title={portfolio ? "District × programme" : "District × trade category"} rows={rows}
          rowDims={["district", "region", "division"]} colDims={portfolio ? ["program", "region"] : ["tradeCategory", "package", "duration", "batch", "region"]}
          defaultRow="district" defaultCol={portfolio ? "program" : undefined} />
      </div>
    </>
  );
}

function TreemapCard({ className }: { className?: string }) {
  const { rows, toggle } = useDash();
  const [mk, setMk] = useState("enrolled");
  const size = metricByKey.get(mk)!;
  const tree = useMemo(() => {
    const byRegion = new Map<string, typeof rows>();
    for (const r of rows) { if (!byRegion.has(r.region)) byRegion.set(r.region, []); byRegion.get(r.region)!.push(r); }
    return [...byRegion.entries()].map(([region, rs], i) => ({
      name: region, itemStyle: { color: REGION_COLORS[region] ?? CHART_PALETTE[i] },
      children: groupBy(rs, (r) => r.district).map((d) => ({ name: d.key, value: size.get(d) ?? 0, score: d.meanScore, enrolled: d.enrolled, att: d.attendanceRate })),
    }));
  }, [rows, size]);

  const option: EChartsOption = {
    tooltip: { formatter: (p: unknown) => { const q = p as { name: string; value: number; data: { score?: number | null; att?: number | null } }; return `<b>${q.name}</b><br/>${size.label}: <b>${fmtMetric(size.kind, size.kind === "rate" ? q.value : q.value)}</b>${q.data.score !== undefined ? `<br/>Mean score ${fmtScore(q.data.score, 1)} · Attendance ${fmtPct(q.data.att ?? null)}` : ""}`; } },
    series: [{
      type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
      upperLabel: { show: true, height: 20, fontSize: 10.5, fontWeight: 700, color: "#fff" },
      itemStyle: { borderColor: "transparent", gapWidth: 2 },
      levels: [{ itemStyle: { gapWidth: 3 } }, { colorSaturation: [0.3, 0.6], itemStyle: { gapWidth: 1, borderColorSaturation: 0.5 } }],
      label: { fontSize: 10, formatter: (p: unknown) => { const q = p as { name: string; value: number }; return `${q.name}\n${size.kind === "count" ? fmtInt(q.value) : fmtMetric(size.kind, q.value)}`; } },
      data: tree,
    }],
  } as EChartsOption;

  return (
    <ChartCard title="Region → district" className={className} subtitle={`Area = ${size.label.toLowerCase()} · click a district to filter`} height={420}
      methodology={<><strong>Treemap</strong><br />Each district is nested inside its region; area is the selected count.</>}
      onEvent={{ type: "click", handler: (p) => { const q = p as { treePathInfo?: unknown[]; name: string }; if ((q.treePathInfo?.length ?? 0) > 2) toggle("district", q.name); else toggle("region", q.name); } }}
      controls={<MiniSelect label="Size" value={mk} onChange={setMk} options={METRICS.filter((m) => m.kind === "count").map((m) => ({ value: m.key, label: m.label }))} />}
      option={option} />
  );
}

function PipelineCard() {
  const { rows } = useDash();
  const [sort, setSort] = useState<"capacity" | "gap">("capacity");
  const ds = useMemo(() => {
    const g = groupBy(rows, (r) => r.district);
    return sort === "capacity" ? g.sort((a, b) => b.capacity - a.capacity) : g.sort((a, b) => (a.verificationRate ?? 0) - (b.verificationRate ?? 0));
  }, [rows, sort]);
  const option: EChartsOption = {
    grid: { left: 52, right: 14, top: 34, bottom: 78 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0 },
    xAxis: { type: "category", data: ds.map((d) => d.key), axisLabel: { fontSize: 9.5, rotate: 45, interval: 0 } },
    yAxis: { type: "value", name: "Trainees", nameTextStyle: { fontSize: 10 } },
    dataZoom: ds.length > 18 ? [{ type: "slider", height: 14, bottom: 4, start: 0, end: Math.min(100, (18 / ds.length) * 100) }, { type: "inside" }] : undefined,
    series: [
      { name: "Approved capacity", type: "bar", barMaxWidth: 14, itemStyle: { borderRadius: [3, 3, 0, 0], color: "#c2cfdd" }, data: ds.map((d) => d.capacity) },
      { name: "Enrolled", type: "bar", barMaxWidth: 14, itemStyle: { borderRadius: [3, 3, 0, 0], color: "#2563eb" }, data: ds.map((d) => d.enrolled) },
      { name: "Present", type: "bar", barMaxWidth: 14, itemStyle: { borderRadius: [3, 3, 0, 0], color: "#0891b2" }, data: ds.map((d) => d.present) },
      { name: "CNIC verified", type: "bar", barMaxWidth: 14, itemStyle: { borderRadius: [3, 3, 0, 0], color: "#10b981" }, data: ds.map((d) => d.verified),
        label: { show: ds.length <= 14, position: "top", fontSize: 9, formatter: (p: unknown) => fmtPct(ds[(p as { dataIndex: number }).dataIndex].verificationRate, 0) } },
    ],
  } as EChartsOption;
  return (
    <ChartCard title="Capacity pipeline by district" subtitle="Seats → enrolled → present → CNIC verified" height={360}
      methodology={<><strong>Capacity pipeline</strong><br />The gaps between bars are where sanctioned seats are lost: unfilled, absent, or present but unverified.</>}
      table={{ columns: ["District", "Capacity", "Enrolled", "Present", "CNIC verified", "Verified % of seats"], rows: ds.map((d) => [d.key, d.capacity, d.enrolled, d.present, d.verified, fmtPct(d.verificationRate)]) }}
      controls={<Seg value={sort} onChange={setSort} label="Sort" options={[{ value: "capacity", label: "Largest first" }, { value: "gap", label: "Worst verification first" }]} />}
      option={option} />
  );
}
