"use client";
import { useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { Maximize2, Download, Table2, X, FileDown, MousePointerClick } from "lucide-react";
import { EChart, type EChartHandle } from "./EChart";
import { Card, Tooltip, EmptyState, IconButton, Button } from "../ui";
import { Overlay } from "../Overlay";
import { downloadDataUrl, downloadCsv } from "@/lib/export";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  methodology?: React.ReactNode;
  option: EChartsOption;
  height?: number;
  /** Rows behind the chart, shown by "view data" and downloadable as CSV. */
  data?: { label: string; value: string | number }[];
  /** Multi-column alternative to `data`. */
  table?: { columns: string[]; rows: (string | number | null)[][] };
  onEvent?: { type: string; handler: (p: unknown) => void };
  /** Per-chart controls (metric, Top-N, sort, local filters) rendered under the title. */
  controls?: React.ReactNode;
  /** Shown as a hint that the chart is clickable. */
  clickHint?: string;
  empty?: boolean;
  className?: string;
  accent?: string;
  /** Extra element at the right of the title row (e.g. a range selector). */
  actions?: React.ReactNode;
}

/** Chart container: per-chart controls, fullscreen, PNG, view data, CSV. */
export function ChartCard({
  title, subtitle, methodology, option, height = 300, data, table, onEvent, controls, clickHint, empty, className = "", accent, actions,
}: ChartCardProps) {
  const ref = useRef<EChartHandle>(null);
  const fullRef = useRef<EChartHandle>(null);
  const [full, setFull] = useState(false);
  const [showData, setShowData] = useState(false);
  const fileStem = title.replace(/[^\w]+/g, "_");

  const png = () => {
    const url = (full ? fullRef : ref).current?.getPng();
    if (url) downloadDataUrl(url, fileStem);
  };
  const tbl = table ?? (data ? { columns: ["Label", "Value"], rows: data.map((d) => [d.label, d.value]) } : null);
  const csv = () => { if (tbl) downloadCsv([tbl.columns, ...tbl.rows], fileStem); };

  const body = (r: React.Ref<EChartHandle>, h: number | string) => empty ? (
    <EmptyState title="No data for this view" hint="This chart has no records under the active filters." />
  ) : (
    <EChart ref={r} option={option} height={h} onEvent={onEvent} ariaLabel={`${title}. ${subtitle ?? ""}`} />
  );

  return (
    <>
      <Card className={`cv-auto print-avoid group/card relative flex flex-col overflow-hidden ${className}`} style={{ containIntrinsicSize: `auto ${height + 110}px` }}>
        {accent && <div aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent 75%)` }} />}
        <div className="px-4 pb-2 pt-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-[13.5px] font-semibold leading-tight tracking-[-.01em]">
                <span className="truncate">{title}</span>
                {methodology && <Tooltip label={methodology} />}
              </h3>
              {subtitle && <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
            </div>
            <div className="no-print flex shrink-0 items-center gap-0.5">
              {actions}
              {onEvent && (
                <span className="mr-1 hidden items-center gap-1 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[9.5px] text-[var(--text-muted)] 2xl:inline-flex" title={clickHint ?? "Click a mark to filter the dashboard"}>
                  <MousePointerClick size={10} /> {clickHint ?? "click to filter"}
                </span>
              )}
              <div className="flex items-center opacity-60 transition-opacity duration-200 focus-within:opacity-100 group-hover/card:opacity-100">
                {tbl && tbl.rows.length > 0 && (
                  <IconButton label={`View data behind ${title}`} onClick={() => setShowData(true)} size="sm"><Table2 size={14} /></IconButton>
                )}
                <IconButton label={`Download ${title} as PNG`} onClick={png} size="sm"><Download size={14} /></IconButton>
                <IconButton label={`Expand ${title}`} onClick={() => setFull(true)} size="sm"><Maximize2 size={14} /></IconButton>
              </div>
            </div>
          </div>
          {controls && <div className="no-print mt-2.5 flex flex-wrap items-center gap-1.5">{controls}</div>}
        </div>
        <div className="flex-1 px-2 pb-2">{body(ref, height)}</div>
      </Card>

      <Overlay open={full} onClose={() => setFull(false)} variant="full" label={`${title} — fullscreen`}
        className="m-3 flex w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-pop)] sm:m-6 sm:w-[calc(100vw-3rem)] sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="t-title text-lg">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
            {controls && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{controls}</div>}
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <IconButton label="Download PNG" onClick={png}><Download size={15} /></IconButton>
            <IconButton label="Close fullscreen" onClick={() => setFull(false)}><X size={16} /></IconButton>
          </div>
        </div>
        <div className="min-h-0 flex-1">{full && body(fullRef, "calc(100vh - 220px)")}</div>
      </Overlay>

      <Overlay open={showData && !!tbl} onClose={() => setShowData(false)} label={`${title} — underlying data`}
        className="pop flex max-h-[82vh] w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden">
        {tbl && (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{title}</h3>
                <p className="num text-[11px] text-[var(--text-muted)]">{tbl.rows.length.toLocaleString()} rows · exactly what the chart plots</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={csv}><FileDown size={13} /> CSV</Button>
                <IconButton label="Close" onClick={() => setShowData(false)}><X size={16} /></IconButton>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--surface-2)]/95 backdrop-blur">
                  <tr>{tbl.columns.map((c, i) => <th key={c} className={`t-label whitespace-nowrap border-b border-[var(--border)] px-4 py-2 ${i ? "text-right" : "text-left"}`}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {tbl.rows.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface-3)]/60">
                      {r.map((v, j) => <td key={j} className={`px-4 py-1.5 ${j ? "num text-right font-semibold" : ""}`}>{v ?? "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Overlay>
    </>
  );
}
