# NAVTTC PMYSDP B3 — Pre-Build Audit Findings

**Audit date:** 2026-09-08
**Excel source:** `NAVTTC_-_PMYSDP_B3_-_184_TPI_-_24052026.xlsx` (150 KB, 1 sheet: `Combined Sheet`, range A1:AK699)
**Dashboard source:** `index.html` (638 KB, single file, 1,190 lines, Chart.js 4.4.0 via CDN)

This document must be read before any code is written. Section 2 of the master prompt requires an audit first; this is it. Several findings invalidate assumptions built into the master prompt itself.

---

## 1. Headline finding: the Excel is not new data

The master prompt is built on the premise that the HTML dashboard holds outdated values and the Excel holds updated values, and that section 3 ("DATA RECONCILIATION — EXTREMELY IMPORTANT") is therefore a large workstream.

That premise is wrong.

The HTML file already contains a fully parsed copy of this dataset, embedded at character offset 23,094 as `const RAW_DATA = [...]` — 698 records with snake_case keys. I diffed all 698 rows × 34 mapped fields against the Excel workbook.

**Result: 3 substantive cell differences. Total.**

| Excel row | Column | Old dashboard value | New Excel value |
|---|---|---|---|
| 533 | Trainer Relevant Degree | *(missing)* | 2.5 |
| 552 | TLMs Full Provision | *(missing)* | 2.5 |
| 575 | TLMs Full Provision | *(missing)* | 2.5 |

Those three changes propagate into `Trade Wise Score` on the same three rows (77.5 → 80.0, 72.99 → 75.49, 88.64 → 91.14). **No institute changes performance tier as a result.**

A further 5 cells differ only because the old converter silently dropped text values it could not parse — see finding 3.2. Everything else — all 698 rows, all identifiers, all geography, all capacity and attendance counts, all 16 score components — is byte-identical.

### What this means for the project

Reconciliation and migration are close to zero work. The Excel is a maintenance revision of the same 24-May-2026 assessment round, not a new round. The actual work in this project is:

1. Architecture and UI rebuild (real, large)
2. Fixing the data-quality defects listed below (real, small, high-value)
3. Resolving the definitional conflicts in section 2 (blocking — needs your decisions)

You should not budget for a data migration phase. You should budget for the decisions in section 2, because they change displayed numbers.

---

## 2. Blocking conflicts — these need your decision before the build

### 2.1 The grading model disagrees with itself

The dashboard and the Excel classify institutes using **different thresholds**, and neither is documented.

`index.html` defines:

```js
const TIERS = [
  {key:'E',  label:'Excellent', min:85, max:100},
  {key:'VG', label:'Very Good',  min:70, max:84},
  {key:'G',  label:'Good',       min:55, max:69},
  {key:'A',  label:'Average',    min:40, max:54},
  {key:'P',  label:'Poor',       min:0,  max:39}
];
```

The Excel's own `Grading` column implies different cut-points. Observed score ranges per grade in the workbook:

| Grade | Excel min | Excel max | Dashboard band |
|---|---|---|---|
| Excellent | 80.38 | 98.35 | ≥ 85 |
| Very Good | 70.69 | 80.58 | 70–84 |
| Good | 59.81 | 70.46 | 55–69 |
| Average | 49.91 | 60.34 | 40–54 |
| Poor | 40.73 | 40.73 | 0–39 |

Note the Excel bands **overlap** (Very Good tops out at 80.58, Excellent starts at 80.38; Good tops at 70.46, Very Good starts at 70.69). They are not a clean rule — they look hand-assigned.

The headline count changes materially depending on which you adopt:

| | Dashboard thresholds | Excel `Grading` column |
|---|---|---|
| Excellent | **52** | **81** |
| Very Good | 81 | 51 |
| Good | 34 | 25 |
| Average | 11 | 14 |
| Poor | 6 | 1 |

The old dashboard's "Excellent Institutes" KPI currently reads **52**. If NAVTTC's official position is the `Grading` column, that KPI should read **81** — a 56% understatement on the single most visible number on the homepage.

**Decision required:** which is authoritative — the ≥85 rule, the `Grading` column, or a third official rule I have not been given? I will not pick one for you; every downstream ranking, tier donut, and "requires attention" list depends on it.

