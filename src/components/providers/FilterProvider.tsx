"use client";
import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AssessmentRow, FilterState, Institute } from "@/types";
import { rows as allRows, institutes as allInstitutes, dimensions } from "@/lib/dataset";
import { EMPTY_FILTERS, applyFilters, buildGradeMap, paramsToFilters, filtersToParams, countActive, isActive } from "@/lib/filters";
import { institutesFromRows, computeKpis, type Kpis } from "@/lib/aggregate";

interface Ctx {
  filters: FilterState;
  setFilters: (f: FilterState | ((p: FilterState) => FilterState)) => void;
  patch: (p: Partial<FilterState>) => void;
  reset: () => void;
  rows: AssessmentRow[];
  institutes: Institute[];
  kpis: Kpis;
  activeCount: number;
  hasFilters: boolean;
  isEmpty: boolean;
  gradeByInstitute: Map<number, string>;
}

const FilterCtx = createContext<Ctx | null>(null);

const baseInstituteMap = new Map(allInstitutes.map((i) => [i.instituteId, i]));
const gradeByInstitute = buildGradeMap(allInstitutes);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFiltersState] = useState<FilterState>(EMPTY_FILTERS);
  const [hydrated, setHydrated] = useState(false);

  // Read filters out of the URL on first paint so shared links restore state (§55).
  useEffect(() => {
    setFiltersState(paramsToFilters(new URLSearchParams(searchParams.toString())));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push filter state back into the URL, replacing history so Back still works.
  useEffect(() => {
    if (!hydrated) return;
    const qs = filtersToParams(filters).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, hydrated, pathname, router]);

  const setFilters = useCallback((f: FilterState | ((p: FilterState) => FilterState)) => {
    setFiltersState((prev) => {
      const next = typeof f === "function" ? f(prev) : f;
      // Cascading: drop districts that no longer belong to a selected region (§13)
      if (next.region.length) {
        const valid = new Set(next.region.flatMap((r) => dimensions.regionDistricts[r] ?? []));
        next.district = next.district.filter((d) => valid.has(d));
      }
      return next;
    });
  }, []);

  const patch = useCallback((p: Partial<FilterState>) => setFilters((prev) => ({ ...prev, ...p })), [setFilters]);
  const reset = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters]);

  const rows = useMemo(() => applyFilters(allRows, filters, gradeByInstitute), [filters]);
  const institutes = useMemo(() => institutesFromRows(rows, baseInstituteMap), [rows]);
  const kpis = useMemo(() => computeKpis(rows, institutes), [rows, institutes]);

  const value: Ctx = {
    filters, setFilters, patch, reset,
    rows, institutes, kpis,
    activeCount: countActive(filters),
    hasFilters: isActive(filters),
    isEmpty: rows.length === 0,
    gradeByInstitute,
  };
  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

export function useFilters(): Ctx {
  const c = useContext(FilterCtx);
  if (!c) throw new Error("useFilters must be used inside <FilterProvider>");
  return c;
}
