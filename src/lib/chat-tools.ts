import { tool } from "ai";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AssessmentRow, FilterState, Institute, Portfolio } from "../types";
import { applyFilters, EMPTY_FILTERS } from "./filters";
import { computeKpis, institutesFromRows, groupBy, drivers, funnel, CATEGORY_KEYS } from "./aggregate";
import { indexPortfolio, type PortfolioIndex } from "./portfolio";
import { gradeOf, TIER_RUBRIC } from "../config";

/* ---------- data: read once per server process ---------- */
let INDEX: PortfolioIndex | null = null;
function data(): PortfolioIndex {
  if (!INDEX) {
    const raw = JSON.parse(readFileSync(join(/* turbopackIgnore: true */ process.cwd(), "public", "data", "portfolio.json"), "utf8")) as Portfolio;
    INDEX = indexPortfolio(raw);
  }
  return INDEX;
}

/* ---------- filters arriving from the browser are untrusted: validate ---------- */
export const filtersSchema = z.object({
  institute: z.array(z.string()).max(5).default([]),
  program: z.array(z.string()).max(20).default([]),
  region: z.array(z.string()).max(20).default([]),
  district: z.array(z.string()).max(60).default([]),
  package: z.array(z.string()).max(10).default([]),
  trade: z.array(z.string()).max(150).default([]),
  batch: z.array(z.number()).max(10).default([]),
  grade: z.array(z.string()).max(10).default([]),
  status: z.array(z.string()).max(10).default([]),
  search: z.string().max(200).default(""),
  scoreMin: z.number().nullable().default(null),
  scoreMax: z.number().nullable().default(null),
  flaggedOnly: z.boolean().default(false),
});
export const scopeSchema = z.string().max(40).nullable().optional();

