"use client";
import { useMemo } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import { ArrowLeft, ArrowRight, AlertTriangle, Trophy, FileSpreadsheet, FileText, UserRound, MessageSquareText } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionTitle } from "@/components/dashboard/widgets";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card, Badge, EmptyState, Delta, Button } from "@/components/ui";
import { IdChip, FocusButton } from "@/components/filters/InstitutePicker";
import { GRADE_COLORS, STATUS_COLORS, SEVERITY_TEXT, fmtInt, fmtPct, fmtScore, fmtMonth, scoreColor, truncate } from "@/config";
import { instituteHref, programBase } from "@/lib/portfolio";
import { directoryOf } from "@/lib/institutes";
import { rankLabel } from "@/lib/standings";
import { instKey } from "@/lib/filters";
import { CATEGORY_KEYS } from "@/lib/aggregate";
import { exportCsv, exportXlsx } from "@/lib/export";
import type { Institute } from "@/types";

/** One institute across every programme it was assessed in — the 360° record. */
export function GlobalInstituteModule({ globalKey }: { globalKey: string }) {
  const { data } = useDash();
  const entry = directoryOf(data).byKey.get(globalKey);
  const records = useMemo(() => entry?.records ?? [], [entry]);
  const rowsByProg = useMemo(() => new Map(records.map((r) => [r.p, (data.rowsByProgram.get(r.p) ?? []).filter((x) => x.instituteKey === r.instituteKey)])), [records, data]);
  const allRows = useMemo(() => [...rowsByProg.values()].flat(), [rowsByProg]);
  const cats = data.raw.categories;

  /** Programme-wide category means, for the gap table. */
  const progCatMean = useMemo(() => {
    const m = new Map<string, Record<string, number | null>>();
    for (const r of records) {
      const sc = (data.rowsByProgram.get(r.p) ?? []).filter((x) => x.scored);
      m.set(r.p, Object.fromEntries(CATEGORY_KEYS.map((k) => {
        const xs = sc.map((x) => x.categoryPct[k]).filter((v): v is number => v !== null && v !== undefined);
        return [k, xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null];
      })));
    }
    return m;
  }, [records, data]);

  if (!entry || !records.length) return <Card><EmptyState title="Institute not found" hint="No programme carries this institute." /></Card>;

  const P = (r: Institute) => data.programBySlug.get(r.p)!;
  const when = (r: Institute) => (r.visitDate ? fmtMonth(r.visitDate) : P(r).period ? fmtMonth(P(r).period!.to) : P(r).assessmentDate ? fmtMonth(P(r).assessmentDate) : "undated");
  const st = (r: Institute) => data.standings.get(instKey(r.p, r.instituteKey));
  const fileStem = `NAVTTC_Institute_${globalKey}_${new Date().toISOString().slice(0, 10)}`;

  /* ---------------- charts ---------------- */
  const trend: EChartsOption = {
    legend: { bottom: 0 },
    grid: { left: 48, right: 52, top: 30, bottom: 74 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: records.map((r) => `${P(r).short}\n${when(r)}`), axisLabel: { fontSize: 10, lineHeight: 14 } },
    yAxis: [{ type: "value", min: 0, max: 100, name: "Score / %", nameTextStyle: { fontSize: 10 } }, { type: "value", name: "Enrolled", splitLine: { show: false }, nameTextStyle: { fontSize: 10 } }],
    series: [
      { name: "Enrolled", type: "bar", yAxisIndex: 1, barMaxWidth: 40, data: records.map((r) => ({ value: r.enrolled, itemStyle: { color: P(r).color, opacity: 0.35, borderRadius: [5, 5, 0, 0] } })), label: { show: true, position: "insideTop", fontSize: 9.5 } },
      { name: "Score", type: "line", symbolSize: 11, lineStyle: { width: 3, color: "#7c3aed" }, itemStyle: { color: "#7c3aed" }, label: { show: true, position: "top", fontWeight: 700, formatter: (p: unknown) => (p as { value: number }).value?.toFixed(1) }, data: records.map((r) => (r.score === null ? null : Number(r.score.toFixed(2)))),
        markLine: { silent: true, symbol: "none", lineStyle: { type: "dashed", color: "#94a3b8" }, label: { fontSize: 9, position: "insideEndTop", color: "#94a3b8" }, data: [{ yAxis: 80, label: { formatter: "Excellent 80" } }] } },
      { name: "Programme mean", type: "line", symbol: "diamond", symbolSize: 7, lineStyle: { width: 1.5, type: "dotted", color: "#64748b" }, itemStyle: { color: "#64748b" }, data: records.map((r) => { const m = st(r)?.programMean; return m === null || m === undefined ? null : Number(m.toFixed(2)); }) },
      { name: "Attendance %", type: "line", symbolSize: 8, lineStyle: { width: 2, type: "dashed", color: "#059669" }, itemStyle: { color: "#059669" }, label: { show: true, position: "bottom", fontSize: 9.5, formatter: (p: unknown) => `${(p as { value: number }).value?.toFixed(0)}%` }, data: records.map((r) => (r.attendanceRate === null ? null : Number((r.attendanceRate * 100).toFixed(1)))) },
    ],
  } as EChartsOption;

  const funnelOpt: EChartsOption = {
    legend: { top: 0 },
    grid: { left: 8, right: 12, top: 32, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: records.map((r) => P(r).short) },
    yAxis: { type: "value" },
    series: ([["Approved capacity", "approvedCapacity", "#94a3b8"], ["Enrolled", "enrolled", "#2563eb"], ["Present", "present", "#0891b2"], ["CNIC verified", "cnicVerified", "#10b981"], ["Dropped out", "droppedOut", "#ef4444"]] as const).map(([name, k, color]) => ({
      name, type: "bar", barMaxWidth: 18, itemStyle: { color, borderRadius: [3, 3, 0, 0] },
      label: { show: true, position: "top", fontSize: 9 }, data: records.map((r) => r[k]),
    })),
  } as EChartsOption;

  const radar: EChartsOption = {
    legend: { bottom: 0 },
    tooltip: { trigger: "item" },
    radar: { indicator: cats.map((c) => ({ name: c.short, max: 100 })), radius: "62%", axisName: { fontSize: 10 }, splitArea: { areaStyle: { color: ["transparent"] } } },
    series: [{
      type: "radar", symbolSize: 4,
      data: records.map((r) => ({ name: P(r).short, value: cats.map((c) => (r.categoryPct[c.key] === null ? 0 : Number(((r.categoryPct[c.key] as number) * 100).toFixed(1)))), lineStyle: { color: P(r).color, width: 2 }, itemStyle: { color: P(r).color }, areaStyle: { color: P(r).color, opacity: 0.08 } })),
    }],
  } as EChartsOption;

  /* ---------------- trades matrix ---------------- */
  const tradeKeys = [...new Set(allRows.map((r) => r.tradeNorm))].sort((a, b) => data.tradeName(a).localeCompare(data.tradeName(b)));
  const tradeCell = (t: string, p: string) => {
    const rs = (rowsByProg.get(p) ?? []).filter((r) => r.tradeNorm === t);
    if (!rs.length) return null;
    const sc = rs.filter((r) => r.scored);
    return { n: rs.length, enrolled: rs.reduce((s, r) => s + r.enrolled, 0), score: sc.length ? sc.reduce((s, r) => s + (r.tradeScore as number), 0) / sc.length : null };
  };

  /* ---------------- KPI table ---------------- */
  const kpiRows: { label: string; get: (r: Institute) => number | null; kind: "score" | "rate" | "count"; low?: boolean }[] = [
    { label: "Institute score", get: (r) => r.score, kind: "score" },
    { label: "Trade assessments", get: (r) => r.assessments, kind: "count" },
    { label: "Approved capacity", get: (r) => r.approvedCapacity, kind: "count" },
    { label: "Enrolled", get: (r) => r.enrolled, kind: "count" },
    { label: "Present", get: (r) => r.present, kind: "count" },
    { label: "CNIC verified", get: (r) => r.cnicVerified, kind: "count" },
    { label: "Dropped out", get: (r) => r.droppedOut, kind: "count", low: true },
    { label: "Attendance % (programme rule)", get: (r) => r.attendanceRate, kind: "rate" },
    { label: "Presence %", get: (r) => r.presenceRate, kind: "rate" },
    { label: "CNIC verified % of seats", get: (r) => r.verificationRate, kind: "rate" },
    { label: "Seat utilisation %", get: (r) => r.utilizationRate, kind: "rate" },
    { label: "Dropout %", get: (r) => r.dropoutRate, kind: "rate", low: true },
  ];
  const fmtK = (kind: string, v: number | null) => (v === null ? "—" : kind === "rate" ? fmtPct(v) : kind === "score" ? v.toFixed(1) : fmtInt(v));

  /* ---------------- criteria strengths ---------------- */
  const strengths = records.map((r) => {
    const comps = P(r).rubric.components.map((c) => ({ label: c.label, max: c.max, pct: c.max ? ((r.components[c.key] ?? 0) / c.max) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
    return { r, best: comps.slice(0, 3), worst: [...comps].reverse().filter((c) => c.pct < 99.999).slice(0, 3) };
  });

  /* ---------------- issues on its rows ---------------- */
  const issues = records.flatMap((r) => {
    const rowsSet = new Set((rowsByProg.get(r.p) ?? []).map((x) => x.excelRow));
    return P(r).quality.issues.filter((i) => i.row !== null && rowsSet.has(i.row)).map((i) => ({ ...i, p: r.p }));
  });
  const remarks = allRows.filter((r) => r.extra?.monitorRemarks).map((r) => ({ p: r.p, trade: r.tradeName, text: String(r.extra.monitorRemarks) }));
  const instructors = allRows.filter((r) => r.extra?.instructorName).map((r) => ({ p: r.p, trade: r.tradeName, name: String(r.extra.instructorName), q: r.extra.instructorQualification ? String(r.extra.instructorQualification) : null, y: r.extra.instructorExperience ?? null }));

  const latest = records[records.length - 1];
  const first = records[0];
  const overallDelta = records.length > 1 && latest.score !== null && first.score !== null ? latest.score - first.score : null;

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <Link href="/journey" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-brand-600"><ArrowLeft size={13} /> Institute journeys</Link>
        <Link href="/institutions" className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-brand-600">All institutions</Link>
      </div>
      <PageHeader page={`Institute_${globalKey}`} title={entry.name}
        description={`${entry.district}, ${entry.region} · assessed in ${records.length} programme${records.length === 1 ? "" : "s"}: ${records.map((r) => P(r).short).join(" → ")}`}>
        <span className="flex items-center gap-1.5"><IdChip entry={entry} /><FocusButton globalKey={globalKey} /></span>
        <Button size="sm" onClick={() => exportCsv(allRows, data.programBySlug, fileStem)}><FileText size={13} /> Records CSV</Button>
        <Button size="sm" onClick={() => exportXlsx(allRows, data.programBySlug, fileStem)}><FileSpreadsheet size={13} /> Excel</Button>
      </PageHeader>

      {entry.conflict && (
        <Card className="mb-4 border-l-4 border-l-amber-500 p-3 text-xs">
          <span className="font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle size={12} className="mr-1 inline" />The same Institute ID carries different names across programmes:</span> {entry.names.join(" · ")}. Linked on the ID — verify they are the same institute.
        </Card>
      )}

      {/* Standings */}
      <SectionTitle hint="Always against the whole programme — not the filtered view">Standings</SectionTitle>
      <Card className="mb-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--surface-2)]">
            <tr>{["Programme", "Assessed", "Score", "Grade", "Programme rank", "Top %", "District rank", "Region rank", "vs programme mean", "vs district median", "vs top-10% line"].map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>))}</tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const s = st(r);
              const d = (ref: number | null | undefined) => (r.score === null || ref === null || ref === undefined ? null : r.score - ref);
              return (
                <tr key={r.p} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-2"><Link href={instituteHref(programBase(r.p), r)} className="inline-flex items-center gap-1.5 font-semibold hover:underline" style={{ color: P(r).color }}><span className="h-2 w-2 rounded-full" style={{ background: P(r).color }} />{P(r).short}</Link></td>
                  <td className="num whitespace-nowrap px-3 py-2 text-[var(--text-muted)]">{when(r)}</td>
                  <td className="num px-3 py-2 text-base font-extrabold" style={{ color: scoreColor(r.score) }}>{fmtScore(r.score, 1)}</td>
                  <td className="whitespace-nowrap px-3 py-2"><Badge color={GRADE_COLORS[r.grade]}>{r.grade}</Badge>{r.status !== "Active" && <span className="ml-1"><Badge color={STATUS_COLORS[r.status]}>{r.status}</Badge></span>}</td>
                  <td className="num px-3 py-2 font-semibold">{s?.rank === 1 && <Trophy size={11} className="mr-1 inline text-amber-500" />}{rankLabel(s)} <span className="font-normal text-[var(--text-muted)]">/ {s?.of}</span>{s && s.tiedWith > 0 && <span className="block text-[10px] font-normal text-[var(--text-muted)]">tied with {s.tiedWith} other{s.tiedWith === 1 ? "" : "s"}</span>}</td>
                  <td className="px-3 py-2">
                    {s?.topShare !== null && s?.topShare !== undefined ? (
                      <div className="w-24">
                        <div className="num text-[11px] font-semibold">Top {Math.max(1, Math.round(s.topShare * 100))}%</div>
                        <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(2, (1 - s.topShare) * 100)}%` }} /></div>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="num px-3 py-2">#{s?.districtRank ?? "—"} <span className="text-[var(--text-muted)]">/ {s?.districtOf} · {r.district}</span></td>
                  <td className="num px-3 py-2">#{s?.regionRank ?? "—"} <span className="text-[var(--text-muted)]">/ {s?.regionOf}</span></td>
                  <td className="px-3 py-2"><Delta value={d(s?.programMean)} /> <span className="num text-[10px] text-[var(--text-muted)]">({fmtScore(s?.programMean, 1)})</span></td>
                  <td className="px-3 py-2"><Delta value={d(s?.districtMedian)} /> <span className="num text-[10px] text-[var(--text-muted)]">({fmtScore(s?.districtMedian, 1)})</span></td>
                  <td className="px-3 py-2"><Delta value={d(s?.top10)} /> <span className="num text-[10px] text-[var(--text-muted)]">({fmtScore(s?.top10, 1)})</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Journey */}
      <SectionTitle hint={overallDelta !== null ? `${overallDelta >= 0 ? "+" : ""}${overallDelta.toFixed(1)} points from ${P(first).short} to ${P(latest).short}` : undefined}>Journey</SectionTitle>
      <div className="mb-3 flex items-stretch gap-1 overflow-x-auto pb-1">
        {records.map((r, idx) => {
          const prev = idx > 0 ? records[idx - 1] : null;
          return (
            <div key={r.p} className="flex items-center gap-1">
              {idx > 0 && <ArrowRight size={16} className="shrink-0 text-[var(--text-muted)]" />}
              <Card className="card-hover relative min-w-[220px] overflow-hidden p-3.5">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: P(r).color }} />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold" style={{ color: P(r).color }}>{P(r).name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{when(r)} · {r.assessments} trade{r.assessments === 1 ? "" : "s"} · {P(r).rubric.components.length}-criteria rubric</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-2xl font-extrabold leading-none" style={{ color: scoreColor(r.score) }}>{fmtScore(r.score, 1)}</div>
                    {prev && <Delta value={r.score !== null && prev.score !== null ? r.score - prev.score : null} />}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Badge color={GRADE_COLORS[r.grade]}>{r.grade}</Badge>
                  {prev && prev.grade !== r.grade && <span className="text-[10px] text-[var(--text-muted)]">was {prev.grade}</span>}
                </div>
                {r.assessorNote && <p className="mt-2 flex gap-1 text-[10.5px] text-red-700 dark:text-red-300"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{truncate(r.assessorNote, 160)}</p>}
                <Link href={instituteHref(programBase(r.p), r)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: P(r).color }}>{P(r).short} profile & one-pager <ArrowRight size={12} /></Link>
              </Card>
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Score, attendance and enrolment across programmes" subtitle="Dotted line = that programme's mean institute score" height={330} option={trend}
          methodology={<>Each programme uses its own rubric and attendance rule, so part of any change reflects the measuring instrument.</>}
          table={{ columns: ["Programme", "Score", "Programme mean", "Attendance %", "Enrolled"], rows: records.map((r) => [P(r).name, fmtScore(r.score), fmtScore(st(r)?.programMean), fmtPct(r.attendanceRate), r.enrolled]) }} />
        <ChartCard title="Enrolment across programmes" subtitle="Seats → enrolled → present → CNIC verified, and dropouts" height={330} option={funnelOpt}
          table={{ columns: ["Programme", "Capacity", "Enrolled", "Present", "CNIC verified", "Dropped"], rows: records.map((r) => [P(r).name, r.approvedCapacity, r.enrolled, r.present, r.cnicVerified, r.droppedOut]) }} />
      </div>

      {/* KPI table */}
      <SectionTitle>Every measure, programme by programme</SectionTitle>
      <Card className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Measure</th>
              {records.map((r, i) => (
                <th key={r.p} className="px-3 py-2 text-right text-[10.5px] font-bold" style={{ color: P(r).color }}>{P(r).short}{i > 0 && <span className="ml-1 font-normal text-[var(--text-muted)]">· change</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpiRows.map((k) => (
              <tr key={k.label} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                <td className="px-3 py-1.5 font-medium">{k.label}</td>
                {records.map((r, i) => {
                  const v = k.get(r); const pv = i > 0 ? k.get(records[i - 1]) : null;
                  const d = v !== null && pv !== null && i > 0 ? (k.kind === "rate" ? (v - pv) * 100 : v - pv) : null;
                  return (
                    <td key={r.p} className="num px-3 py-1.5 text-right">
                      <span className="font-semibold">{fmtK(k.kind, v)}</span>
                      {i > 0 && <span className="ml-1.5"><Delta value={d} digits={k.kind === "count" ? 0 : 1} suffix={k.kind === "rate" ? " pt" : ""} invert={k.low} /></span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Trades matrix */}
      <SectionTitle hint={`${tradeKeys.length} distinct trade${tradeKeys.length === 1 ? "" : "s"}`}>Trades across programmes</SectionTitle>
      <Card className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Trade</th>
              {records.map((r) => <th key={r.p} className="px-3 py-2 text-center text-[10.5px] font-bold" style={{ color: P(r).color }}>{P(r).short}</th>)}
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Pattern</th>
            </tr>
          </thead>
          <tbody>
            {tradeKeys.map((t) => {
              const cells = records.map((r) => tradeCell(t, r.p));
              const present = cells.map((c) => c !== null);
              const pattern = present.every(Boolean) ? (records.length > 1 ? "Ran in every programme" : "—")
                : present[present.length - 1] && !present.slice(0, -1).some(Boolean) ? "New in latest" : !present[present.length - 1] ? "Dropped" : "Intermittent";
              return (
                <tr key={t} className="border-b border-[var(--border)] last:border-0">
                  <td className="max-w-[280px] truncate px-3 py-1.5 font-medium">{data.tradeName(t)}</td>
                  {cells.map((c, i) => (
                    <td key={records[i].p} className="px-2 py-1 text-center">
                      {c ? (
                        <span className="inline-block min-w-[78px] rounded-md px-2 py-1" style={{ background: scoreColor(c.score) + "22" }}>
                          <span className="num block text-[12px] font-bold" style={{ color: scoreColor(c.score) }}>{fmtScore(c.score, 1)}</span>
                          <span className="num block text-[9.5px] text-[var(--text-muted)]">{fmtInt(c.enrolled)} enrolled{c.n > 1 ? ` · ${c.n} batches` : ""}</span>
                        </span>
                      ) : <span className="text-[var(--text-muted)]">·</span>}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-[10.5px] text-[var(--text-muted)]">{pattern}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Category + criteria */}
      <SectionTitle>Where it earns and loses its score</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Category profile by programme" subtitle="Share of each shared category's maximum" height={330} option={radar}
          table={{ columns: ["Programme", ...cats.map((c) => c.label)], rows: records.map((r) => [P(r).short, ...cats.map((c) => fmtPct(r.categoryPct[c.key]))]) }} />
        <Card className="overflow-x-auto">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-[13px] font-semibold">Category gap vs programme average</h3>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Institute achievement, with the gap to the programme&apos;s mean in points of %</p>
          </div>
          <table className="w-full text-xs">
            <thead><tr><th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase text-[var(--text-muted)]">Category</th>{records.map((r) => <th key={r.p} className="px-3 py-1.5 text-right text-[10.5px] font-bold" style={{ color: P(r).color }}>{P(r).short}</th>)}</tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.key} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-medium">{c.label}</td>
                  {records.map((r) => {
                    const v = r.categoryPct[c.key]; const m = progCatMean.get(r.p)?.[c.key] ?? null;
                    return <td key={r.p} className="num px-3 py-1.5 text-right">{v === null ? <span className="text-[var(--text-muted)]">n/a</span> : <>{fmtPct(v, 0)} <Delta value={m === null ? null : (v - m) * 100} digits={0} /></>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {strengths.map(({ r, best, worst }) => (
          <Card key={r.p} className="p-3.5">
            <div className="mb-2 text-[11px] font-bold" style={{ color: P(r).color }}>{P(r).name} — criteria</div>
            {[["Strongest", best, "#10b981"], ["Weakest", worst, "#ef4444"]].map(([t, list, col]) => (
              <div key={t as string} className="mb-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t as string}</div>
                {(list as typeof best).length === 0 && <div className="text-[11px] text-emerald-600">Every criterion at full marks</div>}
                {(list as typeof best).map((c) => (
                  <div key={c.label} className="mb-1 flex items-center gap-2 text-[11px]">
                    <span className="w-36 shrink-0 truncate">{c.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, c.pct)}%`, background: col as string }} /></span>
                    <span className="num w-10 text-right font-semibold">{c.pct.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            ))}
          </Card>
        ))}
      </div>

      {/* Notes */}
      {(remarks.length > 0 || instructors.length > 0 || issues.length > 0) && <SectionTitle>Field notes & data checks</SectionTitle>}
      <div className="grid gap-3 lg:grid-cols-2">
        {remarks.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><MessageSquareText size={14} /> Monitor remarks</h3>
            <ul className="space-y-1.5 text-xs">{remarks.map((m, i) => <li key={i}><span className="font-semibold" style={{ color: data.programBySlug.get(m.p)?.color }}>{data.programBySlug.get(m.p)?.code} · {m.trade}:</span> {m.text}</li>)}</ul>
          </Card>
        )}
        {instructors.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold"><UserRound size={14} /> Instructors</h3>
            <ul className="space-y-1 text-xs">{instructors.map((m, i) => <li key={i}><span className="font-semibold" style={{ color: data.programBySlug.get(m.p)?.color }}>{data.programBySlug.get(m.p)?.code}</span> {m.trade}: {m.name}{m.q ? ` · ${m.q}` : ""}{m.y !== null ? ` · ${m.y} yrs` : ""}</li>)}</ul>
          </Card>
        )}
        {issues.length > 0 && (
          <Card className="p-4 lg:col-span-2">
            <h3 className="mb-2 text-[13px] font-semibold">Data-quality issues on this institute&apos;s rows · {issues.length}</h3>
            <ul className="space-y-1 text-xs">{issues.slice(0, 30).map((i, k) => (
              <li key={k}><span className="font-semibold capitalize" style={{ color: SEVERITY_TEXT[i.severity] }}>{i.severity}</span> · <span style={{ color: data.programBySlug.get(i.p)?.color }}>{data.programBySlug.get(i.p)?.code}</span> row {i.row}: {i.message}{i.detail ? <span className="text-[var(--text-muted)]"> — {i.detail}</span> : null}</li>
            ))}</ul>
          </Card>
        )}
      </div>
    </>
  );
}
