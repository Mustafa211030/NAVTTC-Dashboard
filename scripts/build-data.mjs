/**
 * NAVTTC multi-programme ingest pipeline
 * --------------------------------------
 * Reads every workbook registered in scripts/programs.config.mjs from
 * data/programs/<slug>/source.xlsx and emits ONE file:
 *
 *     public/data/portfolio.json
 *
 * which the browser fetches once and the AI assistant reads on the server.
 *
 * Per programme:   raw → normalised → validated → derived → aggregated
 * Across them:     institute identity linking, trade-name harmonisation
 *
 * Rules carried over from the single-programme build:
 *   - raw values are never destructively mutated; repairs are logged
 *   - rates are pooled (Σ numerator ÷ Σ denominator), never averaged
 *   - every validation failure is recorded with its Excel row
 *   - the workbook's own stored totals are kept for audit, never trusted
 */

import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROGRAMS, RUBRICS, CATEGORIES, ATTENDANCE_RULES, GRADE_BANDS, DISTRICT_ALIASES } from "./programs.config.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/data/portfolio.json");
const SHEET = "Combined Sheet";

/* Fixed template columns A–R (0-indexed). Identical in every programme's sheet. */
const COL = {
  srNo: 0, package: 1, programName: 2, region: 3, district: 4,
  instituteId: 5, instituteName: 6, tradeName: 7, batch: 8,
  instituteTradeCode: 9, tradeCode: 10, approvedCapacity: 11,
  enrolled: 12, droppedOut: 13, present: 14, absent: 15,
  cnicVerified: 16, attendancePctReported: 17,
};
const FIRST_COMPONENT_COL = 18;

/** Optional trailing columns, located by header. First match wins. */
const EXTRA_FIELDS = {
  visitDate:        [/^Date of Visit$/i],
  duration:         [/^Duration of Trade$/i, /^Course Duration$/i, /^Duration$/i],
  tradeCategory:    [/^Trade Category$/i],
  tradeSector:      [/^Trade Sector$/i],
  division:         [/^Division$/i],
  tehsil:           [/^Tehsil$/i],
  visit:            [/^Visit$/i],
  firm:             [/^Firm Name$/i],
  release:          [/^Recommendation for Release$/i, /^Financial Release$/i],
  monitorRemarks:   [/^Monitor Remarks$/i, /^Recommendations \(monitor\)$/i],
  instructorName:   [/^Instructor Name$/i],
  instructorQualification: [/^Instructor Qualification$/i],
  instructorExperience:    [/^Instructor Experience/i],
  sourceScore:      [/^Source MARKS\/100/i, /^Original Final Score/i],
  batchId:          [/^Batch ID$/i],
};

/* ------------------------------------------------------------------ helpers */

function cellValue(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  // Formula cells: ExcelJS omits a cached result of 0 from the value object,
  // but still exposes it through cell.result.
  if (typeof v === "object" && !(v instanceof Date) && ("formula" in v || "sharedFormula" in v)) {
    const res = cell.result;
    if (res === undefined || res === null) return null;
    if (typeof res === "object" && "error" in res) return null;
    return res;
  }
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if ("error" in v) return null;
  }
  return v;
}

