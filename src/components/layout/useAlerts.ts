"use client";
import { useMemo } from "react";
import { useDash } from "../providers/FilterProvider";
import { instituteHref, programBase } from "@/lib/portfolio";

export type AlertKind = "integrity" | "decline" | "quality";
export interface DashAlert {
  id: string;
  kind: AlertKind;
  severity: "high" | "medium";
  title: string;
  detail: string;
  program: string;
  href: string;
  /** global institute key, when the alert is about one institute */
  globalKey?: string;
  score?: number | null;
}

/**
 * The alerts centre. Assessment data is batch, not streaming, so "alerts"
 * are the findings a monitor would want surfaced without hunting:
 *
 *   integrity — institutes recorded as fake, critical, non-functional or closed
 *   decline   — an institute's score fell 10+ points since its previous programme
 *   quality   — high-severity validation findings per workbook, ID/name conflicts
 *
 * Scoped to the programmes in view; independent of the other filters, so the
 * list does not shift while the user is filtering charts.
 */
export function useAlerts(): DashAlert[] {
  const { data, scope } = useDash();
  return useMemo(() => {
    const inScope = new Set(scope.programs.map((p) => p.slug));
    const out: DashAlert[] = [];
    const P = (s: string) => data.programBySlug.get(s)!;

    for (const i of data.institutes) {
      if (!inScope.has(i.p) || i.status === "Active") continue;
      out.push({
        id: `int|${i.p}|${i.instituteKey}`, kind: "integrity",
        severity: i.status === "Fake" || i.status === "Critical" ? "high" : "medium",
        title: i.instituteName,
        detail: `${i.status}${i.gradeOverride && i.gradeOverride !== i.status ? ` · graded ${i.gradeOverride}` : ""} · ${i.district}${i.assessorNote ? ` — ${i.assessorNote}` : ""}`,
        program: i.p, href: instituteHref(programBase(i.p), i), globalKey: i.globalKey, score: i.score,
      });
    }

    for (const [gk, list] of data.institutesByGlobal) {
      const scored = list.filter((x) => x.score !== null);
      for (let k = 1; k < scored.length; k++) {
        const a = scored[k - 1], b = scored[k];
        if (!inScope.has(b.p)) continue;
        const d = (b.score as number) - (a.score as number);
        if (d > -10) continue;
        out.push({
          id: `dec|${gk}|${b.p}`, kind: "decline", severity: d <= -20 ? "high" : "medium",
          title: b.instituteName,
          detail: `${(a.score as number).toFixed(1)} → ${(b.score as number).toFixed(1)} (${d.toFixed(1)}) · ${P(a.p).short} → ${P(b.p).short}`,
          program: b.p, href: `/institutions/${encodeURIComponent(gk)}`, globalKey: gk, score: b.score,
        });
      }
    }

    for (const p of scope.programs) {
      const high = p.quality.issues.filter((x) => x.severity === "high");
      if (!high.length) continue;
      const codes = [...new Set(high.map((x) => x.code))].slice(0, 3).join(", ");
      out.push({
        id: `dq|${p.slug}|${high.length}`, kind: "quality", severity: "high",
        title: `${high.length} high-severity data finding${high.length === 1 ? "" : "s"}`,
        detail: `${p.name} workbook · ${codes}`,
        program: p.slug, href: `${programBase(p.slug)}/data-quality`,
      });
    }
    if (scope.mode === "portfolio" && data.raw.crossProgramIssues.length) {
      out.push({
        id: `dq|ids|${data.raw.crossProgramIssues.length}`, kind: "quality", severity: "medium",
        title: `${data.raw.crossProgramIssues.length} Institute IDs with different names`,
        detail: "The same ID is recorded under different institute names in different programmes — verify before comparing.",
        program: "", href: "/data-quality",
      });
    }

    const rank = { high: 0, medium: 1 };
    return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.kind === "decline" && b.kind === "decline" ? (a.score ?? 0) - (b.score ?? 0) : 0));
  }, [data, scope]);
}
