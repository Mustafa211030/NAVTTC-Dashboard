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
  // B-II: workbook row 479 is a second copy of row 475 (Netlab, Digital Marketing, batch 1) and is removed.
  "pmysdp-b2": { rows: 862, institutes: 264, capacity: 16792, enrolled: 16618, dropped: 174, present: 11967, verified: 11213, components: 15 },
  "pmysdp-b3": { rows: 697, institutes: 184, capacity: 17060, enrolled: 16458, dropped: 345, present: 11519, verified: 11428, components: 16 },
  "cbtp-b1":   { rows: 8,   institutes: 6,   capacity: 165,   enrolled: 150,   dropped: 15,  present: 97,    verified: 97,    components: 15 },
  "cbi-b2":    { rows: 62,  institutes: 26,  capacity: 1325,  enrolled: 1306,  dropped: 25,  present: 1069,  verified: 1069,  components: 15 },
  "nsis-b2":   { rows: 12,  institutes: 10,  capacity: 300,   enrolled: 275,   dropped: 0,   present: 234,   verified: 234,   components: 15 },
  // From the 19 Oct 2026 programme-wise VTT report (checked against the sheet's Package totals).
  "pmysdp-b3-ext":      { rows: 157, institutes: 71, capacity: 3670, enrolled: 3371, dropped: 299, present: 1687, verified: 1687, components: 8 },
  "pmysdp-b3-it":       { rows: 117, institutes: 76, capacity: 2460, enrolled: 2269, dropped: 191, present: 1138, verified: 1138, components: 8 },
  "madrassas-b3":       { rows: 36,  institutes: 21, capacity: 749,  enrolled: 703,  dropped: 65,  present: 568,  verified: 568,  components: 9 },
  "she-fixes-b2":       { rows: 15,  institutes: 8,  capacity: 370,  enrolled: 357,  dropped: 13,  present: 208,  verified: 208,  components: 9 },
  "overseas-b4":        { rows: 16,  institutes: 2,  capacity: 400,  enrolled: 378,  dropped: 22,  present: 157,  verified: 157,  components: 9 },
  "hospitality-b2-ext": { rows: 8,   institutes: 6,  capacity: 155,  enrolled: 143,  dropped: 12,  present: 50,   verified: 50,   components: 8 },
  "domestic-worker":    { rows: 7,   institutes: 4,  capacity: 155,  enrolled: 155,  dropped: 0,   present: 104,  verified: 104,  components: 9 },
  "biitt-2026":         { rows: 6,   institutes: 1,  capacity: 155,  enrolled: 156,  dropped: 0,   present: 125,  verified: 125,  components: 8 },
};

