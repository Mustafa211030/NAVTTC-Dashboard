# NAVTTC Analytics — PMYSDP Batch III

Training Provider Institute performance dashboard, built from
`NAVTTC_-_PMYSDP_B3_-_184_TPI_-_24052026.xlsx`.

698 assessment records · 184 institutes · 70 trades · 25 districts · 4 regions.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

`npm run dev` regenerates the dataset from the Excel file first, so the app can
never drift from the workbook.

| Command | What it does |
|---|---|
| `npm run data` | Reads `data/raw/source.xlsx` → writes `data/processed/dataset.json` |
| `npm run dev` | Rebuild data, then start the dev server |
| `npm run build` | Rebuild data, then produce a static site in `out/` |
| `npm test` | 14 regression tests over the generated dataset |

Requires Node 20 or newer (built and tested on Node 22).

---

## Updating the data

> When I receive a new NAVTTC Excel file, this is how I update the dashboard.

```bash
cp /path/to/NEW_FILE.xlsx data/raw/source.xlsx
npm run data
npm test
npm run build
```

That is the whole procedure. **No component, page, chart or KPI is edited.**

Three things to know before you swap the file:

1. **The sheet must be named `Combined Sheet`** and the 37 columns must stay in
   the same positions. Column *positions* are the contract, not the header text
   — the headers contain embedded newlines and double spaces, so they are too
   fragile to key on. Positions are mapped in `scripts/build-data.mjs` under `COL`.
2. **`npm test` will fail** on the new file, because the tests assert the exact
   totals of the May 2026 round (698 rows, 16,517 registered, and so on). That
   failure is the point: it tells you what changed. Read the diff, confirm the
   new numbers are right, then update the baselines in `tests/data.test.mjs`.
3. **Check the Data Quality page** after loading. New defect types will appear
   in the issue register automatically, but a genuinely new *kind* of defect may
   want a new validation rule in the ingest script.

If a future round adds a date column, trend charts become possible for the first
time — see "Deliberate omissions" below.

---

## Deploying free

The build output is a plain static site with no server, no API and no database.

```bash
npm run build        # writes out/
```

Then either:

- **Netlify** — drag the `out/` folder onto <https://app.netlify.com/drop>. Sign in first, or the site is deleted after an hour.
- **GitHub Pages** — push the repo, then Settings → Pages → deploy from a branch. Add `basePath` to `next.config.ts` if the site is served from a subpath.
- **Cloudflare Pages** — connect the repo; build command `npm run build`, output directory `out`.

---

## Project structure

```
navttc-dashboard/
├── data/
│   ├── raw/source.xlsx            ← the only input. Replace this to update.
│   └── processed/dataset.json     ← generated. Never edit by hand.
├── scripts/build-data.mjs         ← ingest, normalize, validate, aggregate
├── tests/data.test.mjs            ← regression fixture
├── docs/
│   ├── AUDIT_FINDINGS.md          ← data defects and the decisions they force
│   ├── DATA_MAPPING.md            ← every Excel column → dashboard field
│   └── DASHBOARD_INVENTORY.md     ← what the previous HTML build contained
└── src/
    ├── app/                       ← 8 routes + dynamic institute pages
    ├── components/
    │   ├── layout/AppShell.tsx    ← sidebar, header, mobile drawer
    │   ├── providers/             ← filter state (with URL sync), theme
    │   ├── filters/FilterBar.tsx  ← global cascading filters
    │   ├── charts/                ← ECharts wrapper + chart card
    │   ├── tables/DataTable.tsx   ← TanStack table
    │   ├── dashboard/             ← KPI card, page header, export menu
    │   └── ui.tsx                 ← primitives
    ├── lib/
    │   ├── dataset.ts             ← imports data/processed/dataset.json directly
    │   ├── filters.ts             ← filter engine + URL serialization
    │   ├── aggregate.ts           ← KPIs, grouping, histograms
    │   └── export.ts              ← CSV / Excel / JSON / PNG
    └── config.ts                  ← tier model, palette, number formatting
```

