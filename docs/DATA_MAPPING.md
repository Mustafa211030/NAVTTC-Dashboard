# DATA_MAPPING.md

Mandated by master prompt §62. Source of truth: `NAVTTC_-_PMYSDP_B3_-_184_TPI_-_24052026.xlsx`, sheet `Combined Sheet`, range A1:AK699 — 1 header row, 698 data rows, 37 columns.

**Grain:** one row = one *institute × trade × batch* assessment.

---

## Column inventory

`Non-null` is out of 698. Excel letters are 1-indexed; array indices are 0-indexed.

| # | Col | Excel header | Proposed field | Type | Non-null | Distinct | Role | Notes |
|---|---|---|---|---|---|---|---|---|
| 0 | A | `Sr No` | `—` | int/str | 185 | 98 | **Drop** | Group-restarting serial, not a key. One cell is a bare space. See AUDIT 3.1 |
| 1 | B | `Package` | `package` | str | 698 | 2 | Filter, dimension | Package-02 (264), Package-03 (434) |
| 2 | C | `Program Name` | `program_name` | str | **264** | 1 | Dimension | Blank on all Package-03 rows. AUDIT 2.3 |
| 3 | D | `Region Name` | `region` | str | 698 | 4 | Filter L1, dimension | PUNJAB, ICT, AJK, GB |
| 4 | E | `District Name` | `district` | str | 698 | 25 | Filter L2 (cascades from region) | |
| 5 | F | `Institute ID` | `institute_id` | int | 698 | 184 | Entity key | ID 5415 has 2 names. AUDIT 3.5 |
| 6 | G | `Institute Name` | `institute_name` | str | 698 | 184 | Display, search | 12 have trailing whitespace |
| 7 | H | `TradeName` | `trade_name_raw` | str | 698 | 76 | Display | Normalizes to 70. AUDIT 3.6 |
| 8 | I | `Batches` | `batch_raw` | str/int | 679 | 6 | Filter | Roman/Arabic mix, 19 null. AUDIT 3.4 |
| 9 | J | `Institute Trade Code` | `institute_trade_code` | int | 698 | 585 | Reference only | 110 reused — **not a row key** |
| 10 | K | `Trade Code` | `trade_code` | int | 698 | 70 | **Trade key** | Reliable. Use for all trade aggregation |
| 11 | L | `Approved  Capacity` | `approved_capacity` | int | 698 | 12 | Measure | 0–40; 5 rows are 0. Sum 17,065 |
| 12 | M | `No of Trainees Registered on Biometric Device as Per PMS Portal List` | `biometric_registered` | int | 698 | 22 | Measure | Sum 16,517; 23 rows are 0 |
| 13 | N | `Dropped  Out` | `dropped_out` | int | 698 | 15 | Measure | Sum 587 |
| 14 | O | `Present` | `present` | int | 698 | 41 | Measure | Sum 11,404; 38 rows are 0 |
| 15 | P | `Absent` | `absent` | int | 698 | 36 | Measure | Sum 5,464 |
| 16 | Q | `CNIC  Verified` | `cnic_verified` | int | 698 | 41 | Measure | Sum 11,387; exceeds Present on 20 rows |
| 17 | R | `Attendance %` | `verification_rate_as_reported` | float | 698 | 117 | Measure (as-reported) | **Mislabelled.** 653 literals, 45 formulas. AUDIT 2.2 |

### Score components — columns S through AH (16 fields, max 100)

All 698 non-null. Scored per assessment row.