### 2.2 "Attendance %" does not mean attendance

Column R is labelled `Attendance %`. In the 45 rows where a live formula survives, it computes:

```
Attendance % = CNIC Verified ÷ Approved Capacity
```

That is a **verification rate against sanctioned seats**, not attendance. Attendance would be `Present ÷ Registered`.

Worse, the column is mostly not a formula at all — 653 of 698 cells are hard-typed literals. Testing both candidate definitions against the stored values:

- Matches `CNIC Verified ÷ Approved Capacity`: 487 / 698
- Matches `Present ÷ Registered`: 448 / 698
- **Matches neither: 207 / 698**

Example, Excel row 69: Capacity 40, Registered 40, Present 0, CNIC Verified 12. Stored `Attendance %` = 0.28. Neither formula yields 0.28 (12/40 = 0.30).

The three pooled figures diverge:

| Metric | Value |
|---|---|
| Mean of the stored `Attendance %` column | 66.87% |
| Present ÷ Registered (pooled) | 69.04% |
| CNIC Verified ÷ Approved Capacity (pooled) | 66.73% |

The old dashboard's "Avg Attendance" KPI averages the stored column, so it currently reports a manually-maintained number that is reproducible from nothing.

**Decision required:** rename the metric to what it measures and compute it programmatically, or keep the stored column as an as-reported field and add a separate computed attendance metric alongside it. I recommend the latter — it preserves auditability (master prompt §74) without endorsing a number we cannot derive.

### 2.3 `Program Name` is blank for 62% of rows

`Program Name` = "PMYSDP Batch III" on all 264 Package-02 rows and **empty on all 434 Package-03 rows**. The filename and every other signal say the whole workbook is PMYSDP Batch III.

This is almost certainly a fill-down omission, but per master prompt §4 ("never replace missing values with invented values") I will not backfill it on my own authority.

**Decision required:** confirm all 698 rows are PMYSDP Batch III and I will populate it in the normalization layer with a documented, flagged transform. Otherwise it stays null and the Programs module effectively has one populated program and one blank.

---

## 3. Data quality register

Severity: **H** blocks or distorts headline numbers · **M** affects a module · **L** cosmetic

### 3.1 No unique row identifier — H

The grain is *institute × trade × batch*. There is no key for it.

- `Sr No` — populated on only 185 of 698 rows, 184 integers ranging 1–97 plus one cell containing a single space. It restarts per group, so values 1–17 each appear 4 times. **Not a key.**
- `Institute Trade Code` — 585 distinct values across 698 rows; 110 codes are reused. **Not a key.**
- `Institute ID` + `Trade Code` + `Batches` — the only viable composite, and `Batches` is dirty (see 3.4).

The Data Explorer (§30) and record-detail drawer (§31) both need a stable row key. A synthetic surrogate key must be generated at ingest and carried through, or row selection and deep links will break.

### 3.2 Decimal commas silently zeroed five scores — H

Five cells were typed with a European decimal comma, so Excel stored them as text and `SUM()` skipped them:

| Excel row | Column | Stored | Should be |
|---|---|---|---|
| 461 | Trainer Registered on PMS Portal | `"2,5"` | 2.5 |
| 463 | Trainer Registered on PMS Portal | `"2,5"` | 2.5 |
| 465 | Assessment | `"2,5"` | 2.5 |
| 518 | Consumable Items | `"2,5"` | 2.5 |
| 615 | Industrial Linkages | `"3,5"` | 3.5 |

`Trade Wise Score` is therefore **understated** on those five rows — by 2.5 points on four of them and 3.5 on one. The old dashboard inherited the same defect from a different direction: its converter wrote `null`, so it understated by the same amounts.

Repairing them shifts the mean institute score from 75.26 to 75.08 and moves **zero** institutes across a tier boundary. Low blast radius, but it must be fixed at ingest and logged, not left.

### 3.3 `Total Score` is computed five different ways — H

The institute-level score column AJ uses five distinct implementations down a single column:

