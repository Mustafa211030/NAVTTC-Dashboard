# NAVTTC Programme Analytics

Training Provider Institute monitoring dashboard for **every NAVTTC programme** —
combined portfolio analytics on the home page, and the full module set for each
programme on its own.

| Programme | Rows | Institutes | Rubric | Attendance rule | Assessed |
|---|---|---|---|---|---|
| PMYSDP Batch I | 435 | 198 | 11-criteria checklist (Attendance 50) | Present ÷ Approved | Mar–May 2024 |
| PMYSDP Batch II | 863 | 264 | 15 criteria (Attendance 50) | CNIC ÷ Approved | Apr–May 2025 |
| PMYSDP Batch III | 697 | 184 | 16 components (Attendance 35) | CNIC ÷ Approved | May 2026 |
| Cluster Based Training Programme B-I | 8 | 6 | 15 criteria | CNIC ÷ Enrolled | not recorded |
| Cluster Based Initiative (CBI) B-II | 62 | 26 | 15 criteria | CNIC ÷ Enrolled | not recorded |
| NSIS Industrial Cluster B-II (AJK) | 12 | 10 | 15 criteria | CNIC ÷ Enrolled | not recorded |

**2,077 assessment rows · 688 programme-institutes · 460 unique institutes · 30 districts · 4 regions.**

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run data` | Reads every `data/programs/<slug>/source.xlsx` → writes `public/data/portfolio.json` |
| `npm run dev` | Rebuild data, then start the dev server |
| `npm run build` / `npm start` | Rebuild data, production build, serve |
| `npm test` | 31 regression tests over the generated portfolio |

Requires Node 20+. The AI assistant needs `GROQ_API_KEY` (and optionally `GROQ_MODEL`) in `.env.local`.

---

## How the dashboard is organised

```
/                         All Programmes — portfolio overview (home)
/programmes               Compare programmes side by side
/institutions             Every institute in every programme
/institutions/<key>       One institute across all programmes it was assessed in
/journey                  Institute journeys between programmes (B-I → B-II → B-III)
/geography /trades /performance /explorer /reports /data-quality /methodology