| # | Col | Excel header (abbrev.) | Proposed field | Max | Distinct | Notes |
|---|---|---|---|---|---|---|
| 18 | S | All PMS Students Registered in Biometric Machine | `biometric_score` | 10 | 21 | Continuous 0.1–10 |
| 19 | T | Attendance Score 80–100%(35), 50–79%(25), 1–49%(10) | `attendance_score` | 35 | 7 | 29 rows violate the band rule; values 8/17/34 appear. AUDIT 3.8 |
| 20 | U | CCTV Installed & Functional | `cctv_score` | 5 | 4 | |
| 21 | V | Trainer Registered on PMS Portal | `trainer_pms_score` | 2.5 | 5 | **Rows 461, 463 contain `"2,5"` text.** AUDIT 3.2 |
| 22 | W | Trainer Relevant Degree | `trainer_degree_score` | 2.5 | 2 | Row 533 changed vs old dashboard |
| 23 | X | Trainer Relevant Experience | `trainer_exp_score` | 5 | 3 | |
| 24 | Y | Tools & Equipments | `tools_score` | 5 | 4 | |
| 25 | Z | Consumable Items | `consumables_score` | 5 | 4 | **Row 518 contains `"2,5"` text** |
| 26 | AA | Student Portfolio | `portfolio_score` | 7.5 | 86 | Continuous |
| 27 | AB | TLMs Implemented | `tlm_impl_score` | 5 | 6 | |
| 28 | AC | TLMs Provision | `tlm_prov_score` | 2.5 | 4 | Rows 552, 575 changed vs old dashboard |
| 29 | AD | Assessment Conducted | `assessment_score` | 2.5 | 7 | **Row 465 contains `"2,5"` text** |
| 30 | AE | Industrial Linkages MOU | `ind_linkage_score` | 3.5 | 8 | **Row 615 contains `"3,5"` text** |
| 31 | AF | Job Fair / Engagement Plan | `job_fair_score` | 3.5 | 4 | |
| 32 | AG | OJT | `ojt_score` | 3 | 3 | |
| 33 | AH | Students Feedback | `student_feedback_score` | 2.5 | 114 | Continuous |

Component maxima sum to exactly **100.0**.

### Derived columns in the workbook

| # | Col | Excel header | Proposed field | Non-null | Notes |
|---|---|---|---|---|---|
| 34 | AI | `Trade Wise Score` | `trade_score` | 698 | `=SUM(S:AH)`. **5 rows understated** by the text cells above. Recompute at ingest |
| 35 | AJ | `Total Score` | `—` | 184 | **Do not import.** Five inconsistent implementations, 8 disagree with the institute mean, 2 contradict each other. AUDIT 3.3 |
| 36 | AK | `Grading` | `grade` + `assessor_note` | 185 | Split: 5 clean grades → `grade`; free-text commentary → `assessor_note`. AUDIT 3.9 |

---

## Normalization pipeline

Per §72–73, raw values are preserved alongside normalized ones. Nothing is mutated in place.

```
raw (698 × 37, verbatim from openpyxl data_only=True)
  ↓ normalize
  ├─ repair decimal commas: "2,5" → 2.5 on 5 cells         [logged]
  ├─ trim whitespace: institute_name (12), trade_name (6)   [raw kept]
  ├─ canonicalize trade: key on trade_code, 76 → 70         [raw kept]
  ├─ normalize batch: {1,I} → 1, {2,II} → 2, {3} → 3, {0,null} → null
  ├─ split Grading → grade | assessor_note
  ├─ synth row key: sha1(institute_id, trade_code, batch, ordinal)
  └─ program_name backfill                          [PENDING DECISION 3]
  ↓ derive
  ├─ trade_score       = Σ(16 components), repaired
  ├─ attendance_rate   = present / biometric_registered      (null-safe)
  ├─ dropout_rate      = dropped_out / biometric_registered  (null-safe)
  ├─ utilization_rate  = biometric_registered / approved_capacity
  └─ verification_rate = cnic_verified / approved_capacity
  ↓ aggregate to institute (184)
  ├─ institute_score = mean(trade_score)
  ├─ tier            = f(institute_score)            [PENDING DECISION 1]
  └─ counts summed, rates recomputed from summed numerators/denominators
  ↓ filter → visualize
```

**Rates are always recomputed from summed numerator and denominator at the aggregate level, never averaged from row-level rates.** Averaging percentages across rows with different denominators is wrong and is a defect the old dashboard has — `getInstituteData()` computes `attendancePct: avg(rows,'attendance_pct')*100`.

---

## Field → dashboard surface

| Field | KPI | Chart | Filter | Table | Detail |
|---|---|---|---|---|---|
| `region` | ✓ count | Region comparison bars, region small-multiples | ✓ L1 | ✓ | ✓ |
| `district` | ✓ count | District ranking, district heatmap | ✓ L2 | ✓ | ✓ |
| `package` | — | Package comparison, split donut | ✓ | ✓ | ✓ |
| `program_name` | — | — | ✓ | ✓ | ✓ |
| `institute_id`/`_name` | ✓ count 184 | Top-N / Bottom-N ranking | ✓ searchable | ✓ | ✓ profile page |
| `trade_code`/`trade_name` | ✓ count 70 | Trade ranking, trade × region matrix | ✓ | ✓ | ✓ |
| `batch` | — | — | ✓ | ✓ | ✓ |
| `approved_capacity` | ✓ 17,065 | Capacity vs registered paired bars | range | ✓ | ✓ |
| `biometric_registered` | ✓ 16,517 | Distribution histogram | range | ✓ | ✓ |
| `dropped_out` | ✓ 3.55% rate | Dropout by region/trade | — | ✓ | ✓ |
| `present`/`absent` | ✓ 69.04% | Attendance distribution | — | ✓ | ✓ |
| `cnic_verified` | ✓ 66.73% | Verification gap by district | — | ✓ | ✓ |
| 16 score components | — | Radar (institute vs national), component bars, strength/gap analysis | — | ✓ | ✓ full breakdown |
| `trade_score` | ✓ mean 75.08 | Score histogram, box-by-region, scatter vs attendance | range | ✓ | ✓ |
| `institute_score` | ✓ | Tier donut, ranking bars | — | ✓ | ✓ |
| `grade` | ✓ tier counts | Tier donut | ✓ | ✓ | ✓ |
| `assessor_note` | — | — | has-note toggle | ✓ | ✓ **Requires Attention view** |

