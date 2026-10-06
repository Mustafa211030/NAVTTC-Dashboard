import type { AssessmentRow, CategoryKey, Institute, Program } from "../types";
import { bandOf, gradeOf } from "../config";
import { instKey } from "./filters";

const sum = (a: AssessmentRow[], k: keyof AssessmentRow) => a.reduce((s, r) => s + ((r[k] as number) ?? 0), 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Pooled rate: sum the numerator, sum the denominator, then divide. Never an average of rates. */
export const pooled = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export const CATEGORY_KEYS: CategoryKey[] = ["biometricAttendance", "infrastructure", "trainer", "delivery", "industry", "feedback"];

/* ------------------------------------------------------------------ KPIs */

export interface Kpis {
  programs: number;
  institutes: number;
  uniqueInstitutes: number;
  assessments: number;
  trades: number;
  districts: number;
  regions: number;
  approvedCapacity: number;
  enrolled: number;
  droppedOut: number;
  present: number;
  absent: number;
  cnicVerified: number;
  attendanceRate: number | null;
  presenceRate: number | null;
  verificationRate: number | null;
  dropoutRate: number | null;
  utilizationRate: number | null;
  meanInstituteScore: number | null;
  meanTradeScore: number | null;
  excellent: number;
  excellentShare: number | null;
  belowAverage: number;
  flagged: number;
  gradeCounts: Record<string, number>;
}

export function computeKpis(rows: AssessmentRow[], insts: Institute[]): Kpis {
  const capacity = sum(rows, "approvedCapacity");
  const enrolled = sum(rows, "enrolled");
  const present = sum(rows, "present");
  const droppedOut = sum(rows, "droppedOut");
  const cnicVerified = sum(rows, "cnicVerified");
  const scoredInst = insts.filter((i) => i.score !== null);
  const scoredRows = rows.filter((r) => r.scored && r.tradeScore !== null);
  const gradeCounts: Record<string, number> = {};
  for (const i of insts) { const g = gradeOf(i); gradeCounts[g] = (gradeCounts[g] ?? 0) + 1; }
  const excellent = gradeCounts.Excellent ?? 0;
  return {
    programs: new Set(rows.map((r) => r.p)).size,
    institutes: insts.length,
    uniqueInstitutes: new Set(insts.map((i) => i.globalKey)).size,
    assessments: rows.length,
    trades: new Set(rows.map((r) => r.tradeNorm)).size,
    districts: new Set(rows.map((r) => r.district)).size,
    regions: new Set(rows.map((r) => r.region)).size,
    approvedCapacity: capacity,
    enrolled, droppedOut, present,
    absent: sum(rows, "absent"),
    cnicVerified,
    attendanceRate: pooled(sum(rows, "attNum"), sum(rows, "attDen")),
    presenceRate: pooled(present, enrolled),
    verificationRate: pooled(cnicVerified, capacity),
    dropoutRate: pooled(droppedOut, enrolled),
    utilizationRate: pooled(enrolled, capacity),
    meanInstituteScore: mean(scoredInst.map((i) => i.score as number)),
    meanTradeScore: mean(scoredRows.map((r) => r.tradeScore as number)),
    excellent,
    excellentShare: insts.length ? excellent / insts.length : null,
    belowAverage: (gradeCounts.Poor ?? 0) + (gradeCounts.Closed ?? 0),
    flagged: insts.filter((i) => i.flagged).length,
    gradeCounts,
  };
}

/* ------------------------------------------------------------------ institutes */

/**
 * Rebuilds institute records from an arbitrary row subset, so a trade or batch
 * filter narrows what each institute is scored on rather than only hiding
 * institutes wholesale. Workbook-level fields (override, note, status) come
 * from the base record.
 */
export function institutesFromRows(rows: AssessmentRow[], base: Map<string, Institute>, programs: Map<string, Program>): Institute[] {
  const groups = new Map<string, AssessmentRow[]>();
  for (const r of rows) {
    const k = instKey(r.p, r.instituteKey);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: Institute[] = [];
  for (const [k, g] of groups) {
    const b = base.get(k);
    const prog = programs.get(g[0].p);
    const scored = g.filter((r) => r.scored && r.tradeScore !== null);
    const score = mean(scored.map((r) => r.tradeScore as number));
    const capacity = sum(g, "approvedCapacity");
    const enrolled = sum(g, "enrolled");
    const present = sum(g, "present");
    const dropped = sum(g, "droppedOut");
    const verified = sum(g, "cnicVerified");
    const attNum = sum(g, "attNum");
    const attDen = sum(g, "attDen");
    const categoryPct = {} as Record<CategoryKey, number | null>;
    const categoryScores = {} as Record<CategoryKey, number | null>;
    for (const c of CATEGORY_KEYS) {
      const vals = scored.map((r) => r.categoryPct[c]).filter((v): v is number => v !== null && v !== undefined);
      const m = mean(vals);
      categoryPct[c] = m;
      const max = prog?.rubric.categories.find((x) => x.key === c)?.max ?? 0;
      categoryScores[c] = m === null ? null : m * max;
    }
    const components: Record<string, number | null> = {};
    for (const comp of prog?.rubric.components ?? []) components[comp.key] = mean(scored.map((r) => r.components[comp.key] ?? 0));
    const gradeOverride = b?.gradeOverride ?? null;
    out.push({
      p: g[0].p,
      instituteKey: g[0].instituteKey,
      globalKey: g[0].globalKey,
      instituteId: g[0].instituteId,
      instituteName: b?.instituteName ?? g[0].instituteName,
      region: g[0].region,
      district: g[0].district,
      division: g[0].division,
      package: g[0].package,
      assessments: g.length,
      trades: [...new Set(g.map((r) => r.tradeName))].sort(),
      approvedCapacity: capacity, enrolled, droppedOut: dropped, present,
      absent: sum(g, "absent"), cnicVerified: verified, attNum, attDen,
      attendanceRate: pooled(attNum, attDen),
      presenceRate: pooled(present, enrolled),
      verificationRate: pooled(verified, capacity),
      dropoutRate: pooled(dropped, enrolled),
      utilizationRate: pooled(enrolled, capacity),
      score,
      scoreStored: b?.scoreStored ?? null,
      grade: gradeOverride ?? bandOf(score) ?? "Unscored",
      gradeReported: b?.gradeReported ?? null,
      gradeOverride,
      assessorNote: b?.assessorNote ?? null,
      status: b?.status ?? "Active",
      flagged: b?.flagged ?? false,
      categoryScores, categoryPct, components,
      visitDate: b?.visitDate ?? null,
      rank: 0,
    });
  }
  out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  out.forEach((i, idx) => { i.rank = idx + 1; });
  return out;
}

/* ------------------------------------------------------------------ grouping */

export interface GroupStat {
  key: string;
  institutes: number;
  programs: number;
  assessments: number;
  capacity: number;
  enrolled: number;
  present: number;
  absent: number;
  dropped: number;
  verified: number;
  attNum: number;
  attDen: number;
  meanScore: number | null;
  scored: number;
  attendanceRate: number | null;
  presenceRate: number | null;
  verificationRate: number | null;
  dropoutRate: number | null;
  utilizationRate: number | null;
  /** share of scored trade rows at 80+ */
  excellentShare: number | null;
}

export function statOf(key: string, arr: AssessmentRow[]): GroupStat {
  const capacity = sum(arr, "approvedCapacity");
  const enrolled = sum(arr, "enrolled");
  const present = sum(arr, "present");
  const verified = sum(arr, "cnicVerified");
  const dropped = sum(arr, "droppedOut");
  const attNum = sum(arr, "attNum");
  const attDen = sum(arr, "attDen");
  const scored = arr.filter((r) => r.scored && r.tradeScore !== null);
  return {
    key,
    institutes: new Set(arr.map((r) => instKey(r.p, r.instituteKey))).size,
    programs: new Set(arr.map((r) => r.p)).size,
    assessments: arr.length,
    capacity, enrolled, present,
    absent: sum(arr, "absent"),
    dropped, verified, attNum, attDen,
    meanScore: mean(scored.map((r) => r.tradeScore as number)),
    scored: scored.length,
    attendanceRate: pooled(attNum, attDen),
    presenceRate: pooled(present, enrolled),
    verificationRate: pooled(verified, capacity),
    dropoutRate: pooled(dropped, enrolled),
    utilizationRate: pooled(enrolled, capacity),
    excellentShare: scored.length ? scored.filter((r) => (r.tradeScore as number) >= 80).length / scored.length : null,
  };
}

/** Generic grouped aggregation used by every comparison and ranking chart. */
export function groupBy(rows: AssessmentRow[], keyFn: (r: AssessmentRow) => string | null): GroupStat[] {
  const g = new Map<string, AssessmentRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null || k === undefined || k === "") continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(r);
  }
  return [...g.entries()].map(([key, arr]) => statOf(key, arr));
}