### Routes

| Route | Module |
|---|---|
| `/` | Executive overview |
| `/institutions` | All 184 TPIs ranked, sortable |
| `/institutions/[id]` | Full institute profile (184 static pages) |
| `/geography` | Regions, districts, capacity pipeline |
| `/trades` | 70 trades by enrolment and performance |
| `/performance` | Score components, what drives the score, distributions |
| `/explorer` | Every record, every column, with record drawer |
| `/data-quality` | Validation report and repair log |
| `/methodology` | Calculation registry and source mapping |

---

## Analytical views

Beyond the descriptive charts, four views answer questions the raw workbook does not:

**Enrolment funnel** (Overview). Approved capacity 17,065 → registered 16,517 → present 11,404 → CNIC-verified 11,387. Seats fill at 96.8%, but only 66.8% of sanctioned capacity was physically in the room. The loss is almost entirely absence, not under-registration.

**What actually drives the score** (Performance). Pearson correlation between each component and the total. Attendance dominates at r = 0.742. At the other end, CCTV (r = 0.130) and Trainer-on-PMS-Portal (r = 0.184) barely separate institutes at all — 7.5 points that award marks without discriminating. Worth raising with whoever designs the scoring rubric.

**Score spread by region** (Performance). Box plots rather than means, because a region can post a healthy average while containing failing institutes. The whisker length is where that shows.

**Flagged by assessors** (Institutions). The 12 institutes carrying a written note in the workbook. This is deliberately separate from "lowest 15 by score", because the two lists disagree — one flagged institute scores 65.6, above many graded Good. A score ranking alone would miss it.

## Data architecture

```
data/raw/source.xlsx
      ↓  scripts/build-data.mjs
raw values (verbatim, cached formula results)
      ↓  normalize    — 5 decimal-comma repairs, trade canonicalization,
      ↓                 batch numerals, Grading split into grade + note
      ↓  validate     — 12 rules, every failure logged with its Excel row
      ↓  derive       — trade score, attendance, dropout, utilization
      ↓  aggregate    — 184 institute records
data/processed/dataset.json
      ↓  src/lib/dataset.ts
filters → aggregation → KPIs, charts, tables, exports
```

Two rules hold throughout:

- **Raw is never mutated destructively.** Repaired values sit alongside the
  original, and the Data Quality page shows both.
- **Rates are pooled, never averaged.** `Σ present ÷ Σ registered`, not the mean
  of per-row percentages. Averaging rates across rows with different denominators
  is wrong, and it is a defect the previous dashboard had.

---

## Three decisions baked into this build

Each is documented in full in `docs/AUDIT_FINDINGS.md`.

### 1. Grading follows the official NAVTTC rubric

| Remarks | Overall score |
|---|---|
| Excellent | Above 80 |
| Very Good | 71 – 80 |
| Good | 61 – 70 |
| Average | 50 – 60 |
| Poor | Below 50 |

Applied to the recomputed institute score, this gives **82 / 51 / 25 / 15 / 11**.
The workbook's own `Grading` column gives **81 / 51 / 25 / 14** plus 10 Critical
and 2 Non-Functional — near-identical, which is strong evidence this is the
rubric the assessors actually applied.

Two notes on the published table. It lists Poor as "> 50", which is a
transcription slip for "< 50"; Poor is the lowest band. And the bands leave
gaps at 70.x and 80.x, so they are implemented continuously — 70.4 is Very
Good, 80.2 is Excellent.

Grades are derived from the score rather than read from the workbook, because
the workbook column contradicts the scores it describes: institute 21520 scores
30.35 and is graded "Good". The workbook grade is still carried on every
institute and shown in the Data Explorer. Because grades are now score-derived,
assessor-flagged institutes carry a separate red flag marker wherever they
appear, so a "Critical" field observation is never hidden behind a decent score.

### 1b. Superseded: grades from the workbook column

