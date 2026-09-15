/**
 * NAVTTC dashboard — Excel ingest pipeline
 * ----------------------------------------
 * Reads data/raw/source.xlsx and emits data/processed/dataset.json.
 *
 * This is the ONLY place the workbook is read. No component, page or chart
 * ever touches the Excel file or hard-codes a value from it. To publish a new
 * assessment round, replace data/raw/source.xlsx and run `npm run data`.
 *
 * Pipeline (master prompt §72-73 — raw is never mutated destructively):
 *   raw  →  normalized  →  validated  →  derived  →  aggregated  →  JSON
 *
 * Every repair is recorded in the `quality` block of the output so the
 * Data Quality Center can show exactly what was changed and why.
 */

import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "data/raw/source.xlsx");
const OUT = resolve(ROOT, "data/processed/dataset.json");
const SHEET = "Combined Sheet";

/* ------------------------------------------------------------------ *
 * Column map — 0-indexed positions in the sheet, NOT header text.
 * Headers contain embedded newlines and double spaces; positions are
 * stable, header strings are not.
 * ------------------------------------------------------------------ */
const COL = {
  srNo: 0, package: 1, programName: 2, region: 3, district: 4,
  instituteId: 5, instituteName: 6, tradeName: 7, batch: 8,
  instituteTradeCode: 9, tradeCode: 10, approvedCapacity: 11,
  biometricRegistered: 12, droppedOut: 13, present: 14, absent: 15,
  cnicVerified: 16, attendancePctReported: 17,
  // 16 score components, columns S..AH
  biometric: 18, attendance: 19, cctv: 20, trainerPms: 21, trainerDegree: 22,
  trainerExp: 23, tools: 24, consumables: 25, portfolio: 26, tlmImpl: 27,
  tlmProv: 28, assessment: 29, indLinkage: 30, jobFair: 31, ojt: 32,
  studentFeedback: 33,
  tradeScoreStored: 34, totalScoreStored: 35, grading: 36,
};

/** The 16 score components, their field names and their maxima. Sums to 100. */
export const COMPONENTS = [
  { key: "biometric",       col: COL.biometric,       max: 10,  label: "Biometric Registration" },
  { key: "attendance",      col: COL.attendance,      max: 35,  label: "Attendance" },
  { key: "cctv",            col: COL.cctv,            max: 5,   label: "CCTV" },
  { key: "trainerPms",      col: COL.trainerPms,      max: 2.5, label: "Trainer on PMS Portal" },
  { key: "trainerDegree",   col: COL.trainerDegree,   max: 2.5, label: "Trainer Degree" },
  { key: "trainerExp",      col: COL.trainerExp,      max: 5,   label: "Trainer Experience" },
  { key: "tools",           col: COL.tools,           max: 5,   label: "Tools & Equipment" },
  { key: "consumables",     col: COL.consumables,     max: 5,   label: "Consumables" },
  { key: "portfolio",       col: COL.portfolio,       max: 7.5, label: "Student Portfolio" },
  { key: "tlmImpl",         col: COL.tlmImpl,         max: 5,   label: "TLMs Implemented" },
  { key: "tlmProv",         col: COL.tlmProv,         max: 2.5, label: "TLMs Provision" },
  { key: "assessment",      col: COL.assessment,      max: 2.5, label: "Assessment" },
  { key: "indLinkage",      col: COL.indLinkage,      max: 3.5, label: "Industrial Linkages" },
  { key: "jobFair",         col: COL.jobFair,         max: 3.5, label: "Job Fair / Engagement" },
  { key: "ojt",             col: COL.ojt,             max: 3,   label: "On-Job Training" },
  { key: "studentFeedback", col: COL.studentFeedback, max: 2.5, label: "Student Feedback" },
];

/**
 * Six analytical categories. Carried forward verbatim from the previous
 * dashboard's CATEGORIES constant (master prompt §64 — preserve existing
 * functionality). This grouping exists nowhere in the workbook; it is
 * institutional knowledge and must not be lost.
 */
const CATEGORIES = [
  { key: "biometricAttendance", label: "Biometric & Attendance", max: 45,   members: ["biometric", "attendance"] },
  { key: "infrastructure",      label: "Infrastructure",         max: 15,   members: ["cctv", "tools", "consumables"] },
  { key: "trainer",             label: "Trainer Assessment",     max: 10,   members: ["trainerPms", "trainerDegree", "trainerExp"] },
  { key: "delivery",            label: "Training Delivery",      max: 17.5, members: ["portfolio", "tlmImpl", "tlmProv", "assessment"] },
  { key: "industry",            label: "Industry Engagement",    max: 10,   members: ["indLinkage", "jobFair", "ojt"] },
  { key: "feedback",            label: "Student Feedback",       max: 2.5,  members: ["studentFeedback"] },
];

