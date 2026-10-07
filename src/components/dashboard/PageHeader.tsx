"use client";
import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { ExportMenu } from "./ExportMenu";
import { Letterhead } from "../reports/Letterhead";
import { fmtDate } from "@/config";

/**
 * Page title, scope eyebrow and export bar, plus the print-only report header
 * carrying the letterhead, programme, filter context and generation time.
 */
export function PageHeader({
  title, description, page, printHeader = true, printLabel, children,
}: {
  title: string;
  description?: string;
  page: string;
  printHeader?: boolean;
  printLabel?: string;
  children?: React.ReactNode;
}) {
  const { filters, rows, kpis, scope, data } = useDash();
  const [generatedAt, setGeneratedAt] = useState<string>("");
  useEffect(() => {
    const stamp = () => setGeneratedAt(new Date().toLocaleString("en-GB"));
    stamp();
    window.addEventListener("beforeprint", stamp);
    return () => window.removeEventListener("beforeprint", stamp);
  }, []);

  const chips: string[] = [];
  if (filters.institute.length) chips.push(`Institute: ${filters.institute.map((k) => { const r = data.institutesByGlobal.get(k); return r ? `${r[r.length - 1].instituteName} (${r[0].instituteId !== null ? `ID ${r[0].instituteId}` : k})` : k; }).join("; ")}`);
  if (filters.program.length) chips.push(`Programme: ${filters.program.map((s) => data.programBySlug.get(s)?.short ?? s).join(", ")}`);
  if (filters.region.length) chips.push(`Region: ${filters.region.join(", ")}`);
  if (filters.district.length) chips.push(`District: ${filters.district.join(", ")}`);
  if (filters.package.length) chips.push(`Package: ${filters.package.join(", ")}`);
  if (filters.grade.length) chips.push(`Grade: ${filters.grade.join(", ")}`);
  if (filters.status.length) chips.push(`Status: ${filters.status.join(", ")}`);
  if (filters.trade.length) chips.push(`${filters.trade.length} trade(s)`);
  if (filters.batch.length) chips.push(`Batch: ${filters.batch.join(", ")}`);
  if (filters.search.trim()) chips.push(`Search: "${filters.search.trim()}"`);
  if (filters.scoreMin !== null || filters.scoreMax !== null) chips.push(`Score ${filters.scoreMin ?? 0}–${filters.scoreMax ?? 100}`);
  if (filters.flaggedOnly) chips.push("Flagged only");

  const p = scope.program;
  const color = p?.color ?? "var(--brand-500)";

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="t-eyebrow mb-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1" style={{ color, background: `color-mix(in oklab, ${color} 10%, transparent)` }}>
            {p ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} /> : <Globe2 size={11} />}
            {p ? p.fullName : `All Programmes · ${scope.programs.length} of ${data.programs.length} in view`}
          </div>
          <h1 className="t-title sm:text-[26px]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[var(--text-muted)]">{description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <ExportMenu page={page} printLabel={printLabel} />
        </div>
      </div>

      {printHeader && (
        <div className="print-only mb-4 border-b-2 border-black pb-3">
          <Letterhead variant="print" />
          <div className="mt-2 flex items-end justify-between border-t border-black pt-2">
            <div className="text-[11pt] font-semibold leading-tight">{title}</div>
            <div className="text-right text-[8pt] leading-snug">
              <div><strong>Scope:</strong> {p ? p.name : "All programmes"}</div>
              {p && <div><strong>Assessment:</strong> {p.period ? `${fmtDate(p.period.from)} – ${fmtDate(p.period.to)}` : fmtDate(p.assessmentDate)}</div>}
              <div><strong>Generated:</strong> <span suppressHydrationWarning>{generatedAt || "—"}</span></div>
              <div><strong>Records:</strong> {rows.length.toLocaleString()} · <strong>Institutes:</strong> {kpis.institutes}</div>
            </div>
          </div>
          <div className="mt-2 text-[8.5pt]"><strong>Filters applied:</strong> {chips.length ? chips.join("  ·  ") : "None — full dataset"}</div>
        </div>
      )}
    </>
  );
}