/** Two-level grouping for heatmaps: outer × inner → stat. */
export function crossTab(rows: AssessmentRow[], a: (r: AssessmentRow) => string | null, b: (r: AssessmentRow) => string | null) {
  const m = new Map<string, Map<string, AssessmentRow[]>>();
  for (const r of rows) {
    const ka = a(r); const kb = b(r);
    if (!ka || !kb) continue;
    if (!m.has(ka)) m.set(ka, new Map());
    const inner = m.get(ka)!;
    if (!inner.has(kb)) inner.set(kb, []);
    inner.get(kb)!.push(r);
  }
  const out: { a: string; b: string; stat: GroupStat }[] = [];
  for (const [ka, inner] of m) for (const [kb, arr] of inner) out.push({ a: ka, b: kb, stat: statOf(`${ka}|${kb}`, arr) });
  return out;
}

/* ------------------------------------------------------------------ metric registry */

export interface MetricDef {
  key: string;
  label: string;
  short: string;
  /** unit for axis formatting */
  kind: "score" | "rate" | "count";
  get: (s: GroupStat) => number | null;
  better: "high" | "low";
  help: string;
}

export const METRICS: MetricDef[] = [
  { key: "score", label: "Mean trade score", short: "Score", kind: "score", get: (s) => s.meanScore, better: "high", help: "Mean of trade scores (out of 100) under each programme's own rubric." },
  { key: "attendance", label: "Attendance %", short: "Attendance", kind: "rate", get: (s) => s.attendanceRate, better: "high", help: "Pooled under each programme's own attendance rule." },
  { key: "presence", label: "Presence %", short: "Presence", kind: "rate", get: (s) => s.presenceRate, better: "high", help: "Σ Present ÷ Σ Enrolled." },
  { key: "verification", label: "CNIC verified % of seats", short: "Verified", kind: "rate", get: (s) => s.verificationRate, better: "high", help: "Σ CNIC Verified ÷ Σ Approved Capacity — the same basis in every programme." },
  { key: "utilization", label: "Seat utilisation %", short: "Utilisation", kind: "rate", get: (s) => s.utilizationRate, better: "high", help: "Σ Enrolled ÷ Σ Approved Capacity." },
  { key: "dropout", label: "Dropout %", short: "Dropout", kind: "rate", get: (s) => s.dropoutRate, better: "low", help: "Σ Dropped Out ÷ Σ Enrolled." },
  { key: "excellent", label: "Trades scoring 80+", short: "80+ share", kind: "rate", get: (s) => s.excellentShare, better: "high", help: "Share of scored trade assessments at Excellent level." },
  { key: "enrolled", label: "Trainees enrolled", short: "Enrolled", kind: "count", get: (s) => s.enrolled, better: "high", help: "Σ Enrolled (B-III: registered on biometric device)." },
  { key: "capacity", label: "Approved capacity", short: "Capacity", kind: "count", get: (s) => s.capacity, better: "high", help: "Σ Approved Capacity." },
  { key: "verified", label: "CNIC verified", short: "Verified #", kind: "count", get: (s) => s.verified, better: "high", help: "Σ CNIC Verified." },
  { key: "institutes", label: "Institutes", short: "Institutes", kind: "count", get: (s) => s.institutes, better: "high", help: "Distinct programme-institutes." },
  { key: "assessments", label: "Trade assessments", short: "Assessments", kind: "count", get: (s) => s.assessments, better: "high", help: "Trade × batch rows assessed." },
];
export const metricByKey = new Map(METRICS.map((m) => [m.key, m]));

