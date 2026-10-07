import type { Institute, Program } from "../types";
import type { PortfolioIndex } from "./portfolio";

/**
 * One entry per real institute (globalKey), spanning every programme it was
 * assessed in. Powers the Institute filter, the focus panel and the
 * cross-programme profile.
 */
export interface InstituteEntry {
  key: string;
  name: string;
  /** every distinct name the institute carries across programmes */
  names: string[];
  id: number | null;
  district: string;
  region: string;
  /** records in programme order */
  records: Institute[];
  programs: Program[];
  latest: Institute;
  /** latest score − previous programme's score */
  delta: number | null;
  nameMatched: boolean;
  /** same ID carries different names in different programmes */
  conflict: boolean;
  haystack: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function instituteDirectory(data: PortfolioIndex): InstituteEntry[] {
  const out: InstituteEntry[] = [];
  for (const [key, records] of data.institutesByGlobal) {
    const latest = records[records.length - 1];
    const prev = records.length > 1 ? records[records.length - 2] : null;
    const names = [...new Set(records.map((r) => r.instituteName))];
    const conflict = names.length > 1 && new Set(names.map((n) => norm(n).slice(0, 14))).size > 1;
    out.push({
      key, name: latest.instituteName, names,
      id: records.find((r) => r.instituteId !== null)?.instituteId ?? null,
      district: latest.district, region: latest.region,
      records,
      programs: records.map((r) => data.programBySlug.get(r.p)!).filter(Boolean),
      latest,
      delta: prev && prev.score !== null && latest.score !== null ? latest.score - prev.score : null,
      nameMatched: key.startsWith("nm-"),
      conflict,
      haystack: norm(`${names.join(" ")} ${latest.district} ${records.map((r) => r.instituteId ?? "").join(" ")}`),
    });
  }
  return out;
}

/**
 * Ranks entries for a query. An exact ID wins; then names starting with the
 * query; then all-token matches. Ties go to institutes in more programmes.
 */
export function searchInstitutes(dir: InstituteEntry[], query: string): InstituteEntry[] {
  const q = query.trim().toLowerCase().replace(/^id\s*/, "");
  if (!q) return [...dir].sort((a, b) => b.records.length - a.records.length || a.name.localeCompare(b.name));
  const tokens = norm(q).split(" ").filter(Boolean);
  const scored: { e: InstituteEntry; s: number }[] = [];
  for (const e of dir) {
    let s = 0;
    if (/^\d+$/.test(q) && e.records.some((r) => String(r.instituteId) === q)) s = 1000;
    else if (/^\d+$/.test(q) && e.records.some((r) => String(r.instituteId ?? "").startsWith(q))) s = 500;
    else if (tokens.every((t) => e.haystack.includes(t))) {
      s = 100;
      if (norm(e.name).startsWith(norm(q))) s += 200;
      else if (e.haystack.split(" ").some((w) => w.startsWith(tokens[0]))) s += 50;
    }
    if (s) scored.push({ e, s: s + e.records.length });
  }
  return scored.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name)).map((x) => x.e);
}

const cache = new WeakMap<PortfolioIndex, { list: InstituteEntry[]; byKey: Map<string, InstituteEntry> }>();
/** Memoised per portfolio — built once, shared by every component. */
export function directoryOf(data: PortfolioIndex) {
  let c = cache.get(data);
  if (!c) {
    const list = instituteDirectory(data);
    c = { list, byKey: new Map(list.map((e) => [e.key, e])) };
    cache.set(data, c);
  }
  return c;
}
