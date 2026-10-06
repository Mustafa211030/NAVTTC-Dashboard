"use client";
import { useMemo } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import { ArrowLeft, AlertTriangle, GitCompareArrows, Calendar, UserRound } from "lucide-react";
import { useDash } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card, Badge, ProgressBar, EmptyState, Tooltip } from "@/components/ui";
import { InstituteOnePager } from "@/components/reports/InstituteOnePager";
import { fmtInt, fmtPct, fmtScore, fmtDate, GRADE_COLORS, STATUS_COLORS, gradeOf, scoreColor, truncate } from "@/config";
import { instKey } from "@/lib/filters";
import { globalInstituteHref, instituteHref, programBase } from "@/lib/portfolio";

export function InstituteProfileModule({ instituteKey }: { instituteKey: string }) {
  const { data, scope } = useDash();
  const program = scope.program!;
  const inst = data.instituteByKey.get(instKey(program.slug, instituteKey));
  const instRows = useMemo(() => (data.rowsByProgram.get(program.slug) ?? []).filter((r) => r.instituteKey === instituteKey), [data, program.slug, instituteKey]);
  const progRows = data.rowsByProgram.get(program.slug) ?? [];

  const programMeans = useMemo(() => {
    const sc = progRows.filter((r) => r.scored);
    return Object.fromEntries(program.rubric.components.map((c) => [c.key, sc.length ? sc.reduce((s, r) => s + (r.components[c.key] ?? 0), 0) / sc.length : 0]));
  }, [progRows, program]);

  const peers = useMemo(() => (inst ? data.institutes.filter((i) => i.p === program.slug && i.district === inst.district && i.score !== null) : []), [data, program.slug, inst]);
  const others = inst ? (data.institutesByGlobal.get(inst.globalKey) ?? []).filter((i) => i.p !== program.slug) : [];

  if (!inst) return <Card><EmptyState title="Institute not found" hint={`No institute in ${program.name} carries this key.`} /></Card>;

  const grade = gradeOf(inst);
  const peerMedian = peers.length ? [...peers].sort((a, b) => (a.score as number) - (b.score as number))[Math.floor(peers.length / 2)].score : null;
  const districtRank = [...peers].sort((a, b) => (b.score as number) - (a.score as number)).findIndex((p) => p.instituteKey === inst.instituteKey) + 1;
  const cats = program.rubric.categories.filter((c) => c.max > 0);
  const progCatMean = (k: string) => {
    const sc = progRows.filter((r) => r.scored);
    const xs = sc.map((r) => r.categoryPct[k as keyof typeof r.categoryPct]).filter((v): v is number => v !== null && v !== undefined);
    return xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length) * 100 : 0;
  };
  const instructors = [...new Set(instRows.map((r) => r.extra?.instructorName).filter(Boolean))];
  const remarks = [...new Set(instRows.map((r) => r.extra?.monitorRemarks).filter(Boolean))] as string[];

  const stat = (label: string, value: string, note?: string) => (
    <div className="px-4 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="num mt-0.5 text-base font-bold leading-none">{value}</div>
      {note && <div className="mt-1 text-[10px] text-[var(--text-muted)]">{note}</div>}
    </div>
  );

  const compOption: EChartsOption = {
    grid: { left: 8, right: 36, top: 30, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => `${v}%` },
    legend: { top: 0, right: 0 },
    xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", data: program.rubric.components.map((c) => `${truncate(c.label, 24)} (${c.max})`), axisLabel: { fontSize: 9.5 }, inverse: true },
    series: [
      {
        name: "This institute", type: "bar", barMaxWidth: 9, itemStyle: { borderRadius: [0, 3, 3, 0], color: program.color },
        label: { show: true, position: "right", fontSize: 9, formatter: (p: unknown) => `${Math.round((p as { value: number }).value)}%` },
        data: program.rubric.components.map((c) => Number((((inst.components[c.key] ?? 0) / c.max) * 100).toFixed(1))),
      },
      { name: `${program.short} mean`, type: "bar", barMaxWidth: 9, itemStyle: { borderRadius: [0, 3, 3, 0], color: "#c2cfdd" },
        data: program.rubric.components.map((c) => Number((((programMeans[c.key] ?? 0) / c.max) * 100).toFixed(1))) },
    ],
  } as EChartsOption;

  const radarOption: EChartsOption = {
    radar: { indicator: cats.map((c) => ({ name: c.short, max: 100 })), radius: "62%", axisName: { fontSize: 10 }, splitArea: { areaStyle: { color: ["transparent"] } } },
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [{
      type: "radar", symbolSize: 4,
      data: [
        { name: "This institute", value: cats.map((c) => Number(((inst.categoryPct[c.key] ?? 0) * 100).toFixed(1))), areaStyle: { color: program.color, opacity: 0.2 }, lineStyle: { color: program.color, width: 2 }, itemStyle: { color: program.color }, label: { show: true, fontSize: 9, formatter: "{c}%" } },
        { name: `${program.short} mean`, value: cats.map((c) => Number(progCatMean(c.key).toFixed(1))), lineStyle: { color: "#94a3b8", width: 1.5, type: "dashed" }, itemStyle: { color: "#94a3b8" } },
      ],
    }],
  } as EChartsOption;

  const tradeOption: EChartsOption = {
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", max: 100 },
    yAxis: { type: "category", data: instRows.map((r) => truncate(`${r.tradeName}${r.batch ? ` (B${r.batch})` : ""}`, 34)), axisLabel: { fontSize: 9.5 }, inverse: true },
    series: [{
      type: "bar", barMaxWidth: 14,
      label: { show: true, position: "right", fontSize: 9.5, fontWeight: 600, formatter: (p: unknown) => (p as { value: number | null }).value?.toFixed(1) ?? "—" },
      data: instRows.map((r) => ({ value: r.tradeScore === null ? null : Number(r.tradeScore.toFixed(2)), itemStyle: { color: scoreColor(r.tradeScore), borderRadius: [0, 4, 4, 0] } })),
    }],
  } as EChartsOption;

  return (
    <>
      <div className="no-print mb-3 flex flex-wrap items-center gap-3">
        <Link href={scope.href("/institutions")} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-brand-600"><ArrowLeft size={13} /> All {program.short} institutions</Link>
        {others.length > 0 && (
          <Link href={globalInstituteHref(inst.globalKey)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 dark:bg-brand-700/20 dark:text-brand-100">
            <GitCompareArrows size={12} /> Also assessed in {others.map((o) => data.programBySlug.get(o.p)?.short).join(", ")} — view journey
          </Link>
        )}
      </div>

      <PageHeader page={`Institute_${inst.instituteKey}`} title={inst.instituteName}
        description={`${inst.district}, ${inst.region} · Institute ID ${inst.instituteId ?? "not recorded"} · ${inst.package ?? "—"}${inst.division ? ` · ${inst.division} division` : ""}`}
        printHeader={false} printLabel="Print one-pager" />

      <InstituteOnePager inst={inst} rows={instRows} program={program} />

      <div className="screen-only">
        {(inst.assessorNote || inst.status !== "Active" || inst.gradeOverride) && (
          <Card className="print-avoid mb-4 border-l-4 border-l-red-500 bg-red-50/60 p-3 dark:bg-red-950/30">
            <div className="flex gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-300">
                  Assessor flag {inst.status !== "Active" && <Badge color={STATUS_COLORS[inst.status]}>{inst.status}</Badge>}
                  {inst.gradeOverride && <Badge color={GRADE_COLORS[inst.gradeOverride] ?? "#64748b"}>Grade override: {inst.gradeOverride}</Badge>}
                </div>
                {inst.assessorNote && <p className="mt-0.5 text-xs leading-relaxed">{inst.assessorNote}</p>}
              </div>
            </div>
          </Card>
        )}

        <Card className="print-avoid mb-4 grid grid-cols-2 divide-x divide-y divide-[var(--border)] sm:grid-cols-4 lg:grid-cols-8 lg:divide-y-0">
          <div className="px-4 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Grade</div>
            <div className="mt-1"><Badge color={GRADE_COLORS[grade]}>{grade}</Badge></div>
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">Rank {inst.rank} of {program.instituteCount}</div>
          </div>
          <div className="px-4 py-2.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Score <Tooltip label={<>Mean of this institute&apos;s {inst.assessments} trade scores on the {program.rubric.components.length}-criteria rubric.</>} />
            </div>
            <div className="num mt-0.5 text-base font-bold leading-none" style={{ color: scoreColor(inst.score) }}>{fmtScore(inst.score)}</div>
            <div className="mt-1"><ProgressBar value={inst.score ?? 0} max={100} color={scoreColor(inst.score)} /></div>
          </div>
          {stat("District rank", districtRank ? `${districtRank} / ${peers.length}` : "—", `median ${fmtScore(peerMedian, 1)} in ${inst.district}`)}
          {stat("Capacity", fmtInt(inst.approvedCapacity), `${inst.assessments} trade rows`)}
          {stat(program.enrolledLabel, fmtInt(inst.enrolled), fmtPct(inst.utilizationRate) + " utilisation")}
          {stat("Attendance %", fmtPct(inst.attendanceRate), program.attendanceRule.label)}
          {stat("Presence %", fmtPct(inst.presenceRate), `${fmtInt(inst.present)} present`)}
          {stat("Dropout", fmtPct(inst.dropoutRate, 2), `${fmtInt(inst.droppedOut)} trainees`)}
        </Card>

        <div className="mb-4 grid gap-3 lg:grid-cols-2">
          <ChartCard title={`Rubric criteria vs ${program.short} mean`} height={Math.max(320, program.rubric.components.length * 26)} option={compOption}
            methodology={<><strong>Criterion comparison</strong><br />This institute&apos;s mean on each criterion against the whole programme, as a percentage of each criterion&apos;s maximum.</>}
            table={{ columns: ["Criterion", "Max", "This institute", `${program.short} mean`], rows: program.rubric.components.map((c) => [c.label, c.max, (inst.components[c.key] ?? 0).toFixed(2), (programMeans[c.key] ?? 0).toFixed(2)]) }} />
          <div className="grid gap-3">
            <ChartCard title="Category profile" height={300} option={radarOption}
              methodology={<><strong>Category achievement</strong><br />Criteria grouped into the six shared categories, as a percentage of each category&apos;s maximum.</>}
              table={{ columns: ["Category", "Max", "This institute", "Programme mean"], rows: cats.map((c) => [c.label, c.max, fmtPct(inst.categoryPct[c.key]), `${progCatMean(c.key).toFixed(1)}%`]) }} />
            {instRows.length > 1 && <ChartCard title="Score by trade" height={Math.max(160, instRows.length * 24 + 20)} option={tradeOption} />}
          </div>
        </div>

        {others.length > 0 && (
          <Card className="mb-4 overflow-hidden">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold"><GitCompareArrows size={14} className="text-brand-600" /> Same institute in other programmes</h3>
            </div>
            <div className="grid divide-y divide-[var(--border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[inst, ...others].sort((a, b) => (data.programBySlug.get(a.p)!.order - data.programBySlug.get(b.p)!.order)).map((o) => {
                const p = data.programBySlug.get(o.p)!;
                return (
                  <Link key={o.p} href={instituteHref(programBase(o.p), o)} className={`block p-3 hover:bg-[var(--surface-3)] ${o.p === inst.p ? "bg-[var(--surface-2)]" : ""}`}>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: p.color }}><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.short}{o.p === inst.p && " (this)"}</div>
                    <div className="num mt-1 text-xl font-bold" style={{ color: scoreColor(o.score) }}>{fmtScore(o.score, 1)}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{o.grade} · {o.assessments} trades · attendance {fmtPct(o.attendanceRate, 0)}</div>
                  </Link>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="print-avoid overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
            <div>
              <h3 className="text-[13px] font-semibold">Trade-level assessments</h3>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{instRows.length} row{instRows.length === 1 ? "" : "s"} in the workbook for this institute</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
              {inst.visitDate && <span className="inline-flex items-center gap-1"><Calendar size={12} /> Visited {fmtDate(inst.visitDate)}</span>}
              {instructors.length > 0 && <span className="inline-flex items-center gap-1"><UserRound size={12} /> {instructors.join(", ")}</span>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-2)]">
                <tr>
                  {["Trade", "Batch", "Capacity", program.enrolledLabel, "Present", "Absent", "Dropped", "CNIC", "Attendance %", "Presence %", ...program.rubric.components.map((c) => c.label), "Score", "Row"].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instRows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="max-w-[240px] truncate px-3 py-1.5 font-medium">{r.tradeName}</td>
                    <td className="num px-3 py-1.5">{r.batch ?? "—"}</td>
                    <td className="num px-3 py-1.5">{r.approvedCapacity}</td>
                    <td className="num px-3 py-1.5">{r.enrolled}</td>
                    <td className="num px-3 py-1.5">{r.present}</td>
                    <td className="num px-3 py-1.5">{r.absent}</td>
                    <td className="num px-3 py-1.5">{r.droppedOut}</td>
                    <td className="num px-3 py-1.5">{r.cnicVerified}</td>
                    <td className="num px-3 py-1.5 font-semibold">{fmtPct(r.attendanceRate)}</td>
                    <td className="num px-3 py-1.5 text-[var(--text-muted)]">{fmtPct(r.presenceRate)}</td>
                    {program.rubric.components.map((c) => {
                      const v = r.components[c.key] ?? 0;
                      return <td key={c.key} className={`num px-3 py-1.5 ${r.scored && v === 0 ? "font-semibold text-red-600" : ""}`}>{r.scored ? (Number.isInteger(v) ? v : v.toFixed(2)) : "—"}</td>;
                    })}
                    <td className="num px-3 py-1.5 font-bold" style={{ color: scoreColor(r.tradeScore) }}>{fmtScore(r.tradeScore, 1)}</td>
                    <td className="num px-3 py-1.5 text-[var(--text-muted)]">{r.excelRow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {remarks.length > 0 && (
            <div className="border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Monitor remarks</div>
              {remarks.map((m) => <p key={m} className="leading-relaxed">• {m}</p>)}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
