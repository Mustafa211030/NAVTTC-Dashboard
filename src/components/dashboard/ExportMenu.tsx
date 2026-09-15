"use client";
import { useState, useRef, useEffect } from "react";
import { Download, Printer, FileSpreadsheet, FileText, FileJson, ChevronDown, Loader2 } from "lucide-react";
import { useFilters } from "../providers/FilterProvider";
import { exportCsv, exportJson, exportXlsx, reportName } from "@/lib/export";
import { Button } from "../ui";

/**
 * Consistent export bar on every page (§44). Every export respects the active
 * filters — if 412 rows are on screen, 412 rows leave the building.
 */
export function ExportMenu({ page, printLabel }: { page: string; printLabel?: string }) {
  const { rows, filters } = useFilters();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const name = reportName(page, filters);
  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); setOpen(false); }
  };

  const item = "flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs hover:bg-[var(--surface-3)] disabled:opacity-40";

  return (
    <div className="no-print relative flex items-center gap-2" ref={ref}>
      <Button size="sm" onClick={() => window.print()} title={printLabel ? `${printLabel} — fits one A4 sheet` : "Print this module only"}>
        <Printer size={13} /> {printLabel ?? "Print"}
      </Button>
      <Button size="sm" variant="primary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Export <ChevronDown size={12} />
      </Button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-60 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
          <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            {rows.length.toLocaleString()} filtered record{rows.length === 1 ? "" : "s"}
          </div>
          <button className={item} disabled={!rows.length} onClick={() => run(() => exportCsv(rows, name))}>
            <FileText size={13} /> CSV
          </button>
          <button className={item} disabled={!rows.length} onClick={() => run(() => exportXlsx(rows, name))}>
            <FileSpreadsheet size={13} /> Excel (.xlsx)
          </button>
          <button className={item} disabled={!rows.length} onClick={() => run(() => exportJson(rows, name, filters))}>
            <FileJson size={13} /> JSON
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button className={item} onClick={() => run(() => window.print())}>
            <Printer size={13} /> {printLabel ? `${printLabel} as PDF` : "PDF — via print dialog"}
          </button>
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Choose &ldquo;Save as PDF&rdquo; as the destination. This renders the print stylesheet at full vector quality.
          </p>
        </div>
      )}
    </div>
  );
}
