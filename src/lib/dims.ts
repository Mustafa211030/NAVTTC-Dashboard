import type { AssessmentRow, FilterState } from "../types";
import type { PortfolioIndex } from "./portfolio";
import { instKey } from "./filters";
import { GRADE_COLORS, GRADE_ORDER, REGION_COLORS, STATUS_COLORS } from "../config";

/**
 * Dimension registry. Every comparison chart can regroup by any dimension
 * that exists in the rows it is given — the per-chart "Group by" control.
 */
export interface Dim {
  key: string;
  label: string;
  get: (r: AssessmentRow) => string | null;
  /** display name for a key */
  name: (k: string) => string;
  color?: (k: string) => string | undefined;
  /** global filter this dimension maps to, for click-to-filter */
  filterKey?: "program" | "region" | "district" | "package" | "trade" | "grade" | "status";
  order?: (a: string, b: string) => number;
}

export function makeDims(data: PortfolioIndex): Record<string, Dim> {
  const p = (s: string) => data.programBySlug.get(s);
  const gradeOfRow = (r: AssessmentRow) => data.facts.get(instKey(r.p, r.instituteKey))?.grade ?? null;
  const statusOfRow = (r: AssessmentRow) => data.facts.get(instKey(r.p, r.instituteKey))?.status ?? null;
  return {
    program: {
      key: "program", label: "Programme", get: (r) => r.p, name: (k) => p(k)?.short ?? k, color: (k) => p(k)?.color,
      filterKey: "program", order: (a, b) => (p(a)?.order ?? 0) - (p(b)?.order ?? 0),
    },
    family: { key: "family", label: "Programme family", get: (r) => p(r.p)?.family ?? null, name: (k) => k },
    region: { key: "region", label: "Region", get: (r) => r.region, name: (k) => k, color: (k) => REGION_COLORS[k], filterKey: "region" },
    district: { key: "district", label: "District", get: (r) => r.district, name: (k) => k, filterKey: "district" },
    trade: { key: "trade", label: "Trade", get: (r) => r.tradeNorm, name: (k) => data.tradeName(k), filterKey: "trade" },
    package: { key: "package", label: "Package", get: (r) => r.package, name: (k) => k, filterKey: "package" },
    grade: {
      key: "grade", label: "Institute grade", get: gradeOfRow, name: (k) => k, color: (k) => GRADE_COLORS[k], filterKey: "grade",
      order: (a, b) => GRADE_ORDER.indexOf(a as never) - GRADE_ORDER.indexOf(b as never),
    },
    status: { key: "status", label: "Institute status", get: statusOfRow, name: (k) => k, color: (k) => STATUS_COLORS[k], filterKey: "status" },
    batch: { key: "batch", label: "Batch", get: (r) => (r.batch === null ? null : String(r.batch)), name: (k) => `Batch ${k}`, order: (a, b) => Number(a) - Number(b) },
    tradeCategory: { key: "tradeCategory", label: "Trade category", get: (r) => r.tradeCategory, name: (k) => k },
    tradeSector: { key: "tradeSector", label: "Trade sector", get: (r) => r.tradeSector, name: (k) => k },
    duration: {
      key: "duration", label: "Course duration", get: (r) => (r.durationMonths === null ? null : String(r.durationMonths)),
      name: (k) => `${k} month${k === "1" ? "" : "s"}`, order: (a, b) => Number(a) - Number(b),
    },
    division: { key: "division", label: "Division", get: (r) => r.division, name: (k) => k },
  };
}

/** Dimensions that actually vary within the given rows (≥2 values). */
export function availableDims(dims: Record<string, Dim>, rows: AssessmentRow[], wanted: string[]): Dim[] {
  return wanted.map((k) => dims[k]).filter((d): d is Dim => {
    if (!d) return false;
    const s = new Set<string>();
    for (const r of rows) { const v = d.get(r); if (v) { s.add(v); if (s.size > 1) return true; } }
    return false;
  });
}

export type ToggleFn = (key: NonNullable<Dim["filterKey"]>, value: string) => void;
export const isFilterable = (d: Dim, f: FilterState, scopeMode: "portfolio" | "program") =>
  Boolean(d.filterKey) && !(d.filterKey === "program" && scopeMode === "program") && f !== undefined;
