import type { Institute } from "./types";


/**
 * GRADING
 *
 * Every programme's Scoring Criteria sheet uses the same bands:
 *
 *     80 – 100   Excellent
 *     70 – 79.99 Very Good
 *     60 – 69.99 Good
 *     50 – 59.99 Average
 *     below 50   Poor
 *
 * Half-open intervals, so no score falls between two bands.
 *
 * A Grade Override recorded in the workbook (Fake / Non-functional / Closed
 * institutes) replaces the band, exactly as the workbook's own Grading formula
 * does. PMYSDP B-III predates the override column; its grades come from the
 * score and its written assessor notes travel separately as flags.
 */


export interface Tier { key: string; label: string; min: number; max: number; color: string }

export const COMPUTED_TIERS: Tier[] = [
  { key: "E",  label: "Excellent", min: 80, max: 100.01, color: "#10b981" },
  { key: "VG", label: "Very Good", min: 70, max: 80,     color: "#3b82f6" },
  { key: "G",  label: "Good",      min: 60, max: 70,     color: "#f59e0b" },
  { key: "A",  label: "Average",   min: 50, max: 60,     color: "#f97316" },
  { key: "P",  label: "Poor",      min: -1, max: 50,     color: "#ef4444" },
];

export const TIER_RUBRIC: Record<string, string> = {
  Excellent: "80 and above",
  "Very Good": "70 – 79.99",
  Good: "60 – 69.99",
  Average: "50 – 59.99",
  Poor: "below 50",
};

export const GRADE_ORDER = ["Excellent", "Very Good", "Good", "Average", "Poor", "Closed", "Unscored"] as const;

export const GRADE_COLORS: Record<string, string> = {
  Excellent: "#10b981",
  "Very Good": "#3b82f6",
  Good: "#f59e0b",
  Average: "#f97316",
  Poor: "#ef4444",
  Closed: "#6b7280",
  Unscored: "#94a3b8",
  Critical: "#b91c1c",
  "Non-Functional": "#6b7280",
};

export const STATUS_COLORS: Record<string, string> = {
  Active: "#10b981",
  Fake: "#b91c1c",
  Critical: "#dc2626",
  "Non-Functional": "#64748b",
  Closed: "#475569",
};

export function computedTier(score: number): Tier {
  return COMPUTED_TIERS.find((t) => score >= t.min && score < t.max) ?? COMPUTED_TIERS[COMPUTED_TIERS.length - 1];
}

export function bandOf(score: number | null | undefined): string | null {
  return score === null || score === undefined ? null : computedTier(score).label;
}

/** The grade an institute is shown with: workbook override, else score band. */
export function gradeOf(inst: Pick<Institute, "gradeOverride" | "score">): string {
  return inst.gradeOverride ?? bandOf(inst.score) ?? "Unscored";
}

export const scoreColor = (v: number | null | undefined): string =>
  v === null || v === undefined ? "#94a3b8" : computedTier(v).color;

export const CHART_PALETTE = [
  "#2563eb", "#0891b2", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#dc2626", "#65a30d", "#0d9488", "#9333ea",
];

export const REGION_COLORS: Record<string, string> = {
  PUNJAB: "#2563eb", ICT: "#0891b2", AJK: "#059669", GB: "#d97706",
};

export const SEVERITY_COLORS = { high: "#dc2626", medium: "#d97706", low: "#64748b" } as const;
export const SEVERITY_TEXT = { high: "var(--sev-high)", medium: "var(--sev-medium)", low: "var(--sev-low)" } as const;

/* ---------------- number formatting (presentation only) ---------------- */

export const fmtInt = (n: number | null | undefined): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : Math.round(n).toLocaleString("en-US");

export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 10_000) return (n / 1_000).toFixed(1) + "K";
  return Math.round(n).toLocaleString("en-US");
}

/** Accepts a 0-1 rate. Returns an em dash for null so charts never print NaN. */
export const fmtPct = (rate: number | null | undefined, digits = 1): string =>
  rate === null || rate === undefined || Number.isNaN(rate) ? "—" : (rate * 100).toFixed(digits) + "%";

export const fmtScore = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(digits);

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export const fmtMonth = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
};

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
