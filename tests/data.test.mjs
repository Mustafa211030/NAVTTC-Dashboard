/**
 * Regression fixture for the multi-programme portfolio.
 *
 *   SAME INPUT WORKBOOKS = SAME NUMBERS
 *
 * Baselines below were checked against each workbook when it was loaded.
 * When a workbook is replaced, these fail on purpose: read the diff, confirm
 * the new figures, then update the baseline for that programme only.
 *
 * Run with: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const d = JSON.parse(readFileSync(new URL("../public/data/portfolio.json", import.meta.url)));
const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
const rowsOf = (slug) => d.rows.filter((r) => r.p === slug);
const instOf = (slug) => d.institutes.filter((i) => i.p === slug);

const BASELINE = {
  "pmysdp-b1": { rows: 435, institutes: 198, capacity: 10637, enrolled: 10353, dropped: 284, present: 7967, verified: 3529, components: 11 },
  "pmysdp-b2": { rows: 863, institutes: 264, capacity: 16812, enrolled: 16638, dropped: 174, present: 11972, verified: 11218, components: 15 },
  "pmysdp-b3": { rows: 697, institutes: 184, capacity: 17060, enrolled: 16458, dropped: 345, present: 11519, verified: 11428, components: 16 },
  "cbtp-b1":   { rows: 8,   institutes: 6,   capacity: 165,   enrolled: 150,   dropped: 15,  present: 97,    verified: 97,    components: 15 },
  "cbi-b2":    { rows: 62,  institutes: 26,  capacity: 1325,  enrolled: 1306,  dropped: 25,  present: 1069,  verified: 1069,  components: 15 },
  "nsis-b2":   { rows: 12,  institutes: 10,  capacity: 300,   enrolled: 275,   dropped: 0,   present: 234,   verified: 234,   components: 15 },
};

test("every registered programme is present", () => {
  assert.deepEqual(d.programs.map((p) => p.slug).sort(), Object.keys(BASELINE).sort());
});

for (const [slug, b] of Object.entries(BASELINE)) {
  test(`${slug}: shape and headline totals`, () => {
    const rows = rowsOf(slug);
    assert.equal(rows.length, b.rows, "rows");
    assert.equal(instOf(slug).length, b.institutes, "institutes");
    assert.equal(sum(rows, "approvedCapacity"), b.capacity, "approved capacity");
    assert.equal(sum(rows, "enrolled"), b.enrolled, "enrolled");
    assert.equal(sum(rows, "droppedOut"), b.dropped, "dropped out");
    assert.equal(sum(rows, "present"), b.present, "present");
    assert.equal(sum(rows, "cnicVerified"), b.verified, "cnic verified");
  });

  test(`${slug}: rubric totals exactly 100`, () => {
    const p = d.programs.find((x) => x.slug === slug);
    assert.equal(p.rubric.components.length, b.components);
    const total = p.rubric.components.reduce((s, c) => s + c.max, 0);
    assert.ok(Math.abs(total - 100) < 1e-9, `rubric sums to ${total}`);
    const catTotal = p.rubric.categories.reduce((s, c) => s + c.max, 0);
    assert.ok(Math.abs(catTotal - 100) < 1e-9, `categories sum to ${catTotal}`);
  });

  test(`${slug}: trade score = Σ criteria on every scored row`, () => {
    const p = d.programs.find((x) => x.slug === slug);
    for (const r of rowsOf(slug).filter((x) => x.scored)) {
      const s = p.rubric.components.reduce((a, c) => a + r.components[c.key], 0);
      assert.ok(Math.abs(s - r.tradeScore) < 1e-3, `row ${r.excelRow}: ${s} vs ${r.tradeScore}`);
    }
  });

  test(`${slug}: institute score = mean of its scored trade scores`, () => {
    for (const i of instOf(slug)) {
      const rs = rowsOf(slug).filter((r) => r.instituteKey === i.instituteKey && r.scored);
      if (!rs.length) { assert.equal(i.score, null); continue; }
      const m = rs.reduce((s, r) => s + r.tradeScore, 0) / rs.length;
      assert.ok(Math.abs(m - i.score) < 1e-3, `${i.instituteKey}: ${m} vs ${i.score}`);
    }
  });
}

test("PMYSDP B-III mean institute score is unchanged from the single-programme build", () => {
  const s = instOf("pmysdp-b3");
  assert.equal((s.reduce((a, i) => a + i.score, 0) / s.length).toFixed(2), "75.29");
});

test("attendance follows each programme's own rule", () => {
  const rule = Object.fromEntries(d.programs.map((p) => [p.slug, p.attendanceRule]));
  for (const r of d.rows) {
    const { num, den } = rule[r.p];
    assert.equal(r.attNum, r[num]);
    assert.equal(r.attDen, r[den]);
  }
});

test("rates on zero denominators are null, never NaN or Infinity", () => {
  for (const r of d.rows) for (const k of ["attendanceRate", "presenceRate", "verificationRate", "dropoutRate", "utilizationRate"]) {
    const v = r[k];
    assert.ok(v === null || Number.isFinite(v), `row ${r.id} ${k} = ${v}`);
  }
});

test("grades: workbook overrides win, otherwise the score band", () => {
  const band = (s) => (s >= 80 ? "Excellent" : s >= 70 ? "Very Good" : s >= 60 ? "Good" : s >= 50 ? "Average" : "Poor");
  for (const i of d.institutes) {
    const expected = i.gradeOverride ?? (i.score === null ? "Unscored" : band(i.score));
    assert.equal(i.grade, expected, `${i.p} ${i.instituteKey}`);
  }
});

test("cross-programme links: PMYSDP batches share institutes", () => {
  const byG = new Map();
  for (const i of d.institutes) { if (!byG.has(i.globalKey)) byG.set(i.globalKey, new Set()); byG.get(i.globalKey).add(i.p); }
  const both = (a, b) => [...byG.values()].filter((s) => s.has(a) && s.has(b)).length;
  assert.equal(both("pmysdp-b1", "pmysdp-b2"), 111);
  assert.equal(both("pmysdp-b2", "pmysdp-b3"), 105);
  assert.equal(both("pmysdp-b1", "pmysdp-b3"), 69);
});

test("portfolio totals equal the sum of the programmes", () => {
  assert.equal(d.rows.length, Object.values(BASELINE).reduce((s, b) => s + b.rows, 0));
  assert.equal(d.institutes.length, Object.values(BASELINE).reduce((s, b) => s + b.institutes, 0));
});
