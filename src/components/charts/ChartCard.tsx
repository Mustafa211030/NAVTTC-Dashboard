"use client";
import { useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { Maximize2, Download, Table2, X, FileDown, MousePointerClick } from "lucide-react";
import { EChart, type EChartHandle } from "./EChart";
import { Card, Tooltip, EmptyState } from "../ui";
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
}

/** Chart container: per-chart controls, fullscreen, PNG, view data, CSV. */
export function ChartCard({
  title, subtitle, methodology, option, height = 300, data, table, onEvent, controls, clickHint, empty, className = "", accent,
}: ChartCardProps) {
  const ref = useRef<EChartHandle>(null);
  const [full, setFull] = useState(false);
  const [showData, setShowData] = useState(false);
  const fileStem = title.replace(/[^\w]+/g, "_");

  const png = () => {
    const url = ref.current?.getPng();
    if (url) downloadDataUrl(url, fileStem);
  };
  const tbl = table ?? (data ? { columns: ["Label", "Value"], rows: data.map((d) => [d.label, d.value]) } : null);
  const csv = () => { if (tbl) downloadCsv([tbl.columns, ...tbl.rows], fileStem); };

  const body = empty ? (
    <EmptyState title="No data for this view" hint="This chart has no records under the active filters." />
  ) : (
    <EChart ref={ref} option={option} height={full ? "calc(100vh - 210px)" : height} onEvent={onEvent} ariaLabel={`${title}. ${subtitle ?? ""}`} />
  );

  const iconBtn = "rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]";

  return (
    <>
      <Card className={`print-avoid group/card flex flex-col overflow-hidden ${className}`}>
        {accent && <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />}
        <div className="border-b border-[var(--border)] px-4 pb-2.5 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
                <span className="truncate">{title}</span>
                {methodology && <Tooltip label={methodology} />}
              </h3>
              {subtitle && <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
            </div>
            <div className="no-print flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover/card:opacity-100">
              {onEvent && (
                <span className="mr-1 hidden items-center gap-1 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9.5px] text-[var(--text-muted)] xl:inline-flex" title={clickHint ?? "Click a mark to filter the dashboard"}>
                  <MousePointerClick size={10} /> {clickHint ?? "click to filter"}
                </span>
              )}
              {tbl && tbl.rows.length > 0 && (
                <button onClick={() => setShowData(true)} title="View data" aria-label={`View data behind ${title}`} className={iconBtn}><Table2 size={14} /></button>
              )}
              <button onClick={png} title="Download PNG" aria-label={`Download ${title} as PNG`} className={iconBtn}><Download size={14} /></button>
              <button onClick={() => setFull(true)} title="Fullscreen" aria-label={`Expand ${title}`} className={iconBtn}><Maximize2 size={14} /></button>
            </div>
          </div>
          {controls && <div className="no-print mt-2 flex flex-wrap items-center gap-1.5">{controls}</div>}
        </div>
        <div className="flex-1 px-2 pb-2 pt-2">{body}</div>
      </Card>

      {full && (
        <div className="no-print fixed inset-0 z-[80] flex flex-col bg-[var(--surface)] p-4 sm:p-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
              {controls && <div className="mt-2 flex flex-wrap items-center gap-1.5">{controls}</div>}
            </div>
            <button onClick={() => setFull(false)} aria-label="Close fullscreen" className="rounded-md border border-[var(--border)] p-2 hover:bg-[var(--surface-3)]"><X size={16} /></button>
          </div>
          <div className="flex-1">{body}</div>
        </div>
      )}

      {showData && tbl && (
        <div className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" onClick={() => setShowData(false)}>
          <Card className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <h3 className="truncate text-sm font-semibold">{title} — underlying data</h3>
              <div className="flex items-center gap-1">
                <button onClick={csv} className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--surface-3)]"><FileDown size={12} /> CSV</button>
                <button onClick={() => setShowData(false)} aria-label="Close" className={iconBtn}><X size={16} /></button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[var(--surface-2)]">
                  <tr>{tbl.columns.map((c, i) => <th key={c} className={`whitespace-nowrap px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ${i ? "text-right" : "text-left"}`}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {tbl.rows.map((r, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      {r.map((v, j) => <td key={j} className={`px-4 py-1.5 ${j ? "num text-right font-semibold" : ""}`}>{v ?? "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
