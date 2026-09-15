# DASHBOARD_INVENTORY.md

Mandated by master prompt §63 and §64. This is the complete inventory of the existing `index.html`, so the rebuild can be verified against it rather than guessed at.

**File:** `index.html` — 638 KB, 1,190 lines, single self-contained file
**Dependency:** Chart.js 4.4.0 via jsDelivr CDN. That is the only external resource.
**Assets:** none. No images, no logo file, no CSS or JS files, no SVG. 20 `<canvas>`, 0 `<svg>`.
**Data:** `const RAW_DATA = [...]` at offset 23,094 — 698 records, 34 keys, ~590 KB of the 638 KB total.

> **Note on branding (§8):** no NAVTTC logo or brand asset was supplied. The current dashboard uses emoji as KPI icons (📍 👥 📅 ⭐). A logo file will be needed, or the header ships as a wordmark.

---

## 1. Sections (5)

Single-page app. `showSection(id)` toggles `#sec-*` visibility. No router, no URL state.

| ID | Name | Rebuild route |
|---|---|---|
| `overview` | Overview | `/` |
| `rankings` | Rankings | `/institutions` |
| `institute` | Institute Profile | `/institutions/[id]` |
| `regional` | Regional Analysis | `/geography` |
| `category` | Category Analysis | `/performance` |

The master prompt's §9 sidebar suggests 13 modules and §54 suggests 11 routes. **This dataset supports 5 existing + at most 3 new** (Data Explorer, Data Quality, Methodology). Routes for Programs, Training, Beneficiaries, Demographics have no data behind them — §54's own caveat applies: *"ONLY create modules supported by the existing dashboard/data."*

---

## 2. KPIs (4)

From `renderKPIs()`. All recompute against `filteredData`.

| # | Label | Current logic | Value | Rebuild note |
|---|---|---|---|---|
| 1 | Total Institutes | distinct `institute_id` | 184 | Carry forward as-is |
| 2 | Registered Trainees | `Σ biometric_registered`, sub-line shows dropped count and % | 16,517 / 587 (3.6%) | Carry forward |
| 3 | Avg Attendance | `avg(rows, 'attendance_pct') × 100` | 66.9% | **Two defects.** Averages a rate instead of pooling; sources the mislabelled column R. See AUDIT 2.2 |
| 4 | Excellent Institutes | count where `institute_score ≥ 85` | 52 | **Blocked on Decision 1.** Excel `Grading` says 81 |

§15 asks for trend indicators on KPIs. Not possible — no time dimension. §17 methodology tooltips are absent from the current build and should be added; this dataset needs them more than most.

---

## 3. Charts (20 canvases)

All Chart.js. Several are `responsive:false`, which is why they do not scale — this is the root of the §21 sharpness requirement.

### Overview (7)

| Canvas | Type | Shows | Rebuild |
|---|---|---|---|
| `ch-tier` | Doughnut | Institutes per performance tier, custom legend | Keep. Add click-to-filter (§22) |
| `ch-heatmap` | Matrix-style bar | Region × Package | Keep, upgrade to real heatmap |
| `ch-radar` | Radar | 6 category scores vs maxima | Keep — strongest chart in the build |
| `ch-dist-h` | Horizontal bar | District distribution | Keep, add Top-N control |
| `ch-attend` | Bar | Attendance distribution | Keep, re-source to computed rate |
| `ch-package` | Bar | Package comparison | Keep |
| `ch-spread` | Histogram | Score bins in 10s (0–90) | Keep, add box-plot toggle |

### Rankings (3)

| Canvas | Type | Shows | Rebuild |
|---|---|---|---|
| `ch-top5bot5` | Bar | Top 5 / Bottom 5 institutes | Keep. Feeds §28 |
| `ch-pkg-rank` | Bar | Mean score by package | Keep |
| `ch-dist-rank` | Bar | Mean score by district | Keep |

### Regional (4)

`ch-reg-ajk`, `ch-reg-gb`, `ch-reg-ict`, `ch-reg-punjab` — one bar chart per region, hardcoded as `const regions=['AJK','GB','ICT','PUNJAB']` and a fixed `chartIds` map.

**This is the one genuinely hardcoded structure in the file** and it violates §69. If a region is ever added the page breaks silently. Rebuild as a data-driven small-multiples grid.

### Category (6)

| Canvas | Category | Max |
|---|---|---|
| `ch-cat-bar` | All six, comparative | 100 |
| `ch-bio` | Biometric & Attendance | 45 |
| `ch-infra` | Infrastructure | 15 |
| `ch-trainer` | Trainer Assessment | 10 |
| `ch-industry` | Industry Engagement | 10 |
| `ch-delivery` | Training Delivery | 17.5 |

Student Feedback (max 2.5) has no dedicated canvas — the only category without one. Minor gap; worth closing.

**Missing from every chart:** fullscreen, download, view-data, zoom, click-to-filter, reset. §22–23 require all of these.

---

## 4. Filters (3 global + 2 local)

| Control | Type | Populated from | Behaviour |
|---|---|---|---|
| `f-package` | select | `RAW_DATA` distinct package | Global |
| `f-region` | select | `RAW_DATA` distinct region | Global |
| `f-district` | select | `RAW_DATA` distinct district | Global |
| `rank-by` | select | static | Rankings sort only |
| `rank-search` | text | — | Client-side filter on the ranking table |
| `inst-select` | select | 184 institutes | Institute profile picker |

**Gaps against §11–14:**