/* ------------------------------------------------------------------ *
 * Cell readers
 * ------------------------------------------------------------------ */

/** Unwrap an ExcelJS cell to its literal value, preferring the cached formula result. */
function cellValue(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null;   // formula cell
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
  }
  return v;
}

const issues = [];
const repairs = [];
function flag(severity, code, message, row = null, detail = null) {
  issues.push({ severity, code, message, row, detail });
}

/**
 * Numeric reader with decimal-comma repair.
 *
 * Five cells in the source workbook were typed with a European decimal comma
 * ("2,5" instead of 2.5). Excel stores those as text, so SUM() silently skips
 * them and the stored Trade Wise Score is understated. We repair and log.
 */
function readNumber(raw, rowNo, label) {
  if (raw === null || raw === "" || raw === " ") return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return null;
    if (/^-?\d+,\d+$/.test(t)) {
      const fixed = Number(t.replace(",", "."));
      repairs.push({ row: rowNo, field: label, from: raw, to: fixed, reason: "decimal comma stored as text" });
      return fixed;
    }
    const n = Number(t);
    if (!Number.isNaN(n)) return n;
    flag("high", "NON_NUMERIC", `Non-numeric value in ${label}`, rowNo, String(raw));
    return null;
  }
  return null;
}

const str = (v) => (v === null || v === undefined ? null : String(v).replace(/\s+/g, " ").trim() || null);

/** Batch values are a mix of Arabic and Roman numerals: 1/I, 2/II, 3, 0, blank. */
function normalizeBatch(raw, rowNo) {
  if (raw === null || raw === undefined || raw === "") {
    flag("low", "BATCH_MISSING", "Batch not recorded", rowNo);
    return null;
  }
  const t = String(raw).trim().toUpperCase();
  const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  if (t in roman) return roman[t];
  const n = Number(t);
  if (Number.isInteger(n)) {
    if (n === 0) { flag("low", "BATCH_ZERO", "Batch recorded as 0", rowNo); return null; }
    return n;
  }
  flag("low", "BATCH_UNPARSED", "Unrecognised batch value", rowNo, String(raw));
  return null;
}

/**
 * The Grading column mixes five clean grades with free-text assessor
 * commentary ("CRITICAL / Poor\nInstitute was closed in 2nd visit").
 * We split it into a structured grade plus the note, rather than discarding
 * the commentary as the previous dashboard did.
 */
function parseGrading(raw) {
  if (raw === null || raw === undefined) return { grade: null, note: null };
  const full = String(raw).trim();
  if (!full) return { grade: null, note: null };
  const [head, ...rest] = full.split("\n");
  const h = head.trim();
  const note = [rest.join(" ").trim(), /^CRITICAL/i.test(h) && h.includes("/") ? "" : ""].filter(Boolean).join(" ") || (rest.length ? rest.join(" ").trim() : null);

  if (/^CRITICAL/i.test(h)) return { grade: "Critical", note: note || h };
  if (/^non\s*fun/i.test(h) || /^no classes/i.test(h)) return { grade: "Non-Functional", note: full };

  const canon = h.toLowerCase();
  const map = { excellent: "Excellent", "very good": "Very Good", good: "Good", average: "Average", poor: "Poor" };
  if (canon in map) return { grade: map[canon], note: note || null };
  return { grade: null, note: full };
}