| Implementation | Rows |
|---|---|
| `=AVERAGE(AIn:AIn)` over a hardcoded range | 128 |
| `=IF(COUNTIF(...),AVERAGEIF($F:$F,Fn,$AI:$AI),"")` | 18 |
| `=AIn` (direct reference, single-trade institutes) | 20 |
| Hard-typed literal number | 18 |
| Empty | 514 |

184 rows carry a value — one per institute, matching the "184 TPI" in the filename. Of those, **8 disagree with the institute mean of `Trade Wise Score`**:

| Excel row | Institute | Stated | Actual mean | Trades |
|---|---|---|---|---|
| 69 | Capital Vocational Training Institute Gilgit | 84.00 | 82.51 | 4 |
| 73 | GB Overseas Trade Test & Training Center | 63.00 | 63.07 | 5 |
| 78 | GB Polytechnic Institute, Gilgit | 78.50 | 77.01 | 6 |
| 84 | Noor Beauty Parlour and Training Center Gilgit | 77.00 | 75.80 | 1 |
| 85 | uConnect Technologies PVT LTD | 83.00 | 82.46 | 2 |
| 87 | North Tech Solution, Gilgit | 80.50 | 80.06 | 4 |
| 388 | Executive Training Center, Islamia University Bahawalpur | **60.69** | 30.35 | 2 |
| 389 | Executive Training Center, Islamia University Bahawalpur | **0.00** | 30.35 | 2 |

Rows 388 and 389 are the same institute (ID 21520) carrying **two contradictory institute-level scores**, neither of which is the mean of its own trade rows. One of them must be wrong; possibly both.

Recommendation: do not read `Total Score` at all. Recompute it as the institute mean of the repaired `Trade Wise Score`, and surface the eight discrepancies in the Data Quality Center (§38) rather than silently overriding them. The old dashboard already does this — `getInstituteData()` computes `avg(rows,'trade_score')` and ignores column AJ entirely.

### 3.4 `Batches` mixes Roman and Arabic numerals — M

| Value | Rows |
|---|---|
| `1` (integer) | 524 |
| `2` (integer) | 102 |
| `I` (string) | 43 |
| *(blank)* | 19 |
| `II` (string) | 5 |
| `3` (integer) | 3 |
| `0` (integer) | 2 |

Six surface values, four real ones, plus 19 nulls and two rows claiming batch zero. As a filter dimension (§11) this will render as six options where three are duplicates. Needs normalization with the raw value preserved (§72–73).

### 3.5 Institute identity is ambiguous for one pair — M

- `Institute ID` **5415** maps to two different names: "Pakistan College of Science Multan" and "Skillcastle Multan Campus"
- "Skillcastle Multan Campus" maps to two different IDs: **5415** and **23077**

So the 184 distinct `Institute ID` values do not cleanly correspond to 184 distinct real institutes. Either 5415 was reassigned, or a row was pasted into the wrong institute block. Institute rankings and the institute profile page are both affected.

### 3.6 Trade names have 6 casing/whitespace duplicates — M

76 distinct `TradeName` strings collapse to **70** once trimmed and case-folded — which exactly matches the 70 distinct `Trade Code` values. `Trade Code` is the reliable key.

| Normalized | Raw variants |
|---|---|
| certificate in it (web development) | `Certificate in IT (Web Development) `, `Certificate in IT (Web Development)` |
| graphic design (print media) | `Graphic Design (Print Media)`, `Graphic design (Print media)`, `Graphic Design (print media)` |
| graphic design and video editing | `Graphic Design and Video Editing`, `Graphic Design and video Editing` |
| amazon virtual assistant | `Amazon Virtual Assistant`, `AMAZON VIRTUAL ASSISTANT` |
| care worker | `Care worker`, `Care Worker` |

Untreated, a Trade filter shows 76 options and every trade-level aggregate splits across the variants. Five `Trade Code` values also map to more than one name string — same root cause.

Separately, 12 `Institute Name` values carry trailing whitespace.

### 3.7 Attendance arithmetic does not close — M

| Check | Rows failing |
|---|---|
| `Present + Absent = Registered` | 57 / 698 |
| `Present + Absent = Registered − Dropped Out` | 85 / 698 |
| `CNIC Verified > Present` | 20 |
| `CNIC Verified > Registered` | 15 |