- **No cascading.** `f-district` is populated once from the full dataset and never re-filtered when region changes, so you can select PUNJAB + Skardu and get zero rows with no explanation. §13 explicitly requires this be fixed.
- No Trade filter — despite 70 trades being the most analytically interesting dimension in the dataset.
- No Batch filter, no score-range filter, no tier filter.
- No active-filter chips, no Clear All (`resetFilters()` exists but has no chip UI).
- No URL state (§55).
- `rank-search` is a local input, not the global search of §33.

---

## 5. Tables (3)

| Table | Content | Features |
|---|---|---|
| Rankings | 184 institutes, sortable by `rank-by` | Sort, text search |
| Institute score breakdown | 16 components via `sbRow()` | Static |
| Institute trade list | Trades per selected institute | Static |

None have pagination, column management, row selection, export, or sticky headers. §30–32 require a full Data Explorer over all 698 rows with all 37 columns — **this does not exist at all today** and is the single largest functional addition in the rebuild.

---

## 6. Export and print

| Feature | Status |
|---|---|
| `exportInstReport()` | Opens a new window with the institute profile and calls `window.print()` |
| `@media print` | **1 rule.** Effectively no print stylesheet |
| CSV export | Absent |
| Excel export | Absent |
| PDF export | Absent |
| Chart image export | Absent |
| Per-page print | Absent — only the institute profile can be printed |

Against §39–44 this is the weakest area of the existing build. Four of the five required export formats do not exist, and print works on one of five pages.

---

## 7. Functions (22)

| Function | Purpose | Disposition |
|---|---|---|
| `getTier` | score → tier | Port to `lib/calculations/tiers.ts`. **Blocked on Decision 1** |
| `avg`, `sum` | array reducers | Replace with null-safe versions |
| `dc` | destroy chart before re-render | Obsolete — React handles this |
| `initFilters` | populate selects | Rebuild with cascading |
| `applyFilters` | filter `RAW_DATA` → `filteredData` | Port to `lib/filters/`, add URL sync |
| `resetFilters` | clear all | Keep, add chip UI |
| `getInstituteData` | **row → institute aggregation** | **Core business logic.** Port carefully; fix the rate-averaging defect |
| `renderAll` | orchestrator | Obsolete |
| `renderSummary` | header text | Fold into PageHeader |
| `renderKPIs` | 4 KPI cards | Rebuild as `<KPIGrid>` |
| `renderOverviewCharts` | 7 charts | Split into 7 components |
| `renderRankings`, `rankTable`, `filterRankTable` | rankings | Replace with TanStack Table |
| `initInstituteSelect`, `loadInstituteProfile`, `sbRow` | institute profile | Rebuild as a route |
| `exportInstReport` | print institute | Generalize to all pages |
| `renderRegional` | 4 hardcoded region charts | Rebuild data-driven |
| `renderCategoryCharts` | 6 category charts | Rebuild data-driven |
| `showSection` | tab switch | Replace with App Router |

**`getInstituteData()` is the most valuable thing in the file** — it defines what an "institute" means when the data is stored per trade-batch. Port it deliberately, with the two fixes noted in DATA_MAPPING.

---

## 8. Constants to preserve

| Constant | Content | Status |
|---|---|---|
| `TIERS` | 5 tiers, thresholds, colors, CSS classes | **Thresholds blocked on Decision 1.** Colors are usable |
| `CATEGORIES` | 6 categories → component columns, maxima sum to 100 | **Preserve verbatim.** Legitimate analytical model, not in the Excel |
| `SCORE_COLS` | 16 components → max + display label | **Preserve verbatim.** These labels are far more readable than the Excel headers |

`SCORE_COLS` and `CATEGORIES` are institutional knowledge that exists nowhere in the workbook. Losing them would be exactly the §64 failure the master prompt warns about.

---

## 9. Preservation checklist

Verify each before declaring completion (§86):

- [ ] All 5 sections have a route
- [ ] All 4 KPIs present (2 with corrected calculations)
- [ ] All 20 charts present or consciously merged with a documented reason
- [ ] `getInstituteData()` aggregation semantics preserved
- [ ] `TIERS`, `CATEGORIES`, `SCORE_COLS` carried forward
- [ ] All 3 global filters still work, now cascading
- [ ] Institute profile reachable for all 184 institutes
- [ ] Institute report still printable
- [ ] Ranking sort options preserved
- [ ] Ranking search preserved, promoted to global search

### Deliberate removals

| Removed | Reason |
|---|---|
| `dc()` chart-destroy helper | React lifecycle handles it |
| `showSection()` | Replaced by App Router |
| `renderAll()` orchestrator | Replaced by React rendering |
| Hardcoded `regions` / `chartIds` in `renderRegional` | Violates §69; replaced with data-driven small multiples |
| Emoji KPI icons | Replaced with Lucide icons per §79 |

Nothing analytical is removed.

---

## 10. What the rebuild adds

| Addition | Driver |
|---|---|
| Data Explorer over all 698 × 37 | §30–33 — does not exist today |
| Data Quality Center | §37–38 — this dataset has 10 documented defect classes |
| Trade dimension (70 trades) | Present in the data, entirely unused by the current dashboard |
| `Grading` free-text assessor notes | Present in the Excel, not imported today. Highest-value unused field |
| Cascading filters + chips + URL state | §13, §14, §55 |
| Per-page print and PDF/CSV/Excel/PNG export | §39–44 |
| KPI methodology tooltips | §17, §60 — critical given the definitional problems in AUDIT §2 |
| Responsive layout, dark mode, WCAG AA | §45–47, §50 |
| Regression tests on the §4 baseline figures | §85 |