Every one of the 37 source columns is either mapped above or explicitly dropped with a reason. §5 coverage requirement satisfied.

---

## Calculation registry

Format per §61. Every derived metric appears here or it does not ship.

```
Total Institutes
  Source:   Institute ID (F)
  Logic:    distinct count over filtered rows
  Formula:  |{institute_id}|
  Baseline: 184
  Format:   integer

Total Assessments
  Source:   row count
  Formula:  count(rows)
  Baseline: 698
  Format:   integer with thousands separator

Registered Trainees
  Source:   No of Trainees Registered on Biometric Device (M)
  Formula:  Σ biometric_registered
  Baseline: 16,517
  Format:   16,517 / 16.5K

Capacity Utilization
  Source:   M ÷ L
  Formula:  Σ biometric_registered ÷ Σ approved_capacity × 100
  Guard:    denominator 0 → null, render "—"
  Baseline: 96.79%
  Format:   1 decimal, %

Attendance Rate  [computed — NOT column R]
  Source:   Present (O) ÷ Registered (M)
  Formula:  Σ present ÷ Σ biometric_registered × 100
  Guard:    denominator 0 → null
  Baseline: 69.04%
  Format:   1 decimal, %

Verification Rate as Reported  [column R, as-is]
  Source:   Attendance % (R)
  Formula:  mean of stored values × 100
  Warning:  207/698 match no reproducible definition. Tooltip must say so.
  Baseline: 66.87%
  Format:   1 decimal, %

Dropout Rate
  Source:   Dropped Out (N) ÷ Registered (M)
  Formula:  Σ dropped_out ÷ Σ biometric_registered × 100
  Baseline: 3.55%
  Format:   2 decimals, %

Trade Score
  Source:   16 components, S through AH
  Formula:  Σ components, after decimal-comma repair
  Range:    0 – 100
  Note:     differs from stored AI on 5 rows by design
  Format:   2 decimals

Institute Score
  Source:   trade_score
  Formula:  mean(trade_score) grouped by institute_id
  Note:     replaces column AJ entirely
  Baseline: mean 75.08 across 184
  Format:   2 decimals

Performance Tier
  Source:   institute_score
  Formula:  PENDING DECISION 1 — ≥85 rule vs Excel Grading column
  Impact:   Excellent count = 52 or 81
  Format:   categorical badge

Category Score  (6 categories)
  Biometric & Attendance  = biometric + attendance                      max 45
  Infrastructure          = cctv + tools + consumables                  max 15
  Trainer Assessment      = trainer_pms + trainer_degree + trainer_exp  max 10
  Training Delivery       = portfolio + tlm_impl + tlm_prov + assessment max 17.5
  Industry Engagement     = ind_linkage + job_fair + ojt                max 10
  Student Feedback        = student_feedback                            max 2.5
  Formula:  Σ member components; % = score ÷ max × 100
  Total:    100.0
```

Category definitions are carried forward unchanged from the old dashboard's `CATEGORIES` constant — they are a legitimate existing analytical construct and §64 requires preservation.

---

## Regression fixture

Assert these at zero filters (§85):

```
rows                        698
institutes                  184
trades (trade_code)          70
districts                    25
regions                       4
Σ approved_capacity      17,065
Σ biometric_registered   16,517
Σ dropped_out               587
Σ present                11,404
Σ absent                  5,464
Σ cnic_verified          11,387
mean institute_score      75.08
```

Filter identity: `region ∈ {PUNJAB, ICT, AJK, GB}` must return exactly 698 rows. Package-02 → 264, Package-03 → 434, sum 698. Export row count must equal the on-screen filtered count (§42, §84).