Fifteen rows report more CNIC-verified trainees than were registered on the biometric device at all. Neither reconciliation identity holds across the sheet, so there is no single consistent enrolment model to build on.

### 3.8 `Attendance Score` band does not follow its own rule — M

The header specifies 80–100% → 35, 50–79% → 25, 1–49% → 10. Applying that rule to the stored `Attendance %`:

- Consistent: 669 / 698
- Inconsistent: **29**

Four rows carry scores of **8, 17, and 34** — values the stated scheme does not permit at all. Six rows score 0 despite an attendance percentage in the 50–79% band.

### 3.9 `Grading` column contains free text — M

185 populated cells (one more than the 184 institutes with a `Total Score`), 18 distinct values where 5 are expected. Beyond the clean grades it holds assessor commentary:

- `CRITICAL / Poor\nInstitute had unverified students` (×2)
- `CRITICAL / Poor\nInstitute was empty during the revisit. Only 3 out of 230 students were present in the class.`
- `CRITICAL / Poor\nInstitute was closed in 2nd visit`
- `CRITICAL\nPoor Performance and Low Attendance`
- `Non Funtional Trade` *(sic)*, `Non Functional`, `No classes`
- `Very GOOD` — casing variant of an existing grade

This is genuinely valuable qualitative data currently being thrown away — the old dashboard does not import this column at all. It should become a structured `grade` field plus a separate `assessor_note` field, surfaced on the institute profile and in an "Institutions Requiring Attention" view (§28).

One row (698, New Vision College of Health Sciences Vehari, `No classes`) has a `Grading` but no `Total Score`, which is why the counts are 185 vs 184.

### 3.10 Empty and zero-activity rows — L

| Condition | Rows |
|---|---|
| `Approved Capacity` = 0 | 5 |
| `Registered` = 0 | 23 |
| `Present` = 0 | 38 |
| `Trade Wise Score` = 0 | 5 |

These are real signal — non-functional trades — not corruption. They must survive into the dashboard, but every rate calculation needs zero-denominator guards or the empty-state requirement (§57) will be hit by `NaN` instead of a message.

---

## 4. Verified baseline figures

Every number below is computed from the workbook and is what the rebuilt dashboard must reproduce at zero filters. Use these as the regression fixture for §85.

| Metric | Value |
|---|---|
| Assessment rows (institute × trade × batch) | 698 |
| Distinct `Institute ID` | 184 |
| Distinct `Trade Code` | 70 |
| Distinct `TradeName` strings (raw) | 76 |
| Regions | 4 — PUNJAB, ICT, AJK, GB |
| Districts | 25 |
| Packages | 2 — Package-02 (264 rows), Package-03 (434 rows) |
| Approved Capacity | 17,065 |
| Registered on biometric device | 16,517 |
| Dropped Out | 587 |
| Present | 11,404 |
| Absent | 5,464 |
| CNIC Verified | 11,387 |
| Dropout rate (Dropped ÷ Registered) | 3.55% |
| Present ÷ Registered (pooled) | 69.04% |
| CNIC Verified ÷ Approved Capacity (pooled) | 66.73% |
| Mean of stored `Attendance %` | 66.87% |
| Mean institute score (recomputed, repaired) | 75.08 |
| Mean of stored `Total Score` column | 75.26 |

### Geographic coverage

Only four regions are present. **Sindh, Khyber Pakhtunkhwa and Balochistan do not appear in this dataset.**

| Region | Rows | Districts |
|---|---|---|
| PUNJAB | 434 | Bahawalnagar, Bahawalpur, Dera Ghazi Khan, Khanewal, Layyah, Lodhran, Multan, Muzaffargarh, Rahimyar Khan, Rajan Pur, Vehari (11) |
| ICT | 175 | Islamabad (1) |
| AJK | 45 | Bagh, Hattian, Haveli, Kotli, Mirpur, Muzaffarabad, Rawalakot (7) |
| GB | 44 | Astore, Ghanche, Ghizer, Gilgit, Hunza, Skardu (6) |

This has a direct consequence for §26. A national Pakistan choropleth will render three of the four largest provinces as empty, which reads as a rendering failure rather than as scope. Recommend a four-region map, or a district-level map bounded to the 25 covered districts, with explicit scope labelling. The master prompt's own instruction applies: *"Do not create geographic maps if the dataset does not support reliable geographic mapping."*