const pct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10000) / 100);
const num = (v: number | null | undefined, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

export function describeFilters(f: FilterState): string {
  const d = data();
  const p: string[] = [];
  if (f.institute.length) p.push(`institute: ${f.institute.map((k) => { const r = d.institutesByGlobal.get(k); return r ? `${r[r.length - 1].instituteName} (${k})` : k; }).join(", ")}`);
  if (f.program.length) p.push(`programme: ${f.program.map((s) => d.programBySlug.get(s)?.short ?? s).join(", ")}`);
  if (f.region.length) p.push(`region: ${f.region.join(", ")}`);
  if (f.district.length) p.push(`district: ${f.district.join(", ")}`);
  if (f.package.length) p.push(`package: ${f.package.join(", ")}`);
  if (f.trade.length) p.push(`trade: ${f.trade.map((t) => d.tradeName(t)).join(", ")}`);
  if (f.batch.length) p.push(`batch: ${f.batch.join(", ")}`);
  if (f.grade.length) p.push(`grade: ${f.grade.join(", ")}`);
  if (f.status.length) p.push(`status: ${f.status.join(", ")}`);
  if (f.search.trim()) p.push(`search: "${f.search.trim()}"`);
  if (f.scoreMin !== null || f.scoreMax !== null) p.push(`trade score ${f.scoreMin ?? 0}–${f.scoreMax ?? 100}`);
  if (f.flaggedOnly) p.push("flagged institutes only");
  return p.length ? p.join("; ") : "none";
}

export function buildSystemPrompt(filters: FilterState, scopeSlug: string | null): string {
  const d = data();
  const scoped = scopeSlug ? d.programBySlug.get(scopeSlug) : null;
  const bands = Object.entries(TIER_RUBRIC).map(([g, r]) => `${g}: ${r}`).join("; ");
  const progLines = d.programs.map((p) =>
    `- ${p.slug} = ${p.name} (${p.instituteCount} institutes, ${p.rowCount} trade rows; rubric ${p.rubric.label}; attendance ${p.attendanceRule.label}; ${p.period ? `visits ${p.period.from}..${p.period.to}` : p.assessmentDate ? `assessed ${p.assessmentDate}` : "date not recorded"})`).join("\n");
  return `You are the analytics assistant for the NAVTTC Programme Analytics dashboard: third-party monitoring of Training Provider Institutes across ${d.programs.length} programmes.

PROGRAMMES (use the slug in tool calls)
${progLines}

The user is currently viewing: ${scoped ? `the ${scoped.name} dashboard (tools default to this programme)` : "the combined All Programmes dashboard"}.
Current dashboard filters: ${describeFilters(filters)}.

RULES
- Every number must come from a tool result in this conversation. Never estimate, recall or invent figures. If the tools cannot answer, say so.
- Call a tool before answering any data question. Prefer one or two well-chosen calls. Pass "programs" to narrow or compare programmes.
- Say which scope your answer covers. Use scope "all" for figures across every programme without the dashboard filters.
- Be brief: lead with the finding, then 2–4 supporting numbers. Plain text only; use lines starting with "- " for lists.
- Reply in the language the user writes in (English or Urdu).

DEFINITIONS
- Each programme is scored on its OWN rubric (11, 15 or 16 criteria, each totalling 100). Cross-programme comparisons should use institute score, attendance, CNIC-verified % of seats, grade shares, or the six shared categories as % of max.
- Attendance % uses each programme's own rule (listed above). CNIC verified % of seats is identical in every programme. Presence % = present / enrolled. Dropout % = dropped / enrolled. Rates are pooled (sum / sum).
- Institute score = mean of its trade scores. Grades: ${bands}. A workbook Grade Override (Poor for fake/non-functional, Closed) replaces the band.
- An institute assessed in two programmes counts once per programme; institutes are linked across programmes by Institute ID.

NOT IN THE DATA: gender or age, employment or certification outcomes, Sindh, KP, Balochistan. The three cluster programme workbooks carry no visit dates.`;
}

/* ---------- scope handling ---------- */
function view(filters: FilterState, scopeSlug: string | null, scope?: "dashboard" | "all", programs?: string[]) {
  const d = data();
  const base: FilterState = scope === "all" ? { ...EMPTY_FILTERS } : { ...filters };
  if (scopeSlug && scope !== "all") base.program = [scopeSlug];
  if (programs?.length) base.program = programs.filter((p) => d.programBySlug.has(p));
  const rows = applyFilters(d.rows, base, d.facts);
  return {
    rows,
    insts: institutesFromRows(rows, d.instituteByKey, d.programBySlug),
    label: `${base.program.length ? base.program.map((s) => d.programBySlug.get(s)?.short).join(" + ") : "all programmes"}; filters: ${describeFilters({ ...base, program: [] })}`,
  };
}

const scopeArg = z.enum(["dashboard", "all"]).optional().describe('"dashboard" (default) applies the filters currently set; "all" ignores them.');
const programsArg = z.array(z.string()).optional().describe("Optional programme slugs to restrict to, e.g. [\"pmysdp-b2\",\"pmysdp-b3\"].");

const brief = (i: Institute) => ({
  programme: data().programBySlug.get(i.p)?.short,
  id: i.instituteId, name: i.instituteName, district: i.district, region: i.region,
  score: num(i.score), grade: gradeOf(i),
  attendance_pct: pct(i.attendanceRate), dropout_pct: pct(i.dropoutRate), enrolled: i.enrolled,
  flagged: i.flagged ? (i.status !== "Active" ? i.status : "note") : undefined,
});

const METRICS: Record<string, (i: Institute) => number | null> = {
  score: (i) => i.score, attendance: (i) => i.attendanceRate, verification: (i) => i.verificationRate,
  dropout: (i) => i.dropoutRate, utilization: (i) => i.utilizationRate, enrolled: (i) => i.enrolled, capacity: (i) => i.approvedCapacity,
};

const GROUP_KEYS: Record<string, (r: AssessmentRow) => string | null> = {
  programme: (r) => data().programBySlug.get(r.p)?.short ?? r.p,
  region: (r) => r.region, district: (r) => r.district, package: (r) => r.package,
  trade: (r) => data().tradeName(r.tradeNorm), batch: (r) => (r.batch === null ? null : `Batch ${r.batch}`),
  grade: (r) => data().facts.get(`${r.p}|${r.instituteKey}`)?.grade ?? null,
  trade_sector: (r) => r.tradeSector, trade_category: (r) => r.tradeCategory,
};

const clamp = (n: number | undefined, def: number, max: number) => Math.min(Math.max(Math.round(n ?? def), 1), max);

export function buildTools(filters: FilterState, scopeSlug: string | null) {
  return {
    getSummary: tool({
      description: "Headline KPIs, institutes by grade, enrolment funnel, and a per-programme breakdown.",
      inputSchema: z.object({ scope: scopeArg, programs: programsArg }),
      execute: async ({ scope, programs }) => {
        const v = view(filters, scopeSlug, scope, programs);
        if (!v.rows.length) return { scope_used: v.label, note: "No records match." };
        const k = computeKpis(v.rows, v.insts);
        const perProgramme = groupBy(v.rows, (r) => r.p).map((g) => {
          const pi = v.insts.filter((i) => i.p === g.key && i.score !== null);
          return {
            programme: data().programBySlug.get(g.key)?.name, institutes: g.institutes, enrolled: g.enrolled,
            mean_institute_score: num(pi.length ? pi.reduce((s, i) => s + (i.score as number), 0) / pi.length : null),
            attendance_pct: pct(g.attendanceRate), cnic_verified_pct_of_seats: pct(g.verificationRate), dropout_pct: pct(g.dropoutRate),
          };
        });
        return {
          scope_used: v.label,
          programmes: k.programs, institutes: k.institutes, unique_institutes: k.uniqueInstitutes, trade_assessments: k.assessments,
          trades: k.trades, districts: k.districts, regions: k.regions,
          approved_capacity: k.approvedCapacity, enrolled: k.enrolled, present: k.present, dropped_out: k.droppedOut, cnic_verified: k.cnicVerified,
          attendance_pct_programme_rules: pct(k.attendanceRate), presence_pct: pct(k.presenceRate), cnic_verified_pct_of_seats: pct(k.verificationRate),
          dropout_pct: pct(k.dropoutRate), utilization_pct: pct(k.utilizationRate),
          mean_institute_score: num(k.meanInstituteScore), institutes_by_grade: k.gradeCounts, flagged_institutes: k.flagged,
          funnel: funnel(v.rows).map((s) => ({ stage: s.stage, value: s.value, pct_of_capacity: num(s.pctOfCapacity, 1) })),
          per_programme: perProgramme,
        };
      },
    }),

    rankInstitutes: tool({
      description: "Rank institutes by a metric (highest or lowest).",
      inputSchema: z.object({
        by: z.enum(["score", "attendance", "verification", "dropout", "utilization", "enrolled", "capacity"]),
        order: z.enum(["highest", "lowest"]).optional(),
        limit: z.number().optional().describe("1 to 25, default 10"),
        scope: scopeArg, programs: programsArg,
      }),
      execute: async ({ by, order, limit, scope, programs }) => {
        const v = view(filters, scopeSlug, scope, programs);
        const key = METRICS[by];
        const dir = order === "lowest" ? 1 : -1;
        const list = v.insts.filter((i) => key(i) !== null).sort((a, b) => dir * ((key(a) as number) - (key(b) as number)));
        return { scope_used: v.label, ranked_by: by, order: order ?? "highest", institutes_in_scope: v.insts.length, results: list.slice(0, clamp(limit, 10, 25)).map(brief) };
      },
    }),

    findInstitute: tool({
      description: "Profile of one institute in every programme it was assessed in: score, grade, headcounts, weakest criteria, trades. Search by ID or name.",
      inputSchema: z.object({ query: z.string().describe("Institute ID (digits) or part of its name") }),
      execute: async ({ query }) => {
        const d = data();
        const q = query.trim().toLowerCase();
        const tokens = q.split(/\s+/).filter(Boolean);
        const matches = d.institutes.filter((i) => String(i.instituteId) === q || tokens.every((t) => i.instituteName.toLowerCase().includes(t)));
        if (!matches.length) return { found: false, note: "No institute matches that name or ID." };
        const key = matches[0].globalKey;
        const records = d.institutesByGlobal.get(key) ?? [matches[0]];
        return {
          found: true,
          other_matches: [...new Set(matches.filter((m) => m.globalKey !== key).map((m) => `${m.instituteName} (${m.district})`))].slice(0, 5),
          institute: { name: records[records.length - 1].instituteName, id: records[0].instituteId, district: records[0].district, region: records[0].region },
          by_programme: records.map((inst) => {
            const p = d.programBySlug.get(inst.p)!;
            const weakest = p.rubric.components
              .map((c) => ({ criterion: c.label, avg_points: num(inst.components[c.key]), max_points: c.max, pct_of_max: num(((inst.components[c.key] ?? 0) / c.max) * 100, 1) }))
              .sort((a, b) => (a.pct_of_max ?? 0) - (b.pct_of_max ?? 0)).slice(0, 4);
            const irows = (d.rowsByProgram.get(inst.p) ?? []).filter((r) => r.instituteKey === inst.instituteKey);
            return {
              programme: p.name, rank: inst.rank, out_of: p.instituteCount, score: num(inst.score), grade: inst.grade,
              workbook_grade: inst.gradeReported, status: inst.status, assessor_note: inst.assessorNote,
              capacity: inst.approvedCapacity, enrolled: inst.enrolled, present: inst.present, dropped_out: inst.droppedOut, cnic_verified: inst.cnicVerified,
              attendance_pct: pct(inst.attendanceRate), presence_pct: pct(inst.presenceRate), dropout_pct: pct(inst.dropoutRate),
              category_pct: Object.fromEntries(CATEGORY_KEYS.map((c) => [c, pct(inst.categoryPct[c])])),
              weakest_criteria: weakest,
              trades: irows.slice(0, 12).map((r) => ({ trade: r.tradeName, batch: r.batch, score: num(r.tradeScore), enrolled: r.enrolled, present: r.present })),
            };
          }),
        };
      },
    }),

    compareGroups: tool({
      description: "Compare groups (programmes, regions, districts, packages, trades, batches, grades, trade sectors/categories) on score, attendance, dropout, utilisation or size.",
      inputSchema: z.object({
        dimension: z.enum(["programme", "region", "district", "package", "trade", "batch", "grade", "trade_sector", "trade_category"]),
        sortBy: z.enum(["mean_score", "attendance", "verification", "dropout", "utilization", "enrolled", "institutes"]).optional(),
        order: z.enum(["highest", "lowest"]).optional(),
        limit: z.number().optional().describe("1 to 30, default 15"),
        scope: scopeArg, programs: programsArg,
      }),
      execute: async ({ dimension, sortBy, order, limit, scope, programs }) => {
        const v = view(filters, scopeSlug, scope, programs);
        const stats = groupBy(v.rows, GROUP_KEYS[dimension]);
        const val = (g: (typeof stats)[number]): number => {
          switch (sortBy ?? "mean_score") {
            case "attendance": return g.attendanceRate ?? -1;
            case "verification": return g.verificationRate ?? -1;
            case "dropout": return g.dropoutRate ?? -1;
            case "utilization": return g.utilizationRate ?? -1;
            case "enrolled": return g.enrolled;
            case "institutes": return g.institutes;
            default: return g.meanScore ?? -1;
          }
        };
        const dir = order === "lowest" ? 1 : -1;
        stats.sort((a, b) => dir * (val(a) - val(b)));
        return {
          scope_used: v.label, dimension, groups_in_scope: stats.length,
          note: "mean_trade_score is over trade rows. Small 'institutes' counts make a group less reliable. Rubrics differ by programme.",
          results: stats.slice(0, clamp(limit, 15, 30)).map((g) => ({
            group: g.key, institutes: g.institutes, records: g.assessments, enrolled: g.enrolled, capacity: g.capacity,
            mean_trade_score: num(g.meanScore), attendance_pct: pct(g.attendanceRate), cnic_verified_pct_of_seats: pct(g.verificationRate),
            dropout_pct: pct(g.dropoutRate), utilization_pct: pct(g.utilizationRate),
          })),
        };
      },
    }),

    scoreDrivers: tool({
      description: "Which rubric criteria (for one programme) or shared categories (across programmes) drive the total score, and achievement on each.",
      inputSchema: z.object({ program: z.string().optional().describe("Programme slug for criterion-level drivers; omit for category-level across programmes"), scope: scopeArg }),
      execute: async ({ program, scope }) => {
        const d = data();
        const slug = program ?? scopeSlug ?? undefined;
        const p = slug ? d.programBySlug.get(slug) : undefined;
        const v = view(filters, scopeSlug, scope, p ? [p.slug] : undefined);
        const out = p
          ? drivers(v.rows, p.rubric.components.map((c) => ({ key: c.key, label: c.label, max: c.max, value: (r: AssessmentRow) => r.components[c.key] ?? 0 })))
          : drivers(v.rows, CATEGORY_KEYS.map((k) => ({ key: k, label: d.raw.categories.find((c) => c.key === k)!.label, max: 1, value: (r: AssessmentRow) => r.categoryPct[k] })));
        return {
          scope_used: v.label, level: p ? `criteria of ${p.name}` : "shared categories",
          note: "correlation_with_total is Pearson r against the trade score. Low r = awards marks without discriminating.",
          factors: out.map((x) => ({ factor: x.label, max_points: p ? x.max : undefined, mean_pct_of_max: num(p ? x.pct : x.mean * 100, 1), correlation_with_total: num(x.r, 3) })),
        };
      },
    }),

    institutesAcrossProgrammes: tool({
      description: "Institutes assessed in two programmes: how many improved or declined between them, and the biggest movers.",
      inputSchema: z.object({ from: z.string().describe("earlier programme slug"), to: z.string().describe("later programme slug"), limit: z.number().optional() }),
      execute: async ({ from, to, limit }) => {
        const d = data();
        const pairs: { name: string; district: string; from: number | null; to: number | null; delta: number | null; from_grade: string; to_grade: string }[] = [];
        for (const recs of d.institutesByGlobal.values()) {
          const a = recs.find((r) => r.p === from); const b = recs.find((r) => r.p === to);
          if (!a || !b) continue;
          pairs.push({ name: b.instituteName, district: b.district, from: num(a.score), to: num(b.score), delta: a.score !== null && b.score !== null ? num(b.score - a.score) : null, from_grade: a.grade, to_grade: b.grade });
        }
        const withD = pairs.filter((p) => p.delta !== null) as (typeof pairs[number] & { delta: number })[];
        withD.sort((x, y) => y.delta - x.delta);
        const n = clamp(limit, 5, 15);
        return {
          from: d.programBySlug.get(from)?.name, to: d.programBySlug.get(to)?.name, linked_institutes: pairs.length,
          improved_5plus: withD.filter((p) => p.delta >= 5).length, declined_5plus: withD.filter((p) => p.delta <= -5).length,
          mean_change: num(withD.length ? withD.reduce((s, p) => s + p.delta, 0) / withD.length : null),
          biggest_gains: withD.slice(0, n), biggest_drops: withD.slice(-n).reverse(),
          note: "Rubrics differ between programmes, so part of any change reflects the measuring instrument.",
        };
      },
    }),

    flaggedInstitutes: tool({
      description: "Institutes carrying a written assessor note or workbook override (fake, non-functional, closed, critical), with the note.",
      inputSchema: z.object({ scope: scopeArg, programs: programsArg }),
      execute: async ({ scope, programs }) => {
        const v = view(filters, scopeSlug, scope, programs);
        const list = v.insts.filter((i) => i.flagged);
        return { scope_used: v.label, count: list.length, results: list.slice(0, 40).map((i) => ({ ...brief(i), note: i.assessorNote ? String(i.assessorNote).slice(0, 240) : null })) };
      },
    }),
  };
}