/** Institute mean of the official (post-penalty) score, per the report. */
const REPORT_MEANS = {
  "pmysdp-b3-ext": "58.43", "pmysdp-b3-it": "54.57", "madrassas-b3": "73.19", "she-fixes-b2": "59.22",
  "overseas-b4": "35.19", "hospitality-b2-ext": "57.38", "domestic-worker": "67.28", "biitt-2026": "71.75",
};
/** Trades carrying a NAVTTC penalty, per the report. */
const PENALISED = { "pmysdp-b3": 0, "pmysdp-b3-ext": 23, "pmysdp-b3-it": 43, "madrassas-b3": 5, "she-fixes-b2": 4, "overseas-b4": 6, "hospitality-b2-ext": 1, "domestic-worker": 1, "biitt-2026": 0 };

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

  test(`${slug}: criteria score = Σ criteria on every scored row`, () => {
    const p = d.programs.find((x) => x.slug === slug);
    for (const r of rowsOf(slug).filter((x) => x.scored)) {
      const s = p.rubric.components.reduce((a, c) => a + r.components[c.key], 0);
      assert.ok(Math.abs(s - r.rubricScore) < 1e-3, `row ${r.excelRow}: ${s} vs ${r.rubricScore}`);
    }
  });

  test(`${slug}: official score = VTT × (1 − penalty %) where the VTT report applies, else Σ criteria`, () => {
    for (const r of rowsOf(slug).filter((x) => x.scored)) {
      const expected = r.vttScore === null ? r.rubricScore : r.vttScore * (1 - (r.penaltyPct ?? 0) / 100);
      assert.ok(Math.abs(expected - r.tradeScore) < 0.051, `row ${r.excelRow}: ${expected} vs ${r.tradeScore}`);
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

test("PMYSDP B-III: criteria mean is unchanged; final mean follows the VTT report's re-scoring", () => {
  const s = instOf("pmysdp-b3");
  const rows = rowsOf("pmysdp-b3").filter((r) => r.scored);
  const crit = new Map();
  for (const r of rows) { if (!crit.has(r.instituteKey)) crit.set(r.instituteKey, []); crit.get(r.instituteKey).push(r.rubricScore); }
  const critMean = [...crit.values()].reduce((a, v) => a + v.reduce((x, y) => x + y, 0) / v.length, 0) / crit.size;
  assert.equal(critMean.toFixed(2), "75.29", "16-criteria mean from the original workbook");
  assert.equal((s.reduce((a, i) => a + i.score, 0) / s.length).toFixed(2), "75.55", "after the 19 Oct 2026 re-scoring");
  assert.equal(rows.filter((r) => r.vttScore !== null).length, 696, "rows matched to the VTT report");
});

test("VTT report programmes: institute means and penalised trades match the report", () => {
  for (const [slug, mean] of Object.entries(REPORT_MEANS)) {
    const s = instOf(slug);
    assert.equal((s.reduce((a, i) => a + i.score, 0) / s.length).toFixed(2), mean, slug);
  }
  for (const [slug, n] of Object.entries(PENALISED))
    assert.equal(rowsOf(slug).filter((r) => (r.penaltyPct ?? 0) > 0).length, n, slug);
});

test("VTT report programmes: locations come from earlier programme records where the TSP ID is known", () => {
  const known = new Map();
  for (const i of d.institutes) if (["pmysdp-b1", "pmysdp-b2", "pmysdp-b3", "cbtp-b1", "cbi-b2", "nsis-b2"].includes(i.p) && i.instituteId !== null) known.set(i.instituteId, i);
  for (const slug of Object.keys(REPORT_MEANS)) for (const i of instOf(slug)) {
    if (known.has(i.instituteId)) assert.notEqual(i.district, "Not recorded", `${slug} ${i.instituteId}`);
    else assert.equal(i.district, "Not recorded");
  }
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

/* ------------------------------------------------------------------ duplicates and spellings */

test("no class is counted twice: institute + trade + batch + headcounts are unique within a programme", () => {
  const seen = new Set();
  for (const r of d.rows) {
    const k = [r.p, r.instituteKey, r.tradeNorm, r.batch, r.approvedCapacity, r.enrolled, r.present, r.absent, r.droppedOut].join("|");
    assert.ok(!seen.has(k), `duplicate class ${k}`);
    seen.add(k);
  }
});

test("one name per Institute ID within each programme, and one per programme-institute", () => {
  const names = new Map();
  for (const r of d.rows) {
    if (r.instituteId === null) continue;
    const k = `${r.p}|${r.instituteKey}`;
    if (!names.has(k)) names.set(k, new Set());
    names.get(k).add(r.instituteName);
  }
  for (const [k, s] of names) assert.equal(s.size, 1, `${k}: ${[...s].join(" | ")}`);
  const inst = new Set(d.institutes.map((i) => `${i.p}|${i.instituteKey}`));
  assert.equal(inst.size, d.institutes.length, "programme-institutes are unique");
});

test("corrupted and mislabelled institute names are corrected", () => {
  const n = (p, id) => [...new Set(d.rows.filter((r) => r.p === p && r.instituteId === id).map((r) => r.instituteName))];
  assert.deepEqual(n("pmysdp-b2", 5904), ["CORVIT Networks Pvt. Ltd-Muzaffarabad"]);
  assert.deepEqual(n("pmysdp-b3", 5415), ["Pakistan College of Science Multan"]);
  for (const r of d.rows) assert.ok(!/\uFFFD/.test(r.instituteName + r.tradeName), `bad character in row ${r.id}`);
});

test("trade spelling variants share one name across programmes", () => {
  const names = new Set(d.rows.map((r) => r.tradeName));
  for (const bad of ["Driver (HTV)", "Tunnel Farming and", "Manual Jewellery Designer", "Bakery & Pastery Making", "Fiber Optic Technician i", "Applied GIS (Geographic Infromation System)"])
    assert.ok(!names.has(bad), bad);
  assert.equal(new Set(d.rows.map((r) => r.tradeNorm)).size, Object.keys(d.tradeNames).length);
});

test("B-III classes recorded twice as batch 1 are told apart by the VTT report's batch", () => {
  const iqra = d.rows.filter((r) => r.p === "pmysdp-b3" && r.instituteId === 5399 && /office management/i.test(r.tradeName));
  assert.deepEqual(iqra.map((r) => r.batch).sort(), [1, 2]);
});

test("unique-institute count follows the identity links", () => {
  assert.equal(new Set(d.institutes.map((i) => i.globalKey)).size, d.meta.uniqueInstitutes);
  for (const id of [556, 10807, 30432]) assert.ok(d.institutes.some((i) => i.p === "cbi-b2" && i.globalKey === `id-${id}`), `CBI link to ${id}`);
});