const normHeader = (h) => (h === null || h === undefined ? null : String(h).replace(/\s+/g, " ").trim());
const str = (v) => (v === null || v === undefined ? null : String(v).replace(/\s+/g, " ").trim() || null);
const round = (n, d = 4) => (n === null || n === undefined || Number.isNaN(n) ? null : Number(n.toFixed(d)));
const rate = (num, den) => (!den || den === 0 || num === null || num === undefined ? null : round(num / den, 6));
const slug = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const norm = (s) => String(s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

function titleCase(s) {
  if (!s) return s;
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function canonicalDistrict(raw) {
  const s = str(raw);
  if (!s) return null;
  const alias = DISTRICT_ALIASES[s.toLowerCase()];
  return alias ?? titleCase(s);
}

function bandOf(score) {
  if (score === null || score === undefined) return null;
  return GRADE_BANDS.find((b) => score >= b.min).label;
}

function parseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).replace(/^[A-Za-z]+,\s*/, "").trim(); // drop weekday
  const d = new Date(s + " UTC");
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
function parseDurationMonths(v) {
  const s = str(v);
  if (!s) return null;
  const m = s.toLowerCase().match(/(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(month|week|year)/);
  if (!m) return null;
  const n = WORD_NUM[m[1]] ?? Number(m[1]);
  return m[2] === "year" ? n * 12 : m[2] === "week" ? round(n / 4.345, 2) : n;
}

/* ------------------------------------------------------------------ per programme */

async function ingestProgram(cfg) {
  const src = resolve(ROOT, "data/programs", cfg.slug, "source.xlsx");
  if (!existsSync(src)) throw new Error(`Missing workbook for ${cfg.slug}: ${src}`);
  const rubric = RUBRICS[cfg.rubric];
  if (!rubric) throw new Error(`Unknown rubric "${cfg.rubric}" for ${cfg.slug}`);
  const attRule = ATTENDANCE_RULES[cfg.attendance];
  if (!attRule) throw new Error(`Unknown attendance rule "${cfg.attendance}" for ${cfg.slug}`);

  const issues = [];
  const repairs = [];
  const flag = (severity, code, message, row = null, detail = null) => issues.push({ severity, code, message, row, detail });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(src);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`${cfg.slug}: sheet "${SHEET}" not found. Sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);

  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i - 1] = normHeader(cellValue(c)); });
  const findCol = (re, from = 0, to = headers.length) => {
    for (let i = from; i < to; i++) if (headers[i] && re.test(headers[i])) return i;
    return -1;
  };

  /* ---- locate the score block and the trailing template columns ---- */
  const tradeScoreCol = findCol(/^Trade Wise Score$/i, FIRST_COMPONENT_COL);
  if (tradeScoreCol < 0) throw new Error(`${cfg.slug}: "Trade Wise Score" column not found`);
  const totalScoreCol = findCol(/^Total Score$/i, tradeScoreCol);
  const gradingCol = findCol(/^Grading$/i, tradeScoreCol);
  const remarksCol = findCol(/^Remarks$/i, tradeScoreCol);
  const overrideCol = findCol(/^Grade Override$/i, tradeScoreCol);

  const used = new Set();
  const components = rubric.components.map((c) => {
    let col = -1;
    for (let i = FIRST_COMPONENT_COL; i < tradeScoreCol; i++) {
      if (!used.has(i) && headers[i] && c.match.test(headers[i])) { col = i; break; }
    }
    if (col < 0) throw new Error(`${cfg.slug}: rubric component "${c.label}" (${c.match}) has no matching column`);
    used.add(col);
    return { ...c, col };
  });
  for (let i = FIRST_COMPONENT_COL; i < tradeScoreCol; i++)
    if (!used.has(i) && headers[i]) flag("medium", "UNMAPPED_SCORE_COLUMN", `Score column not in the ${cfg.rubric} rubric: ignored`, null, headers[i]);

  const rubricMax = round(components.reduce((s, c) => s + c.max, 0), 4);
  if (Math.abs(rubricMax - 100) > 0.001) flag("high", "RUBRIC_NOT_100", `Rubric maxima sum to ${rubricMax}, not 100`);

  const categories = CATEGORIES.map((cat) => {
    const members = components.filter((c) => c.cat === cat.key).map((c) => c.key);
    return { ...cat, members, max: round(components.filter((c) => c.cat === cat.key).reduce((s, c) => s + c.max, 0), 4) };
  });

  const extraCols = {};
  for (const [field, patterns] of Object.entries(EXTRA_FIELDS)) {
    for (const re of patterns) {
      const c = findCol(re, tradeScoreCol);
      if (c >= 0) { extraCols[field] = c; break; }
    }
  }

  /* ---- numeric reader with decimal-comma repair ---- */
  function readNumber(raw, rowNo, label) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (raw instanceof Date) return null;
    const t = String(raw).trim();
    if (t === "") return null;
    if (/^-?\d+,\d+$/.test(t)) {
      const fixed = Number(t.replace(",", "."));
      repairs.push({ row: rowNo, field: label, from: String(raw), to: fixed, reason: "decimal comma stored as text" });
      return fixed;
    }
    const n = Number(t);
    if (!Number.isNaN(n)) return n;
    flag("high", "NON_NUMERIC", `Non-numeric value in ${label}`, rowNo, String(raw));
    return null;
  }

  function normalizeBatch(raw, rowNo) {
    if (raw === null || raw === undefined || raw === "") return null;
    const t = String(raw).trim().toUpperCase();
    const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
    if (t in roman) return roman[t];
    const n = Number(t);
    if (Number.isInteger(n)) {
      if (n === 0) { flag("low", "BATCH_ZERO", "Batch recorded as 0", rowNo); return null; }
      if (n > 20) { flag("low", "BATCH_UNPARSED", "Implausible batch number", rowNo, String(raw)); return null; }
      return n;
    }
    flag("low", "BATCH_UNPARSED", "Unrecognised batch value", rowNo, String(raw));
    return null;
  }

  /** B3-style Grading cell: grade on line 1, free-text assessor commentary after. */
  function parseGradingWithNotes(raw) {
    if (raw === null || raw === undefined) return { grade: null, note: null };
    const full = String(raw).trim();
    if (!full) return { grade: null, note: null };
    const [head, ...rest] = full.split("\n");
    const h = head.trim();
    const tail = rest.join(" ").replace(/\s+/g, " ").trim() || null;
    if (/^CRITICAL/i.test(h)) return { grade: "Critical", note: tail || h };
    if (/^non\s*fun/i.test(h) || /^no classes/i.test(h)) return { grade: "Non-Functional", note: full.replace(/\s+/g, " ") };
    const map = { excellent: "Excellent", "very good": "Very Good", good: "Good", average: "Average", poor: "Poor" };
    const g = map[h.toLowerCase()];
    if (g) return { grade: g, note: tail };
    return { grade: null, note: full.replace(/\s+/g, " ") };
  }
  const cleanGrade = (v) => {
    const s = str(v);
    if (!s) return null;
    const map = { excellent: "Excellent", "very good": "Very Good", good: "Good", average: "Average", poor: "Poor", closed: "Closed" };
    return map[s.toLowerCase()] ?? s;
  };

  /* ---- pass 1: rows ---- */
  const rows = [];
  const instMeta = new Map(); // workbook per-institute fields (merged cells live on the first row)
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (i) => (i < 0 ? null : cellValue(row.getCell(i + 1)));
    const name = str(get(COL.instituteName));
    const rawId = get(COL.instituteId);

    if (rawId === null && name === null) {
      const vals = Array.isArray(row.values) ? row.values : Object.values(row.values ?? {});
      const stray = vals.some((v) => v !== null && v !== undefined && v !== "");
      if (stray) flag("high", "SPACER_ROW", "Empty row carrying a stray value — excluded from all totals", r, "no institute or trade, but another column is populated");
      continue;
    }

    const instituteId = readNumber(rawId, r, "Institute ID");

    /* components */
    const comp = {};
    let anyScore = false;
    for (const c of components) {
      const v = readNumber(get(c.col), r, c.label);
      if (v !== null) anyScore = true;
      comp[c.key] = v;
    }
    const scored = anyScore;
    if (!scored) flag("medium", "UNSCORED_ROW", "Trade row carries no scores — excluded from score averages, kept in headcounts", r);
    for (const c of components) {
      if (comp[c.key] === null) {
        if (scored) flag("medium", "COMPONENT_MISSING", `${c.label} missing, treated as 0`, r);
        comp[c.key] = 0;
      } else if (comp[c.key] > c.max + 1e-9) {
        flag("medium", "COMPONENT_OVER_MAX", `${c.label} exceeds its maximum of ${c.max}`, r, String(comp[c.key]));
      } else if (comp[c.key] < 0) {
        flag("high", "COMPONENT_NEGATIVE", `${c.label} is negative`, r, String(comp[c.key]));
      }
    }

    const approvedCapacity = readNumber(get(COL.approvedCapacity), r, "Approved Capacity") ?? 0;
    const enrolled = readNumber(get(COL.enrolled), r, "Enrolled") ?? 0;
    const droppedOut = readNumber(get(COL.droppedOut), r, "Dropped Out") ?? 0;
    const present = readNumber(get(COL.present), r, "Present") ?? 0;
    const absent = readNumber(get(COL.absent), r, "Absent") ?? 0;
    const cnicVerified = readNumber(get(COL.cnicVerified), r, "CNIC Verified") ?? 0;
    const h = { approvedCapacity, enrolled, droppedOut, present, absent, cnicVerified };

    const tradeScore = scored ? round(components.reduce((s, c) => s + comp[c.key], 0), 4) : null;
    const tradeScoreStored = readNumber(get(tradeScoreCol), r, "Trade Wise Score");
    if (tradeScore !== null && tradeScore > 100.0001)
      flag("high", "SCORE_OVER_100", "Trade score exceeds 100 — a component is over its own ceiling", r, `${tradeScore.toFixed(2)} / 100`);
    if (tradeScore !== null && tradeScoreStored !== null && Math.abs(tradeScore - tradeScoreStored) > 0.01)
      flag("medium", "TRADE_SCORE_MISMATCH", "Stored Trade Wise Score differs from the sum of its components", r, `stored ${tradeScoreStored} vs ${tradeScore}`);

    const categoryScores = {};
    const categoryPct = {};
    for (const cat of categories) {
      if (!cat.members.length) { categoryScores[cat.key] = null; categoryPct[cat.key] = null; continue; }
      const s = scored ? round(cat.members.reduce((a, k) => a + comp[k], 0), 4) : null;
      categoryScores[cat.key] = s;
      categoryPct[cat.key] = s === null ? null : round(s / cat.max, 5);
    }

    /* integrity checks — reported, never auto-corrected */
    if (present + absent !== enrolled)
      flag("medium", "ATTENDANCE_MISMATCH", "Present + Absent does not equal Enrolled", r, `${present} + ${absent} ≠ ${enrolled}`);
    if (cnicVerified > present && cnicVerified > 0)
      flag("medium", "VERIFIED_EXCEEDS_PRESENT", "CNIC Verified exceeds Present", r, `${cnicVerified} > ${present}`);
    if (enrolled > approvedCapacity && approvedCapacity > 0)
      flag("high", "OVER_CAPACITY", "Enrolled exceeds Approved Capacity", r, `${enrolled} > ${approvedCapacity}`);
    if (approvedCapacity === 0) flag("medium", "ZERO_CAPACITY", "Approved Capacity is 0", r);
    if (enrolled === 0) flag("low", "ZERO_ENROLLED", "No trainees enrolled", r);

    const attNum = h[attRule.num];
    const attDen = h[attRule.den];
    const attendanceRate = rate(attNum, attDen);
    const attendanceReported = readNumber(get(COL.attendancePctReported), r, "Attendance % (reported)");
    if (attendanceRate !== null && attendanceReported !== null && Math.abs(attendanceRate - attendanceReported) > 0.0051)
      flag("low", "ATTENDANCE_PCT_MISMATCH", `Stored Attendance % differs from ${attRule.label}`, r,
        `stored ${(attendanceReported * 100).toFixed(1)}% vs ${(attendanceRate * 100).toFixed(1)}%`);

    const extra = {};
    for (const [field, c] of Object.entries(extraCols)) {
      const v = get(c);
      if (v === null || v === undefined || v === "") continue;
      extra[field] = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "number" ? v : String(v).replace(/\s+/g, " ").trim();
    }

    const TYPED = ["visitDate", "duration", "tradeCategory", "tradeSector", "division", "tehsil", "release"];
    const extraOut = Object.fromEntries(Object.entries(extra).filter(([k]) => !TYPED.includes(k)));
    const tradeNameRaw = String(get(COL.tradeName) ?? "");
    const tradeCode = readNumber(get(COL.tradeCode), r, "Trade Code");
    const batchRawV = get(COL.batch);
    const district = canonicalDistrict(get(COL.district));
    const region = str(get(COL.region))?.toUpperCase() ?? null;

    const instituteKey = instituteId !== null ? String(instituteId) : `n-${slug(name)}`;

    // per-institute workbook fields (first non-null wins; merged cells carry them)
    if (!instMeta.has(instituteKey)) instMeta.set(instituteKey, { totals: [], grading: null, remarks: null, override: null, firstRow: r });
    const im = instMeta.get(instituteKey);
    const tot = readNumber(get(totalScoreCol), r, "Total Score");
    if (tot !== null) im.totals.push(tot);
    if (im.grading === null && get(gradingCol) !== null) im.grading = get(gradingCol);
    if (im.remarks === null && str(get(remarksCol))) im.remarks = str(get(remarksCol));
    if (im.override === null && str(get(overrideCol))) im.override = str(get(overrideCol));

    rows.push({
      id: `${cfg.slug}:${r}`,
      p: cfg.slug,
      excelRow: r,
      package: str(get(COL.package)),
      programName: str(get(COL.programName)),
      region,
      district,
      division: extra.division ? str(extra.division) : null,
      tehsil: extra.tehsil ? str(extra.tehsil) : null,
      instituteId,
      instituteKey,
      instituteName: name,
      tradeNameRaw: tradeNameRaw.trim(),
      tradeName: null, // canonicalised below
      tradeCode,
      tradeKey: null,
      tradeNorm: null,
      tradeCategory: extra.tradeCategory ? titleCase(str(extra.tradeCategory)).replace(/^Convention$/i, "Conventional") : null,
      tradeSector: extra.tradeSector ? str(extra.tradeSector) : null,
      durationMonths: parseDurationMonths(extra.duration),
      visitDate: parseDate(extra.visitDate ?? null),
      release: extra.release ? (/^y/i.test(String(extra.release)) ? "Yes" : /^n/i.test(String(extra.release)) ? "No" : String(extra.release)) : null,
      batch: normalizeBatch(batchRawV, r),
      batchRaw: batchRawV === null ? null : String(batchRawV),
      approvedCapacity, enrolled, droppedOut, present, absent, cnicVerified,
      attNum, attDen,
      attendanceRate,
      presenceRate: rate(present, enrolled),
      verificationRate: rate(cnicVerified, approvedCapacity),
      dropoutRate: rate(droppedOut, enrolled),
      utilizationRate: rate(enrolled, approvedCapacity),
      attendanceReported,
      scored,
      components: comp,
      categoryScores,
      categoryPct,
      tradeScore,
      tradeScoreStored,
      extra: extraOut,
    });
  }

  /* ---- trade canonicalisation ----
   * Keyed on Trade Code where the programme records it (B3), otherwise on the
   * normalised name. Displayed as the most common spelling. */
  const variants = new Map();
  for (const row of rows) {
    const k = row.tradeCode !== null ? `c${row.tradeCode}` : `n${norm(row.tradeNameRaw)}`;
    row.tradeKey = k;
    if (!variants.has(k)) variants.set(k, new Map());
    const v = row.tradeNameRaw.replace(/\s+/g, " ").trim();
    variants.get(k).set(v, (variants.get(k).get(v) ?? 0) + 1);
  }
  const canonical = new Map();
  for (const [k, m] of variants) {
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    canonical.set(k, sorted[0][0]);
    if (sorted.length > 1)
      flag("low", "TRADE_NAME_VARIANTS", `Trade ${k.startsWith("c") ? "code " + k.slice(1) : sorted[0][0]} has ${sorted.length} spellings`, null, sorted.map(([n]) => n).join(" | "));
  }
  for (const row of rows) {
    row.tradeName = canonical.get(row.tradeKey) || "(unnamed trade)";
    row.tradeNorm = norm(row.tradeName);
  }

  /* ---- institute aggregation ---- */
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.instituteKey)) groups.set(row.instituteKey, []);
    groups.get(row.instituteKey).push(row);
  }
  const sum = (a, k) => a.reduce((s, x) => s + (x[k] ?? 0), 0);
  const institutes = [];
  for (const [key, g] of groups) {
    const names = [...new Set(g.map((x) => x.instituteName))];
    if (g[0].instituteId === null)
      flag("low", "NO_INSTITUTE_ID", "Institute ID not recorded — institute identified by name", g[0].excelRow, names[0]);
    if (names.length > 1)
      flag("high", "AMBIGUOUS_INSTITUTE", `Institute ID ${key} carries ${names.length} different names`, g[0].excelRow, names.join(" | "));
    const districts = [...new Set(g.map((x) => x.district))];
    if (districts.length > 1)
      flag("low", "INSTITUTE_MULTI_DISTRICT", `Institute ${key} appears in ${districts.length} districts`, g[0].excelRow, districts.join(" | "));

    const scoredRows = g.filter((x) => x.scored);
    const score = scoredRows.length ? round(scoredRows.reduce((s, x) => s + x.tradeScore, 0) / scoredRows.length, 4) : null;
    const im = instMeta.get(key);
    const stored = im.totals.length ? im.totals[0] : null;
    if (stored !== null && score !== null && Math.abs(stored - score) > 0.01)
      flag("high", "TOTAL_SCORE_MISMATCH", `Stored Total Score for institute ${key} disagrees with the mean of its trade scores`, im.firstRow, `stored ${stored.toFixed(2)} vs computed ${score.toFixed(2)}`);

    let gradeReported, note, override = null;
    if (cfg.gradingCarriesNotes) {
      const p = parseGradingWithNotes(im.grading);
      gradeReported = p.grade; note = p.note;
    } else {
      gradeReported = cleanGrade(im.grading);
      note = im.remarks;
      override = cleanGrade(im.override);
    }
    const band = bandOf(score);
    const grade = override ?? band ?? "Unscored";
    if (!override && gradeReported && band && gradeReported !== band && !["Critical", "Non-Functional"].includes(gradeReported))
      flag("medium", "GRADE_MISMATCH", `Workbook grade "${gradeReported}" disagrees with score band "${band}"`, im.firstRow, `institute ${key}, score ${score?.toFixed(2)}`);

    const blob = `${note ?? ""} ${im.override ?? ""} ${typeof im.grading === "string" ? im.grading : ""}`.toLowerCase();
    const status =
      /closed/.test(blob) && override === "Closed" ? "Closed" :
      /fake/.test(blob) ? "Fake" :
      /critical/.test(blob) ? "Critical" :
      /not functional|non[\s-]?functional|no classes|withdr|closed|no (any )?students|not in working/.test(blob) ? "Non-Functional" :
      "Active";

    const catAgg = {};
    const catPct = {};
    for (const cat of categories) {
      if (!cat.members.length || !scoredRows.length) { catAgg[cat.key] = null; catPct[cat.key] = null; continue; }
      const m = scoredRows.reduce((s, x) => s + x.categoryScores[cat.key], 0) / scoredRows.length;
      catAgg[cat.key] = round(m, 4);
      catPct[cat.key] = round(m / cat.max, 5);
    }
    const compAgg = Object.fromEntries(components.map((c) => [c.key,
      scoredRows.length ? round(scoredRows.reduce((s, x) => s + x.components[c.key], 0) / scoredRows.length, 4) : null]));

    const cap = sum(g, "approvedCapacity"), enr = sum(g, "enrolled"), pre = sum(g, "present"),
      drop = sum(g, "droppedOut"), ver = sum(g, "cnicVerified"), aN = sum(g, "attNum"), aD = sum(g, "attDen");
    const dates = g.map((x) => x.visitDate).filter(Boolean).sort();

    institutes.push({
      p: cfg.slug,
      instituteKey: key,
      globalKey: null,
      instituteId: g[0].instituteId,
      instituteName: names[0],
      region: g[0].region,
      district: g[0].district,
      division: g[0].division,
      package: g[0].package,
      assessments: g.length,
      trades: [...new Set(g.map((x) => x.tradeName))].sort(),
      approvedCapacity: cap, enrolled: enr, droppedOut: drop, present: pre,
      absent: sum(g, "absent"), cnicVerified: ver, attNum: aN, attDen: aD,
      attendanceRate: rate(aN, aD),
      presenceRate: rate(pre, enr),
      verificationRate: rate(ver, cap),
      dropoutRate: rate(drop, enr),
      utilizationRate: rate(enr, cap),
      score, scoreStored: stored,
      grade, gradeReported, gradeOverride: override,
      assessorNote: note,
      status,
      flagged: Boolean(note) || Boolean(override) || status !== "Active",
      categoryScores: catAgg,
      categoryPct: catPct,
      components: compAgg,
      visitDate: dates[0] ?? null,
      rank: 0,
    });
  }
  institutes.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  institutes.forEach((x, i) => { x.rank = i + 1; });

  /* ---- Change Log sheet: corrections documented by the workbook's author ---- */
  const changeLog = [];
  const cl = wb.getWorksheet("Change Log");
  if (cl) {
    let headerRow = -1;
    for (let r = 1; r <= Math.min(cl.rowCount, 10); r++) {
      if (str(cellValue(cl.getRow(r).getCell(1))) === "#") { headerRow = r; break; }
    }
    if (headerRow > 0) {
      for (let r = headerRow + 1; r <= cl.rowCount; r++) {
        const g = (i) => cellValue(cl.getRow(r).getCell(i));
        if (g(1) === null && g(2) === null) continue;
        changeLog.push({
          row: typeof g(2) === "number" ? g(2) : str(g(2)),
          institute: str(g(3)), trade: str(g(4)), field: str(g(5)),
          from: g(6) === null ? null : String(g(6)), to: g(7) === null ? null : String(g(7)),
          reason: str(g(8)),
        });
      }
    }
  }

  /* ---- Scoring Criteria sheet: programme-specific notes ---- */
  const notes = [];
  const sc = wb.getWorksheet("Scoring Criteria");
  if (sc) {
    let inNotes = false;
    for (let r = 1; r <= sc.rowCount; r++) {
      const a = cellValue(sc.getRow(r).getCell(1));
      const b = cellValue(sc.getRow(r).getCell(2));
      if (str(a) === "#" && /notes/i.test(String(b ?? ""))) { inNotes = true; continue; }
      if (inNotes && typeof a === "number" && b) notes.push(String(b).replace(/\s+/g, " ").trim());
    }
  }

  /* ---- completeness over the template columns that exist ---- */
  const usedCols = [
    ...Object.values(COL), ...components.map((c) => c.col), tradeScoreCol,
  ];
  let filled = 0;
  let cells = 0;
  for (const row of rows) {
    const r = ws.getRow(row.excelRow);
    for (const c of usedCols) {
      cells++;
      const v = cellValue(r.getCell(c + 1));
      if (v !== null && v !== undefined && v !== "") filled++;
    }
  }

  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byCode = {};
  for (const i of issues) { bySeverity[i.severity]++; byCode[i.code] = (byCode[i.code] ?? 0) + 1; }

  const dates = rows.map((r) => r.visitDate).filter(Boolean).sort();
  const period = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
  const assessmentDate = cfg.assessmentDate ?? (period ? period.to : null);

  return {
    program: {
      slug: cfg.slug, order: cfg.order, family: cfg.family,
      name: cfg.name, short: cfg.short, code: cfg.code, badge: cfg.badge ?? cfg.code, fullName: cfg.fullName,
      color: cfg.color,
      rubric: {
        key: cfg.rubric, label: rubric.label,
        components: components.map(({ key, label, max, cat, col }) => ({ key, label, max, cat, column: col })),
        categories: categories.map(({ key, label, short, max, members }) => ({ key, label, short, max, members })),
      },
      attendanceRule: { key: cfg.attendance, ...attRule },
      enrolledLabel: /registered on biometric/i.test(headers[COL.enrolled] ?? "") ? "Registered (biometric)" : "Enrolled",
      assessmentDate,
      period,
      hasVisitDates: dates.length > 0,
      sourceFile: cfg.sourceLabel,
      sheet: SHEET,
      columnCount: headers.filter(Boolean).length,
      headers: headers.filter(Boolean),
      extras: Object.keys(extraCols),
      notes,
      rowCount: rows.length,
      instituteCount: institutes.length,
      quality: {
        totals: {
          rows: rows.length, institutes: institutes.length, cells, filledCells: filled,
          completeness: cells ? round(filled / cells, 4) : 1,
          issues: issues.length, repairs: repairs.length, changeLog: changeLog.length,
        },
        bySeverity, byCode, repairs, issues, changeLog,
      },
    },
    rows,
    institutes,
  };
}

/* ------------------------------------------------------------------ portfolio */

async function main() {
  const programs = [];
  const rows = [];
  const institutes = [];
  for (const cfg of [...PROGRAMS].sort((a, b) => a.order - b.order)) {
    const out = await ingestProgram(cfg);
    programs.push(out.program);
    rows.push(...out.rows.map(({ categoryScores, ...keep }) => keep));
    institutes.push(...out.institutes);
  }

  /* ---- cross-programme institute identity ----
   * Institutes are linked across programmes on Institute ID when both sides
   * carry one and the names agree; on normalised name otherwise. An ID shared
   * by two different names is NOT linked — that would merge two institutes. */
  const byId = new Map();
  for (const i of institutes) {
    if (i.instituteId === null) continue;
    if (!byId.has(i.instituteId)) byId.set(i.instituteId, []);
    byId.get(i.instituteId).push(i);
  }
  const nameKey = (i) => norm(i.instituteName).slice(0, 40);
  const crossIssues = [];
  for (const i of institutes) {
    if (i.instituteId !== null) {
      const peers = byId.get(i.instituteId).filter((x) => x.p !== i.p);
      const conflict = peers.find((x) => nameKey(x) !== nameKey(i) && !nameKey(x).includes(nameKey(i).slice(0, 12)) && !nameKey(i).includes(nameKey(x).slice(0, 12)));
      if (conflict && !crossIssues.some((c) => c.id === i.instituteId)) {
        crossIssues.push({ id: i.instituteId, names: [...new Set(byId.get(i.instituteId).map((x) => `${x.instituteName} [${x.p}]`))] });
      }
      i.globalKey = `id-${i.instituteId}`;
    } else {
      // Try to attach a name-only institute to an ID'd one in another programme.
      const match = institutes.find((x) => x.instituteId !== null && x.p !== i.p && nameKey(x) === nameKey(i));
      i.globalKey = match ? `id-${match.instituteId}` : `nm-${slug(i.instituteName)}`;
    }
  }
  const instGlobal = new Map(institutes.map((i) => [`${i.p}|${i.instituteKey}`, i.globalKey]));
  for (const r of rows) r.globalKey = instGlobal.get(`${r.p}|${r.instituteKey}`);

  /* ---- cross-programme trade display names (most common spelling per normalised name) ---- */
  const tn = new Map();
  for (const r of rows) {
    if (!tn.has(r.tradeNorm)) tn.set(r.tradeNorm, new Map());
    tn.get(r.tradeNorm).set(r.tradeName, (tn.get(r.tradeNorm).get(r.tradeName) ?? 0) + 1);
  }
  const tradeNames = Object.fromEntries([...tn.entries()].map(([k, m]) => [k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]]));

  const portfolio = {
    meta: {
      generatedAt: new Date().toISOString(),
      programCount: programs.length,
      rowCount: rows.length,
      instituteCount: institutes.length,
      uniqueInstitutes: new Set(institutes.map((i) => i.globalKey)).size,
      gradeBands: GRADE_BANDS.map((b) => ({ label: b.label, min: Number.isFinite(b.min) ? b.min : 0 })),
    },
    categories: CATEGORIES,
    programs,
    tradeNames,
    crossProgramIssues: crossIssues,
    rows,
    institutes,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(portfolio));

  const s = (n) => n.toLocaleString("en-US");
  const sumK = (a, k) => a.reduce((t, x) => t + (x[k] ?? 0), 0);
  console.log("\nNAVTTC portfolio built");
  console.log("─".repeat(96));
  console.log("  programme".padEnd(18) + "rows".padStart(6) + "inst".padStart(6) + "capacity".padStart(10) + "enrolled".padStart(10) +
    "present".padStart(9) + "verified".padStart(10) + "mean".padStart(8) + "issues H/M/L".padStart(16));
  for (const p of programs) {
    const pr = rows.filter((r) => r.p === p.slug);
    const pi = institutes.filter((i) => i.p === p.slug && i.score !== null);
    const mean = pi.reduce((t, i) => t + i.score, 0) / (pi.length || 1);
    const q = p.quality.bySeverity;
    console.log("  " + p.short.padEnd(16) + s(pr.length).padStart(6) + s(p.instituteCount).padStart(6) + s(sumK(pr, "approvedCapacity")).padStart(10) +
      s(sumK(pr, "enrolled")).padStart(10) + s(sumK(pr, "present")).padStart(9) + s(sumK(pr, "cnicVerified")).padStart(10) +
      mean.toFixed(2).padStart(8) + `${q.high}/${q.medium}/${q.low}`.padStart(16));
  }
  console.log("─".repeat(96));
  console.log(`  ${s(rows.length)} rows · ${s(institutes.length)} programme-institutes · ${s(portfolio.meta.uniqueInstitutes)} unique institutes · ${crossIssues.length} cross-programme ID conflicts`);
  console.log(`  → ${OUT} (${(JSON.stringify(portfolio).length / 1024 / 1024).toFixed(2)} MB)\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
