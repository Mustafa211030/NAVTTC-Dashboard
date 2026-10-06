"use client";
import React, { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AssessmentRow, FilterState, Institute, Program, Portfolio } from "@/types";
import { EMPTY_FILTERS, applyFilters, paramsToFilters, filtersToParams, countActive } from "@/lib/filters";
import { institutesFromRows, computeKpis, type Kpis } from "@/lib/aggregate";
import { indexPortfolio, programBase, scopeFromPath, type PortfolioIndex } from "@/lib/portfolio";
import { BootScreen } from "../layout/BootScreen";

/* ------------------------------------------------------------------ *
 * Data + scope + filters, in one provider.
 *
 *   data   — the whole portfolio, fetched once from /data/portfolio.json
 *   scope  — "portfolio" at the root, or one programme under /p/<slug>.
 *            Every module reads the same hook and renders for whichever
 *            scope the URL is in, so each page exists once and serves both.
 *   filters — global, URL-synced, cascading.
 * ------------------------------------------------------------------ */

export interface Scope {
  mode: "portfolio" | "program";
  program: Program | null;
  /** programmes visible in this scope (after the Programme filter, in portfolio mode) */
  programs: Program[];
  base: string;
  href: (path: string) => string;
  label: string;
}

interface Ctx {
  data: PortfolioIndex;
  scope: Scope;
  filters: FilterState;
  setFilters: (f: FilterState | ((p: FilterState) => FilterState)) => void;
  patch: (p: Partial<FilterState>) => void;
  /** add/remove a value from a list filter — used by every click-to-filter chart */
  toggle: <K extends "program" | "region" | "district" | "package" | "trade" | "grade" | "status">(key: K, value: string) => void;
  reset: () => void;
  /** every row in scope, before filters */
  scopeRows: AssessmentRow[];
  rows: AssessmentRow[];
  institutes: Institute[];
  kpis: Kpis;
  activeCount: number;
  hasFilters: boolean;
  isEmpty: boolean;
  /** rows in scope with every filter except the listed ones — powers option counts */
  rowsIgnoring: (keys: (keyof FilterState)[]) => AssessmentRow[];
}

const DashCtx = createContext<Ctx | null>(null);

let cache: Promise<Portfolio> | null = null;
function loadPortfolio(): Promise<Portfolio> {
  if (!cache) {
    cache = fetch("/data/portfolio.json", { cache: "force-cache" }).then((r) => {
      if (!r.ok) throw new Error(`Could not load dataset (${r.status})`);
      return r.json();
    });
    cache.catch(() => { cache = null; });
  }
  return cache;
}

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PortfolioIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPortfolio().then((p) => setData(indexPortfolio(p))).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  if (!data) return <BootScreen error={error} />;
  return <Inner data={data}>{children}</Inner>;
}

function Inner({ data, children }: { data: PortfolioIndex; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFiltersState] = useState<FilterState>(EMPTY_FILTERS);
  const [hydrated, setHydrated] = useState(false);

  /* ---- scope from the URL ---- */
  const { slug } = scopeFromPath(pathname);
  const program = slug ? data.programBySlug.get(slug) ?? null : null;
  const mode: Scope["mode"] = program ? "program" : "portfolio";

  useEffect(() => {
    setFiltersState(paramsToFilters(new URLSearchParams(searchParams.toString())));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const qs = filtersToParams(filters).toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    if (typeof window !== "undefined" && window.location.pathname + window.location.search === target) return;
    router.replace(target, { scroll: false });
  }, [filters, hydrated, pathname, router]);

  const scopeRows = useMemo(
    () => (program ? data.rowsByProgram.get(program.slug) ?? [] : data.rows),
    [data, program]);

  /* ---- entering a programme: drop filter values that do not exist there ---- */
  const lastSlug = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!hydrated) return;
    if (lastSlug.current === undefined) { lastSlug.current = slug; return; }
    if (lastSlug.current === slug) return;
    lastSlug.current = slug;
    const has = <T,>(vals: T[], get: (r: AssessmentRow) => T) => {
      const s = new Set(scopeRows.map(get));
      return vals.filter((v) => s.has(v));
    };
    setFiltersState((f) => ({
      ...f,
      program: program ? [] : f.program,
      region: has(f.region, (r) => r.region),
      district: has(f.district, (r) => r.district),
      package: has(f.package, (r) => r.package ?? ""),
      trade: has(f.trade, (r) => r.tradeNorm),
      batch: has(f.batch, (r) => r.batch ?? -1),
    }));
  }, [slug, hydrated, program, scopeRows]);

  const setFilters = useCallback((f: FilterState | ((p: FilterState) => FilterState)) => {
    setFiltersState((prev) => {
      const next = { ...(typeof f === "function" ? f(prev) : f) };
      // Cascading: a district must belong to a selected region.
      if (next.region.length) {
        const valid = new Set(data.rows.filter((r) => next.region.includes(r.region)).map((r) => r.district));
        next.district = next.district.filter((d) => valid.has(d));
      }
      return next;
    });
  }, [data]);

  const patch = useCallback((p: Partial<FilterState>) => setFilters((prev) => ({ ...prev, ...p })), [setFilters]);
  const toggle = useCallback(<K extends "program" | "region" | "district" | "package" | "trade" | "grade" | "status">(key: K, value: string) => {
    setFilters((prev) => {
      const cur = prev[key] as string[];
      return { ...prev, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] };
    });
  }, [setFilters]);
  const reset = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters]);

  const effective = useMemo<FilterState>(() => (program ? { ...filters, program: [] } : filters), [filters, program]);
  const rows = useMemo(() => applyFilters(scopeRows, effective, data.facts), [scopeRows, effective, data]);
  const institutes = useMemo(() => institutesFromRows(rows, data.instituteByKey, data.programBySlug), [rows, data]);
  const kpis = useMemo(() => computeKpis(rows, institutes), [rows, institutes]);
  const rowsIgnoring = useCallback(
    (keys: (keyof FilterState)[]) => applyFilters(scopeRows, effective, data.facts, keys),
    [scopeRows, effective, data]);

  const scope = useMemo<Scope>(() => {
    const base = program ? programBase(program.slug) : "";
    const programs = program ? [program] : data.programs.filter((p) => !effective.program.length || effective.program.includes(p.slug));
    return {
      mode, program, programs, base,
      href: (path: string) => (base + (path === "/" ? "" : path)) || "/",
      label: program ? program.name : "All Programmes",
    };
  }, [mode, program, data, effective.program]);

  const value: Ctx = {
    data, scope, filters: effective, setFilters, patch, toggle, reset,
    scopeRows, rows, institutes, kpis,
    activeCount: countActive(effective),
    hasFilters: countActive(effective) > 0,
    isEmpty: rows.length === 0,
    rowsIgnoring,
  };
  return <DashCtx.Provider value={value}>{children}</DashCtx.Provider>;
}

export function useFilters(): Ctx {
  const c = useContext(DashCtx);
  if (!c) throw new Error("useFilters must be used inside <FilterProvider>");
  return c;
}
export const useDash = useFilters;