---

## 5. Dimensions the master prompt asks for that do not exist

Section 11 lists candidate filters. Against this dataset:

**Available:** Region · District · Package · Trade (via Trade Code) · Institute · Batch · Program Name (partially) · Performance tier

**Not present — do not build:** Tehsil · Gender · Age Group · Employment Status · Certification Status · Completion Status · Funding Category · Institution Type (public/private) · any date or time field

The absence of dates is structural. There is **no date column anywhere in the workbook** — the only temporal marker is `24052026` in the filename. This means:

- Every trend, line, area, and multi-series time chart in §19 is unbuildable
- The calendar heatmap in §19 is unbuildable
- Every "trend" element of the KPI spec in §15 is unbuildable
- §25 Level 5 ("What trends exist?") has no data behind it
- Any Year / Month / Date Range filter in §11 is unbuildable

This is a single-snapshot assessment. The dashboard should be designed as a **cross-sectional performance assessment tool**, not a monitoring-over-time tool. Comparison must carry the analytical weight that trend would normally carry — region vs region, package vs package, institute vs peer median, score component vs its maximum.

Gender is worth flagging separately. §29 asks for demographic analytics and gender distribution. There is no gender field. A handful of institute names imply it ("Government Boys Postgraduate College Bagh") but inferring gender from institute names would be exactly the fabrication §4 prohibits.

---

## 6. Recommended decisions

| # | Question | My recommendation |
|---|---|---|
| 1 | Which grading model is authoritative? | **Needs your answer.** Ask NAVTTC. This is the highest-impact open item — it swings the headline KPI from 52 to 81. |
| 2 | Rename `Attendance %`? | Keep the stored column as `verification_rate_as_reported`, add a computed `attendance_rate = Present ÷ Registered`, show both, document both. |
| 3 | Backfill `Program Name`? | Yes, if you confirm all rows are PMYSDP Batch III. Flag the transform in the data-quality report. |
| 4 | Repair the 5 decimal-comma cells? | Yes, at ingest, logged. No tier changes result. |
| 5 | Trust `Total Score`? | No. Recompute from repaired `Trade Wise Score`; surface the 8 discrepancies. |
| 6 | Normalize trade names? | Yes — key on `Trade Code`, display the modal name variant, keep raw for audit. |
| 7 | Build a Pakistan choropleth? | No. Four-region + 25-district view with explicit scope labelling. |
| 8 | Build trend charts? | No. Not possible. Rebalance the IA toward comparison and composition. |
| 9 | Import the `Grading` free text? | Yes — this is the most valuable currently-discarded field in the workbook. |

---

## 7. Scope reality check

The master prompt specifies 90 sections including 3D visualization (§20), Sankey diagrams, treemaps, sunbursts, box plots, calendar heatmaps, dark mode, WCAG 2.1 AA, URL filter state, virtualized tables, per-page PDF export, and a full test suite.

The dataset is **698 rows × 37 columns, 150 KB, no time dimension, no demographics**.

Specific consequences:

- **Virtualization (§34) is unnecessary.** 698 rows renders instantly. TanStack Table without virtualization is the right call; adding it is complexity with no payoff.
- **3D (§20) has nothing to justify it.** §20 itself says "ONLY use 3D where it materially improves the analytical experience." Four regions and a single snapshot do not meet that bar. Three.js would add ~600 KB to defend a decorative hero.
- **Sankey needs a flow.** There is no flow in this data — no from/to, no stage transitions. Skip.
- **The full dataset is smaller than the charting library.** It can ship as a static typed JSON module generated at build time. No API, no database, no runtime parsing. This makes §71 (Excel future-proofing) trivial: one script, one command.

Cutting these is not a reduction in quality. Building a Sankey with no flow, or a 3D hero with four data points, is what §67 means by "Admin Dashboard Template #438."

Where the spec is well-matched to the data and should be built in full: the filter engine (§11–14), KPI methodology tooltips (§17, §60), the Data Explorer (§30–33), the Data Quality Center (§37–38) — which this dataset badly needs — and the print/export system (§39–44).
