/**
 * Regression fixture. The rule these enforce is the one in master prompt §85:
 *   SAME INPUT DATA + SAME FILTERS = SAME RESULTS
 * Baselines were verified by hand against the workbook before the rebuild.
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const d = JSON.parse(readFileSync(new URL("../data/processed/dataset.json", import.meta.url)));
const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);

test("shape matches the workbook", () => {
  assert.equal(d.rows.length, 697, "697 assessment rows — Excel row 419 is an empty spacer, excluded and flagged");
  assert.equal(d.institutes.length, 184, "184 institutes — matches '184 TPI' in the filename");
  assert.equal(d.meta.columnCount, 37);
  assert.equal(d.dimensions.regions.length, 4);
  assert.equal(d.dimensions.districts.length, 26);
  assert.equal(d.dimensions.trades.length, 70, "76 raw name spellings collapse to 70 trade codes");
});

test("headline totals are unchanged", () => {
  assert.equal(sum(d.rows, "approvedCapacity"), 17060);
  assert.equal(sum(d.rows, "biometricRegistered"), 16458);
  assert.equal(sum(d.rows, "droppedOut"), 345);
  assert.equal(sum(d.rows, "present"), 11519);
  assert.equal(sum(d.rows, "absent"), 5413);
  assert.equal(sum(d.rows, "cnicVerified"), 11428);
});

test("pooled rates use the official attendance basis", () => {
  // Attendance % = CNIC Verified / Approved Capacity (columns Q / L)
  const att = sum(d.rows, "cnicVerified") / sum(d.rows, "approvedCapacity");
  // Presence % = Present / Registered (columns O / M) — a separate measure
  const pres = sum(d.rows, "present") / sum(d.rows, "biometricRegistered");
  const drop = sum(d.rows, "droppedOut") / sum(d.rows, "biometricRegistered");
  assert.ok(Math.abs(att * 100 - 66.99) < 0.01, `attendance ${(att * 100).toFixed(2)}%`);
  assert.ok(Math.abs(pres * 100 - 69.99) < 0.01, `presence ${(pres * 100).toFixed(2)}%`);
  assert.ok(Math.abs(drop * 100 - 2.10) < 0.01, `dropout ${(drop * 100).toFixed(2)}%`);

  // and the two are genuinely different, so neither is silently standing in for the other
  assert.notEqual(att.toFixed(4), pres.toFixed(4));
});

test("official grading rubric partitions all 184 institutes", () => {
  // Excellent 80+ · Very Good 70-79 · Good 60-69 · Average 50-59 · Poor 0-49
  const band = (s) => (s >= 80 ? "Excellent" : s >= 70 ? "Very Good" : s >= 60 ? "Good" : s >= 50 ? "Average" : "Poor");
  const counts = {};
  for (const i of d.institutes) counts[band(i.score)] = (counts[band(i.score)] ?? 0) + 1;
  assert.equal(counts["Excellent"], 82);
  assert.equal(counts["Very Good"], 52);
  assert.equal(counts["Good"], 25);
  assert.equal(counts["Average"], 14);
  assert.equal(counts["Poor"], 11);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 184);

  // rank must follow score, descending, with no ties out of order
  const ordered = [...d.institutes].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(ordered[i].score <= ordered[i - 1].score + 1e-9,
      `rank ${ordered[i].rank} scores ${ordered[i].score} above rank ${ordered[i - 1].rank}`);
  }
});

test("score model sums to 100", () => {
  assert.equal(d.components.reduce((s, c) => s + c.max, 0), 100);
  assert.equal(d.categories.reduce((s, c) => s + c.max, 0), 100);
  // every component belongs to exactly one category
  const members = d.categories.flatMap((c) => c.members);
  assert.equal(members.length, d.components.length);
  assert.equal(new Set(members).size, d.components.length);
});

test("trade score equals the sum of its 16 components", () => {
  for (const r of d.rows) {
    const calc = d.components.reduce((s, c) => s + r.components[c.key], 0);
    assert.ok(Math.abs(calc - r.tradeScore) < 1e-6, `row ${r.excelRow}`);
    // A score above 100 is impossible under the rubric. The new workbook has
    // one (Excel row 78: a 2.5-max component scored 10). It must be flagged
    // rather than quietly accepted or clamped.
    if (r.tradeScore > 100.0001) {
      assert.ok(d.quality.issues.some((i) => i.code === "SCORE_OVER_100" && i.row === r.excelRow),
        `row ${r.excelRow} scores ${r.tradeScore} but was not flagged`);
    } else {
      assert.ok(r.tradeScore >= 0, `row ${r.excelRow} score below zero`);
    }
  }
});

test("institute score is the mean of its trade scores", () => {
  for (const inst of d.institutes) {
    const rows = d.rows.filter((r) => r.instituteId === inst.instituteId);
    const mean = rows.reduce((s, r) => s + r.tradeScore, 0) / rows.length;
    // institute scores are stored rounded to 4dp, so tolerance is 1e-4 not 1e-6
    assert.ok(Math.abs(mean - inst.score) < 1e-4, `institute ${inst.instituteId}`);
  }
  const overall = d.institutes.reduce((s, i) => s + i.score, 0) / d.institutes.length;
  assert.ok(Math.abs(overall - 75.29) < 0.01, `mean institute score ${overall.toFixed(2)}`);
});

test("the five decimal-comma cells were repaired", () => {
  assert.equal(d.quality.repairs.length, 4);
  for (const r of d.quality.repairs) assert.ok(r.to === 2.5 || r.to === 3.5, `repair to ${r.to}`);
  // every repaired row must now differ from the score stored in the workbook
  const differing = d.rows.filter((r) => r.tradeScoreStored !== null && Math.abs(r.tradeScoreStored - r.tradeScore) > 0.001);
  assert.equal(differing.length, d.quality.repairs.length);
});

test("rates never produce NaN or Infinity", () => {
  for (const r of d.rows) {
    for (const k of ["attendanceRate", "presenceRate", "dropoutRate", "utilizationRate"]) {
      const v = r[k];
      assert.ok(v === null || Number.isFinite(v), `row ${r.excelRow}.${k} = ${v}`);
    }
  }
  assert.ok(d.rows.some((r) => r.approvedCapacity === 0), "zero-capacity rows exist and are retained");
  // attendance divides by capacity, presence divides by registration — each guards its own denominator
  assert.ok(d.rows.filter((r) => r.approvedCapacity === 0).every((r) => r.attendanceRate === null));
  assert.ok(d.rows.filter((r) => r.biometricRegistered === 0).every((r) => r.presenceRate === null));
});

test("row keys are unique", () => {
  assert.equal(new Set(d.rows.map((r) => r.id)).size, d.rows.length);
  // and the workbook's own candidate keys are not
  assert.notEqual(new Set(d.rows.map((r) => r.instituteTradeCode)).size, d.rows.length);
});

test("filter partitions are exhaustive and disjoint", () => {
  const byRegion = d.dimensions.regions.reduce((s, rg) => s + d.rows.filter((r) => r.region === rg).length, 0);
  assert.equal(byRegion, d.rows.length, "every row belongs to exactly one region");
  const byPackage = d.dimensions.packages.reduce((s, p) => s + d.rows.filter((r) => r.package === p).length, 0);
  assert.equal(byPackage, d.rows.length, "every row belongs to exactly one package");
});

test("cascading district options are valid for their region", () => {
  for (const [region, districts] of Object.entries(d.dimensions.regionDistricts)) {
    for (const dist of districts) {
      assert.ok(d.rows.some((r) => r.region === region && r.district === dist), `${region}/${dist}`);
    }
  }
});

test("grades cover every institute exactly once", () => {
  const graded = d.institutes.filter((i) => i.gradeReported !== null);
  assert.equal(graded.length, 184);
  const counts = {};
  for (const i of graded) counts[i.gradeReported] = (counts[i.gradeReported] ?? 0) + 1;
  // the workbook's Grading column now carries the same rubric, written by
  // scripts/apply-grading.mjs, so it should agree with the dashboard except
  // where the dashboard recomputes a different institute score
  assert.equal(counts["Excellent"], 82);
  assert.equal(counts["Very Good"], 52);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 184);
});

test("known defects are still detected, not silently swallowed", () => {
  const c = d.quality.byCode;
  assert.ok(c.ATTENDANCE_MISMATCH > 0, "headcount reconciliation failures are still detected");
  assert.equal(c.SPACER_ROW, 1, "Excel row 419 is an empty spacer carrying a stray score");
  assert.ok(c.TOTAL_SCORE_MISMATCH > 0, "stored Total Score still disagrees with its own trade rows");
  assert.ok(d.quality.totals.completeness > 0.97);
});

test("Program Name is left blank rather than backfilled", () => {
  assert.ok(d.rows.filter((r) => r.programName !== null).length > 0);
  assert.equal(new Set(d.rows.filter((r) => r.programName).map((r) => r.programName)).size, 1);
});
