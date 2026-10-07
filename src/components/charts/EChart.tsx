"use client";
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { flushSync } from "react-dom";
import type { EChartsType, EChartsOption } from "echarts";
import { usePrefs } from "../providers/ThemeProvider";
import { Skeleton } from "../ui";

export interface EChartHandle {
  getPng: () => string | null;
  instance: () => EChartsType | null;
}

type EchartsModule = typeof import("echarts");
let mod: EchartsModule | null = null;
let modPromise: Promise<EchartsModule> | null = null;
/** ECharts lives in its own chunk, fetched once and shared by every chart. */
function loadEcharts(): Promise<EchartsModule> {
  if (mod) return Promise.resolve(mod);
  modPromise ??= import("echarts").then((m) => (mod = m));
  return modPromise;
}

/**
 * ECharts wrapper.
 *
 *  • Lazy: a chart initialises only when it comes within 300px of the
 *    viewport, so a page with fifteen charts paints the first screen first.
 *    Printing initialises every remaining chart synchronously.
 *  • SVG renderer: sharp at any zoom and in print.
 *  • Option updates use notMerge so stale series never linger, and are
 *    animated with a short, decisive curve.
 */
export const EChart = forwardRef<EChartHandle, {
  option: EChartsOption;
  height?: number | string;
  onEvent?: { type: string; handler: (p: unknown) => void };
  ariaLabel?: string;
}>(function EChart({ option, height = 300, onEvent, ariaLabel }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const { dark, reducedMotion, prefs } = usePrefs();
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const themed = useRef<EChartsOption>(option);
  themed.current = withTheme(option, dark, { animate: !reducedMotion, labels: prefs.chartLabels });

  useImperativeHandle(ref, () => ({
    getPng: () =>
      chart.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: dark ? "#111827" : "#ffffff" }) ?? null,
    instance: () => chart.current,
  }), [dark]);

  const ro = useRef<ResizeObserver | null>(null);

  /** Create the instance (once) and keep it sized to its box. Synchronous. */
  function start(echarts: EchartsModule) {
    const node = el.current;
    if (!node || chart.current) return;
    chart.current = echarts.init(node, undefined, { renderer: "svg" });
    chart.current.setOption(themed.current, true);
    for (const t of ["click", "dblclick"]) {
      chart.current.on(t, (p: unknown) => { if (handlerRef.current?.type === t) handlerRef.current.handler(p); });
    }
    let raf = 0;
    ro.current = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => chart.current?.resize()); });
    ro.current.observe(node);
    setReady(true);
  }

  /* visibility gate + print */
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    // Warm the chunk in idle time: charts scrolled into view render at once,
    // and printing can create every chart synchronously.
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (!mod) { if (ric) ric(() => void loadEcharts(), { timeout: 2500 }); else setTimeout(() => void loadEcharts(), 1200); }
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === "undefined") setVisible(true);
    else {
      io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io?.disconnect(); } }, { rootMargin: "300px 0px" });
      io.observe(node);
    }
    // Printing must never show a skeleton. The module is already loaded by the
    // charts on screen, so every remaining chart is created synchronously here,
    // with its card taken out of content-visibility so it has a real size.
    const bp = () => {
      if (chart.current || !mod) return;
      const card = node.closest<HTMLElement>(".cv-auto");
      card?.style.setProperty("content-visibility", "visible");
      io?.disconnect();
      const m = mod;
      flushSync(() => start(m));
      (chart.current as EChartsType | null)?.setOption({ animation: false });
    };
    window.addEventListener("beforeprint", bp);
    // Re-fit to the printed column width when print layout is applied.
    const pm = window.matchMedia("print");
    const fit = () => { if (chart.current) { chart.current.resize({ animation: { duration: 0 } }); } };
    pm.addEventListener("change", fit);
    return () => { io?.disconnect(); window.removeEventListener("beforeprint", bp); pm.removeEventListener("change", fit); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    loadEcharts().then((echarts) => { if (!disposed) start(echarts); });
    return () => { disposed = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => () => {
    ro.current?.disconnect();
    chart.current?.dispose();
    chart.current = null;
  }, []);

  useEffect(() => {
    chart.current?.setOption(themed.current, true);
  }, [option, dark, reducedMotion, prefs.chartLabels]);

  return (
    <div className="relative w-full" style={{ height }}>
      {!ready && (
        <div className="absolute inset-0 flex items-end gap-2 px-3 pb-6 pt-8" aria-hidden>
          {[62, 84, 48, 92, 70, 56, 78].map((h, i) => <Skeleton key={i} className="flex-1 rounded-md" style={{ height: `${h}%` }} />)}
        </div>
      )}
      <div ref={el} role="img" aria-label={ariaLabel} className={`h-full w-full transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"} ${onEvent ? "[&_path]:cursor-pointer" : ""}`} />
    </div>
  );
});

/* ================================================================== *
 * THEME
 * One function turns any module's option into the house style:
 * glass tooltips, quiet dashed grids, gradient bars, soft line areas,
 * value labels in the theme's text colour, and legend toggles.
 * ================================================================== */

const HEX = /^#([0-9a-f]{6})$/i;
const alpha = (hex: string, a: number) => (HEX.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, "0") : hex);

function grad(color: unknown, horizontal: boolean): unknown {
  if (typeof color !== "string" || !HEX.test(color)) return color;
  return horizontal
    ? { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: alpha(color, 0.55) }, { offset: 1, color }] }
    : { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color }, { offset: 1, color: alpha(color, 0.55) }] };
}

