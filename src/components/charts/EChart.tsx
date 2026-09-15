"use client";
import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import type { EChartsType, EChartsOption } from "echarts";
import { useTheme } from "../providers/ThemeProvider";
import { Skeleton } from "../ui";

export interface EChartHandle {
  getPng: () => string | null;
  instance: () => EChartsType | null;
}

/**
 * ECharts wrapper. The library is imported dynamically so it lands in its own
 * chunk instead of the shared bundle (§34), and the canvas is re-rendered as
 * SVG so it stays sharp at 4K and in print (§21).
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
  const { dark } = useTheme();

  useImperativeHandle(ref, () => ({
    getPng: () =>
      chart.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: dark ? "#101c30" : "#ffffff" }) ?? null,
    instance: () => chart.current,
  }), [dark]);

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | undefined;

    (async () => {
      const echarts = await import("echarts");
      if (disposed || !el.current) return;
      chart.current?.dispose();
      chart.current = echarts.init(el.current, undefined, {
        renderer: "svg",
        useDirtyRect: true,
      });
      chart.current.setOption(withTheme(option, dark), true);
      if (onEvent) chart.current.on(onEvent.type, onEvent.handler);
      setReady(true);

      ro = new ResizeObserver(() => chart.current?.resize());
      ro.observe(el.current);
    })();

    return () => {
      disposed = true;
      ro?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chart.current) return;
    chart.current.setOption(withTheme(option, dark), true);
  }, [option, dark]);

  return (
    <div className="relative w-full" style={{ height }}>
      {!ready && <Skeleton className="absolute inset-0" />}
      <div ref={el} role="img" aria-label={ariaLabel} className="h-full w-full" />
    </div>
  );
});

/** Applies dark-mode-aware axis, tooltip and legend colours to any option. */
export function withTheme(option: EChartsOption, dark: boolean): EChartsOption {
  const text = dark ? "#c6d3e2" : "#33455a";
  const muted = dark ? "#8fa3b8" : "#64798f";
  const split = dark ? "#24374f" : "#eef2f6";
  const axis = { axisLine: { lineStyle: { color: split } }, axisLabel: { color: muted, fontSize: 11 }, splitLine: { lineStyle: { color: split } } };
  return {
    textStyle: { fontFamily: "Inter, system-ui, sans-serif", color: text },
    tooltip: {
      backgroundColor: dark ? "#17263d" : "#ffffff",
      borderColor: dark ? "#24374f" : "#dde5ed",
      textStyle: { color: text, fontSize: 12 },
      extraCssText: "box-shadow:0 6px 20px rgba(10,21,38,.16);border-radius:8px;",
      ...(option.tooltip as object ?? {}),
    },
    legend: { textStyle: { color: muted, fontSize: 11 }, icon: "roundRect", itemWidth: 10, itemHeight: 10, ...(option.legend as object ?? {}) },
    ...option,
    xAxis: mergeAxis(option.xAxis, axis),
    yAxis: mergeAxis(option.yAxis, axis),
  } as EChartsOption;
}

function mergeAxis(a: unknown, base: object): unknown {
  if (!a) return a;
  if (Array.isArray(a)) return a.map((x) => ({ ...base, ...x }));
  return { ...base, ...(a as object) };
}
