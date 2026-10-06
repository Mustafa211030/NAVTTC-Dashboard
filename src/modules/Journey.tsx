"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp, TrendingDown, MoveRight, Link2 } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { KPICard } from "@/components/dashboard/KPICard";
import { DataTable } from "@/components/tables/DataTable";
import { Card, EmptyState, MiniSelect, Seg, Badge, Delta } from "@/components/ui";
import type { Institute } from "@/types";
import { GRADE_COLORS, GRADE_ORDER, fmtScore, fmtPct, truncate } from "@/config";
import { globalInstituteHref } from "@/lib/portfolio";

interface Pair { key: string; name: string; district: string; region: string; a: Institute; b: Institute; delta: number | null; attDelta: number | null }

export function JourneyModule() {
  const { data, institutes, scope } = useDash();
  const router = useRouter();

  /** Programme × programme overlap counts (on the filtered institutes). */
  const byGlobal = useMemo(() => {
    const m = new Map<string, Map<string, Institute>>();
    for (const i of institutes) { if (!m.has(i.globalKey)) m.set(i.globalKey, new Map()); m.get(i.globalKey)!.set(i.p, i); }
    return m;
  }, [institutes]);

  const progs = data.programs.filter((p) => institutes.some((i) => i.p === p.slug));
  const overlap = useMemo(() => {
    const out: { a: string; b: string; n: number }[] = [];
    for (const a of progs) for (const b of progs) {
      if (a.order >= b.order) continue;
      let n = 0;
      for (const m of byGlobal.values()) if (m.has(a.slug) && m.has(b.slug)) n++;
      if (n) out.push({ a: a.slug, b: b.slug, n });
    }
    return out.sort((x, y) => y.n - x.n);
  }, [progs, byGlobal]);

  const best = overlap.find((o) => o.a === "pmysdp-b2" && o.b === "pmysdp-b3") ?? overlap[0];
  const [from, setFrom] = useState<string>(best?.a ?? progs[0]?.slug ?? "");
  const [to, setTo] = useState<string>(best?.b ?? progs[1]?.slug ?? "");
  const [threshold, setThreshold] = useState(5);
  const A = data.programBySlug.get(from); const B = data.programBySlug.get(to);

  const pairs = useMemo<Pair[]>(() => {
    const out: Pair[] = [];
    for (const [key, m] of byGlobal) {
      const a = m.get(from); const b = m.get(to);
      if (!a || !b) continue;
      out.push({
        key, name: b.instituteName, district: b.district, region: b.region, a, b,
        delta: a.score !== null && b.score !== null ? b.score - a.score : null,
        attDelta: a.attendanceRate !== null && b.attendanceRate !== null ? b.attendanceRate - a.attendanceRate : null,
      });
    }
    return out.sort((x, y) => (y.delta ?? -999) - (x.delta ?? -999));
  }, [byGlobal, from, to]);

  const withDelta = pairs.filter((p) => p.delta !== null);
  const improved = withDelta.filter((p) => (p.delta as number) >= threshold).length;
  const declined = withDelta.filter((p) => (p.delta as number) <= -threshold).length;
  const stable = withDelta.length - improved - declined;
  const meanDelta = withDelta.length ? withDelta.reduce((s, p) => s + (p.delta as number), 0) / withDelta.length : null;

  /* ---- Sankey: grade migration ---- */
  const sankey = useMemo(() => {
    const flows = new Map<string, number>();
    for (const p of pairs) { const k = `${p.a.grade}|${p.b.grade}`; flows.set(k, (flows.get(k) ?? 0) + 1); }
    const left = GRADE_ORDER.filter((g) => pairs.some((p) => p.a.grade === g));
    const right = GRADE_ORDER.filter((g) => pairs.some((p) => p.b.grade === g));
    const nodes = [
      ...left.map((g) => ({ name: `${A?.code ?? "From"} · ${g}`, itemStyle: { color: GRADE_COLORS[g] }, depth: 0 })),
      ...right.map((g) => ({ name: `${B?.code ?? "To"} · ${g}`, itemStyle: { color: GRADE_COLORS[g] }, depth: 1 })),
    ];
    const links = [...flows.entries()].map(([k, v]) => { const [ga, gb] = k.split("|"); return { source: `${A?.code ?? "From"} · ${ga}`, target: `${B?.code ?? "To"} · ${gb}`, value: v }; });
    return { nodes, links };
  }, [pairs, A, B]);

  if (scope.mode !== "portfolio") return null;
  if (!overlap.length) {
    return (<><PageHeader page="Journeys" title="Institute Journeys" /><Card><EmptyState title="No institute appears in two programmes under the current filters" /></Card></>);
  }

  const slopeItems = [...withDelta].sort((x, y) => Math.abs(y.delta as number) - Math.abs(x.delta as number)).slice(0, 120);
  const slope: EChartsOption = {
    grid: { left: 60, right: 60, top: 30, bottom: 30 },
    tooltip: { trigger: "item", formatter: (p: unknown) => { const q = (p as { data: { pair: Pair } }).data?.pair; if (!q) return ""; return `<b>${q.name}</b><br/>${q.district}<br/>${A?.short}: ${fmtScore(q.a.score, 1)} → ${B?.short}: ${fmtScore(q.b.score, 1)}<br/>Change <b>${(q.delta as number) > 0 ? "+" : ""}${(q.delta as number).toFixed(1)}</b>`; } },
    xAxis: { type: "category", data: [A?.short ?? "", B?.short ?? ""], boundaryGap: false, axisLabel: { fontSize: 12, fontWeight: 700 } },
    yAxis: { type: "value", min: 0, max: 100, name: "Institute score", nameTextStyle: { fontSize: 10 } },
    series: slopeItems.map((p) => ({
      type: "line", symbolSize: 5, silent: false,
      lineStyle: { width: 1.3, opacity: 0.55, color: (p.delta as number) >= threshold ? "#10b981" : (p.delta as number) <= -threshold ? "#ef4444" : "#94a3b8" },
      itemStyle: { color: (p.delta as number) >= threshold ? "#10b981" : (p.delta as number) <= -threshold ? "#ef4444" : "#94a3b8" },
      emphasis: { focus: "series", lineStyle: { width: 3, opacity: 1 } },
      data: [{ value: Number((p.a.score as number).toFixed(1)), pair: p }, { value: Number((p.b.score as number).toFixed(1)), pair: p }],
    })),
  } as EChartsOption;

  const bins = Array.from({ length: 13 }, (_, i) => ({ from: -60 + i * 10, n: 0 }));
  for (const p of withDelta) { const idx = Math.max(0, Math.min(12, Math.floor(((p.delta as number) + 60) / 10))); bins[idx].n++; }
  const deltaHist: EChartsOption = {
    grid: { left: 40, right: 12, top: 20, bottom: 34 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: bins.map((b) => `${b.from > 0 ? "+" : ""}${b.from}…${b.from + 10 > 0 ? "+" : ""}${b.from + 10}`), axisLabel: { fontSize: 9.5, rotate: 35 } },
    yAxis: { type: "value", name: "Institutes", nameTextStyle: { fontSize: 10 } },
    series: [{
      type: "bar", barMaxWidth: 34,
      label: { show: true, position: "top", fontSize: 9.5, formatter: (p: unknown) => ((p as { value: number }).value ? String((p as { value: number }).value) : "") },
      data: bins.map((b) => ({ value: b.n, itemStyle: { borderRadius: [4, 4, 0, 0], color: b.from >= 0 ? "#10b981" : "#ef4444" } })),
    }],
  } as EChartsOption;

  const overlapOpt: EChartsOption = {
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value" },
    yAxis: { type: "category", data: [...overlap].reverse().map((o) => `${data.programBySlug.get(o.a)?.short} ↔ ${data.programBySlug.get(o.b)?.short}`), axisLabel: { fontSize: 10.5 } },
    series: [{
      type: "bar", barMaxWidth: 16, label: { show: true, position: "right", fontSize: 10, fontWeight: 600 },
      data: [...overlap].reverse().map((o) => ({ value: o.n, itemStyle: { borderRadius: [0, 4, 4, 0], color: o.a === from && o.b === to ? "#2563eb" : "#94a3b8" } })),
    }],
  } as EChartsOption;

  const columns: ColumnDef<Pair, unknown>[] = [
    { id: "name", header: "Institute", accessorKey: "name", cell: (c) => <span className="block max-w-[280px] truncate font-medium">{c.getValue() as string}</span> },
    { id: "district", header: "District", accessorKey: "district" },
    { id: "a", header: `${A?.short} score`, accessorFn: (r) => r.a.score ?? -1, cell: (c) => <span className="num">{fmtScore(c.row.original.a.score, 1)}</span> },
    { id: "ag", header: `${A?.short} grade`, accessorFn: (r) => r.a.grade, cell: (c) => <Badge color={GRADE_COLORS[c.getValue() as string]}>{c.getValue() as string}</Badge> },
    { id: "b", header: `${B?.short} score`, accessorFn: (r) => r.b.score ?? -1, cell: (c) => <span className="num font-semibold">{fmtScore(c.row.original.b.score, 1)}</span> },
    { id: "bg", header: `${B?.short} grade`, accessorFn: (r) => r.b.grade, cell: (c) => <Badge color={GRADE_COLORS[c.getValue() as string]}>{c.getValue() as string}</Badge> },
    { id: "delta", header: "Δ score", accessorFn: (r) => r.delta ?? -999, cell: (c) => <Delta value={c.row.original.delta} /> },
    { id: "att", header: "Δ attendance", accessorFn: (r) => r.attDelta ?? -999, cell: (c) => <Delta value={c.row.original.attDelta === null ? null : c.row.original.attDelta * 100} suffix=" pt" /> },
    { id: "atts", header: `${B?.short} attendance`, accessorFn: (r) => r.b.attendanceRate, cell: (c) => <span className="num">{fmtPct(c.row.original.b.attendanceRate)}</span> },
  ];

  return (
    <>
      <PageHeader page="Journeys" title="Institute Journeys"
        description="Institutes assessed in more than one programme, matched on Institute ID. Did they improve, hold or slip between rounds? Note that rubrics differ between programmes, so read score changes alongside grade movement." />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold"><Link2 size={14} className="text-brand-600" /> Compare</span>
        <MiniSelect label="From" value={from} onChange={setFrom} options={progs.map((p) => ({ value: p.slug, label: p.name }))} />
        <MoveRight size={14} className="text-[var(--text-muted)]" />
        <MiniSelect label="To" value={to} onChange={setTo} options={progs.filter((p) => p.slug !== from).map((p) => ({ value: p.slug, label: p.name }))} />
        <Seg value={threshold} onChange={setThreshold} label="Change threshold" options={[{ value: 2, label: "±2" }, { value: 5, label: "±5" }, { value: 10, label: "±10" }]} />
        <span className="ml-auto text-[11px] text-[var(--text-muted)]">{pairs.length} institutes in both · {A?.rubric.components.length}-criteria → {B?.rubric.components.length}-criteria rubric</span>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Linked institutes" value={pairs.length} format={(n) => String(Math.round(n))} icon={Link2} accent="#2563eb"
          sub={`assessed in both ${A?.short} and ${B?.short}`} methodology={<>Matched on Institute ID. Where IDs disagree on name the link is still made, and the conflict is listed on the Data Quality page.</>} />
        <KPICard label="Improved" value={improved} format={(n) => String(Math.round(n))} icon={TrendingUp} accent="#10b981"
          sub={`score up by ${threshold}+ points`} gauge={pairs.length ? improved / pairs.length : 0} methodology={<>Institute score in the later programme at least {threshold} points higher.</>} />
        <KPICard label="Declined" value={declined} format={(n) => String(Math.round(n))} icon={TrendingDown} accent="#dc2626"
          sub={`score down by ${threshold}+ points`} gauge={pairs.length ? declined / pairs.length : 0} methodology={<>Institute score at least {threshold} points lower.</>} />
        <KPICard label="Mean change" value={meanDelta ?? 0} format={(n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`} icon={MoveRight} accent="#7c3aed"
          sub={`${stable} held within ±${threshold}`} methodology={<>Average of (later score − earlier score) over linked institutes.</>} />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Grade migration" subtitle={`${A?.short} grade → ${B?.short} grade · band width = institutes`} height={380}
          methodology={<><strong>Sankey</strong><br />Each band is a group of institutes moving from one grade to another between the two programmes.</>}
          table={{ columns: ["From grade", "To grade", "Institutes"], rows: sankey.links.map((l) => [l.source, l.target, l.value]) }}
          option={{
            tooltip: { trigger: "item" },
            series: [{
              type: "sankey", left: 8, right: 120, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 10, draggable: false, layoutIterations: 0,
              emphasis: { focus: "adjacency" }, label: { fontSize: 10.5, formatter: "{b}" },
              lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.45 },
              data: sankey.nodes, links: sankey.links,
            }],
          } as EChartsOption} />
        <ChartCard title="Score paths" subtitle={`${slopeItems.length} largest moves · green = improved, red = declined · hover to isolate`} height={380} option={slope}
          methodology={<><strong>Slope chart</strong><br />Each line is one institute: its score in the earlier programme on the left and the later on the right.</>}
          onEvent={{ type: "click", handler: (p) => { const q = (p as { data: { pair: Pair } }).data?.pair; if (q) router.push(globalInstituteHref(q.key)); } }} clickHint="click a line to open" />
      </div>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Distribution of score change" subtitle="Institutes per 10-point band of change" height={280} option={deltaHist}
          table={{ columns: ["Change band", "Institutes"], rows: bins.map((b) => [`${b.from} to ${b.from + 10}`, b.n]) }} />
        <ChartCard title="Programme overlaps" subtitle="Institutes shared by each pair of programmes (current filters)" height={280} option={overlapOpt}
          onEvent={{ type: "click", handler: (p) => { const o = [...overlap].reverse()[(p as { dataIndex: number }).dataIndex]; setFrom(o.a); setTo(o.b); } }} clickHint="click to compare that pair" />
      </div>

      <DataTable<Pair> data={pairs} columns={columns} pageSize={25} storageKey="journeys" searchable
        onRowClick={(r) => router.push(globalInstituteHref(r.key))} />
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">{truncate("Rows open the cross-programme profile for that institute.", 200)}</p>
    </>
  );
}