const round = (n, d = 4) => (n === null || n === undefined || Number.isNaN(n) ? null : Number(n.toFixed(d)));
/** Rate helper. Returns null on a zero or missing denominator — never NaN, never Infinity. */
const rate = (num, den) => (!den || den === 0 || num === null || num === undefined ? null : round(num / den, 6));

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */
async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`Sheet "${SHEET}" not found. Sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);

  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i - 1] = str(cellValue(c)); });

  /* ---- pass 1: raw + normalized rows ---- */
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (i) => cellValue(row.getCell(i + 1));
    // Spacer rows: no institute, no trade, but sometimes a stray value left in
    // a score column. Counting one would add a phantom zero-score trade and pull
    // that institute's mean down, so they are excluded — and reported, never
    // dropped in silence.
    if (get(COL.instituteId) === null && get(COL.instituteName) === null) {
      const stray = row.values && Object.values(row.values).some((v) => v !== null && v !== undefined && v !== "");
      flag(stray ? "high" : "low", "SPACER_ROW",
        stray ? "Empty row carrying a stray value — excluded from all totals" : "Empty row — excluded",
        r, stray ? "no institute or trade, but a score column is populated" : null);
      continue;
    }

    const raw = {};
    headers.forEach((h, i) => { if (h) raw[h] = get(i); });

    const components = {};
    for (const c of COMPONENTS) {
      const v = readNumber(get(c.col), r, c.label);
      components[c.key] = v ?? 0;
      if (v === null) flag("medium", "COMPONENT_MISSING", `${c.label} missing, treated as 0`, r);
      else if (v > c.max) flag("medium", "COMPONENT_OVER_MAX", `${c.label} exceeds its maximum of ${c.max}`, r, String(v));
    }

    const approvedCapacity = readNumber(get(COL.approvedCapacity), r, "Approved Capacity") ?? 0;
    const biometricRegistered = readNumber(get(COL.biometricRegistered), r, "Registered") ?? 0;
    const droppedOut = readNumber(get(COL.droppedOut), r, "Dropped Out") ?? 0;
    const present = readNumber(get(COL.present), r, "Present") ?? 0;
    const absent = readNumber(get(COL.absent), r, "Absent") ?? 0;
    const cnicVerified = readNumber(get(COL.cnicVerified), r, "CNIC Verified") ?? 0;

    // Recomputed score. Differs from the stored Trade Wise Score on exactly the
    // rows repaired above — by design, and reported in the quality block.
    const tradeScore = round(COMPONENTS.reduce((s, c) => s + components[c.key], 0), 4);
    const tradeScoreStored = readNumber(get(COL.tradeScoreStored), r, "Trade Wise Score");

    if (tradeScore > 100.0001)
      flag("high", "SCORE_OVER_100",
        "Trade score exceeds the 100-point maximum — a component is over its own ceiling", r,
        `${tradeScore.toFixed(3)} / 100`);

    const categoryScores = {};
    for (const cat of CATEGORIES) {
      categoryScores[cat.key] = round(cat.members.reduce((s, k) => s + components[k], 0), 4);
    }

    const instituteId = readNumber(get(COL.instituteId), r, "Institute ID");
    const tradeCode = readNumber(get(COL.tradeCode), r, "Trade Code");
    const batch = normalizeBatch(get(COL.batch), r);

    /* --- row-level integrity checks (reported, never auto-corrected) --- */
    if (present + absent !== biometricRegistered)
      flag("medium", "ATTENDANCE_MISMATCH", "Present + Absent does not equal Registered", r,
        `${present} + ${absent} ≠ ${biometricRegistered}`);
    if (cnicVerified > biometricRegistered)
      flag("high", "VERIFIED_EXCEEDS_REGISTERED", "CNIC Verified exceeds Registered", r,
        `${cnicVerified} > ${biometricRegistered}`);
    if (biometricRegistered > approvedCapacity)
      flag("high", "OVER_CAPACITY", "Registered exceeds Approved Capacity", r,
        `${biometricRegistered} > ${approvedCapacity}`);
    if (approvedCapacity === 0) flag("medium", "ZERO_CAPACITY", "Approved Capacity is 0", r);
    if (biometricRegistered === 0) flag("medium", "ZERO_REGISTERED", "No trainees registered", r);

    rows.push({
      // synthetic stable key — the workbook has no unique row identifier.
      // Sr No restarts per group; Institute Trade Code is reused on 110 rows.
      id: `${instituteId}-${tradeCode}-${batch ?? "x"}-${r}`,
      excelRow: r,
      package: str(get(COL.package)),
      programName: str(get(COL.programName)),   // null on all Package-03 rows; NOT backfilled
      region: str(get(COL.region)),
      district: str(get(COL.district)),
      instituteId,
      instituteName: str(get(COL.instituteName)),
      tradeNameRaw: String(get(COL.tradeName) ?? ""),
      tradeCode,
      instituteTradeCode: readNumber(get(COL.instituteTradeCode), r, "Institute Trade Code"),
      batch,
      batchRaw: get(COL.batch) === null ? null : String(get(COL.batch)),
      approvedCapacity, biometricRegistered, droppedOut, present, absent, cnicVerified,
      // Column R as stored. Labelled "Attendance %" but computes CNIC Verified /
      // Approved Capacity where a formula survives, and matches no reproducible
      // definition on 207 rows. Kept as-reported, never used as attendance.
      verificationRateReported: readNumber(get(COL.attendancePctReported), r, "Attendance % (reported)"),
      // ATTENDANCE BASIS — CNIC Verified / Approved Capacity.
      // This is the definition the workbook itself uses wherever a live formula
      // survives in column R (=Q/L), and it is the basis the 35-point Attendance
      // Score is banded on, so the dashboard and the score now agree.
      attendanceRate: rate(cnicVerified, approvedCapacity),
      // Physical presence is a separate question and is kept alongside it.
      presenceRate: rate(present, biometricRegistered),
      dropoutRate: rate(droppedOut, biometricRegistered),
      utilizationRate: rate(biometricRegistered, approvedCapacity),
      components,
      categoryScores,
      tradeScore,
      tradeScoreStored,
      _raw: raw,
    });
  }

  /* ---- canonical trade names: key on Trade Code, display the most common spelling ---- */
  const tradeVariants = new Map();
  for (const row of rows) {
    if (row.tradeCode === null) continue;
    if (!tradeVariants.has(row.tradeCode)) tradeVariants.set(row.tradeCode, new Map());
    const m = tradeVariants.get(row.tradeCode);
    const v = row.tradeNameRaw.replace(/\s+/g, " ").trim();
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  const tradeCanonical = new Map();
  for (const [code, variants] of tradeVariants) {
    const sorted = [...variants.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    tradeCanonical.set(code, sorted[0][0]);
    if (sorted.length > 1)
      flag("low", "TRADE_NAME_VARIANTS", `Trade code ${code} has ${sorted.length} spellings`, null,
        sorted.map(([n]) => n).join(" | "));
  }
  for (const row of rows) {
    row.tradeName = tradeCanonical.get(row.tradeCode) ?? row.tradeNameRaw.trim();
  }

  /* ---- institute-level aggregation ---- *
   * Rates are recomputed from summed numerators and denominators. They are
   * never averaged from row-level rates — averaging percentages across rows
   * with different denominators is arithmetically wrong, and is a defect in
   * the previous dashboard's getInstituteData().
   */
  const byInstitute = new Map();
  for (const row of rows) {
    if (!byInstitute.has(row.instituteId)) byInstitute.set(row.instituteId, []);
    byInstitute.get(row.instituteId).push(row);
  }

  // Grading lives on the first row of each institute block in the workbook.
  const gradingByInstitute = new Map();
  for (let r = 2; r <= ws.rowCount; r++) {
    const g = cellValue(ws.getRow(r).getCell(COL.grading + 1));
    const id = cellValue(ws.getRow(r).getCell(COL.instituteId + 1));
    if (g !== null && id !== null && !gradingByInstitute.has(id)) gradingByInstitute.set(id, parseGrading(g));
  }
  const storedTotalByInstitute = new Map();
  for (let r = 2; r <= ws.rowCount; r++) {
    const t = cellValue(ws.getRow(r).getCell(COL.totalScoreStored + 1));
    const id = cellValue(ws.getRow(r).getCell(COL.instituteId + 1));
    if (typeof t === "number" && id !== null && !storedTotalByInstitute.has(id)) storedTotalByInstitute.set(id, t);
  }

  const sum = (a, k) => a.reduce((s, x) => s + (x[k] ?? 0), 0);
  const institutes = [];
  for (const [instituteId, group] of byInstitute) {
    const names = [...new Set(group.map((g) => g.instituteName))];
    if (names.length > 1)
      flag("high", "AMBIGUOUS_INSTITUTE", `Institute ID ${instituteId} carries ${names.length} different names`,
        null, names.join(" | "));

    const score = round(group.reduce((s, g) => s + g.tradeScore, 0) / group.length, 4);
    const stored = storedTotalByInstitute.get(instituteId) ?? null;
    if (stored !== null && Math.abs(stored - score) > 0.01)
      flag("high", "TOTAL_SCORE_MISMATCH",
        `Stored Total Score for institute ${instituteId} disagrees with the mean of its trade scores`,
        null, `stored ${stored.toFixed(2)} vs computed ${score.toFixed(2)}`);

    const { grade, note } = gradingByInstitute.get(instituteId) ?? { grade: null, note: null };

    const categoryScores = {};
    for (const cat of CATEGORIES)
      categoryScores[cat.key] = round(group.reduce((s, g) => s + g.categoryScores[cat.key], 0) / group.length, 4);

    const approvedCapacity = sum(group, "approvedCapacity");
    const biometricRegistered = sum(group, "biometricRegistered");
    const present = sum(group, "present");
    const droppedOut = sum(group, "droppedOut");
    const cnicVerified = sum(group, "cnicVerified");

    institutes.push({
      instituteId,
      instituteName: names[0],
      region: group[0].region,
      district: group[0].district,
      package: group[0].package,
      assessments: group.length,
      trades: [...new Set(group.map((g) => g.tradeName))].sort(),
      tradeCodes: [...new Set(group.map((g) => g.tradeCode))],
      approvedCapacity, biometricRegistered, droppedOut, present,
      absent: sum(group, "absent"), cnicVerified,
      attendanceRate: rate(present, biometricRegistered),
      dropoutRate: rate(droppedOut, biometricRegistered),
      utilizationRate: rate(biometricRegistered, approvedCapacity),
      verificationRate: rate(cnicVerified, approvedCapacity),
      score,
      scoreStored: stored,
      gradeReported: grade,
      assessorNote: note,
      categoryScores,
      components: Object.fromEntries(
        COMPONENTS.map((c) => [c.key, round(group.reduce((s, g) => s + g.components[c.key], 0) / group.length, 4)])
      ),
    });
  }
  institutes.sort((a, b) => b.score - a.score);
  institutes.forEach((inst, i) => { inst.rank = i + 1; });

  /* ---- dimension catalogue for the filter engine ---- */
  const uniq = (arr) => [...new Set(arr.filter((v) => v !== null && v !== undefined))];
  const dimensions = {
    regions: uniq(rows.map((r) => r.region)).sort(),
    districts: uniq(rows.map((r) => r.district)).sort(),
    packages: uniq(rows.map((r) => r.package)).sort(),
    batches: uniq(rows.map((r) => r.batch)).sort((a, b) => a - b),
    grades: uniq(institutes.map((i) => i.gradeReported)),
    trades: [...tradeCanonical.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)),
    // region → districts, for cascading filters
    regionDistricts: Object.fromEntries(
      uniq(rows.map((r) => r.region)).sort().map((rg) => [rg, uniq(rows.filter((r) => r.region === rg).map((r) => r.district)).sort()])
    ),
  };

  /* ---- completeness ---- */
  const totalCells = rows.length * headers.filter(Boolean).length;
  let filled = 0;
  for (const row of rows) for (const h of headers) if (h && row._raw[h] !== null && row._raw[h] !== undefined && row._raw[h] !== "") filled++;

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const i of issues) bySeverity[i.severity]++;
  const byCode = {};
  for (const i of issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1;

  const dataset = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: "NAVTTC_-_PMYSDP_Updated_File.xlsx",
      sheet: SHEET,
      assessmentDate: "2026-05-24",
      program: "PMYSDP Batch III",
      rowCount: rows.length,
      instituteCount: institutes.length,
      columnCount: headers.filter(Boolean).length,
      headers: headers.filter(Boolean),
      hasTimeDimension: false,
      hasDemographics: false,
    },
    components: COMPONENTS.map(({ key, max, label }) => ({ key, max, label })),
    categories: CATEGORIES,
    dimensions,
    rows: rows.map(({ _raw, ...keep }) => keep),
    institutes,
    quality: {
      totals: {
        rows: rows.length,
        institutes: institutes.length,
        cells: totalCells,
        filledCells: filled,
        completeness: round(filled / totalCells, 4),
        issues: issues.length,
        repairs: repairs.length,
      },
      bySeverity,
      byCode,
      repairs,
      issues,
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(dataset));

  /* ---- console report ---- */
  const s = (n) => n.toLocaleString("en-US");
  console.log("\nNAVTTC dataset built");
  console.log("─".repeat(58));
  console.log(`  rows                  ${s(rows.length)}`);
  console.log(`  institutes            ${s(institutes.length)}`);
  console.log(`  trades (trade code)   ${s(dimensions.trades.length)}`);
  console.log(`  districts / regions   ${dimensions.districts.length} / ${dimensions.regions.length}`);
  console.log(`  approved capacity     ${s(sum(rows, "approvedCapacity"))}`);
  console.log(`  registered            ${s(sum(rows, "biometricRegistered"))}`);
  console.log(`  present               ${s(sum(rows, "present"))}`);
  console.log(`  dropped out           ${s(sum(rows, "droppedOut"))}`);
  console.log(`  cnic verified         ${s(sum(rows, "cnicVerified"))}`);
  console.log(`  completeness          ${(dataset.quality.totals.completeness * 100).toFixed(2)}%`);
  console.log(`  repairs applied       ${repairs.length}`);
  console.log(`  issues (H/M/L)        ${bySeverity.high}/${bySeverity.medium}/${bySeverity.low}`);
  console.log("─".repeat(58));
  console.log(`  → ${OUT}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
