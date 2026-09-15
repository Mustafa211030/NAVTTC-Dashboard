"use client";
import { useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { Maximize2, Download, Table2, X } from "lucide-react";
import { EChart, type EChartHandle } from "./EChart";
import { Card, Tooltip, EmptyState } from "../ui";
import { downloadDataUrl } from "@/lib/export";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  methodology?: React.ReactNode;
  option: EChartsOption;
  height?: number;
  /** Rows behind the chart, shown by the "view data" action and used for the PNG filename. */
  data?: { label: string; value: string | number }[];
  onEvent?: { type: string; handler: (p: unknown) => void };
  empty?: boolean;
  className?: string;
}

/** Chart container providing fullscreen, PNG download and view-data (§22-23). */
export function ChartCard({
  title, subtitle, methodology, option, height = 300, data, onEvent, empty, className = "",
}: ChartCardProps) {
  const ref = useRef<EChartHandle>(null);
  const [full, setFull] = useState(false);
  const [showData, setShowData] = useState(false);

  const png = () => {
    const url = ref.current?.getPng();
    if (url) downloadDataUrl(url, title.replace(/\s+/g, "_"));
  };

  const body = empty ? (
    <EmptyState title="No data for this view" hint="This chart has no records under the active filters." />
  ) : (
    <EChart ref={ref} option={option} height={full ? "calc(100vh - 190px)" : height} onEvent={onEvent} ariaLabel={`${title}. ${subtitle ?? ""}`} />
  );

  return (
    <>
      <Card className={`print-avoid flex flex-col ${className}`}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-tight">
              <span className="truncate">{title}</span>
              {methodology && <Tooltip label={methodology} />}
            </h3>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>}
          </div>
          <div className="no-print flex shrink-0 items-center gap-0.5">
            {data && data.length > 0 && (
              <button onClick={() => setShowData(true)} title="View data" aria-label={`View data behind ${title}`}
                className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
                <Table2 size={14} />
              </button>
            )}
            <button onClick={png} title="Download PNG" aria-label={`Download ${title} as PNG`}
              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
              <Download size={14} />
            </button>
            <button onClick={() => setFull(true)} title="Fullscreen" aria-label={`Expand ${title}`}
              className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 px-2 pb-2 pt-3">{body}</div>
      </Card>

      {full && (
        <div className="no-print fixed inset-0 z-[80] flex flex-col bg-[var(--surface)] p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              {subtitle && <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>}
            </div>
            <button onClick={() => setFull(false)} aria-label="Close fullscreen"
              className="rounded-md border border-[var(--border)] p-2 hover:bg-[var(--surface-3)]"><X size={16} /></button>
          </div>
          <div className="flex-1">{body}</div>
        </div>
      )}

      {showData && data && (
        <div className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4" onClick={() => setShowData(false)}>
          <Card className="max-h-[80vh] w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <h3 className="text-sm font-semibold">{title} — underlying data</h3>
              <button onClick={() => setShowData(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <tbody>
                  {data.map((d, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-1.5">{d.label}</td>
                      <td className="num px-4 py-1.5 text-right font-semibold">{d.value}</td>
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