/p/<programme>            The same modules for ONE programme
/p/<programme>/institutions/<id>   Institute profile + one-page A4 report
```

Every module is written once (`src/modules/*`) and renders for whichever scope
the URL is in. The **scope switcher** in the header (and the sidebar) moves
between All Programmes and any programme while keeping you on the same module
and carrying your filters across.

### Filters, at three levels

1. **Global filter bar** — Programme (portfolio scope), Region → District (cascading),
   Trade, Grade; under *More filters*: Package, Batch, Institute status, trade-score
   range, flagged-only. Option lists show live counts; filters live in the URL so a
   link reproduces the view.
2. **Programme scope** — inside `/p/<programme>` the programme is fixed and every
   option list contains only that programme's values.
3. **Per-chart controls** — every chart has its own controls: *group by*, *metric*,
   *Top-N*, *sort*, *minimum n*, a chart-only programme filter, split/stack toggles.
   Clicking a bar, segment, cell or bubble pushes that value into the global filters
   (or opens the institute).

Every chart shows its values on the marks, and offers fullscreen, PNG download,
"view data" and CSV of exactly what is plotted. `Ctrl/⌘ K` opens a command palette
to jump to any programme, page or institute, or to filter by district or trade.

---

## Adding or updating a programme

```bash
mkdir data/programs/<slug>
cp NEW_FILE.xlsx data/programs/<slug>/source.xlsx
# register it in scripts/programs.config.mjs (name, rubric, attendance rule, colour)
npm run data && npm test
```

No page, chart or component is edited. Details:

- **Workbook layout.** Sheet `Combined Sheet`, NAVTTC template columns A–R in place.
  Score columns are located **by header text** against the programme's rubric, so a
  programme whose criteria sit in a different order still ingests correctly.
- **Rubric.** Pick one in `RUBRICS` (`b3-16`, `std-15`, `checklist-11`) or add one;
  each criterion is mapped to one of the six shared categories. Maxima must total 100
  (a test enforces it).
- **Attendance rule.** One of `cnic/approved`, `present/approved`, `cnic/enrolled` — as
  stated in the workbook's *Scoring Criteria* sheet.
- **Tests.** `npm test` fails on purpose when a workbook changes. Read the diff, confirm
  the new figures, update that programme's baseline in `tests/data.test.mjs`.

Optional workbook columns are picked up automatically when present: Date of Visit,
Duration, Trade Category / Sector, Division, Tehsil, Release recommendation, monitor
remarks, instructor details. The *Scoring Criteria* notes and *Change Log* sheets are
imported and shown on the Methodology and Data Quality pages.

---

## How numbers are made

- **Trade score** = Σ of the programme's criteria (recomputed; stored value kept for audit).
- **Institute score** = mean of its trade scores; rows with no scores (closed) are excluded
  from the mean but kept in headcounts.
- **Grade** = score band (80 / 70 / 60 / 50) unless the workbook records a **Grade
  Override** (Poor for fake / non-functional, Closed) — exactly the workbook's own formula.
- **Attendance %** = pooled under each programme's own rule. **CNIC verified % of seats**
  is computed identically everywhere and is the strict like-for-like comparison.
- **Rates are pooled** (Σ numerator ÷ Σ denominator), never averages of percentages.
- **Comparing programmes.** Rubrics differ, so cross-programme charts use institute score,
  rates, grade shares and the **six shared categories** (Attendance & Biometric,
  Infrastructure & Equipment, Trainer Quality, Training Delivery, Industry Linkage,
  Feedback & Impression) as a percentage of each category's maximum. A category a
  rubric does not score (e.g. Trainer in PMYSDP B-I) is blank, never zero.
- **Institute identity across programmes** — linked on Institute ID; CBI B-II records no
  IDs, so its institutes are identified by name. 111 institutes appear in both B-I and
  B-II, 105 in B-II and B-III, 69 in B-I and B-III. IDs whose names differ between
  programmes are listed on the Data Quality page.

---

## Project structure

```
data/programs/<slug>/source.xlsx    ← the only inputs
scripts/programs.config.mjs         ← programme registry, rubrics, attendance rules
scripts/build-data.mjs              ← ingest → validate → derive → aggregate → link
public/data/portfolio.json          ← generated (fetched by the browser, read by the AI route)
tests/data.test.mjs                 ← per-programme regression baselines
src/
  modules/                          ← one file per module, scope-aware
  app/                              ← thin route files: / and /p/[program]/…
  components/
    providers/FilterProvider.tsx    ← data + scope + filters (URL-synced)
    layout/                         ← sidebar, scope switcher, command palette
    charts/blocks.tsx               ← interactive chart blocks with per-chart controls
    charts/ComponentBars.tsx        ← rubric criteria charts and cross-programme matrix
    filters/FilterBar.tsx           ← global cascading filters
  lib/
    aggregate.ts                    ← KPIs, grouping, metric registry, distributions
    dims.ts                         ← dimension registry used by "group by" controls
    filters.ts / portfolio.ts       ← filter engine, URL state, indexes, route helpers
    chat-tools.ts                   ← programme-aware AI assistant tools
```

Stack: Next.js 16 · React 19 · TypeScript strict · Tailwind 4 · ECharts 6 · TanStack Table 8 · ExcelJS.

## Deploying

The AI assistant uses server routes (`/api/chat`, `/api/transcribe`), so deploy to a
Node host (Vercel, Netlify with Next runtime, any `npm start` server). Every page is
client-rendered from `public/data/portfolio.json` (≈3.7 MB raw, ≈0.4 MB gzipped).

## Known limitations

- Three cluster workbooks have no visit dates, so they sit after the dated PMYSDP
  batches on the timeline.
- Trades are matched across programmes on normalised names; near-identical spellings
  that differ by more than case/spacing/punctuation remain separate trades.
- PMYSDP B-III keeps the data-quality findings from its first audit (see
  `docs/AUDIT_FINDINGS.md`): a mislabelled stored Attendance % column, components over
  their maximum, and stored totals that disagree with their trade rows.