export function fmtMetric(kind: MetricDef["kind"], v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (kind === "rate") return (v * 100).toFixed(digits ?? 1) + "%";
  if (kind === "score") return v.toFixed(digits ?? 1);
  return Math.round(v).toLocaleString("en-US");
}
/** Value as plotted: rates in percent, others as is. */
export const plotValue = (kind: MetricDef["kind"], v: number | null | undefined): number | null =>
  v === null || v === undefined || Number.isNaN(v) ? null : kind === "rate" ? Number((v * 100).toFixed(2)) : Number(v.toFixed(2));

/* ------------------------------------------------------------------ distributions */

export function histogram(values: number[], binSize = 10): { label: string; count: number; from: number }[] {
  const bins = new Map<number, number>();
  for (let b = 0; b < 100; b += binSize) bins.set(b, 0);
  for (const v of values) {
    const b = Math.max(0, Math.min(Math.floor(v / binSize) * binSize, 100 - binSize));
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  return [...bins.entries()].sort((a, b) => a[0] - b[0])
    .map(([from, count]) => ({ from, label: `${from}–${from + binSize}`, count }));
}

export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export interface BoxStat { key: string; min: number; q1: number; median: number; q3: number; max: number; n: number; mean: number }

export function boxStats<T>(items: T[], keyFn: (r: T) => string | null, valueFn: (r: T) => number | null): BoxStat[] {
  const g = new Map<string, number[]>();
  for (const r of items) {
    const k = keyFn(r);
    const v = valueFn(r);
    if (k === null || v === null || v === undefined) continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(v);
  }
  return [...g.entries()].map(([key, v]) => ({
    key,
    min: Math.min(...v), q1: quantile(v, 0.25), median: quantile(v, 0.5), q3: quantile(v, 0.75), max: Math.max(...v),
    n: v.length, mean: v.reduce((s, x) => s + x, 0) / v.length,
  })).sort((a, b) => b.median - a.median);
}

/**
 * Pearson correlation between each factor and the total trade score — which
 * parts of the rubric actually separate strong institutes from weak ones.
 */
export function drivers(
  rows: AssessmentRow[],
  factors: { key: string; label: string; max: number; value: (r: AssessmentRow) => number | null }[],
): { key: string; label: string; max: number; r: number; mean: number; pct: number; n: number }[] {
  const scored = rows.filter((r) => r.scored && r.tradeScore !== null);
  if (scored.length < 3) return [];
  return factors.map((f) => {
    const pairs = scored.map((r) => [f.value(r), r.tradeScore as number] as const).filter((p): p is [number, number] => p[0] !== null);
    if (pairs.length < 3) return { key: f.key, label: f.label, max: f.max, r: 0, mean: 0, pct: 0, n: pairs.length };
    const mx = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
    const my = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
    let num = 0, dx = 0, dy = 0;
    for (const [x, y] of pairs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; }
    const den = Math.sqrt(dx * dy);
    return { key: f.key, label: f.label, max: f.max, r: den === 0 ? 0 : num / den, mean: mx, pct: f.max ? (mx / f.max) * 100 : 0, n: pairs.length };
  }).sort((a, b) => b.r - a.r);
}

/** Enrolment funnel: sanctioned seats down to verified attendance. */
export function funnel(rows: AssessmentRow[]) {
  const cap = sum(rows, "approvedCapacity");
  const enr = sum(rows, "enrolled");
  const pre = sum(rows, "present");
  const ver = sum(rows, "cnicVerified");
  const pct = (v: number) => (cap > 0 ? (v / cap) * 100 : null);
  return [
    { stage: "Approved capacity", value: cap, pctOfCapacity: pct(cap), note: "Seats sanctioned" },
    { stage: "Enrolled", value: enr, pctOfCapacity: pct(enr), note: `${(cap - enr).toLocaleString()} seats unfilled` },
    { stage: "Present", value: pre, pctOfCapacity: pct(pre), note: `${(enr - pre).toLocaleString()} enrolled but not present` },
    { stage: "CNIC verified", value: ver, pctOfCapacity: pct(ver), note: `${Math.max(pre - ver, 0).toLocaleString()} present but unverified` },
  ];
}

/** Mean achievement (0–1) per shared category over scored rows. */
export function categoryMeans(rows: AssessmentRow[]): Record<CategoryKey, number | null> {
  const out = {} as Record<CategoryKey, number | null>;
  const scored = rows.filter((r) => r.scored);
  for (const c of CATEGORY_KEYS) out[c] = mean(scored.map((r) => r.categoryPct[c]).filter((v): v is number => v !== null && v !== undefined));
  return out;
}
