"use client";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import type { EChartsOption, ECharts } from "echarts";
import { Maximize2, Minimize2, Minus, Plus, RotateCcw, MapPin, Info } from "lucide-react";
import { useFilters } from "@/components/providers/FilterProvider";
import { Card, Badge, Skeleton } from "@/components/ui";
import { groupBy } from "@/lib/aggregate";
import { coordsFor } from "@/data/districtCoords";
import geo from "@/data/pakistan-provinces.json";
import { fmtInt, fmtPct, fmtScore, GRADE_COLORS, computedTier } from "@/config";

/**
 * Interactive map of Pakistan, wired to the live filter state.
 *
 * Performance notes — the three things that made the first version stutter:
 *
 *  1. Chart hover fed React state. `mouseover` fires continuously while the
 *     pointer moves, and every event re-rendered the component, the 26-row
 *     district rail and the memoised ECharts option. Hover is now handled
 *     entirely inside ECharts; the rail talks to the chart through
 *     dispatchAction and never re-renders on hover.
 *
 *  2. Provinces and bubbles sat on two different coordinate systems. A hidden
 *     `geo` component carried the scatter while a `map` series carried the
 *     polygons, each with its own roam state, so zooming moved one and not the
 *     other. There is now a single `geo` component; the map series binds to it
 *     with `geoIndex`, so one pan/zoom drives both layers.
 *
 *  3. Every update called setOption with notMerge, which tears down and
 *     rebuilds the chart including re-parsing the geometry. Updates now merge
 *     and run lazily, so changing a filter animates instead of flashing.
 *
 * Wheel zoom anchors on the pointer, which is ECharts' default once the
 * coordinate systems are unified. The +/- buttons anchor on the centre of the
 * canvas, measured at click time rather than assumed.
 */

type MetricKey = "institutes" | "trades" | "registered" | "verified" | "attendance" | "score";

const METRICS: { key: MetricKey; label: string; short: string; format: (n: number) => string }[] = [
  { key: "institutes", label: "Institutes", short: "TPIs", format: (n) => fmtInt(n) },
  { key: "trades", label: "Distinct trades", short: "Trades", format: (n) => fmtInt(n) },
  { key: "registered", label: "Trainees registered", short: "Registered", format: (n) => fmtInt(n) },
  { key: "verified", label: "CNIC verified", short: "Verified", format: (n) => fmtInt(n) },
  { key: "attendance", label: "Attendance %", short: "Attendance", format: (n) => n.toFixed(1) + "%" },
  { key: "score", label: "Mean score", short: "Score", format: (n) => n.toFixed(1) },
];

/** Fits Pakistan to the canvas without depending on aspect ratio. */
const BOUNDS: [[number, number], [number, number]] = [[60.6, 37.3], [78.1, 23.4]];
const UNCOVERED_LIGHT = "#e8edf3";
const UNCOVERED_DARK = "#1b293d";

