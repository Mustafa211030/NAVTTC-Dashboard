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
import { PROGRAMS, RUBRICS, CATEGORIES, ATTENDANCE_RULES, GRADE_BANDS, DISTRICT_ALIASES, MERGED_SOURCES, TRADE_ALIASES, INSTITUTE_LINKS, INSTITUTE_NAME_FIXES } from "./programs.config.mjs";

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
const str = (v) => (v === null || v === undefined ? null : String(v).replace(/[\s\uFFFD]+/g, " ").trim() || null);
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
    const tradeNameRaw = String(get(COL.tradeName) ?? "").replace(/[\s\uFFFD]+/g, " ");
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
      tradeScore,          // official score (after any NAVTTC penalty)
      rubricScore: tradeScore, // Σ criteria, before penalty
      vttScore: null,
      penaltyPct: null,
      penaltyReason: null,
      tradeScoreStored,
      extra: extraOut,
    });
  }

  /* ---- NAVTTC penalties from the programme-wise VTT report ---- */
  const supplement = cfg.penalties ? await applyPenaltiesAsync(cfg, rows, flag) : null;

  /* ---- identity and duplicate clean-up (reported, never silent) ---- */
  harmoniseInstituteNames(rows, flag);
  removeDuplicateRows(rows, flag);

  const institutes = aggregateInstitutes(cfg, rows, instMeta, components, categories, flag);

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
      supplementarySource: supplement?.reportLabel ?? null,
      reportDate: supplement?.reportDate ?? null,
      hasPenalties: Boolean(supplement),
      packageName: null,
      sheet: SHEET,
      columnCount: headers.filter(Boolean).length,
      headers: headers.filter(Boolean),
      extras: Object.keys(extraCols),
      notes: supplement ? [...notes, `Final scores include NAVTTC penalties from ${supplement.reportLabel} (${supplement.reportDate}). The 16-criterion breakdown is from this workbook; where the report re-scored a trade, the report's score is used and the change is listed under Data Quality.`] : notes,
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


/* ------------------------------------------------------------------ merged programme-wise report */

/**
 * The programme-wise VTT report: ONE sheet, many programmes (Package column),
 * nine summary score columns, the VTT score, the NAVTTC penalty and the final
 * penalty score. Read once, shared by every programme that points at it.
 */
const mergedCache = new Map();
async function loadMerged(key) {
  if (mergedCache.has(key)) return mergedCache.get(key);
  const src = MERGED_SOURCES[key];
  if (!src) throw new Error(`Unknown merged source "${key}"`);
  const file = resolve(ROOT, src.file);
  if (!existsSync(file)) throw new Error(`Missing merged workbook: ${file}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(src.sheet);
  if (!ws) throw new Error(`${key}: sheet "${src.sheet}" not found. Sheets: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i - 1] = normHeader(cellValue(c)); });
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const vals = headers.map((_, i) => cellValue(row.getCell(i + 1)));
    if (vals.every((v) => v === null || v === "")) continue;
    rows.push({ excelRow: r, vals });
  }
  const col = (re) => headers.findIndex((h) => h && re.test(h));
  const out = { src, headers, rows, col };
  mergedCache.set(key, out);
  return out;
}

const MCOL = {
  package: /^Package$/i, region: /^Region$/i, instituteName: /^Institute Name$/i, tspId: /^TSP ID$/i,
  trade: /^Trade$/i, instituteTradeId: /^Institute Trade ID$/i, batch: /^Batch$/i,
  vtt: /^VTT Score$/i, final: /^NAVTTC Penalty score$/i, penaltyPct: /^Penalty Percent$/i, penaltyReason: /^Penalty Reason$/i,
  attPct: /^CNIC Verified Attendance %$/i, cnic: /^CNIC Verified$/i, capacity: /^Approved Capacity$/i,
  reported: /^Reported Candidates$/i, absent: /^Absent Candidates$/i, dropped: /^Dropped Out$/i,
};
function mergedColumns(m, slugForErrors) {
  const c = {};
  for (const [k, re] of Object.entries(MCOL)) {
    c[k] = m.col(re);
    if (c[k] < 0 && k !== "penaltyReason") throw new Error(`${slugForErrors}: column ${re} not found in ${m.src.label}`);
  }
  return c;
}
const num = (v) => (v === null || v === undefined || v === "" ? null : typeof v === "number" ? v : Number.isFinite(Number(String(v).trim())) ? Number(String(v).trim()) : null);
const batchNo = (v) => {
  const t = String(v ?? "").replace(/^batch\s*/i, "").trim().toUpperCase();
  return ({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 })[t] ?? (Number.isInteger(Number(t)) && t !== "" ? Number(t) : null);
};