Two incompatible models existed. The old HTML dashboard classified institutes
with a hard-coded `score >= 85` rule; the workbook's `Grading` column was
assigned by assessors. They disagree substantially — **81 institutes are
Excellent under the workbook, 52 under the threshold rule.**

Because the Excel file is the declared source of truth, the workbook wins. Both
counts are shown side by side on the Methodology page, and switching is a
one-line change:

```ts
// src/config.ts
export const TIER_SOURCE: "reported" | "computed" = "reported";
```

**This is still an open question for NAVTTC.** It moves the most visible number
on the homepage.

### 2. Attendance is measured on CNIC-verified trainees

**Attendance % = CNIC Verified ÷ Approved Capacity** (columns Q ÷ L). A trainee
counts only once their CNIC is verified against the sanctioned seat list. This
is the basis the 35-point Attendance Score is banded on, and the formula the
workbook itself uses wherever a live formula survives in column R — so the
dashboard and the score now agree. Pooled figure: **66.73%**.

The stored column R is not read. 653 of 698 cells are hard-typed rather than
calculated and 207 match no reproducible formula at all, so the rate is
recomputed on every row and the stored value kept visible for audit.

**Presence % = Present ÷ Registered** (69.04%) answers a different question —
how many enrolled trainees were physically in the room — and is reported
alongside rather than merged in.

### 2b. Superseded: attendance from presence

Workbook column R is labelled `Attendance %`, but where a live formula survives
it computes `CNIC Verified ÷ Approved Capacity` — a verification rate against
sanctioned seats. 653 of 698 cells are hard-typed rather than calculated, and
**207 match no reproducible formula at all.**

So attendance is computed here as `Σ Present ÷ Σ Registered` (69.04% overall),
and column R is kept visible in the Data Explorer as an as-reported field.

### 3. `Total Score` is recomputed, not trusted

The workbook's column AJ uses five different formulas down a single column, and
**disagrees with the mean of its own trade rows on 10 institutes.** Two rows
(388 and 389) give the same institute two contradictory scores, 60.69 and 0.00.

Institute score is therefore recomputed as the mean of the institute's trade
scores. The discrepancies are surfaced on the Data Quality page rather than
silently overridden.

---

## Print and export

### Single-page institute report

On any institute profile page the print button reads **Print one-pager**. It
produces one A4 sheet holding that institute's entire record:

- header with name, ID, district, region, package, grade, score and rank
- the assessor's written note, where one exists
- eight headcount figures — capacity, registered, present, absent, dropped, CNIC-verified, attendance, utilization
- **every trade row**, with counts and score, each tagged with its source row number in the workbook
- **a full matrix of all 16 score components for every trade**, with the maximum for each component and an institute-mean row; zero scores are highlighted
- the six-category rollup
- source file, sheet, assessment date, grade basis and generation timestamp

This is not the web page compressed. In print the screen layout is suppressed
entirely and the one-pager renders in its place, laid out for paper.

The worst case in this dataset is 11 trades, which fits with room to spare.
Beyond roughly 14 trades it would spill onto a second sheet — the layout
degrades gracefully rather than clipping.

### Everything else

**Print** (`Print` button, every other page) renders only the current module. The
sidebar, header, filter controls and every button are removed by
`@media print`; a report header is revealed carrying NAVTTC branding, the module
name, the active filter list, the record count and a timestamp. Page breaks are
controlled so cards and table rows never split.

**PDF** is produced through the same path — choose "Save as PDF" in the print
dialog. This gives true vector output at any page size, which is better quality
than a rasterized client-side PDF and adds no dependency.

**Data export** respects the active filters exactly. If 412 records are on
screen, 412 records leave.

| Format | Notes |
|---|---|
| CSV | UTF-8 with BOM so Excel opens it correctly |
| Excel `.xlsx` | Frozen header, autofilter; ExcelJS loaded on demand |
| JSON | Includes the filter state that produced it |
| PNG | Per chart, 2× pixel ratio |

