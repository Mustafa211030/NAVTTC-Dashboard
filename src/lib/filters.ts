import type { AssessmentRow, FilterState, Institute } from "../types";
import { gradeOf } from "../config";

export const EMPTY_FILTERS: FilterState = {
  region: [], district: [], package: [], trade: [], batch: [], grade: [],
  search: "", scoreMin: null, scoreMax: null,
};

export const isActive = (f: FilterState): boolean =>
  f.region.length > 0 || f.district.length > 0 || f.package.length > 0 ||
  f.trade.length > 0 || f.batch.length > 0 || f.grade.length > 0 ||
  f.search.trim() !== "" || f.scoreMin !== null || f.scoreMax !== null;

export function countActive(f: FilterState): number {
  return f.region.length + f.district.length + f.package.length + f.trade.length +
    f.batch.length + f.grade.length + (f.search.trim() ? 1 : 0) +
    (f.scoreMin !== null || f.scoreMax !== null ? 1 : 0);
}

/**
 * Applies every filter to the assessment rows. This is the only filtering
 * implementation in the app — KPIs, charts, tables and exports all read the
 * output of this function, so a filter can never be visual-only.
 */
export function applyFilters(all: AssessmentRow[], f: FilterState, gradeByInstitute: Map<number, string>): AssessmentRow[] {
  const q = f.search.trim().toLowerCase();
  return all.filter((r) => {
    if (f.region.length && !f.region.includes(r.region)) return false;
    if (f.district.length && !f.district.includes(r.district)) return false;
    if (f.package.length && (!r.package || !f.package.includes(r.package))) return false;
    if (f.trade.length && !f.trade.includes(r.tradeCode)) return false;
    if (f.batch.length && (r.batch === null || !f.batch.includes(r.batch))) return false;
    if (f.grade.length) {
      const g = gradeByInstitute.get(r.instituteId);
      if (!g || !f.grade.includes(g)) return false;
    }
    if (f.scoreMin !== null && r.tradeScore < f.scoreMin) return false;
    if (f.scoreMax !== null && r.tradeScore > f.scoreMax) return false;
    if (q) {
      const hay = `${r.instituteName} ${r.district} ${r.region} ${r.tradeName} ${r.instituteId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Districts valid for the currently selected regions — powers cascading. */
export function availableDistricts(regionDistricts: Record<string, string[]>, selectedRegions: string[]): string[] {
  if (!selectedRegions.length) return [...new Set(Object.values(regionDistricts).flat())].sort();
  return [...new Set(selectedRegions.flatMap((r) => regionDistricts[r] ?? []))].sort();
}

/** Trades that still occur within the current geographic/package selection. */
export function availableTrades(all: AssessmentRow[], f: FilterState): Set<number> {
  const scoped = all.filter((r) =>
    (!f.region.length || f.region.includes(r.region)) &&
    (!f.district.length || f.district.includes(r.district)) &&
    (!f.package.length || (r.package !== null && f.package.includes(r.package))));
  return new Set(scoped.map((r) => r.tradeCode));
}

export function buildGradeMap(institutes: Institute[]): Map<number, string> {
  return new Map(institutes.map((i) => [i.instituteId, gradeOf(i)]));
}

/* ----------------------- URL serialization (§55) ----------------------- */

export function filtersToParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.region.length) p.set("region", f.region.join(","));
  if (f.district.length) p.set("district", f.district.join(","));
  if (f.package.length) p.set("package", f.package.join(","));
  if (f.trade.length) p.set("trade", f.trade.join(","));
  if (f.batch.length) p.set("batch", f.batch.join(","));
  if (f.grade.length) p.set("grade", f.grade.join(","));
  if (f.search.trim()) p.set("q", f.search.trim());
  if (f.scoreMin !== null) p.set("smin", String(f.scoreMin));
  if (f.scoreMax !== null) p.set("smax", String(f.scoreMax));
  return p;
}

export function paramsToFilters(p: URLSearchParams): FilterState {
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(",").filter(Boolean) : []);
  const nums = (k: string) => list(k).map(Number).filter((n) => !Number.isNaN(n));
  const num = (k: string) => (p.get(k) !== null && p.get(k) !== "" ? Number(p.get(k)) : null);
  return {
    region: list("region"), district: list("district"), package: list("package"),
    trade: nums("trade"), batch: nums("batch"), grade: list("grade"),
    search: p.get("q") ?? "", scoreMin: num("smin"), scoreMax: num("smax"),
  };
}