export function PakistanMap() {
  const { rows, filters, patch, isEmpty } = useFilters();
  const [metric, setMetric] = useState<MetricKey>("institutes");
  const [ready, setReady] = useState(false);
  const [full, setFull] = useState(false);
  const [dark, setDark] = useState(false);

  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  const def = METRICS.find((m) => m.key === metric)!;

  /* ------------------------- aggregation ------------------------- */

  const tradesByKey = useCallback((keyFn: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, Set<number>>();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(r.tradeCode);
    }
    return m;
  }, [rows]);

  const regionStats = useMemo(() => {
    const t = tradesByKey((r) => r.region);
    return new Map(groupBy(rows, (r) => r.region).map((s) => [s.key, { ...s, trades: t.get(s.key)?.size ?? 0 }]));
  }, [rows, tradesByKey]);

  const districtStats = useMemo(() => {
    const t = tradesByKey((r) => r.district);
    return groupBy(rows, (r) => r.district)
      .map((s) => ({ ...s, trades: t.get(s.key)?.size ?? 0, coords: coordsFor(s.key) }))
      .filter((s) => s.coords !== null);
  }, [rows, tradesByKey]);

  const unplaced = useMemo(
    () => [...new Set(rows.map((r) => r.district))].filter((d) => !coordsFor(d)),
    [rows]);

  const valueOf = useCallback(
    (s: { institutes: number; trades: number; registered: number; verified: number; attendanceRate: number | null; meanScore: number }) => {
      switch (metric) {
        case "institutes": return s.institutes;
        case "trades": return s.trades;
        case "registered": return s.registered;
        case "verified": return s.verified;
        case "attendance": return (s.attendanceRate ?? 0) * 100;
        case "score": return s.meanScore;
      }
    }, [metric]);

  const provinces = useMemo(() => geo.features.map((f) => {
    const region = f.properties.region as string | null;
    const s = region ? regionStats.get(region) : undefined;
    return {
      name: f.properties.name as string,
      region,
      covered: Boolean(s),
      stats: s ?? null,
      value: s ? valueOf(s) : NaN,
    };
  }), [regionStats, valueOf]);

  /** Rail order, memoised so scrolling and hovering never re-sort. */
  const rail = useMemo(
    () => [...districtStats].sort((a, b) => valueOf(b) - valueOf(a)),
    [districtStats, valueOf]);

  const bubbles = useMemo(() => districtStats.map((d) => ({
    name: d.key,
    value: [d.coords![0], d.coords![1], valueOf(d)],
    stats: d,
  })), [districtStats, valueOf]);

  /** Rail row → scatter dataIndex, for cross-highlighting without a re-render. */
  const bubbleIndex = useMemo(
    () => new Map(bubbles.map((b, i) => [b.name, i])), [bubbles]);

  const covered = provinces.filter((p) => p.covered);
  const values = covered.map((p) => p.value).filter((v) => !Number.isNaN(v));
  const maxProvince = Math.max(...values, 1);
  const minProvince = Math.min(...values, 0);
  const maxBubble = Math.max(...bubbles.map((b) => b.value[2]), 1);

  /* --------------------------- theme --------------------------- */

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains("dark"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  /* --------------------------- option --------------------------- */

  const option: EChartsOption = useMemo(() => {
    const text = dark ? "#c6d3e2" : "#33455a";
    const border = dark ? "#2b405c" : "#ffffff";
    const uncovered = dark ? UNCOVERED_DARK : UNCOVERED_LIGHT;

    const regionsStyle = provinces
      .filter((p) => !p.covered || filters.region.includes(p.region!))
      .map((p) => ({
        name: p.name,
        itemStyle: p.covered
          ? { areaColor: "#f59e0b", borderColor: "#b45309", borderWidth: 1.6 }
          : { areaColor: uncovered, opacity: 0.9 },
        emphasis: p.covered ? undefined : { itemStyle: { areaColor: uncovered }, label: { show: false } },
        silent: !p.covered,
      }));

    return {
      backgroundColor: "transparent",
      // Smooth transitions when a filter or metric changes, no entrance replay.
      animationDuration: 260,
      animationDurationUpdate: 320,
      animationEasingUpdate: "cubicOut",
      tooltip: {
        trigger: "item",
        // Follow the pointer without re-laying out on every pixel.
        transitionDuration: 0.12,
        confine: true,
        backgroundColor: dark ? "#17263d" : "#fff",
        borderColor: dark ? "#24374f" : "#dde5ed",
        textStyle: { color: text, fontSize: 12 },
        extraCssText: "box-shadow:0 8px 24px rgba(10,21,38,.18);border-radius:8px;max-width:270px;",
        formatter: (p: unknown) => {
          const q = p as { seriesType: string; name: string; data?: { stats?: (typeof districtStats)[number] } };
          const s = q.seriesType === "scatter"
            ? q.data?.stats
            : provinces.find((x) => x.name === q.name)?.stats ?? undefined;
          if (q.seriesType === "map" && !s)
            return `<b>${q.name}</b><br/><span style="opacity:.7">Not part of this assessment round</span>`;
          if (!s) return "";
          const title = q.seriesType === "scatter" ? s.key : q.name;
          return `<b>${title}</b><br/>
            ${s.institutes} institutes · ${s.trades} trades<br/>
            ${fmtInt(s.registered)} registered · ${fmtInt(s.verified)} CNIC verified<br/>
            Attendance ${fmtPct(s.attendanceRate)}<br/>
            Mean score <b>${fmtScore(s.meanScore, 1)}</b><br/>
            <span style="opacity:.6;font-size:11px">Click to filter</span>`;
        },
      },
      visualMap: {
        show: covered.length > 1,
        left: 10,
        bottom: 10,
        min: Math.floor(minProvince),
        max: Math.ceil(maxProvince),
        calculable: true,
        itemWidth: 10,
        itemHeight: 88,
        text: [def.short, ""],
        textStyle: { color: text, fontSize: 10 },
        inRange: { color: dark ? ["#16324f", "#1d4ed8", "#2dd4bf"] : ["#dbeafe", "#3b82f6", "#0d9488"] },
        seriesIndex: 0,
      },
      /*
       * ONE coordinate system. Both layers bind to it, so pan and zoom move
       * polygons and bubbles together and wheel zoom anchors on the pointer.
       */
      geo: {
        map: "pakistan",
        roam: true,
        // Throttle roam repaints; without it every wheel tick forces a full redraw.
        scaleLimit: { min: 0.85, max: 14 },
        boundingCoords: BOUNDS,
        aspectScale: 0.86,
        itemStyle: { areaColor: uncovered, borderColor: border, borderWidth: 0.9 },
        emphasis: {
          label: { show: true, color: dark ? "#fff" : "#0a1526", fontWeight: "bold", fontSize: 11 },
          itemStyle: { areaColor: "#f59e0b", borderWidth: 1.6, shadowBlur: 10, shadowColor: "rgba(245,158,11,.45)" },
        },
        label: {
          show: true,
          fontSize: 9.5,
          color: dark ? "#93a7bd" : "#5b6f86",
          formatter: (p: { name: string }) =>
            provinces.find((x) => x.name === p.name)?.covered ? p.name : "",
        },
        regions: regionsStyle,
        z: 1,
      },
      series: [
        {
          // Binds to geo above rather than owning its own coordinate system.
          type: "map",
          geoIndex: 0,
          name: def.label,
          data: provinces.map((p) => ({ name: p.name, value: p.value })),
        },
        {
          type: "scatter",
          coordinateSystem: "geo",
          geoIndex: 0,
          data: bubbles,
          large: false,
          symbolSize: (v: unknown) => 7 + Math.sqrt(Math.max((v as number[])[2] ?? 0, 0) / maxBubble) * 22,
          itemStyle: {
            color: (p: unknown) =>
              GRADE_COLORS[computedTier((p as { data: { stats: { meanScore: number } } }).data.stats.meanScore).label],
            borderColor: dark ? "#0a1526" : "#fff",
            borderWidth: 1.2,
            opacity: 0.92,
          },
          emphasis: { scale: 1.3, itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,.34)" } },
          zlevel: 2,
        },
        {
          // Ripple marks districts the user has filtered to. Non-interactive so
          // it never competes with the scatter for hit-testing.
          type: "effectScatter",
          coordinateSystem: "geo",
          geoIndex: 0,
          silent: true,
          showEffectOn: "render",
          rippleEffect: { scale: 2.8, brushType: "stroke", period: 3.4 },
          data: bubbles.filter((b) => filters.district.includes(b.name)),
          symbolSize: (v: unknown) => 7 + Math.sqrt(Math.max((v as number[])[2] ?? 0, 0) / maxBubble) * 22,
          itemStyle: { color: "#f59e0b", borderColor: "#fff", borderWidth: 1.3 },
          zlevel: 3,
        },
      ],
    } as EChartsOption;
  }, [provinces, bubbles, districtStats, filters.region, filters.district, dark, def, maxBubble, maxProvince, minProvince, covered.length]);

  /* ------------------------ init once ------------------------ */

  // Live refs so the once-bound click handler always reads current state.
  const provincesRef = useRef(provinces); provincesRef.current = provinces;
  const filtersRef = useRef(filters); filtersRef.current = filters;
  const patchRef = useRef(patch); patchRef.current = patch;

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | undefined;
    let raf = 0;

    (async () => {
      const echarts = await import("echarts");
      echarts.registerMap("pakistan", geo as never);
      if (disposed || !elRef.current) return;

      const inst = echarts.init(elRef.current, undefined, { renderer: "canvas", useDirtyRect: true });
      chartRef.current = inst;
      setReady(true);

      inst.on("click", (p: { seriesType?: string; componentType?: string; name?: string }) => {
        const f = filtersRef.current;
        if (p.seriesType === "scatter") {
          const name = p.name!;
          patchRef.current({
            district: f.district.includes(name) ? f.district.filter((x) => x !== name) : [...f.district, name],
          });
          return;
        }
        const prov = provincesRef.current.find((x) => x.name === p.name);
        if (!prov?.region || !prov.covered) return;
        patchRef.current({
          region: f.region.includes(prov.region) ? f.region.filter((x) => x !== prov.region) : [...f.region, prov.region],
        });
      });

      // Coalesce resize into one frame instead of firing per observer callback.
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => inst.resize());
      });
      ro.observe(elRef.current);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  /* --------- merge updates: no teardown, no geometry re-parse --------- */
  useEffect(() => {
    /*
     * Deferred by a frame. A click on the map calls patch(), which updates
     * filter state and schedules this effect — and React can run it while
     * ECharts is still inside its own event dispatch, which triggers
     * "setOption should not be called during main process". Waiting a frame
     * guarantees the dispatch has finished.
     */
    const id = requestAnimationFrame(() => {
      const inst = chartRef.current;
      if (!inst || inst.isDisposed()) return;
      inst.setOption(option, { notMerge: false, lazyUpdate: true });
    });
    return () => cancelAnimationFrame(id);
  }, [option]);

  useEffect(() => {
    const t = setTimeout(() => chartRef.current?.resize(), 80);
    return () => clearTimeout(t);
  }, [full]);

  /* ------------------------- controls ------------------------- */

  /** Zoom about the centre of the canvas, measured now rather than assumed. */
  const zoomBy = useCallback((factor: number) => {
    const inst = chartRef.current;
    const el = elRef.current;
    if (!inst || inst.isDisposed() || !el) return;
    inst.dispatchAction({
      type: "geoRoam",
      componentType: "geo",
      geoIndex: 0,
      zoom: factor,
      originX: el.clientWidth / 2,
      originY: el.clientHeight / 2,
    });
  }, []);

  /**
   * Reset re-applies the complete option with notMerge, which rebuilds the geo
   * component at its default fit.
   *
   * It must not send a partial `{ geo: { zoom, center } }` patch: merging that
   * produces a geo component with no `map` name, and ECharts then throws
   * "Map  not exists" followed by a crash reading `.regions`. The full option
   * always carries `map: "pakistan"`.
   */
  const resetView = useCallback(() => {
    const inst = chartRef.current;
    if (!inst || inst.isDisposed()) return;
    inst.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  /** Rail hover highlights the bubble without touching React state. */
  const highlight = useCallback((name: string | null) => {
    const inst = chartRef.current;
    if (!inst || inst.isDisposed()) return;
    inst.dispatchAction({ type: "downplay", seriesIndex: 1 });
    if (name === null) return;
    const i = bubbleIndex.get(name);
    if (i !== undefined) inst.dispatchAction({ type: "highlight", seriesIndex: 1, dataIndex: i });
  }, [bubbleIndex]);

  const uncoveredNames = geo.features.filter((f) => !f.properties.region).map((f) => f.properties.name);

  if (isEmpty) return null;

  return (
    <Card className={`print-avoid mb-4 overflow-hidden ${full ? "fixed inset-3 z-[90] m-0 flex flex-col" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <MapPin size={14} className="text-brand-600" />
            Pakistan coverage map
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            Provinces shaded by {def.label.toLowerCase()} · district bubbles sized by the same measure, coloured by grade · click either to filter
          </p>
        </div>
        <div className="no-print ml-auto flex flex-wrap gap-1">
          {METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)} aria-pressed={metric === m.key}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                metric === m.key ? "bg-brand-600 text-white" : "border border-[var(--border)] hover:bg-[var(--surface-3)]"}`}>
              {m.short}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid lg:grid-cols-[1fr_250px] ${full ? "min-h-0 flex-1" : ""}`}>
        <div className="relative w-full" style={full ? undefined : { height: 460 }}>
          {!ready && <Skeleton className="absolute inset-0" />}
          <div ref={elRef} className="h-full w-full"
            style={{ touchAction: "none", cursor: "grab" }}
            role="img" aria-label={`Map of Pakistan showing ${def.label} by province and district`} />

          <div className="no-print absolute right-2 top-2 flex flex-col gap-1">
            <CtrlBtn label="Zoom in" onClick={() => zoomBy(1.35)}><Plus size={13} /></CtrlBtn>
            <CtrlBtn label="Zoom out" onClick={() => zoomBy(1 / 1.35)}><Minus size={13} /></CtrlBtn>
            <CtrlBtn label="Reset view" onClick={resetView}><RotateCcw size={12} /></CtrlBtn>
            <CtrlBtn label={full ? "Exit fullscreen" : "Fullscreen"} onClick={() => setFull((v) => !v)}>
              {full ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </CtrlBtn>
          </div>

          <div className="pointer-events-none absolute bottom-2 right-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/88 px-2.5 py-1.5 text-[10px] leading-relaxed backdrop-blur no-print">
            <div className="mb-1 font-semibold">District bubbles</div>
            <div className="text-[var(--text-muted)]">size = {def.label.toLowerCase()}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {["Excellent", "Very Good", "Good", "Average", "Poor"].map((g) => (
                <span key={g} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: GRADE_COLORS[g] }} />{g}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="no-print flex min-h-0 flex-col border-t border-[var(--border)] lg:border-l lg:border-t-0">
          <div className="border-b border-[var(--border)] px-3 py-2">
            <div className="text-[11px] font-semibold">Districts by {def.short.toLowerCase()}</div>
            <div className="text-[10px] text-[var(--text-muted)]">{rail.length} in view · hover to locate, click to filter</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" style={full ? undefined : { maxHeight: 400 }}
            onMouseLeave={() => highlight(null)}>
            {rail.map((d) => {
              const on = filters.district.includes(d.key);
              return (
                <button key={d.key}
                  onMouseEnter={() => highlight(d.key)}
                  onFocus={() => highlight(d.key)}
                  onClick={() => patch({ district: on ? filters.district.filter((x) => x !== d.key) : [...filters.district, d.key] })}
                  className={`flex w-full items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 text-left transition-colors last:border-0 ${
                    on ? "bg-amber-50 dark:bg-amber-950/30" : "hover:bg-[var(--surface-3)]"}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: GRADE_COLORS[computedTier(d.meanScore).label] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">{d.key}</span>
                    <span className="block truncate text-[9.5px] text-[var(--text-muted)]">
                      {d.institutes} TPIs · {d.trades} trades
                    </span>
                  </span>
                  <span className="num shrink-0 text-[11px] font-bold">{def.format(valueOf(d))}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] px-4 py-2 text-[10.5px] text-[var(--text-muted)]">
        <Info size={12} className="shrink-0" />
        <span>
          This round covers <strong>{covered.length} of {geo.features.length}</strong> administrative units.
          Not assessed: {uncoveredNames.join(", ")}.
        </span>
        {unplaced.length > 0 && (
          <Badge color="#d97706">{unplaced.length} district(s) without coordinates: {unplaced.join(", ")}</Badge>
        )}
        <span className="ml-auto">Scroll to zoom · drag to pan · boundaries from Natural Earth 10m admin-1</span>
      </div>
    </Card>
  );
}

function CtrlBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={label} aria-label={label} onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur transition-colors hover:bg-[var(--surface-3)]">
      {children}
    </button>
  );
}