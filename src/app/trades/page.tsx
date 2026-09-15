"use client";
import { useMemo } from "react";
import { useFilters } from "@/components/providers/FilterProvider";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card, EmptyState, Badge } from "@/components/ui";
import { groupBy } from "@/lib/aggregate";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS, computedTier } from "@/config";

export default function TradesPage() {
  const { rows, isEmpty, reset, patch, filters } = useFilters();

  const trades = useMemo(() => {
    const stats = groupBy(rows, (r) => r.tradeName);
    const codeOf = new Map(rows.map((r) => [r.tradeName, r.tradeCode]));
    return stats.map((s) => ({ ...s, code: codeOf.get(s.key)! })).sort((a, b) => b.registered - a.registered);
  }, [rows]);

  const top20 = useMemo(() => trades.slice(0, 20), [trades]);
  const byScore = useMemo(() => [...trades].filter((t) => t.assessments >= 3).sort((a, b) => b.meanScore - a.meanScore), [trades]);

  if (isEmpty) {
    return (<><PageHeader page="Trades" title="Trade Analysis" /><Card><EmptyState onClear={reset} /></Card></>);
  }

  return (
    <>
      <PageHeader page="Trades" title="Trade Analysis"
        description={`${trades.length} distinct trades keyed on Trade Code. Spelling variants in the workbook are merged onto a single canonical name.`} />

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Largest trades by enrolment" subtitle="Top 20 · click to filter" height={480}
          methodology={<><strong>Trade enrolment</strong><br />Σ Registered per trade, keyed on <code>Trade Code</code> (column K) rather than the name string, because 76 raw name spellings collapse to 70 real trades.</>}
          data={top20.map((t) => ({ label: t.key, value: fmtInt(t.registered) }))}
          onEvent={{ type: "click", handler: (p) => {
            const idx = (p as { dataIndex: number }).dataIndex;
            const code = [...top20].reverse()[idx].code;
            patch({ trade: filters.trade.includes(code) ? filters.trade.filter((x) => x !== code) : [...filters.trade, code] });
          } }}
          option={{
            grid: { left: 8, right: 52, top: 8, bottom: 8, containLabel: true },
            tooltip: {
              trigger: "axis", axisPointer: { type: "shadow" },
              formatter: (p: unknown) => {
                const a = (p as { dataIndex: number }[])[0]; const t = [...top20].reverse()[a.dataIndex];
                return `<b>${t.key}</b><br/>${fmtInt(t.registered)} registered · ${t.institutes} institutes<br/>CNIC verified ${fmtInt(t.verified)} of ${fmtInt(t.capacity)} seats<br/>Attendance ${fmtPct(t.attendanceRate)} · Mean score ${t.meanScore.toFixed(1)}`;
              },
            },
            xAxis: { type: "value" },
            yAxis: {
              type: "category",
              data: [...top20].reverse().map((t) => (t.key.length > 34 ? t.key.slice(0, 33) + "…" : t.key)),
              axisLabel: { fontSize: 9.5 },
            },
            series: [{
              type: "bar", barMaxWidth: 13, itemStyle: { borderRadius: [0, 3, 3, 0], color: "#0891b2" },
              label: { show: true, position: "right", fontSize: 9.5 },
              data: [...top20].reverse().map((t) => t.registered),
            }],
          }} />

        <ChartCard title="Enrolment against performance" subtitle="Trades with 3+ assessments" height={480}
          methodology={<><strong>Enrolment vs performance</strong><br />X: Σ Registered. Y: mean trade score. Bubble size: number of institutes offering the trade. Trades with fewer than 3 assessments are excluded because their mean is unstable.</>}
          data={byScore.slice(0, 20).map((t) => ({ label: t.key, value: t.meanScore.toFixed(2) }))}
          option={{
            grid: { left: 48, right: 20, top: 20, bottom: 42 },
            tooltip: {
              formatter: (p: unknown) => {
                const q = p as { data: [number, number, number, string] };
                return `<b>${q.data[3]}</b><br/>${fmtInt(q.data[0])} trainees<br/>Mean score ${q.data[1].toFixed(1)}<br/>${q.data[2]} institutes`;
              },
            },
            xAxis: { type: "value", name: "Registered trainees", nameLocation: "middle", nameGap: 26, nameTextStyle: { fontSize: 10 } },
            yAxis: { type: "value", name: "Mean score", max: 100, nameTextStyle: { fontSize: 10 } },
            series: [{
              type: "scatter",
              symbolSize: (d: unknown) => { const v = d as number[]; return Math.max(7, Math.min(Math.sqrt(v[2]) * 5.5, 34)); },
              itemStyle: { color: "#7c3aed", opacity: 0.62, borderColor: "#fff", borderWidth: 1 },
              data: byScore.map((t) => [t.registered, Number(t.meanScore.toFixed(2)), t.institutes, t.key]),
            }],
          }} />
      </div>

      <Card className="print-avoid overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-[13px] font-semibold">All trades</h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            Ranked by mean trade score. Attendance % is CNIC Verified ÷ Approved Capacity; Presence % is Present ÷ Registered.
            Remarks apply the official rubric to the mean trade score. Trades assessed fewer than 3 times are marked.
          </p>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--surface-2)]">
              <tr>
                {["Trade", "Code", "Institutes", "Assessments", "Capacity", "Registered", "Present", "Absent", "Dropped", "CNIC verified", "Attendance %", "Presence %", "Dropout %", "Utilization %", "Mean score", "Remarks"].map((h) => (
                  <th key={h} scope="col" className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...trades].sort((a, b) => b.meanScore - a.meanScore).map((t) => (
                <tr key={t.code} className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-3)]"
                  onClick={() => patch({ trade: filters.trade.includes(t.code) ? filters.trade.filter((x) => x !== t.code) : [...filters.trade, t.code] })}>
                  <td className="max-w-[300px] truncate px-3 py-1.5 font-medium">
                    {t.key}
                    {t.assessments < 3 && <span className="ml-1.5 rounded bg-[var(--surface-3)] px-1 py-0.5 text-[9px] text-[var(--text-muted)]">low n</span>}
                  </td>
                  <td className="num px-3 py-1.5 text-[var(--text-muted)]">{t.code}</td>
                  <td className="num px-3 py-1.5">{t.institutes}</td>
                  <td className="num px-3 py-1.5">{t.assessments}</td>
                  <td className="num px-3 py-1.5">{fmtInt(t.capacity)}</td>
                  <td className="num px-3 py-1.5">{fmtInt(t.registered)}</td>
                  <td className="num px-3 py-1.5">{fmtInt(t.present)}</td>
                  <td className="num px-3 py-1.5">{fmtInt(t.absent)}</td>
                  <td className="num px-3 py-1.5">{fmtInt(t.dropped)}</td>
                  <td className="num px-3 py-1.5 font-semibold">{fmtInt(t.verified)}</td>
                  <td className="num px-3 py-1.5 font-semibold">{fmtPct(t.attendanceRate)}</td>
                  <td className="num px-3 py-1.5 text-[var(--text-muted)]">{fmtPct(t.presenceRate)}</td>
                  <td className="num px-3 py-1.5 text-[var(--text-muted)]">{fmtPct(t.dropoutRate, 2)}</td>
                  <td className="num px-3 py-1.5 text-[var(--text-muted)]">{fmtPct(t.utilizationRate)}</td>
                  <td className="num px-3 py-1.5 font-bold">{fmtScore(t.meanScore, 1)}</td>
                  <td className="px-3 py-1.5">
                    <Badge color={GRADE_COLORS[computedTier(t.meanScore).label]}>{computedTier(t.meanScore).label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
