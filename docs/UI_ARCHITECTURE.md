# UI architecture — design system v2

This note records the UI decisions behind the redesign and where each one lives in the code.

## 1. Tokens: three layers

All colour, radius, shadow and easing values come from `src/app/globals.css`. Each layer may only reference the layer above it.

| Layer | What it holds | Examples |
|---|---|---|
| Primitives | Raw palette | `--color-ink-50…950` (slate), accent ramps, state hues |
| Semantic | Meaning, switched by theme, accent and density | `--bg`, `--surface`, `--surface-2` (sunken), `--surface-3` (hover/track), `--elevated`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--text-subtle`, `--glass`, `--overlay`, `--shadow-card/lift/pop`, `--glow` |
| Components | Reusable classes | `.card`, `.card-hover`, `.glass`, `.pop`, `.ctl`, `.hero-surface`, `.bg-accent-grad`, `.t-display / .t-title / .t-label / .t-eyebrow` |

- **Dark mode** uses layered slate, not black: `#090d16` (canvas), `#111827` (cards), `#1f2937` (hover and tracks).
- **Accent** is a runtime variable (`[data-accent]`). Tailwind's `brand-*` utilities resolve to it through `@theme inline`, so Settings → Accent re-themes the whole app without a rebuild. Programme colours stay fixed, because they carry meaning.
- **Density** (`[data-density]`) changes `--gap`, `--pad` and `--row-y`. Card grids, card padding and table rows all read these.
- **Geometry**: cards use 14px corners, inner elements 10px, inputs 8px.
- **Typography**: Inter with `cv11/ss01/ss03`, tabular numbers everywhere, and a fixed 4-step type scale.

## 2. Motion: hybrid, cheap by default

| Effect | Mechanism | Cost |
|---|---|---|
| Route enter (fade up) | `app/template.tsx` + CSS `.page-enter` (re-mounts only on navigation, never when filtering) | 0 JS |
| KPI and card entrance | CSS `.stagger` | 0 JS |
| Theme switch | `document.startViewTransition` cross-fade (progressive enhancement) | 0 JS lib |
| Sliding nav and segmented-control pills, toggle knob | Motion `layoutId` / `layout` | Motion, loaded lazily (`LazyMotion` + `domMax` in its own chunk) |
| Modals, drawers, popovers, chips (enter **and** exit) | Motion `AnimatePresence` via `Overlay` and `Popover` | same chunk |
| Count-ups | rAF writing straight to the text node (no React render per frame) | ~0 |
| Sparklines | CSS stroke-dash draw-on | 0 JS |

Reduced motion follows the OS setting, or can be forced in Settings. CSS animations collapse to 0.01ms and Motion uses `reducedMotion="always"`.

## 3. Layout and navigation

- **Floating obsidian-glass sidebar.** It is dark in both themes, which anchors navigation. It has a shared sliding active pill, an icon rail (`Ctrl+\`, state remembered), and per-programme mean scores. Module lists expand and collapse with height animation.
- **Glass header.**
  - Scope switcher with an animated popover.
  - Breadcrumbs.
  - `Ctrl+K` command palette with an animated selection highlight, footer key hints and scroll-into-view.
  - Live data-status popover listing every source workbook.
  - Alerts centre.
  - Theme toggle.
  - Settings.
- **Filter bar.** A sticky glass card. On phones it collapses behind a *Filters (n)* button. A records-in-view meter shows how much the filters remove.
- **Scroll masks** cover the small gaps above the floating header and filter bar, so content never peeks through.

## 4. New modules

- **Alerts centre** (`layout/useAlerts.ts`, `AlertsCenter.tsx`). Covers integrity flags (fake, critical, non-functional, closed), score drops of 10+ points between an institute's programmes, and high-severity workbook findings.
  - Unread state is stored per browser.
  - Tabs filter by alert type.
  - Each alert can be opened, or focused with the crosshair.
- **Settings** (`/settings`).
  - Options: theme (light / dark / system, with previews), accent, density, motion, chart value labels, start-up view, stored-data resets, and the shortcut list.
  - All panels share one grid cell, so switching tabs never shifts the layout.
- **KPI sparklines and trend pills** (`dashboard/useBatchTrend.ts`). Each KPI is computed for every batch of the programme family under the *current filters*.
  - The sparkline highlights the point for the scope in view.
  - The pill compares it with the previous batch: % for counts, pp for rates, points for scores. Inverted colours apply where lower is better.
  - Cluster programmes have no batch history, so their pill compares with all programmes instead.
- **Range selector** (Latest / Last 2 / All) on the programme timeline.

## 5. Performance

- **Lazy charts.** An ECharts instance is created only when its card comes within 300px of the viewport. The ECharts chunk is warmed in idle time.
  - `beforeprint` creates any remaining charts synchronously (with `flushSync`), so a printout never shows a skeleton.
- **`content-visibility: auto`** on every chart card, with an intrinsic size estimate. Off-screen SVG charts skip layout and paint, and the print stylesheet turns this off.
- **Portalled tooltips and popovers** (`position: fixed`), so containment and `overflow: hidden` never clip them.
- **Resize work** is coalesced to one rAF per chart.
- **Glass is used only on floating chrome** (header, sidebar, filter bar, popovers), never on the dozens of cards, to keep the GPU cost of `backdrop-filter` low.
- **No flash of the wrong theme.** A 600-byte inline script applies the stored theme, accent, density and motion settings before first paint.

## 6. States checklist (every interactive element)

| State | How it is shown |
|---|---|
| Default | Defined by the variant |
| Hover | Surface or border shift; cards lift 2px and their border tints toward the accent |
| Pressed | `.ctl:active` → scale .97 |
| Focus | Global 2px accent `:focus-visible` ring |
| Disabled | `.ctl:disabled` → 45% opacity, `not-allowed` cursor |
| Selected | Accent ring or sliding pill |

Keyboard support:

- Segmented controls are radio groups with roving tabindex and arrow keys.
- Overlays trap Tab, close on Escape and return focus to the trigger.
