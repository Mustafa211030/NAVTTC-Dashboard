import type { Institute } from "./types";

/**
 * TIER MODEL — see docs/AUDIT_FINDINGS.md §2.1
 *
 * Two incompatible grading models exist in the sources:
 *
 *   "reported"  the Grading column in the Excel workbook. Hand-assigned by
 *               assessors, bands overlap slightly, and it carries free-text
 *               commentary. 81 institutes are Excellent.
 *   "computed"  the >=85 threshold rule hard-coded in the old HTML dashboard.
 *               Reproducible, but its provenance is undocumented.
 *               52 institutes are Excellent.
 *
 * "computed" is the setting in use.
 *
 * The workbook's Grading column was audited against the scores it is supposed
 * to describe and does not hold up: institute 21520 scores 30.35 and is graded
 * "Good", while several institutes scoring in the low 60s are graded Excellent.
 * The bands also overlap (Very Good tops out at 80.58 while Excellent starts at
 * 80.38), so it cannot be reproduced as a rule. Grading institutes on a figure
 * that contradicts their own score is not defensible in a published ranking.
 *
 * The score-derived rule below is applied instead. The workbook's grade is
 * still carried on every institute as `gradeReported`, shown in the Data
 * Explorer and compared side by side on the Methodology page, so nothing is
 * lost and the divergence stays visible.
 *
 * Assessor notes are unaffected: "Critical" and "Non-Functional" are
 * qualitative field observations rather than score bands, so they continue to
 * drive the Flagged by Assessors list independently of the grade.
 */
export const TIER_SOURCE: "reported" | "computed" = "computed";

export interface Tier { key: string; label: string; min: number; max: number; color: string }

/**
 * Official NAVTTC grading rubric.
 *
 *      0 – 49    Poor
 *     50 – 59    Average
 *     60 – 69    Good
 *     70 – 79    Very Good
 *     80 +       Excellent
 *
 * Half-open intervals, so no score falls between two bands: 49.9 is Poor,
 * 69.99 is Good, exactly 80.0 is Excellent.
 *
 * The same table is implemented in scripts/apply-grading.mjs, which writes the
 * workbook's own Grading column. Change both together or the dashboard and the
 * spreadsheet will disagree.
 */
export const COMPUTED_TIERS: Tier[] = [
  { key: "E",  label: "Excellent", min: 80, max: 100.01, color: "#10b981" },
  { key: "VG", label: "Very Good", min: 70, max: 80,     color: "#3b82f6" },
  { key: "G",  label: "Good",      min: 60, max: 70,     color: "#f59e0b" },
  { key: "A",  label: "Average",   min: 50, max: 60,     color: "#f97316" },
  { key: "P",  label: "Poor",      min: 0,  max: 50,     color: "#ef4444" },
];

/** Human-readable band text, shown on the Methodology page and in tooltips. */
export const TIER_RUBRIC: Record<string, string> = {
  Excellent: "80 and above",
  "Very Good": "70 – 79",
  Good: "60 – 69",
  Average: "50 – 59",
  Poor: "0 – 49",
};

/** Display order and colour for every grade that occurs in the workbook. */
export const GRADE_ORDER = ["Excellent", "Very Good", "Good", "Average", "Poor", "Critical", "Non-Functional"] as const;

export const GRADE_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  "Very Good": "#3b82f6",
  Good: "#f59e0b",
  Average: "#f97316",
  Poor: "#ef4444",
  Critical: "#b91c1c",
  "Non-Functional": "#6b7280",
};

export function computedTier(score: number): Tier {
  return COMPUTED_TIERS.find((t) => score >= t.min && score < t.max) ?? COMPUTED_TIERS[COMPUTED_TIERS.length - 1];
}

/** The grade an institute is shown as, honouring TIER_SOURCE. */
export function gradeOf(inst: Institute): string {
  if (TIER_SOURCE === "reported") return inst.gradeReported ?? computedTier(inst.score).label;
  return computedTier(inst.score).label;
}

/**
 * Grades that can actually occur under the active model. Under "computed" only
 * the five score bands are reachable, so Critical and Non-Functional must not
 * appear as filter options even though they exist in the workbook.
 */
export function availableGrades(reported: string[]): string[] {
  if (TIER_SOURCE === "computed") return COMPUTED_TIERS.map((t) => t.label);
  return GRADE_ORDER.filter((g) => reported.includes(g));
}

export const CHART_PALETTE = [
  "#2563eb", "#0891b2", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#dc2626", "#65a30d", "#0d9488", "#9333ea",
];

/** Severity palette for charts and background tints, where contrast is not a concern. */
export const SEVERITY_COLORS = { high: "#dc2626", medium: "#d97706", low: "#64748b" } as const;

/**
 * Severity palette for TEXT.
 *
 * These labels are rendered with an inline style, which no stylesheet can
 * correct per theme — and no single hex clears 4.5:1 against both a white and
 * a navy background for 11px text. CSS custom properties are valid inside
 * inline styles, so the value resolves per theme from globals.css instead.
 */
export const SEVERITY_TEXT = {
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
} as const;

/* ---------------- number formatting (presentation only) ---------------- */

export const fmtInt = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toLocaleString("en-US");

export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 10_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("en-US");
}

/** Accepts a 0-1 rate. Returns an em dash for null so charts never print NaN. */
export const fmtPct = (rate: number | null | undefined, digits = 1): string =>
  rate === null || rate === undefined || Number.isNaN(rate) ? "—" : (rate * 100).toFixed(digits) + "%";

export const fmtScore = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(digits);