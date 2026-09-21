import { tool } from "ai";
import { z } from "zod";
import { rows as allRows, institutes as allInstitutes, components, meta } from "./dataset";
import { applyFilters, buildGradeMap, EMPTY_FILTERS } from "./filters";
import { computeKpis, institutesFromRows, groupBy, componentDrivers, funnel } from "./aggregate";
import { gradeOf, TIER_RUBRIC } from "../config";
import type { AssessmentRow, FilterState, Institute } from "../types";

/* ---------- filters arriving from the browser are untrusted: validate ---------- */
export const filtersSchema = z.object({
  region: z.array(z.string()).max(20).default([]),
  district: z.array(z.string()).max(50).default([]),
  package: z.array(z.string()).max(10).default([]),
  trade: z.array(z.number()).max(100).default([]),
  batch: z.array(z.number()).max(10).default([]),
  grade: z.array(z.string()).max(10).default([]),
  search: z.string().max(200).default(""),
  scoreMin: z.number().nullable().default(null),
  scoreMax: z.number().nullable().default(null),
});

const baseMap = new Map(allInstitutes.map((i) => [i.instituteId, i]));
const gradeMap = buildGradeMap(allInstitutes);
const tradeNames = new Map<number, string>();
for (const r of allRows) if (r.tradeCode !== null && r.tradeName) tradeNames.set(r.tradeCode, r.tradeName);

