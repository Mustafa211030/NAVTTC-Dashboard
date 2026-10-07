import type { AssessmentRow, FilterState } from "../types";

export const EMPTY_FILTERS: FilterState = {
  institute: [], program: [], region: [], district: [], package: [], trade: [], batch: [], grade: [], status: [],
  search: "", scoreMin: null, scoreMax: null, flaggedOnly: false,
};

export const isActive = (f: FilterState): boolean => countActive(f) > 0;

export function countActive(f: FilterState): number {
  return f.institute.length + f.program.length + f.region.length + f.district.length + f.package.length + f.trade.length +
    f.batch.length + f.grade.length + f.status.length + (f.search.trim() ? 1 : 0) +
    (f.scoreMin !== null || f.scoreMax !== null ? 1 : 0) + (f.flaggedOnly ? 1 : 0);
}

/** Per-institute facts the row filter needs: resolved grade, status and flag. */
export interface InstFacts { grade: string; status: string; flagged: boolean }
export const instKey = (p: string, instituteKey: string) => `${p}|${instituteKey}`;

/**
 * The only filtering implementation in the app. KPIs, charts, tables and
 * exports all read its output, so a filter can never be visual-only.
 * `ignore` lets a chart compute its own option counts without its own filter.
 */
export function applyFilters(
  all: AssessmentRow[], f: FilterState, facts: Map<string, InstFacts>, ignore: (keyof FilterState)[] = [],
): AssessmentRow[] {
  const q = f.search.trim().toLowerCase();
  const on = (k: keyof FilterState) => !ignore.includes(k);
  return all.filter((r) => {
    if (on("institute") && f.institute.length && !f.institute.includes(r.globalKey)) return false;
    if (on("program") && f.program.length && !f.program.includes(r.p)) return false;
    if (on("region") && f.region.length && !f.region.includes(r.region)) return false;
    if (on("district") && f.district.length && !f.district.includes(r.district)) return false;
    if (on("package") && f.package.length && (!r.package || !f.package.includes(r.package))) return false;
    if (on("trade") && f.trade.length && !f.trade.includes(r.tradeNorm)) return false;
    if (on("batch") && f.batch.length && (r.batch === null || !f.batch.includes(r.batch))) return false;
    if ((on("grade") && f.grade.length) || (on("status") && f.status.length) || f.flaggedOnly) {
      const fx = facts.get(instKey(r.p, r.instituteKey));
      if (on("grade") && f.grade.length && (!fx || !f.grade.includes(fx.grade))) return false;
      if (on("status") && f.status.length && (!fx || !f.status.includes(fx.status))) return false;
      if (f.flaggedOnly && !fx?.flagged) return false;
    }
    if (on("scoreMin") && f.scoreMin !== null && (r.tradeScore === null || r.tradeScore < f.scoreMin)) return false;
    if (on("scoreMax") && f.scoreMax !== null && (r.tradeScore === null || r.tradeScore > f.scoreMax)) return false;
    if (q) {
      const hay = `${r.instituteName} ${r.district} ${r.region} ${r.tradeName} ${r.instituteId ?? ""} ${r.division ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ----------------------- URL serialization ----------------------- */

export function filtersToParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  const list = (k: string, v: (string | number)[]) => { if (v.length) p.set(k, v.join("~")); };
  list("inst", f.institute);
  list("prog", f.program);
  list("region", f.region);
  list("district", f.district);
  list("package", f.package);
  list("trade", f.trade);
  list("batch", f.batch);
  list("grade", f.grade);
  list("status", f.status);
  if (f.search.trim()) p.set("q", f.search.trim());
  if (f.scoreMin !== null) p.set("smin", String(f.scoreMin));
  if (f.scoreMax !== null) p.set("smax", String(f.scoreMax));
  if (f.flaggedOnly) p.set("flagged", "1");
  return p;
}

export function paramsToFilters(p: URLSearchParams): FilterState {
  const list = (k: string) => (p.get(k) ? p.get(k)!.split("~").filter(Boolean) : []);
  const nums = (k: string) => list(k).map(Number).filter((n) => !Number.isNaN(n));
  const num = (k: string) => (p.get(k) !== null && p.get(k) !== "" ? Number(p.get(k)) : null);
  return {
    institute: list("inst").slice(0, 5), program: list("prog"), region: list("region"), district: list("district"), package: list("package"),
    trade: list("trade"), batch: nums("batch"), grade: list("grade"), status: list("status"),
    search: p.get("q") ?? "", scoreMin: num("smin"), scoreMax: num("smax"), flaggedOnly: p.get("flagged") === "1",
  };
}