/** A programme whose only source is a package inside the merged report. */
async function ingestMerged(cfg, registry) {
  const m = await loadMerged(cfg.source);
  const C = mergedColumns(m, cfg.slug);
  const rubric = RUBRICS[cfg.rubric];
  if (!rubric) throw new Error(`Unknown rubric "${cfg.rubric}" for ${cfg.slug}`);
  const attRule = ATTENDANCE_RULES[cfg.attendance];

  const issues = [];
  const flag = (severity, code, message, row = null, detail = null) => issues.push({ severity, code, message, row, detail });

  const components = rubric.components.map((c) => {
    const col = m.headers.findIndex((h) => h && c.match.test(h));
    if (col < 0) throw new Error(`${cfg.slug}: rubric component "${c.label}" has no matching column`);
    return { ...c, col };
  });
  const usedCols = new Set(components.map((c) => c.col));
  const categories = CATEGORIES.map((cat) => {
    const members = components.filter((c) => c.cat === cat.key).map((c) => c.key);
    return { ...cat, members, max: round(components.filter((c) => c.cat === cat.key).reduce((s, c) => s + c.max, 0), 4) };
  });
  const scoreCols = Object.values(RUBRICS["vtt-special"].components).map((c) => m.headers.findIndex((h) => h && c.match.test(h)));
  const unusedScoreCols = scoreCols.filter((i) => i >= 0 && !usedCols.has(i));

  const mine = m.rows.filter((r) => str(r.vals[C.package]) === cfg.package);
  if (!mine.length) throw new Error(`${cfg.slug}: no rows with Package "${cfg.package}"`);

  // One display name per TSP ID: the report sometimes appends ", <city>".
  const names = new Map();
  for (const r of mine) {
    const id = str(r.vals[C.tspId]);
    if (!names.has(id)) names.set(id, new Map());
    const n = str(r.vals[C.instituteName]);
    names.get(id).set(n, (names.get(id).get(n) ?? 0) + 1);
  }
  const canonName = new Map();
  for (const [id, ns] of names) {
    const list = [...ns.keys()].sort((a, b) => a.length - b.length);
    const base = list[0];
    const prefixOnly = list.every((n) => norm(n).startsWith(norm(base)));
    canonName.set(id, base);
    if (list.length > 1)
      flag(prefixOnly ? "low" : "high", prefixOnly ? "NAME_SUFFIX_VARIANTS" : "AMBIGUOUS_INSTITUTE",
        prefixOnly ? `TSP ${id} recorded with and without a location suffix` : `TSP ${id} carries ${list.length} different names`, null, list.join(" | "));
  }

  const rows = [];
  const instMeta = new Map();
  let attAdjusted = 0;
  const seen = new Map();
  for (const r of mine) {
    const v = (i) => (i < 0 ? null : r.vals[i]);
    const rowNo = r.excelRow;
    const tsp = str(v(C.tspId));
    const instituteId = num(tsp);
    const name = canonName.get(tsp) ?? str(v(C.instituteName));
    const vtt = num(v(C.vtt));
    const final = num(v(C.final));
    const pct = num(v(C.penaltyPct)) ?? 0;

    const comp = {};
    for (const c of components) comp[c.key] = num(v(c.col)) ?? 0;
    for (const i of unusedScoreCols) {
      const x = num(v(i));
      if (x) flag("medium", "UNMAPPED_SCORE_VALUE", `${m.headers[i]} has a value but is not part of the ${cfg.rubric} rubric`, rowNo, String(x));
    }
    if (rubric.attendanceFromTotal && vtt !== null) {
      // Attendance column runs 5 above its share of the VTT score on most rows.
      const others = components.filter((c) => c.key !== "attendance").reduce((s, c) => s + comp[c.key], 0);
      const derived = round(vtt - others, 4);
      if (Math.abs(derived - comp.attendance) > 0.011) attAdjusted++;
      comp.attendance = derived;
    }
    for (const c of components) {
      if (comp[c.key] > c.max + 0.011) flag("medium", "COMPONENT_OVER_MAX", `${c.label} exceeds its maximum of ${c.max}`, rowNo, String(comp[c.key]));
      if (comp[c.key] < -0.011) flag("high", "COMPONENT_NEGATIVE", `${c.label} is negative`, rowNo, String(comp[c.key]));
    }
    const rubricScore = round(components.reduce((s, c) => s + comp[c.key], 0), 4);
    if (vtt !== null && Math.abs(rubricScore - vtt) > 0.011)
      flag("medium", "VTT_SCORE_MISMATCH", "VTT Score differs from the sum of its criteria", rowNo, `VTT ${vtt} vs Σ ${rubricScore}`);
    if (vtt !== null && final !== null && Math.abs(vtt * (1 - pct / 100) - final) > 0.05)
      flag("high", "PENALTY_MISMATCH", "NAVTTC penalty score ≠ VTT × (1 − penalty %)", rowNo, `${vtt} × ${(1 - pct / 100).toFixed(2)} vs ${final}`);
    const tradeScore = final ?? vtt;

    const approvedCapacity = num(v(C.capacity)) ?? 0;
    const enrolled = num(v(C.reported)) ?? 0;
    const absent = num(v(C.absent)) ?? 0;
    const present = Math.max(enrolled - absent, 0);
    const droppedOut = num(v(C.dropped)) ?? 0;
    const cnicVerified = num(v(C.cnic)) ?? 0;
    const h = { approvedCapacity, enrolled, droppedOut, present, absent, cnicVerified };
    if (enrolled > approvedCapacity && approvedCapacity > 0) flag("high", "OVER_CAPACITY", "Reported candidates exceed Approved Capacity", rowNo, `${enrolled} > ${approvedCapacity}`);
    if (cnicVerified > present && cnicVerified > 0) flag("medium", "VERIFIED_EXCEEDS_PRESENT", "CNIC Verified exceeds candidates present (reported − absent)", rowNo, `${cnicVerified} > ${present}`);
    const attNum = h[attRule.num], attDen = h[attRule.den];
    const attendanceRate = rate(attNum, attDen);
    const attStored = num(v(C.attPct));
    const attendanceReported = attStored === null ? null : round(attStored / 100, 6);
    if (attendanceRate !== null && attendanceReported !== null && Math.abs(attendanceRate - attendanceReported) > 0.0051)
      flag("low", "ATTENDANCE_PCT_MISMATCH", `Stored CNIC Verified Attendance % differs from ${attRule.label}`, rowNo, `stored ${attStored}% vs ${(attendanceRate * 100).toFixed(1)}%`);

    // Location: the report's Region is the monitoring office (ICT office covers
    // GB and AJK) and there is no district, so known institutes keep the
    // region and district recorded in the earlier programme workbooks.
    const office = str(v(C.region));
    const loc = instituteId !== null ? registry.get(instituteId) : null;
    if (!loc) flag("low", "LOCATION_FROM_OFFICE", "Institute not in earlier programmes — region taken from the monitoring office, district not recorded", rowNo, `${name} · office ${office ?? "—"}`);
    const region = loc?.region ?? (office ? office.toUpperCase() : "NOT RECORDED");
    const district = loc?.district ?? "Not recorded";

    const batch = batchNo(v(C.batch));
    const tradeNameRaw = String(v(C.trade) ?? "").replace(/[\s\uFFFD]+/g, " ").trim();
    const itid = str(v(C.instituteTradeId));
    const dupKey = `${itid}|${batch}`;
    if (seen.has(dupKey)) flag("medium", "DUPLICATE_ROW", "Same Institute Trade ID and batch appear twice", rowNo, `also row ${seen.get(dupKey)} · ${tradeNameRaw}`);
    else seen.set(dupKey, rowNo);

    const instituteKey = instituteId !== null ? String(instituteId) : `n-${slug(name)}`;
    if (!instMeta.has(instituteKey)) instMeta.set(instituteKey, { totals: [], grading: null, remarks: null, override: null, firstRow: rowNo });

    const categoryScores = {}, categoryPct = {};
    for (const cat of categories) {
      if (!cat.members.length) { categoryScores[cat.key] = null; categoryPct[cat.key] = null; continue; }
      const sc = round(cat.members.reduce((a, k) => a + comp[k], 0), 4);
      categoryScores[cat.key] = sc;
      categoryPct[cat.key] = round(sc / cat.max, 5);
    }

    rows.push({
      id: `${cfg.slug}:${rowNo}`, p: cfg.slug, excelRow: rowNo,
      package: null, programName: cfg.name,
      region, district, division: null, tehsil: null,
      instituteId, instituteKey, instituteName: name,
      tradeNameRaw, tradeName: null, tradeCode: null, tradeKey: null, tradeNorm: null,
      tradeCategory: null, tradeSector: null, durationMonths: null, visitDate: null, release: null,
      batch, batchRaw: str(v(C.batch)),
      approvedCapacity, enrolled, droppedOut, present, absent, cnicVerified,
      attNum, attDen, attendanceRate,
      presenceRate: rate(present, enrolled),
      verificationRate: rate(cnicVerified, approvedCapacity),
      dropoutRate: rate(droppedOut, enrolled),
      utilizationRate: rate(enrolled, approvedCapacity),
      attendanceReported,
      scored: vtt !== null,
      components: comp, categoryScores, categoryPct,
      tradeScore, rubricScore, vttScore: vtt, penaltyPct: pct, penaltyReason: str(v(C.penaltyReason)),
      tradeScoreStored: vtt,
      extra: { instituteTradeId: itid, monitoringOffice: office },
    });
  }
  harmoniseInstituteNames(rows, flag);
  removeDuplicateRows(rows, flag);
  if (attAdjusted)
    flag("low", "ATTENDANCE_FROM_VTT", `Attendance taken as VTT − other criteria on ${attAdjusted} row${attAdjusted === 1 ? "" : "s"} (the report's Attendance column runs 5 points above its share of the VTT score)`, null, `${attAdjusted} of ${rows.length} rows`);

  const institutes = aggregateInstitutes(cfg, rows, instMeta, components, categories, flag);

  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byCode = {};
  for (const i of issues) { bySeverity[i.severity]++; byCode[i.code] = (byCode[i.code] ?? 0) + 1; }
  const usedHeaders = [...Object.values(C).filter((i) => i >= 0), ...components.map((c) => c.col)];
  let cells = 0, filled = 0;
  for (const r of mine) for (const i of usedHeaders) { cells++; if (r.vals[i] !== null && r.vals[i] !== "") filled++; }

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
      enrolledLabel: "Reported candidates",
      assessmentDate: cfg.assessmentDate ?? null,
      reportDate: m.src.reportDate ?? null,
      period: null,
      hasVisitDates: false,
      hasPenalties: true,
      sourceFile: m.src.label,
      sheet: m.src.sheet,
      packageName: cfg.package,
      columnCount: m.headers.filter(Boolean).length,
      headers: m.headers.filter(Boolean),
      extras: ["instituteTradeId", "monitoringOffice"],
      notes: [
        `Package "${cfg.package}" from the programme-wise VTT report dated ${m.src.reportDate}.`,
        "Official score = NAVTTC penalty score (VTT score less the stated penalty %). Grades, ranks and means use it; the VTT score is kept alongside.",
        "Criterion maxima are inferred from the report data and the VTT totals — the report ships without a Scoring Criteria sheet.",
        rubric.attendanceFromTotal ? "Attendance is taken as VTT score − the other criteria: the report's Attendance column runs 5 points above that on most rows." : "The nine criteria columns sum exactly to the VTT score.",
        "Present = Reported candidates − Absent candidates. Region and district come from the institute's earlier programme records where the TSP ID matches; otherwise the monitoring office region is used.",
      ],
      rowCount: rows.length,
      instituteCount: institutes.length,
      quality: {
        totals: { rows: rows.length, institutes: institutes.length, cells, filledCells: filled, completeness: cells ? round(filled / cells, 4) : 1, issues: issues.length, repairs: 0, changeLog: 0 },
        bySeverity, byCode, repairs: [], issues, changeLog: [],
      },
    },
    rows,
    institutes,
  };
}