export function withTheme(option: EChartsOption, dark: boolean, o: { animate?: boolean; labels?: boolean } = {}): EChartsOption {
  const text = dark ? "#cfd8e6" : "#334155";
  const muted = dark ? "#8f9bb0" : "#66738a";
  const split = dark ? "rgba(148,163,184,.12)" : "rgba(15,23,42,.07)";
  const axisLine = dark ? "rgba(148,163,184,.22)" : "rgba(15,23,42,.14)";
  const axis = {
    axisLine: { lineStyle: { color: axisLine } },
    axisTick: { show: false },
    axisLabel: { color: muted, fontSize: 11 },
    splitLine: { lineStyle: { color: split, type: [3, 4] as unknown as "dashed" } },
    nameTextStyle: { color: muted },
  };
  const horizontal = isCategory(option.yAxis) && !isCategory(option.xAxis);
  const animate = o.animate !== false;
  return {
    animation: animate,
    animationDuration: 650,
    animationEasing: "quarticOut",
    animationDurationUpdate: 450,
    animationEasingUpdate: "quarticOut",
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: text },
    ...option,
    tooltip: {
      backgroundColor: dark ? "rgba(21,30,46,.86)" : "rgba(255,255,255,.9)",
      borderColor: dark ? "rgba(255,255,255,.09)" : "rgba(15,23,42,.08)",
      borderWidth: 1,
      padding: [8, 11],
      textStyle: { color: text, fontSize: 12 },
      extraCssText: `backdrop-filter:blur(12px) saturate(160%);-webkit-backdrop-filter:blur(12px) saturate(160%);border-radius:10px;box-shadow:${dark ? "0 18px 40px -12px rgba(0,0,0,.7)" : "0 16px 36px -12px rgba(15,23,42,.25)"};`,
      ...(option.tooltip as object ?? {}),
    },
    legend: {
      textStyle: { color: muted, fontSize: 11 }, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 14,
      inactiveColor: dark ? "#3a4659" : "#c3ccd9", selectedMode: true,
      ...(option.legend as object ?? {}),
    },
    xAxis: mergeAxis(option.xAxis, axis),
    yAxis: mergeAxis(option.yAxis, axis),
    series: themeSeries(option.series, text, horizontal, o.labels !== false),
  } as EChartsOption;
}

function isCategory(a: unknown): boolean {
  const first = Array.isArray(a) ? a[0] : a;
  return !!first && (first as { type?: string }).type === "category";
}

function mergeAxis(a: unknown, base: Record<string, unknown>): unknown {
  if (!a) return a;
  const one = (x: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...base, ...x };
    for (const k of ["axisLine", "axisLabel", "splitLine", "nameTextStyle"]) {
      if (x[k] && typeof x[k] === "object") out[k] = { ...(base[k] as object), ...(x[k] as object) };
    }
    if (x.splitLine && (x.splitLine as { lineStyle?: object }).lineStyle === undefined && (x.splitLine as { show?: boolean }).show !== false)
      out.splitLine = { ...(x.splitLine as object), lineStyle: (base.splitLine as { lineStyle: object }).lineStyle };
    return out;
  };
  return Array.isArray(a) ? a.map((x) => one(x as Record<string, unknown>)) : one(a as Record<string, unknown>);
}

/** House style per series type. Explicit choices in a module always win. */
function themeSeries(series: unknown, text: string, horizontal: boolean, labels: boolean): unknown {
  if (!series) return series;
  const fix = (sr: Record<string, unknown>) => {
    let out: Record<string, unknown> = { ...sr };
    const label = sr.label as Record<string, unknown> | undefined;

    if (label && !label.color) {
      const pos = String(label.position ?? "");
      const outside = /^(top|right|bottom|left|end)$/.test(pos) || sr.type === "heatmap" || sr.type === "radar";
      if (outside) out.label = { ...label, color: sr.type === "heatmap" ? "#0f172a" : text, textBorderWidth: 0 };
    }
    if (!labels && label && (sr.type === "bar" || sr.type === "line" || sr.type === "scatter")) out.label = { ...(out.label as object), show: false };

    if (sr.type === "bar") {
      const is = (sr.itemStyle as Record<string, unknown> | undefined) ?? {};
      const radius = sr.stack ? 0 : horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0];
      out.itemStyle = { borderRadius: radius, ...is, color: grad(is.color, horizontal) };
      if (Array.isArray(sr.data)) {
        out.data = (sr.data as unknown[]).map((d) => {
          if (!d || typeof d !== "object" || Array.isArray(d)) return d;
          const di = (d as { itemStyle?: Record<string, unknown> }).itemStyle;
          return di?.color ? { ...(d as object), itemStyle: { ...di, color: grad(di.color, horizontal) } } : d;
        });
      }
      out.emphasis = { focus: "series", ...(sr.emphasis as object ?? {}) };
    }
    if (sr.type === "line") {
      out = { symbol: "circle", ...out };
      const lc = (sr.lineStyle as { color?: string } | undefined)?.color ?? (sr.itemStyle as { color?: string } | undefined)?.color;
      const as = sr.areaStyle as Record<string, unknown> | undefined;
      if (as && !as.color && typeof lc === "string" && HEX.test(lc)) {
        out.areaStyle = { ...as, color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(lc, 0.28) }, { offset: 1, color: alpha(lc, 0) }] } };
      }
      out.emphasis = { focus: "series", ...(sr.emphasis as object ?? {}) };
    }
    return out;
  };
  return Array.isArray(series) ? series.map((s) => fix(s as Record<string, unknown>)) : fix(series as Record<string, unknown>);
}
