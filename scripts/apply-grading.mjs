/**
 * Regrade a NAVTTC workbook.
 * ---------------------------
 * Rewrites the last column (AK, `Grading`) from the second-to-last column
 * (AJ, `Total Score`) using the official band table:
 *
 *      0 – 49    Poor
 *     50 – 59    Average
 *     60 – 69    Good
 *     70 – 79    Very Good
 *     80 +       Excellent
 *
 * Bands are applied as half-open intervals so no score can fall between two of
 * them: 49.6 is Poor, 59.9 is Average, exactly 80 is Excellent.
 *
 * Assessor commentary is NOT discarded. Where the original Grading cell carried
 * a written observation ("Institute was closed in 2nd visit"), that text is
 * preserved on a second line beneath the new grade, matching the convention the
 * workbook already uses. Those notes are field observations, not score bands,
 * and they are the most valuable qualitative content in the file.
 *
 * Note on merged cells: in this workbook both AJ and AK are vertically merged
 * across each institute's block of trade rows. ExcelJS propagates a merged
 * value to every cell in the range, so a naive pass would appear to see 688
 * scored rows instead of 184 and would write into slave cells, which Excel
 * discards or treats as a corrupt merge. Only the master cell of each merge is
 * written.
 *
 * Usage:
 *   node scripts/apply-grading.mjs <input.xlsx> [output.xlsx]
 *
 * With no output path the input is rewritten in place.
 */

import ExcelJS from "exceljs";
import { resolve } from "node:path";

const SHEET = "Combined Sheet";
const COL_TOTAL_SCORE = 36; // AJ, 1-indexed for ExcelJS
const COL_GRADING = 37;     // AK

/** Official band table. Ordered high to low; first match wins. */
export const BANDS = [
  { min: 80, label: "Excellent" },
  { min: 70, label: "Very Good" },
  { min: 60, label: "Good" },
  { min: 50, label: "Average" },
  { min: -Infinity, label: "Poor" },
];

export function gradeFor(score) {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  return BANDS.find((b) => score >= b.min).label;
}

/** Unwrap an ExcelJS cell to a literal, preferring the cached formula result. */
function literal(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if ("result" in v) return v.result ?? null;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
  }
  return v;
}

/**
 * Pull the assessor's written observation out of an existing Grading cell.
 * Returns null when the cell held nothing but a grade word.
 */
function extractNote(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const GRADE_WORDS = /^(excellent|very good|good|average|poor|critical|critical\s*\/\s*poor|non\s*fun\w*(\s*trade)?)$/i;

  const kept = lines.filter((l) => !GRADE_WORDS.test(l));
  if (!kept.length) {
    // The whole cell was grade words — but "Non Functional" / "No classes"
    // carry meaning a score band cannot express, so keep those verbatim.
    if (/^non\s*fun|^no classes/i.test(text)) return text.replace(/\n/g, " ");
    return null;
  }
  return kept.join(" ");
}

async function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath) {
    console.error("usage: node scripts/apply-grading.mjs <input.xlsx> [output.xlsx]");
    process.exit(1);
  }
  const src = resolve(inPath);
  const dest = resolve(outPath ?? inPath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(src);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`Sheet "${SHEET}" not found. Found: ${wb.worksheets.map((w) => w.name).join(", ")}`);

  const counts = {};
  const changes = [];
  let notesKept = 0;
  let orphanGrades = 0;

  let skippedSlaves = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const gradingCell = row.getCell(COL_GRADING);

    // Only the master cell of a vertical merge is writable; the rest mirror it.
    if (gradingCell.isMerged && gradingCell.master && gradingCell.master.address !== gradingCell.address) {
      skippedSlaves++;
      continue;
    }

    const score = literal(row.getCell(COL_TOTAL_SCORE));
    const before = literal(gradingCell);

    if (typeof score !== "number") {
      // No institute-level score on this row. A grade here has nothing to rest
      // on, so it is reported rather than invented.
      if (before !== null && String(before).trim() !== "") {
        orphanGrades++;
        console.warn(`  row ${r}: grading present but no Total Score — left untouched (${String(before).split("\n")[0]})`);
      }
      continue;
    }

    const grade = gradeFor(score);
    const note = extractNote(before);
    const value = note ? `${grade}\n${note}` : grade;
    if (note) notesKept++;

    counts[grade] = (counts[grade] ?? 0) + 1;

    const beforeGrade = before === null ? "—" : String(before).split("\n")[0].trim();
    if (beforeGrade !== grade) changes.push({ row: r, score, from: beforeGrade, to: grade });

    gradingCell.value = value;
    gradingCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }

  await wb.xlsx.writeFile(dest);

  console.log("\nGrading rebuilt from Total Score");
  console.log("─".repeat(58));
  for (const b of BANDS) {
    const range = b.min === -Infinity ? "0 – 49" : b.min === 80 ? "80 +" : `${b.min} – ${b.min + 9}`;
    console.log(`  ${b.label.padEnd(10)} ${range.padStart(8)}   ${String(counts[b.label] ?? 0).padStart(4)}`);
  }
  console.log("─".repeat(58));
  console.log(`  institutes graded  ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
  console.log(`  merged rows mirrored ${skippedSlaves}`);
  console.log(`  grades changed     ${changes.length}`);
  console.log(`  assessor notes kept ${notesKept}`);
  if (orphanGrades) console.log(`  grading without a score ${orphanGrades} (left as-is)`);
  console.log(`  → ${dest}\n`);

  if (changes.length) {
    console.log("Changed grades:");
    for (const c of changes.slice(0, 40)) {
      console.log(`  row ${String(c.row).padStart(3)}  score ${c.score.toFixed(2).padStart(6)}   ${c.from}  →  ${c.to}`);
    }
    if (changes.length > 40) console.log(`  … and ${changes.length - 40} more`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