const pct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10000) / 100);
const num = (v: number | null | undefined, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

export function describeFilters(f: FilterState): string {
  const p: string[] = [];
  if (f.region.length) p.push(`region: ${f.region.join(", ")}`);
  if (f.district.length) p.push(`district: ${f.district.join(", ")}`);
  if (f.package.length) p.push(`package: ${f.package.join(", ")}`);
  if (f.trade.length) p.push(`trade: ${f.trade.map((c) => tradeNames.get(c) ?? c).join(", ")}`);
  if (f.batch.length) p.push(`batch: ${f.batch.join(", ")}`);
  if (f.grade.length) p.push(`grade: ${f.grade.join(", ")}`);
  if (f.search.trim()) p.push(`search: "${f.search.trim()}"`);
  if (f.scoreMin !== null || f.scoreMax !== null) p.push(`trade score ${f.scoreMin ?? 0}–${f.scoreMax ?? 100}`);
  return p.length ? p.join("; ") : "none, showing all data";
}

export function buildSystemPrompt(filters: FilterState): string {
  const bands = Object.entries(TIER_RUBRIC).map(([g, r]) => `${g}: ${r}`).join("; ");
  return `You are the analytics assistant for the NAVTTC PMYSDP Batch III Training Provider Institute (TPI) performance dashboard.
Dataset: ${meta.rowCount} assessment records, ${meta.instituteCount} institutes, one assessment snapshot dated ${meta.assessmentDate}.

RULES
- Every number you state must come from a tool result in this conversation. Never estimate, recall or invent figures. If the tools cannot answer, say so plainly.
- Call a tool before answering any data question. Prefer one or two well-chosen calls.
- Tools default to the dashboard's current filters. Current filters: ${describeFilters(filters)}. Say which scope your answer covers. Use scope "all" for national or whole-dataset figures.
- Be brief and direct: lead with the finding, then 2-4 supporting numbers. Plain text only, no markdown symbols; use lines starting with "- " for lists.
- Reply in the language the user writes in (English or Urdu).

DEFINITIONS
- Attendance % = CNIC-verified / approved capacity (official basis). Presence % = present / registered. Dropout % = dropped out / registered. Utilization % = registered / approved capacity. Rates are pooled (sum / sum), never averages of percentages.
- Institute score = mean of its trade scores (max 100, 16 components). Grades by score: ${bands}.
- Assessor notes (Critical, Non-Functional, etc.) are separate qualitative flags from the workbook and can coexist with a decent score.
- Package and region are the same dimension (Package-03 is Punjab; Package-02 is AJK, GB and ICT). Never explain differences by package.

NOT IN THE DATA (say so, do not guess): trends over time or prior periods, gender or age, employment or certification outcomes, Sindh, Khyber Pakhtunkhwa and Balochistan.

CAVEATS to mention when relevant: some component scores exceed their stated maximum and some source values were repaired; the Data Quality page lists them.`;
}

/* ---------- scope handling ---------- */
function view(filters: FilterState, scope?: "dashboard" | "all") {
  const f = scope === "all" ? EMPTY_FILTERS : filters;
  const rows = applyFilters(allRows, f, gradeMap);
  return {
    rows,
    insts: institutesFromRows(rows, baseMap),
    label: scope === "all" ? "all data" : `dashboard filters (${describeFilters(f)})`,
  };
}

const scopeSchema = z
  .enum(["dashboard", "all"])
  .optional()
  .describe('"dashboard" (default) applies the filters currently set in the dashboard; "all" uses the whole dataset.');

const brief = (i: Institute) => ({
  id: i.instituteId,
  name: i.instituteName,
  district: i.district,
  region: i.region,
  score: num(i.score),
  grade: gradeOf(i),
  attendance_pct: pct(i.attendanceRate),
  dropout_pct: pct(i.dropoutRate),
  registered: i.biometricRegistered,
  assessor_flagged: i.assessorNote ? true : undefined,
});

const METRICS: Record<string, (i: Institute) => number | null> = {
  score: (i) => i.score,
  attendance: (i) => i.attendanceRate,
  dropout: (i) => i.dropoutRate,
  utilization: (i) => i.utilizationRate,
  registered: (i) => i.biometricRegistered,
  capacity: (i) => i.approvedCapacity,
};

const GROUP_KEYS: Record<string, (r: AssessmentRow) => string | null> = {
  region: (r) => r.region,
  district: (r) => r.district,
  package: (r) => r.package,
  trade: (r) => r.tradeName,
  batch: (r) => (r.batch === null ? null : `Batch ${r.batch}`),
  grade: (r) => gradeMap.get(r.instituteId) ?? null,
};

const clamp = (n: number | undefined, def: number, max: number) => Math.min(Math.max(Math.round(n ?? def), 1), max);

export function buildTools(filters: FilterState) {
  return {
    getSummary: tool({
      description: "Headline KPIs, institutes-by-grade counts and the enrolment funnel. Use for overview questions.",
      inputSchema: z.object({ scope: scopeSchema }),
      execute: async ({ scope }) => {
        const v = view(filters, scope);
        if (!v.rows.length) return { scope_used: v.label, note: "No records match." };
        const k = computeKpis(v.rows, v.insts);
        const grades: Record<string, number> = {};
        for (const i of v.insts) grades[gradeOf(i)] = (grades[gradeOf(i)] ?? 0) + 1;
        return {
          scope_used: v.label,
          institutes: k.institutes, assessment_records: k.assessments, trades: k.trades,
          districts: k.districts, regions: k.regions,
          approved_capacity: k.approvedCapacity, registered: k.registered, present: k.present,
          dropped_out: k.droppedOut, cnic_verified: k.cnicVerified,
          attendance_pct: pct(k.attendanceRate), presence_pct: pct(k.presenceRate),
          dropout_pct: pct(k.dropoutRate), utilization_pct: pct(k.utilizationRate),
          mean_institute_score: num(k.meanInstituteScore), mean_trade_score: num(k.meanTradeScore),
          institutes_by_grade: grades,
          funnel: funnel(v.rows).map((s) => ({ stage: s.stage, value: s.value, pct_of_capacity: num(s.pctOfCapacity, 1) })),
        };
      },
    }),

    rankInstitutes: tool({
      description: "Rank institutes by a metric (highest or lowest). Use for top/bottom lists.",
      inputSchema: z.object({
        by: z.enum(["score", "attendance", "dropout", "utilization", "registered", "capacity"]),
        order: z.enum(["highest", "lowest"]).optional(),
        limit: z.number().optional().describe("1 to 25, default 10"),
        scope: scopeSchema,
      }),
      execute: async ({ by, order, limit, scope }) => {
        const v = view(filters, scope);
        const key = METRICS[by];
        const dir = order === "lowest" ? 1 : -1;
        const list = v.insts
          .filter((i) => key(i) !== null && key(i) !== undefined)
          .sort((a, b) => dir * ((key(a) as number) - (key(b) as number)));
        return {
          scope_used: v.label, ranked_by: by, order: order ?? "highest",
          institutes_in_scope: v.insts.length,
          results: list.slice(0, clamp(limit, 10, 25)).map(brief),
        };
      },
    }),

    findInstitute: tool({
      description: "Full profile of one institute: score, grade, headcounts, weakest components, trades. Search by ID or name.",
      inputSchema: z.object({ query: z.string().describe("Institute ID (digits) or part of its name") }),
      execute: async ({ query }) => {
        const q = query.trim().toLowerCase();
        const tokens = q.split(/\s+/).filter(Boolean);
        const matches = allInstitutes.filter(
          (i) => String(i.instituteId) === q || tokens.every((t) => (i.instituteName ?? "").toLowerCase().includes(t)),
        );
        if (!matches.length) return { found: false, note: "No institute matches that name or ID." };
        const top = matches[0];
        const irows = allRows.filter((r) => r.instituteId === top.instituteId);
        const inst = institutesFromRows(irows, baseMap)[0];
        const weakest = components
          .map((c) => ({ component: c.label, avg_points: num(inst.components[c.key]), max_points: c.max, pct_of_max: num(((inst.components[c.key] ?? 0) / c.max) * 100, 1) }))
          .sort((a, b) => (a.pct_of_max ?? 0) - (b.pct_of_max ?? 0))
          .slice(0, 5);
        return {
          found: true,
          total_matches: matches.length,
          other_matches: matches.slice(1, 6).map((m) => ({ id: m.instituteId, name: m.instituteName, district: m.district })),
          institute: {
            id: top.instituteId, name: top.instituteName, region: top.region, district: top.district, package: top.package,
            national_rank: top.rank, out_of: allInstitutes.length,
            score: num(inst.score), grade_by_score: gradeOf(inst),
            grade_in_workbook: top.gradeReported, assessor_note: top.assessorNote,
            capacity: inst.approvedCapacity, registered: inst.biometricRegistered, present: inst.present,
            absent: inst.absent, dropped_out: inst.droppedOut, cnic_verified: inst.cnicVerified,
            attendance_pct: pct(inst.attendanceRate), presence_pct: pct(inst.presenceRate),
            dropout_pct: pct(inst.dropoutRate), utilization_pct: pct(inst.utilizationRate),
            category_scores: Object.fromEntries(Object.entries(inst.categoryScores).map(([k, val]) => [k, num(val as number)])),
            weakest_components: weakest,
            trades: irows.slice(0, 15).map((r) => ({ trade: r.tradeName, batch: r.batch, score: num(r.tradeScore), registered: r.biometricRegistered, present: r.present })),
          },
        };
      },
    }),

    compareGroups: tool({
      description: "Compare groups (regions, districts, packages, trades, batches or grades) on score, attendance, dropout, utilization or size.",
      inputSchema: z.object({
        dimension: z.enum(["region", "district", "package", "trade", "batch", "grade"]),
        sortBy: z.enum(["mean_score", "attendance", "dropout", "utilization", "registered", "institutes"]).optional(),
        order: z.enum(["highest", "lowest"]).optional(),
        limit: z.number().optional().describe("1 to 30, default 15"),
        scope: scopeSchema,
      }),
      execute: async ({ dimension, sortBy, order, limit, scope }) => {
        const v = view(filters, scope);
        const stats = groupBy(v.rows, GROUP_KEYS[dimension]);
        const val = (g: (typeof stats)[number]): number => {
          switch (sortBy ?? "mean_score") {
            case "attendance": return g.attendanceRate ?? -1;
            case "dropout": return g.dropoutRate ?? -1;
            case "utilization": return g.utilizationRate ?? -1;
            case "registered": return g.registered;
            case "institutes": return g.institutes;
            default: return g.meanScore;
          }
        };
        const dir = order === "lowest" ? 1 : -1;
        stats.sort((a, b) => dir * (val(a) - val(b)));
        return {
          scope_used: v.label, dimension, groups_in_scope: stats.length,
          note: "mean_trade_score is the mean over assessment records (trade rows), not over institutes. Small 'institutes' counts make a group's figures less reliable.",
          results: stats.slice(0, clamp(limit, 15, 30)).map((g) => ({
            group: g.key, institutes: g.institutes, records: g.assessments,
            registered: g.registered, capacity: g.capacity,
            mean_trade_score: num(g.meanScore),
            attendance_pct: pct(g.attendanceRate), presence_pct: pct(g.presenceRate),
            dropout_pct: pct(g.dropoutRate), utilization_pct: pct(g.utilizationRate),
          })),
        };
      },
    }),

    scoreDrivers: tool({
      description: "Which of the 16 score components drive the total score and which barely separate strong from weak institutes.",
      inputSchema: z.object({ scope: scopeSchema }),
      execute: async ({ scope }) => {
        const v = view(filters, scope);
        const d = componentDrivers(v.rows, components.map((c) => ({ key: c.key, label: c.label, max: c.max })));
        return {
          scope_used: v.label,
          note: "correlation_with_total is Pearson r against the total trade score. Low r means the component awards marks without discriminating between institutes.",
          components: d.map((x) => ({ component: x.label, max_points: x.max, mean_pct_of_max: num(x.pct, 1), correlation_with_total: num(x.r, 3) })),
        };
      },
    }),

    flaggedInstitutes: tool({
      description: "Institutes carrying a written assessor note (e.g. Critical, Non-Functional), with the note text.",
      inputSchema: z.object({ scope: scopeSchema }),
      execute: async ({ scope }) => {
        const v = view(filters, scope);
        const list = v.insts.filter((i) => i.assessorNote);
        return {
          scope_used: v.label, count: list.length,
          results: list.map((i) => ({ ...brief(i), note: String(i.assessorNote).slice(0, 240) })),
        };
      },
    }),
  };
}