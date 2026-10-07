import type { Institute } from "../types";
import { instKey } from "./filters";

/**
 * Fixed standings — always against the WHOLE programme, never the filtered
 * view, so focusing on one institute can never turn its rank into "1 of 1".
 */
export interface Standing {
  rank: number | null;
  of: number;
  /** other institutes on exactly the same score */
  tiedWith: number;
  /** rank ÷ of: 0.07 = top 7% */
  topShare: number | null;
  districtRank: number | null;
  districtOf: number;
  regionRank: number | null;
  regionOf: number;
  programMean: number | null;
  districtMedian: number | null;
  /** score needed to be in the programme's top 10% */
  top10: number | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Competition ranking: ties share a rank (1, 2, 2, 4). */
const rankIn = (score: number | null, scores: number[]) => (score === null ? null : 1 + scores.filter((s) => s > score + 1e-9).length);

export function buildStandings(institutes: Institute[]): Map<string, Standing> {
  const byProg = new Map<string, Institute[]>();
  for (const i of institutes) { if (!byProg.has(i.p)) byProg.set(i.p, []); byProg.get(i.p)!.push(i); }
  const out = new Map<string, Standing>();
  for (const list of byProg.values()) {
    const scored = list.filter((i) => i.score !== null);
    const all = scored.map((i) => i.score as number);
    const sorted = [...all].sort((a, b) => b - a);
    const top10 = sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.1) - 1)] : null;
    const mean = all.length ? all.reduce((s, x) => s + x, 0) / all.length : null;
    const byDistrict = new Map<string, number[]>();
    const byRegion = new Map<string, number[]>();
    for (const i of scored) {
      if (!byDistrict.has(i.district)) byDistrict.set(i.district, []);
      byDistrict.get(i.district)!.push(i.score as number);
      if (!byRegion.has(i.region)) byRegion.set(i.region, []);
      byRegion.get(i.region)!.push(i.score as number);
    }
    for (const i of list) {
      const d = byDistrict.get(i.district) ?? [];
      const r = byRegion.get(i.region) ?? [];
      const rank = rankIn(i.score, all);
      out.set(instKey(i.p, i.instituteKey), {
        rank, of: all.length,
        tiedWith: i.score === null ? 0 : all.filter((s) => Math.abs(s - (i.score as number)) < 1e-9).length - 1, topShare: rank === null || !all.length ? null : rank / all.length,
        districtRank: rankIn(i.score, d), districtOf: d.length,
        regionRank: rankIn(i.score, r), regionOf: r.length,
        programMean: mean, districtMedian: median(d), top10,
      });
    }
  }
  return out;
}

/** "#11", or "=#1" when the score is shared. */
export const rankLabel = (s: Standing | null | undefined) => (!s || s.rank === null ? "—" : `${s.tiedWith > 0 ? "=" : ""}#${s.rank}`);
