import type { AssessmentRow, Institute, Portfolio, Program } from "../types";
import { instKey, type InstFacts } from "./filters";
import { gradeOf } from "../config";
import { buildStandings, type Standing } from "./standings";

/**
 * Indexed view over the portfolio file. Built once after the fetch; every
 * page and chart reads from these maps instead of scanning arrays.
 */
export interface PortfolioIndex {
  raw: Portfolio;
  programs: Program[];
  programBySlug: Map<string, Program>;
  rows: AssessmentRow[];
  rowsByProgram: Map<string, AssessmentRow[]>;
  institutes: Institute[];
  /** key: `${programSlug}|${instituteKey}` */
  instituteByKey: Map<string, Institute>;
  institutesByGlobal: Map<string, Institute[]>;
  facts: Map<string, InstFacts>;
  /** fixed whole-programme standings, key `${programSlug}|${instituteKey}` */
  standings: Map<string, Standing>;
  tradeName: (norm: string) => string;
}

export function indexPortfolio(raw: Portfolio): PortfolioIndex {
  const programs = [...raw.programs].sort((a, b) => a.order - b.order);
  const programBySlug = new Map(programs.map((p) => [p.slug, p]));
  const rowsByProgram = new Map<string, AssessmentRow[]>(programs.map((p) => [p.slug, []]));
  for (const r of raw.rows) rowsByProgram.get(r.p)?.push(r);
  const instituteByKey = new Map(raw.institutes.map((i) => [instKey(i.p, i.instituteKey), i]));
  const institutesByGlobal = new Map<string, Institute[]>();
  for (const i of raw.institutes) {
    if (!institutesByGlobal.has(i.globalKey)) institutesByGlobal.set(i.globalKey, []);
    institutesByGlobal.get(i.globalKey)!.push(i);
  }
  for (const list of institutesByGlobal.values())
    list.sort((a, b) => (programBySlug.get(a.p)?.order ?? 0) - (programBySlug.get(b.p)?.order ?? 0));
  const facts = new Map<string, InstFacts>(
    raw.institutes.map((i) => [instKey(i.p, i.instituteKey), { grade: gradeOf(i), status: i.status, flagged: i.flagged }]));
  return {
    raw, programs, programBySlug,
    rows: raw.rows, rowsByProgram,
    institutes: raw.institutes, instituteByKey, institutesByGlobal, facts,
    standings: buildStandings(raw.institutes),
    tradeName: (n) => raw.tradeNames[n] ?? n,
  };
}

/** Route helpers. Portfolio routes live at the root; programme routes under /p/<slug>. */
export const programBase = (slug: string) => `/p/${slug}`;
export const instituteHref = (base: string, i: Pick<Institute, "instituteKey">) => `${base}/institutions/${encodeURIComponent(i.instituteKey)}`;
export const globalInstituteHref = (globalKey: string) => `/institutions/${encodeURIComponent(globalKey)}`;

export function scopeFromPath(pathname: string): { slug: string | null; rest: string } {
  const m = pathname.match(/^\/p\/([^/]+)(\/.*)?$/);
  if (!m) return { slug: null, rest: pathname };
  return { slug: decodeURIComponent(m[1]), rest: m[2] ?? "/" };
}
