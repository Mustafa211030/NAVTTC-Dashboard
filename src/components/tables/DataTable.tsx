"use client";
import { useState, useMemo } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, type ColumnDef, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Card, Button, EmptyState } from "../ui";

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Opens a detail drawer when a row is clicked (§31). */
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyAction?: () => void;
  /** Columns hidden by default; the user can re-enable them from the column manager. */
  initialHidden?: string[];
  storageKey?: string;
}

export function DataTable<T>({
  data, columns, onRowClick, pageSize = 25, emptyAction, initialHidden = [], storageKey,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(`navttc-cols-${storageKey}`);
        if (saved) return JSON.parse(saved) as VisibilityState;
      } catch { /* ignore */ }
    }
    return Object.fromEntries(initialHidden.map((k) => [k, false]));
  });
  const [showCols, setShowCols] = useState(false);

  const setVis = (updater: VisibilityState | ((v: VisibilityState) => VisibilityState)) => {
    setVisibility((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (storageKey) { try { window.localStorage.setItem(`navttc-cols-${storageKey}`, JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  };

  const table = useReactTable({
    data, columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVis as never,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const pageRows = table.getRowModel().rows;
  const hiddenCount = useMemo(() => Object.values(visibility).filter((v) => v === false).length, [visibility]);

  if (!data.length) return <Card><EmptyState onClear={emptyAction} /></Card>;

  return (
    <Card className="print-avoid overflow-hidden">
      <div className="no-print relative flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="num text-[11px] text-[var(--text-muted)]">
          {data.length.toLocaleString()} row{data.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setShowCols((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--surface-3)]">
            <Columns3 size={12} /> Columns{hiddenCount ? ` (${hiddenCount} hidden)` : ""}
          </button>
          <select value={table.getState().pagination.pageSize} aria-label="Rows per page"
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px]">
            {[10, 25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>

        {showCols && (
          <div className="absolute right-3 top-full z-40 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Visible columns</span>
              <button onClick={() => setShowCols(false)} aria-label="Close"><X size={12} /></button>
            </div>
            {table.getAllLeafColumns().map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--surface-3)]">
                <input type="checkbox" className="accent-brand-600" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                <span className="truncate">{typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}</span>
              </label>
            ))}
            <button onClick={() => setVis({})} className="mt-1 w-full rounded border-t border-[var(--border)] px-2 py-1.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-3)]">
              Reset columns
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th key={h.id} scope="col"
                      className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button onClick={h.column.getToggleSortingHandler()} className="flex items-center gap-1 hover:text-[var(--text)]">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp size={10} /> : sorted === "desc" ? <ArrowDown size={10} /> : <ArrowUpDown size={10} className="opacity-30" />}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={`border-b border-[var(--border)] last:border-0 ${onRowClick ? "cursor-pointer hover:bg-[var(--surface-3)]" : ""}`}>
                {row.getVisibleCells().map((c) => (
                  <td key={c.id} className="whitespace-nowrap px-3 py-1.5">{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="no-print flex items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2">
        <span className="num text-[11px] text-[var(--text-muted)]">
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
        </span>
        <div className="flex gap-1">
          <Button size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft size={12} /> Prev</Button>
          <Button size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next <ChevronRight size={12} /></Button>
        </div>
      </div>
    </Card>
  );
}
