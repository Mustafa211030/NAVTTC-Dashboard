"use client";
import { useState, useMemo } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel, getFilteredRowModel,
  flexRender, type ColumnDef, type SortingState, type VisibilityState, type FilterFn,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Columns3, ChevronLeft, ChevronRight, X, Search } from "lucide-react";
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
  /** Adds an in-table quick search across every column. */
  searchable?: boolean;
}

const anyColumn: FilterFn<unknown> = (row, colId, value) => {
  const v = row.getValue(colId);
  return v !== null && v !== undefined && String(v).toLowerCase().includes(String(value).toLowerCase());
};

export function DataTable<T>({
  data, columns, onRowClick, pageSize = 25, emptyAction, initialHidden = [], storageKey, searchable,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
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
    state: { sorting, columnVisibility: visibility, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: anyColumn as FilterFn<T>,
    getFilteredRowModel: getFilteredRowModel(),
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
          {table.getFilteredRowModel().rows.length.toLocaleString()}{globalFilter ? ` of ${data.length.toLocaleString()}` : ""} row{data.length === 1 ? "" : "s"}
        </span>
        {searchable && (
          <div className="relative">
            <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={globalFilter} onChange={(e) => { setGlobalFilter(e.target.value); table.setPageIndex(0); }} placeholder="Search this table…"
              aria-label="Search this table" className="h-7 w-48 rounded-md border border-[var(--border)] bg-[var(--surface)] pl-6 pr-2 text-[11px] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-brand-500 focus:ring-2 focus:ring-[color-mix(in_oklab,var(--brand-500)_22%,transparent)]" />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setShowCols((v) => !v)} aria-expanded={showCols}
            className={`ctl flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] ${showCols ? "border-brand-500 bg-[var(--surface-3)]" : "border-[var(--border)] hover:bg-[var(--surface-3)]"}`}>
            <Columns3 size={12} /> Columns{hiddenCount ? ` (${hiddenCount} hidden)` : ""}
          </button>
          <select value={table.getState().pagination.pageSize} aria-label="Rows per page"
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px]">
            {[10, 25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>

        {showCols && (
          <div className="pop rise absolute right-3 top-full z-40 mt-1 max-h-72 w-64 overflow-y-auto p-1">
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

      <div className="max-h-[min(72vh,900px)] overflow-auto overscroll-x-contain">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const first = h.index === 0;
                  return (
                    <th key={h.id} scope="col" aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={`whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-2)]/95 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[.06em] text-[var(--text-muted)] backdrop-blur ${first ? "sticky left-0 z-10" : ""}`}>
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className={`group/sort -mx-1 flex items-center gap-1 rounded px-1 transition-colors hover:text-[var(--text)] ${sorted ? "text-[var(--text)]" : ""}`}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? <ArrowUp size={10} className="text-brand-600" /> : sorted === "desc" ? <ArrowDown size={10} className="text-brand-600" /> : <ArrowUpDown size={10} className="opacity-0 transition-opacity group-hover/sort:opacity-60" />}
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
                className={`group/row transition-colors duration-100 hover:bg-[color-mix(in_oklab,var(--brand-500)_5%,var(--surface))] ${onRowClick ? "cursor-pointer" : ""}`}>
                {row.getVisibleCells().map((c, ci) => (
                  <td key={c.id} className={`whitespace-nowrap border-b border-[var(--border)] px-3 py-[var(--row-y)] group-last/row:border-0 ${ci === 0 ? "sticky left-0 z-[1] bg-[var(--surface)] shadow-[1px_0_0_var(--border)] group-hover/row:bg-[color-mix(in_oklab,var(--brand-500)_5%,var(--surface))]" : ""}`}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
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
