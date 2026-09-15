import type { AssessmentRow, Institute } from "../types";
import { categories, components } from "./dataset";

const sum = (a: AssessmentRow[], k: keyof AssessmentRow) =>
  a.reduce((s, r) => s + ((r[k] as number) ?? 0), 0);

/** Pooled rate: sum the numerator, sum the denominator, then divide. Never an average of rates. */
export const pooled = (num: number, den: number): number | null => (den > 0 ? num / den : null);

export interface Kpis {
  institutes: number; assessments: number; trades: number; districts: number; regions: number;
  approvedCapacity: number; registered: number; droppedOut: number; present: number;
  absent: number; cnicVerified: number;
  attendanceRate: number | null; presenceRate: number | null;
  dropoutRate: number | null; utilizationRate: number | null;
  meanInstituteScore: number | null; meanTradeScore: number | null;
}

/** Every headline number on every page comes from here. */
export function computeKpis(rows: AssessmentRow[], insts: Institute[]): Kpis {
  const registered = sum(rows, "biometricRegistered");
  const capacity = sum(rows, "approvedCapacity");
  const present = sum(rows, "present");
  const droppedOut = sum(rows, "droppedOut");
  const cnicVerified = sum(rows, "cnicVerified");
  return {
    institutes: insts.length,
    assessments: rows.length,
    trades: new Set(rows.map((r) => r.tradeCode)).size,
    districts: new Set(rows.map((r) => r.district)).size,
    regions: new Set(rows.map((r) => r.region)).size,
    approvedCapacity: capacity,
    registered, droppedOut, present,
    absent: sum(rows, "absent"),
    cnicVerified,
    // Attendance is CNIC-verified against approved capacity (official basis).
    attendanceRate: pooled(cnicVerified, capacity),
    presenceRate: pooled(present, registered),
    dropoutRate: pooled(droppedOut, registered),
    utilizationRate: pooled(registered, capacity),
    meanInstituteScore: insts.length ? insts.reduce((s, i) => s + i.score, 0) / insts.length : null,
    meanTradeScore: rows.length ? rows.reduce((s, r) => s + r.tradeScore, 0) / rows.length : null,
  };
}

/**
 * Rebuilds institute records from an arbitrary row subset, so that a Trade or
 * Batch filter narrows what each institute is scored on rather than only
 * hiding institutes wholesale.
 */
export function institutesFromRows(rows: AssessmentRow[], base: Map<number, Institute>): Institute[] {
  const groups = new Map<number, AssessmentRow[]>();
  for (const r of rows) {
    if (!groups.has(r.instituteId)) groups.set(r.instituteId, []);
    groups.get(r.instituteId)!.push(r);
  }
  const out: Institute[] = [];
  for (const [id, g] of groups) {
    const b = base.get(id);
    const score = g.reduce((s, r) => s + r.tradeScore, 0) / g.length;
    const registered = sum(g, "biometricRegistered");
    const capacity = sum(g, "approvedCapacity");
    const present = sum(g, "present");
    const dropped = sum(g, "droppedOut");
    const verified = sum(g, "cnicVerified");
    out.push({
      instituteId: id,
      instituteName: g[0].instituteName,
      region: g[0].region,
      district: g[0].district,
      package: g[0].package,
      assessments: g.length,
      trades: [...new Set(g.map((r) => r.tradeName))].sort(),
      tradeCodes: [...new Set(g.map((r) => r.tradeCode))],
      approvedCapacity: capacity,
      biometricRegistered: registered,
      droppedOut: dropped,
      present,
      absent: sum(g, "absent"),
      cnicVerified: verified,
      attendanceRate: pooled(verified, capacity),
      presenceRate: pooled(present, registered),
      dropoutRate: pooled(dropped, registered),
      utilizationRate: pooled(registered, capacity),
      score,
      scoreStored: b?.scoreStored ?? null,
      gradeReported: b?.gradeReported ?? null,
      assessorNote: b?.assessorNote ?? null,
      categoryScores: Object.fromEntries(
        categories.map((c) => [c.key, g.reduce((s, r) => s + r.categoryScores[c.key], 0) / g.length])),
      components: Object.fromEntries(
        components.map((c) => [c.key, g.reduce((s, r) => s + r.components[c.key], 0) / g.length])),
      rank: 0,
    });
  }
  out.sort((a, b) => b.score - a.score);
  out.forEach((i, idx) => { i.rank = idx + 1; });
  return out;
}

export interface GroupStat {
  key: string; institutes: number; assessments: number;
  registered: number; capacity: number; present: number; absent: number;
  dropped: number; verified: number;
  meanScore: number;
  /** CNIC Verified / Approved Capacity — official attendance basis. */
  attendanceRate: number | null;
  /** Present / Registered — physical presence. */
  presenceRate: number | null;
  dropoutRate: number | null;
  utilizationRate: number | null;
}