Filenames carry the filter context, e.g.
`NAVTTC_Geography_PUNJAB_Multan_2026-09-08.csv`.

---

## Verification performed

| Check | Result |
|---|---|
| `npx tsc --noEmit` (strict) | clean |
| `npm run build` | 194 static pages, no errors |
| `npm test` | 14 / 14 passing |
| Row count | 698, matches workbook |
| Institute count | 184, matches "184 TPI" in the filename |
| Σ capacity / registered / present / dropped / verified | 17,065 / 16,517 / 11,404 / 587 / 11,387 — all match a manual audit of the workbook |
| Trade score = Σ of 16 components | verified on all 698 rows |
| Institute score = mean of its trade scores | verified on all 184 |
| Component maxima | sum to exactly 100 |
| Rates on zero denominators | return `null`, render as `—`, never `NaN` |
| Region and package partitions | exhaustive and disjoint (698 each) |

**Not verified:** nobody has clicked through this in a real browser. The build,
the types and the data are machine-checked; the interaction layer — filter
clicks, chart drill-downs, the print dialog on each of the 9 routes, mobile
layout — needs a human pass before this goes in front of anyone senior.

---

## Deliberate omissions

These are absent because the data cannot support them, not because they were
forgotten. Master prompt §4 forbids inventing data, and each of these would
require it.

| Omitted | Reason |
|---|---|
| Trend, time series, calendar heatmap | **The workbook has no date column.** Only the filename carries a date. This is a single snapshot. |
| KPI trend arrows | Same — there is no prior period to compare against. |
| Gender and age analytics | No demographic field exists. Inferring gender from institute names would be fabrication. |
| Pakistan choropleth | Only 4 regions and 25 districts are covered. Sindh, KP and Balochistan are absent, so a national map would render three provinces as empty holes. A region → district treemap is used instead. |
| Sankey diagram | No flow, stage-transition or from/to relationship exists in the data. |
| 3D visualization | Four regions and one snapshot do not justify a ~600 KB Three.js dependency for a decorative hero. |
| Table virtualization | 698 rows render instantly. Virtualization would add complexity with no measurable gain. |
| Programme comparison module | `Program Name` is populated on 264 of 698 rows and holds a single distinct value. It is left blank rather than backfilled. |
| Certification / employment outcomes | Not present in this dataset. |

---

## Known limitations

- **Institute ID 5415 is ambiguous** — it carries two different names, and one
  of those names also appears under ID 23077. Institute identity for that pair
  cannot be resolved from the data alone.
- **`Attendance Score` violates its own rule on 29 rows**, including values of
  8, 17 and 34 that the stated 35/25/10 scheme does not permit.
- **74 component scores exceed their stated maximum**, including a CCTV score of
  35 where the ceiling is 5 — almost certainly a value typed into the wrong
  column. Flagged, not corrected.
- **The client bundle is large.** ECharts is ~1.1 MB and the dataset ~900 KB.
  Both are acceptable for an internal dashboard on a desktop network; on a slow
  connection the first load will be noticeable.
- **No SSR content.** All pages are client-rendered after hydration because
  filter state drives everything, so view-source shows the shell with KPIs at
  zero until hydration completes.
- **Package and Region are the same dimension.** Package-03 is Punjab only;
  Package-02 is AJK, GB and ICT. Any package difference is confounded with
  region, so Package is offered as a filter but never as an explanation.
- **74 component scores exceed their stated maximum**, including a CCTV score of
  35 against a ceiling of 5. Flagged in the Data Quality Center, not corrected.
- **No NAVTTC logo.** None was supplied, so the sidebar uses a placeholder
  wordmark. Drop a real asset into `public/` and update `AppShell.tsx`.

---

## Stack

Next.js 16 (App Router, static export) · React 19 · TypeScript strict ·
Tailwind CSS 4 · Apache ECharts 6 · TanStack Table 8 · Lucide icons · ExcelJS.

No backend, no database, no authentication — none were needed, and master
prompt §77 says not to add them.