/**
 * Attach the VTT report's score, penalty and final NAVTTC score to the rows of
 * a template workbook that already has criterion-level detail (PMYSDP B-III).
 * Rows are matched on Institute ID + trade + batch, falling back to ID + trade.
 */
async function applyPenaltiesAsync(cfg, rows, flag) {
  const m = await loadMerged(cfg.penalties.source);
  const C = mergedColumns(m, cfg.slug);
  const mine = m.rows.filter((r) => str(r.vals[C.package]) === cfg.penalties.package);
  const key3 = (id, t, b) => `${id}|${norm(t)}|${b}`;
  const key2 = (id, t) => `${id}|${norm(t)}`;
  const by3 = new Map(), by2 = new Map();
  for (const r of mine) {
    const id = num(r.vals[C.tspId]), t = r.vals[C.trade], b = batchNo(r.vals[C.batch]);
    for (const [map, k] of [[by3, key3(id, t, b)], [by2, key2(id, t)]]) { if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
  }
  const used = new Set();
  const take = (list) => list?.find((r) => !used.has(r));
  let matched = 0, changed = 0, batchFixed = 0;
  for (const row of rows) {
    const hit = take(by3.get(key3(row.instituteId, row.tradeNameRaw, row.batch))) ?? take(by2.get(key2(row.instituteId, row.tradeNameRaw)));
    if (!hit) { flag("low", "NOT_IN_VTT_REPORT", "Trade row not found in the programme-wise VTT report — no penalty data, criteria sum used", row.excelRow, `${row.instituteName} · ${row.tradeNameRaw}`); continue; }
    used.add(hit);
    matched++;
    const vtt = num(hit.vals[C.vtt]), final = num(hit.vals[C.final]), pct = num(hit.vals[C.penaltyPct]) ?? 0;
    // The workbook records most B-III classes as batch 1; the report numbers
    // them (Batch I / II / III), which is what tells two classes apart.
    const rb = batchNo(hit.vals[C.batch]);
    if (rb !== null && rb !== row.batch) { batchFixed++; row.batch = rb; }
    row.vttScore = vtt;
    row.penaltyPct = pct;
    row.penaltyReason = str(hit.vals[C.penaltyReason]);
    row.extra = { ...row.extra, instituteTradeId: str(hit.vals[C.instituteTradeId]), vttReportRow: hit.excelRow };
    if (row.scored && final !== null) row.tradeScore = final;
    if (row.scored && vtt !== null && row.rubricScore !== null && Math.abs(vtt - row.rubricScore) > 0.011) {
      changed++;
      flag("medium", "SCORE_UPDATED", "VTT report re-scores this trade — the final score follows the report", row.excelRow,
        `${row.instituteName} · ${row.tradeNameRaw}: criteria ${row.rubricScore.toFixed(2)} → VTT ${vtt.toFixed(2)}${pct ? ` → final ${final?.toFixed(2)} (−${pct}%)` : ""}`);
    }
  }
  for (const r of mine) if (!used.has(r))
    flag("medium", "VTT_ROW_NOT_IN_WORKBOOK", "Row in the VTT report has no match in this programme's workbook — not added", null,
      `report row ${r.excelRow}: ${str(r.vals[C.instituteName])} · ${str(r.vals[C.trade])} · ${str(r.vals[C.batch])} · VTT ${num(r.vals[C.vtt])}`);
  flag("low", "VTT_REPORT_MERGED", `Penalties and updated scores merged from ${m.src.label}`, null, `${matched} of ${rows.length} rows matched · ${changed} re-scored`);
  if (batchFixed) flag("low", "BATCH_FROM_REPORT", `Batch number taken from the VTT report on ${batchFixed} row${batchFixed === 1 ? "" : "s"}`, null, "The workbook's Batches column records most classes as 1; the report distinguishes Batch I / II / III.");
  return { reportLabel: m.src.label, reportDate: m.src.reportDate ?? null };
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


/* ------------------------------------------------------------------ identity clean-up */

/**
 * One name per institute within a programme. A workbook occasionally carries
 * a different (or corrupted) name on one row of an institute — e.g. text from
 * neighbouring cells pasted into the name, or another institute's name on a
 * row whose ID is right. The name used on most of the ID's rows wins.
 */
function harmoniseInstituteNames(rows, flag) {
  const byKey = new Map();
  for (const r of rows) {
    if (r.instituteId === null) continue;
    if (!byKey.has(r.instituteKey)) byKey.set(r.instituteKey, new Map());
    const m = byKey.get(r.instituteKey);
    m.set(r.instituteName, (m.get(r.instituteName) ?? 0) + 1);
  }
  for (const [key, m] of byKey) {
    if (m.size < 2) continue;
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    const winner = ranked[0][0];
    const changed = rows.filter((r) => r.instituteKey === key && r.instituteName !== winner);
    for (const r of changed) r.instituteName = winner;
    flag("medium", "INSTITUTE_NAME_CORRECTED", `Institute ID ${key}: ${changed.length} row${changed.length === 1 ? "" : "s"} carried a different name — the name on the ID's other rows is used`,
      changed[0].excelRow, `${ranked.slice(1).map(([n]) => `"${n.slice(0, 90)}"`).join(", ")} → "${winner}" (rows ${changed.map((r) => r.excelRow).join(", ")})`);
  }
}

/**
 * The same class recorded twice: same institute, trade and batch with the
 * same capacity, enrolment, present, absent and dropped-out counts. The first
 * row is kept; later copies are removed from every total and listed.
 */
function removeDuplicateRows(rows, flag) {
  const seen = new Map();
  const drop = new Set();
  for (const r of rows) {
    const k = [r.instituteKey, norm(r.tradeNameRaw), r.batch, r.approvedCapacity, r.enrolled, r.present, r.absent, r.droppedOut].join("|");
    if (!seen.has(k)) { seen.set(k, r); continue; }
    const first = seen.get(k);
    const diff = ["cnicVerified", "tradeScore"].filter((f) => first[f] !== r[f]).map((f) => `${f} ${first[f]} vs ${r[f]}`);
    drop.add(r);
    flag("medium", "DUPLICATE_ROW_REMOVED", "Duplicate of an earlier row (same institute, trade, batch and headcounts) — removed from all totals", r.excelRow,
      `${r.instituteName} · ${r.tradeNameRaw} · batch ${r.batch ?? "—"} · duplicate of row ${first.excelRow}${diff.length ? ` (differs only in ${diff.join("; ")})` : " (identical)"}`);
  }
  if (!drop.size) return 0;
  const keep = rows.filter((r) => !drop.has(r));
  rows.length = 0;
  rows.push(...keep);
  return drop.size;
}

/* ------------------------------------------------------------------ shared aggregation */

/**
 * Trade canonicalisation and institute roll-up, shared by the template
 * workbooks and the merged programme-wise report.
 */
function aggregateInstitutes(cfg, rows, instMeta, components, categories, flag) {
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
  const aliased = new Map();
  for (const row of rows) {
    const name = canonical.get(row.tradeKey) || "(unnamed trade)";
    const alias = TRADE_ALIASES[norm(name)];
    if (alias && alias !== name) aliased.set(name, alias);
    row.tradeName = alias ?? name;
    row.tradeNorm = norm(row.tradeName);
  }
  for (const [from, to] of aliased)
    flag("low", "TRADE_NAME_HARMONISED", `Trade "${from}" shown as "${to}" (same trade, different spelling across programmes)`, null, `${from} → ${to}`);

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
    // The workbook's own total and grade are checked against the criteria sum,
    // not the post-penalty score — the workbook predates the penalties.
    const rubricMean = scoredRows.length ? round(scoredRows.reduce((s, x) => s + x.rubricScore, 0) / scoredRows.length, 4) : null;
    const hasVtt = scoredRows.some((x) => x.vttScore !== null);
    const vttMean = hasVtt ? round(scoredRows.reduce((s, x) => s + (x.vttScore ?? x.rubricScore), 0) / scoredRows.length, 4) : null;
    const penalisedTrades = g.filter((x) => (x.penaltyPct ?? 0) > 0).length;
    if (stored !== null && rubricMean !== null && Math.abs(stored - rubricMean) > 0.01)
      flag("high", "TOTAL_SCORE_MISMATCH", `Stored Total Score for institute ${key} disagrees with the mean of its trade scores`, im.firstRow, `stored ${stored.toFixed(2)} vs computed ${rubricMean.toFixed(2)}`);

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
    const rubricBand = bandOf(rubricMean);
    if (!override && gradeReported && rubricBand && gradeReported !== rubricBand && !["Critical", "Non-Functional"].includes(gradeReported))
      flag("medium", "GRADE_MISMATCH", `Workbook grade "${gradeReported}" disagrees with score band "${rubricBand}"`, im.firstRow, `institute ${key}, score ${rubricMean?.toFixed(2)}`);

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
      vttScore: vttMean,
      penaltyPoints: vttMean !== null && score !== null ? round(vttMean - score, 4) : null,
      penalisedTrades,
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
  return institutes;
}

/* ------------------------------------------------------------------ portfolio */

async function main() {
  const programs = [];
  const rows = [];
  const institutes = [];
  // Template workbooks first: they carry region and district, which the
  // merged report does not. The registry maps Institute ID → latest location.
  const ordered = [...PROGRAMS].sort((a, b) => (a.source ? 1 : 0) - (b.source ? 1 : 0) || a.order - b.order);
  const registry = new Map();
  for (const cfg of ordered) {
    const out = cfg.source ? await ingestMerged(cfg, registry) : await ingestProgram(cfg);
    if (!cfg.source) for (const i of out.institutes) if (i.instituteId !== null && i.district) registry.set(i.instituteId, { region: i.region, district: i.district });
    programs.push(out.program);
    rows.push(...out.rows.map(({ categoryScores, ...keep }) => keep));
    institutes.push(...out.institutes);
  }
  programs.sort((a, b) => a.order - b.order);

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
      // Attach a name-only institute to an ID'd one: an explicit link for known
      // spelling differences, else an exact normalised-name match.
      const linked = INSTITUTE_LINKS[norm(i.instituteName)];
      const match = linked !== undefined ? { instituteId: linked } : institutes.find((x) => x.instituteId !== null && x.p !== i.p && nameKey(x) === nameKey(i));
      i.globalKey = match ? `id-${match.instituteId}` : `nm-${slug(i.instituteName)}`;
    }
  }
  const instGlobal = new Map(institutes.map((i) => [`${i.p}|${i.instituteKey}`, i.globalKey]));
  for (const r of rows) r.globalKey = instGlobal.get(`${r.p}|${r.instituteKey}`);

  /* ---- one spelling per institute across programmes ----
   * The same Institute ID spelled slightly differently in different workbooks
   * ("ALI COLLAGE" / "ALI COLLEGE", ", Multan City" suffixes) is shown under
   * one name everywhere. Genuinely different names under one ID (a rebrand,
   * or a possible ID error) are left as recorded and listed for review. */
  const lev = (a, b) => {
    const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i2 = 1; i2 <= m; i2++) { const cur = [i2]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i2 - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  };
  /** Name with company suffixes, "M/s" and a trailing ", <place>" removed, then normalised. */
  const core = (n) => {
    let t = String(n).toLowerCase();
    const parts = t.split(",");
    if (parts.length > 1 && parts.slice(1).join(" ").trim().split(/\s+/).length <= 3) t = parts[0];
    t = t.replace(/\bm\/s\b/g, " ").replace(/\((pvt|private|smc-pvt)\)/g, " ").replace(/\b(pvt|private|ltd|limited|smc)\b\.?/g, " ");
    return norm(t);
  };
  const similar = (a, b) => {
    const x = core(a), y = core(b);
    if (!x || !y) return false;
    return x === y || (Math.min(x.length, y.length) >= 12 && (x.startsWith(y) || y.startsWith(x))) || lev(x, y) / Math.max(x.length, y.length) <= 0.2;
  };
  const nameHarmonised = [];
  const groups = new Map();
  for (const r of rows) {
    if (!r.globalKey?.startsWith("id-")) continue;
    if (!groups.has(r.globalKey)) groups.set(r.globalKey, new Map());
    const m = groups.get(r.globalKey);
    const e = m.get(r.instituteName) ?? { n: 0, wb: 0, order: 0, progs: new Set() };
    const cfgP = PROGRAMS.find((x) => x.slug === r.p);
    // Spellings from a programme's own workbook, on rows that carry an ID, outrank
    // the merged report and name-only rows when choosing the display name.
    if (!cfgP?.source && r.instituteId !== null) e.wb++;
    if (r.instituteId !== null) e.n++;
    e.order = Math.max(e.order, cfgP?.order ?? 0); e.progs.add(r.p);
    m.set(r.instituteName, e);
  }
  for (const [gk, m] of groups) {
    if (m.size < 2) continue;
    // Most-used spelling first (latest programme breaks ties), then prefer a
    // variant that is the same name without a trailing ", <place>" suffix.
    const ranked = [...m.entries()].sort((a, b) => b[1].wb - a[1].wb || b[1].n - a[1].n || b[1].order - a[1].order);
    let canon = ranked[0][0];
    const family = ranked.filter(([n]) => similar(n, canon)).map(([n]) => n);
    const bare = family.filter((n) => !/,\s*[^,]{1,30}$/.test(n) || !family.some((o) => o !== n && n.startsWith(o)));
    const noSuffix = family.find((n) => family.some((o) => o !== n && o.startsWith(n + ",")) || family.some((o) => o !== n && o.startsWith(n + " ,")));
    if (noSuffix) canon = noSuffix; else if (bare.length && !bare.includes(canon)) canon = bare[0];
    const variants = family.filter((n) => n !== canon);
    if (!variants.length) continue;
    for (const r of rows) if (r.globalKey === gk && variants.includes(r.instituteName)) r.instituteName = canon;
    for (const i of institutes) if (i.globalKey === gk && variants.includes(i.instituteName)) i.instituteName = canon;
    nameHarmonised.push({ key: gk, name: canon, variants, programmes: [...new Set(ranked.flatMap(([, e]) => [...e.progs]))] });
  }
  for (const [id, name] of Object.entries(INSTITUTE_NAME_FIXES)) {
    const gk = `id-${id}`;
    const before = [...new Set(rows.filter((r) => r.globalKey === gk).map((r) => r.instituteName))];
    if (!before.length) continue;
    for (const r of rows) if (r.globalKey === gk) r.instituteName = name;
    for (const i of institutes) if (i.globalKey === gk) i.instituteName = name;
    const h = nameHarmonised.find((x) => x.key === gk);
    if (h) { h.variants = [...new Set([...h.variants, h.name])].filter((v) => v !== name); h.name = name; }
    else nameHarmonised.push({ key: gk, name, variants: before.filter((v) => v !== name), programmes: [...new Set(rows.filter((r) => r.globalKey === gk).map((r) => r.p))] });
  }
  // Rebuild the ID-conflict list after harmonisation: only real name differences remain.
  crossIssues.length = 0;
  for (const [id, list] of byId) {
    const names = [...new Set(list.map((x) => x.instituteName))];
    if (names.length > 1 && new Set(list.map((x) => x.p)).size > 1 && names.some((a) => names.some((b) => !similar(a, b))))
      crossIssues.push({ id, names: [...new Set(list.map((x) => `${x.instituteName} [${x.p}]`))] });
  }

  /* ---- same name, separate Institute IDs (not merged: each ID is its own TSP contract) ---- */
  const sameName = [];
  const byDistrict = new Map();
  const distOf = new Map(institutes.map((i) => [i.instituteId, i.district]));
  for (const i of institutes) {
    if (i.instituteId === null || i.district === "Not recorded") continue;
    if (!byDistrict.has(i.district)) byDistrict.set(i.district, new Map());
    byDistrict.get(i.district).set(i.instituteId, i.instituteName);
  }
  for (const m of byDistrict.values()) {
    const ids = [...m.keys()];
    const done = new Set();
    for (const a of ids) {
      if (done.has(a)) continue;
      const place = (id, nm) => core(nm).replace(new RegExp(`${norm(distOf.get(id) ?? "")}$`), "");
      const ka = place(a, m.get(a));
      const grp = ids.filter((b) => b === a || (!done.has(b) && (ka === place(b, m.get(b)) || lev(ka, place(b, m.get(b))) <= 2)));
      if (grp.length > 1) { grp.forEach((g) => done.add(g)); sameName.push({ ids: grp, names: [...new Set(grp.map((g) => m.get(g)))] }); }
    }
  }

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
    identity: {
      nameHarmonised,
      sameNameDifferentIds: sameName,
      linkedByName: Object.entries(INSTITUTE_LINKS).map(([k, id]) => ({ name: k, id })),
    },
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
