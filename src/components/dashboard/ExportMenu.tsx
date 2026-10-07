"use client";
import { useState, useRef, useCallback } from "react";
import { Download, Printer, FileSpreadsheet, FileText, FileJson, ChevronDown } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { exportCsv, exportJson, exportXlsx, reportName } from "@/lib/export";
import { Button, Popover, Spinner } from "../ui";

/** Export bar on every page. Every export respects the active filters and scope. */
export function ExportMenu({ page, printLabel }: { page: string; printLabel?: string }) {
  const { rows, filters, data, scope } = useDash();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const name = reportName(page, scope.program?.short ?? "All-Programmes", filters);
  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); setOpen(false); }
  };
  const item = "ctl flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-[var(--surface-3)]";

  return (
    <div className="no-print relative flex items-center gap-2">
      <Button size="sm" onClick={() => window.print()} title={printLabel ?? "Print this module only"}>
        <Printer size={13} /> {printLabel ?? "Print"}
      </Button>
      <Button ref={ref} size="sm" variant="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        {busy ? <Spinner className="!h-3.5 !w-3.5 [--brand-500:white] [--brand-2:white]" /> : <Download size={13} />} Export <ChevronDown size={12} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </Button>
      <Popover open={open} anchor={ref} onClose={close} width={272} placement="bottom-end" role="menu" label="Export">
        <div className="p-1">
          <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {rows.length.toLocaleString()} filtered record{rows.length === 1 ? "" : "s"} · {scope.label}
          </div>
          <button className={item} disabled={!rows.length} onClick={() => run(() => exportCsv(rows, data.programBySlug, name))}><FileText size={13} /> CSV</button>
          <button className={item} disabled={!rows.length} onClick={() => run(() => exportXlsx(rows, data.programBySlug, name))}>
            <FileSpreadsheet size={13} /> Excel (.xlsx){scope.mode === "portfolio" ? " — a sheet per programme" : ""}
          </button>
          <button className={item} disabled={!rows.length} onClick={() => run(() => exportJson(rows, data.programBySlug, name, filters, scope.label))}><FileJson size={13} /> JSON</button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button className={item} onClick={() => run(() => window.print())}><Printer size={13} /> {printLabel ? `${printLabel} as PDF` : "PDF — via print dialog"}</button>
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">Choose &ldquo;Save as PDF&rdquo; as the destination for full vector quality.</p>
        </div>
      </Popover>
    </div>
  );
}