/** Generic grouped aggregation used by every comparison and ranking chart. */
export function groupBy(rows: AssessmentRow[], keyFn: (r: AssessmentRow) => string | null): GroupStat[] {
  const g = new Map<string, AssessmentRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (k === null) continue;
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(r);
  }
  return [...g.entries()].map(([key, arr]) => {
    const registered = sum(arr, "biometricRegistered");
    const capacity = sum(arr, "approvedCapacity");
    const present = sum(arr, "present");
    const verified = sum(arr, "cnicVerified");
    const dropped = sum(arr, "droppedOut");
    return {
      key,
      institutes: new Set(arr.map((r) => r.instituteId)).size,
      assessments: arr.length,
      registered, capacity, present,
      absent: sum(arr, "absent"),
      dropped, verified,
      meanScore: arr.reduce((s, r) => s + r.tradeScore, 0) / arr.length,
      attendanceRate: pooled(verified, capacity),
      presenceRate: pooled(present, registered),
      dropoutRate: pooled(dropped, registered),
      utilizationRate: pooled(registered, capacity),
    };
  });
}

/** Score distribution in ten-point bins. */
export function histogram(values: number[], binSize = 10): { label: string; count: number; from: number }[] {
  const bins = new Map<number, number>();
  for (let b = 0; b < 100; b += binSize) bins.set(b, 0);
  for (const v of values) {
    const b = Math.min(Math.floor(v / binSize) * binSize, 100 - binSize);
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  return [...bins.entries()].sort((a, b) => a[0] - b[0])
    .map(([from, count]) => ({ from, label: `${from}–${from + binSize}`, count }));
}

/* ------------------------------------------------------------------ *
 * Distribution and relationship helpers
 * ------------------------------------------------------------------ */

/** Linear-interpolated quantile over an unsorted numeric array. */
export function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export interface BoxStat { key: string; min: number; q1: number; median: number; q3: number; max: number; n: number }

/** Five-number summary per group, for box plots. */
export function boxStats(rows: AssessmentRow[], keyFn: (r: AssessmentRow) => string, valueFn: (r: AssessmentRow) => number): BoxStat[] {
  const g = new Map<string, number[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!g.has(k)) g.set(k, []);
    g.get(k)!.push(valueFn(r));
  }
  return [...g.entries()].map(([key, v]) => ({
    key,
    min: Math.min(...v),
    q1: quantile(v, 0.25),
    median: quantile(v, 0.5),
    q3: quantile(v, 0.75),
    max: Math.max(...v),
    n: v.length,
  })).sort((a, b) => b.median - a.median);
}

/**
 * Pearson correlation between each score component and the total trade score.
 *
 * Answers a question the raw scores cannot: which components actually separate
 * strong institutes from weak ones. A component every institute scores full
 * marks on contributes points but no discrimination.
 */
export function componentDrivers(
  rows: AssessmentRow[],
  comps: { key: string; label: string; max: number }[],
): { key: string; label: string; max: number; r: number; mean: number; pct: number; spread: number }[] {
  if (rows.length < 3) return [];
  const total = rows.map((r) => r.tradeScore);
  const mt = total.reduce((s, x) => s + x, 0) / total.length;

  return comps.map((c) => {
    const xs = rows.map((r) => r.components[c.key]);
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (total[i] - mt);
      dx += (xs[i] - mx) ** 2;
      dy += (total[i] - mt) ** 2;
    }
    const denom = Math.sqrt(dx * dy);
    return {
      key: c.key, label: c.label, max: c.max,
      r: denom === 0 ? 0 : num / denom,
      mean: mx,
      pct: (mx / c.max) * 100,
      // coefficient of variation — how much the component varies at all
      spread: mx === 0 ? 0 : Math.sqrt(dx / xs.length) / mx,
    };
  }).sort((a, b) => b.r - a.r);
}

/** Enrolment funnel: sanctioned seats down to verified attendance. */
export function funnel(rows: AssessmentRow[]): { stage: string; value: number; pctOfCapacity: number | null; note: string }[] {
  const cap = rows.reduce((s, r) => s + r.approvedCapacity, 0);
  const reg = rows.reduce((s, r) => s + r.biometricRegistered, 0);
  const pre = rows.reduce((s, r) => s + r.present, 0);
  const ver = rows.reduce((s, r) => s + r.cnicVerified, 0);
  const pct = (v: number) => (cap > 0 ? (v / cap) * 100 : null);
  return [
    { stage: "Approved capacity", value: cap, pctOfCapacity: pct(cap), note: "Seats sanctioned" },
    { stage: "Registered", value: reg, pctOfCapacity: pct(reg), note: `${(cap - reg).toLocaleString()} seats unfilled` },
    { stage: "Present", value: pre, pctOfCapacity: pct(pre), note: `${(reg - pre).toLocaleString()} registered but not present` },
    { stage: "CNIC verified", value: ver, pctOfCapacity: pct(ver), note: `${(pre - ver).toLocaleString()} present but unverified` },
  ];
}
