"use client";
import { useEffect, useState } from "react";
import { useFilters } from "../providers/FilterProvider";
import { meta } from "@/lib/dataset";
import { ExportMenu } from "./ExportMenu";
import { Letterhead } from "../reports/Letterhead";

/**
 * Page title, breadcrumb and export bar. Also emits the print-only report
 * header (§43) carrying NAVTTC branding, module name, filter context,
 * record count and generation timestamp.
 */
export function PageHeader({
  title, description, page, printHeader = true, printLabel,
}: {
  title: string;
  description?: string;
  page: string;
  /** Set false when the page renders its own purpose-built print document. */
  printHeader?: boolean;
  printLabel?: string;
}) {
  const { filters, rows, kpis } = useFilters();

  /**
   * The report timestamp is resolved after mount, never during render.
   *
   * Rendering `new Date()` inline makes the server HTML and the client HTML
   * disagree by however many seconds hydration took, which React reports as a
   * hydration mismatch. Holding it in state keeps the first client render
   * identical to the server's, then fills the value in.
   *
   * It also refreshes on `beforeprint`, so a printed report is stamped with the
   * moment it was printed rather than the moment the page was opened.
   */
  const [generatedAt, setGeneratedAt] = useState<string>("");
  useEffect(() => {
    const stamp = () => setGeneratedAt(new Date().toLocaleString("en-GB"));
    stamp();
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, []);

  const chips: string[] = [];
  if (filters.region.length) chips.push(`Region: ${filters.region.join(", ")}`);
  if (filters.district.length) chips.push(`District: ${filters.district.join(", ")}`);
  if (filters.package.length) chips.push(`Package: ${filters.package.join(", ")}`);
  if (filters.grade.length) chips.push(`Grade: ${filters.grade.join(", ")}`);
  if (filters.trade.length) chips.push(`${filters.trade.length} trade(s)`);
  if (filters.batch.length) chips.push(`Batch: ${filters.batch.join(", ")}`);
  if (filters.search.trim()) chips.push(`Search: "${filters.search.trim()}"`);
  if (filters.scoreMin !== null || filters.scoreMax !== null)
    chips.push(`Score ${filters.scoreMin ?? 0}–${filters.scoreMax ?? 100}`);

  return (
    <>
      {/* screen */}
      <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 max-w-2xl text-[13px] text-[var(--text-muted)]">{description}</p>}
        </div>
        <ExportMenu page={page} printLabel={printLabel} />
      </div>

      {/* print report header (§43) */}
      {printHeader && <div className="print-only mb-4 border-b-2 border-black pb-3">
        <Letterhead variant="print" />
        <div className="mt-2 flex items-end justify-between border-t border-black pt-2">
          <div>
            <div className="text-[11pt] font-semibold leading-tight">{title}</div>
          </div>
          <div className="text-right text-[8pt] leading-snug">
            <div><strong>Programme:</strong> {meta.program}</div>
            <div><strong>Assessment:</strong> {meta.assessmentDate}</div>
            <div><strong>Generated:</strong> <span suppressHydrationWarning>{generatedAt || "—"}</span></div>
            <div><strong>Records:</strong> {rows.length.toLocaleString()} · <strong>Institutes:</strong> {kpis.institutes}</div>
          </div>
        </div>
        <div className="mt-2 text-[8.5pt]">
          <strong>Filters applied:</strong> {chips.length ? chips.join("  ·  ") : "None — full dataset"}
        </div>
      </div>}
    </>
  );
}
