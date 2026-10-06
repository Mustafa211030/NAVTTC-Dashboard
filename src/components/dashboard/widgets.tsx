"use client";
import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Calendar, ClipboardList, Filter } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { Card, Badge, StackBar } from "../ui";
import type { Institute, Program } from "@/types";
import { GRADE_COLORS, GRADE_ORDER, STATUS_COLORS, fmtCompact, fmtInt, fmtMonth, fmtPct, fmtScore, scoreColor, gradeOf } from "@/config";
import { instituteHref, programBase } from "@/lib/portfolio";
import { statOf } from "@/lib/aggregate";

export function SectionTitle({ children, hint, id }: { children: React.ReactNode; hint?: string; id?: string }) {
  return (
    <div id={id} className="mb-2 mt-6 flex items-baseline gap-3 first:mt-0">
      <h2 className="text-[13px] font-bold uppercase tracking-[.1em] text-[var(--text-muted)]">{children}</h2>
      <div className="h-px flex-1 bg-[var(--border)]" />
      {hint && <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>}
    </div>
  );
}

/** Programme card on the portfolio overview. */
export function ProgramCard({ program, rank }: { program: Program; rank?: number }) {
  const { rows, institutes, toggle, filters, scope } = useDash();
  const pr = useMemo(() => rows.filter((r) => r.p === program.slug), [rows, program.slug]);
  const pi = useMemo(() => institutes.filter((i) => i.p === program.slug), [institutes, program.slug]);
  const st = statOf(program.slug, pr);
  const scored = pi.filter((i) => i.score !== null);
  const mean = scored.length ? scored.reduce((s, i) => s + (i.score as number), 0) / scored.length : null;
  const grades = GRADE_ORDER.map((g) => ({ label: g, value: pi.filter((i) => gradeOf(i) === g).length, color: GRADE_COLORS[g] }));
  const exc = pi.length ? (grades[0].value / pi.length) : null;
  const flagged = pi.filter((i) => i.flagged).length;
  const on = filters.program.includes(program.slug);
  const dateLabel = program.period ? `${fmtMonth(program.period.from)}${program.period.from.slice(0, 7) !== program.period.to.slice(0, 7) ? " – " + fmtMonth(program.period.to) : ""}` : program.assessmentDate ? fmtMonth(program.assessmentDate) : "Date not recorded";

  return (
    <Card className={`card-hover rise relative overflow-hidden ${on ? "ring-2" : ""}`} style={on ? { ["--tw-ring-color" as string]: program.color } : undefined}>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: program.color }} />
      <div className="p-4 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: program.color }}>
              {program.family}{rank ? <span className="rounded bg-[var(--surface-3)] px-1 text-[var(--text-muted)]">#{rank}</span> : null}
            </div>
            <Link href={programBase(program.slug)} className="mt-0.5 block truncate text-[15px] font-bold leading-tight hover:underline">{program.name}</Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1"><Calendar size={10} />{dateLabel}</span>
              <span className="inline-flex items-center gap-1"><ClipboardList size={10} />{program.rubric.components.length} criteria</span>
            </div>
          </div>
          <div className="text-right">
            <div className="num text-[26px] font-extrabold leading-none" style={{ color: scoreColor(mean) }}>{fmtScore(mean, 1)}</div>
            <div className="text-[9.5px] uppercase tracking-wide text-[var(--text-muted)]">mean score</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[
            ["Institutes", fmtInt(pi.length)],
            ["Enrolled", fmtCompact(st.enrolled)],
            ["Attendance", fmtPct(st.attendanceRate, 0)],
            ["Excellent", fmtPct(exc, 0)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-[var(--surface-2)] px-1 py-1.5">
              <div className="num text-sm font-bold leading-none">{v}</div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{k}</div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>Grade mix</span>
            {flagged > 0 && <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle size={10} />{flagged} flagged</span>}
          </div>
          <StackBar parts={grades} height={9} />
          <div className="mt-1 flex flex-wrap gap-x-2 text-[9.5px] text-[var(--text-muted)]">
            {grades.filter((g) => g.value).map((g) => <span key={g.label}><span style={{ color: g.color }}>●</span> {g.label} {g.value}</span>)}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Link href={programBase(program.slug)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110" style={{ background: program.color }}>
            Open dashboard <ArrowRight size={13} />
          </Link>
          {scope.mode === "portfolio" && (
            <button onClick={() => toggle("program", program.slug)} title={on ? "Remove from filter" : "Filter the portfolio to this programme"}
              className={`grid h-[30px] w-[30px] place-items-center rounded-lg border text-xs ${on ? "border-transparent text-white" : "border-[var(--border)] hover:bg-[var(--surface-3)]"}`}
              style={on ? { background: program.color } : undefined}>
              <Filter size={13} />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Ranked list of institutes, linking to each institute's programme profile. */
export function RankPanel({ title, items, tone, showProgram, viewAll }: { title: string; items: Institute[]; tone: "good" | "bad"; showProgram?: boolean; viewAll?: string }) {
  const { data } = useDash();
  return (
    <Card className="print-avoid overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {viewAll && <Link href={viewAll} className="no-print text-[11px] font-medium text-brand-600 hover:underline">View all →</Link>}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {items.map((i, idx) => {
          const g = gradeOf(i);
          const p = data.programBySlug.get(i.p)!;
          return (
            <Link key={`${i.p}-${i.instituteKey}`} href={instituteHref(programBase(i.p), i)}
              className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[var(--surface-3)]">
              <span className={`num grid h-6 w-6 shrink-0 place-items-center rounded text-[10px] font-bold ${
                tone === "good" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>{idx + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium leading-tight">{i.instituteName}</div>
                <div className="truncate text-[10px] text-[var(--text-muted)]">
                  {showProgram && <span className="font-semibold" style={{ color: p.color }}>{p.short} · </span>}
                  {i.district}, {i.region} · {i.assessments} trade{i.assessments === 1 ? "" : "s"} · {fmtInt(i.enrolled)} trainees
                </div>
              </div>
              {i.flagged && <AlertTriangle size={12} className="shrink-0 text-red-500" />}
              <Badge color={GRADE_COLORS[g]}>{g}</Badge>
              <span className="num w-10 shrink-0 text-right text-xs font-bold">{fmtScore(i.score, 1)}</span>
            </Link>
          );
        })}
        {!items.length && <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">No institutes in view</div>}
      </div>
    </Card>
  );
}

/** Institutes carrying a written assessor note or a workbook override. */
export function FlaggedPanel({ institutes, showProgram, limit = 12 }: { institutes: Institute[]; showProgram?: boolean; limit?: number }) {
  const { data, patch, filters } = useDash();
  const flagged = useMemo(() => institutes.filter((i) => i.flagged).sort((a, b) => (a.score ?? -1) - (b.score ?? -1)), [institutes]);
  if (!flagged.length) return null;
  const byStatus = new Map<string, number>();
  for (const i of flagged) { const k = i.status === "Active" ? "Note" : i.status; byStatus.set(k, (byStatus.get(k) ?? 0) + 1); }
  return (
    <Card className="print-avoid overflow-hidden border-l-4 border-l-red-500">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-2 border-b border-[var(--border)] px-4 py-3">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
        <div className="min-w-[240px] flex-1">
          <h3 className="text-[13px] font-semibold">Flagged by assessors · {flagged.length}</h3>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Written monitor notes and workbook overrides (fake, non-functional, closed). Not simply the lowest scorers — read the note, not the number.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {[...byStatus.entries()].map(([s, n]) => <Badge key={s} color={STATUS_COLORS[s] ?? "#2563eb"}>{s === "Note" ? "Written note" : s} {n}</Badge>)}
          <button onClick={() => patch({ flaggedOnly: !filters.flaggedOnly })} className="no-print rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] hover:bg-[var(--surface-3)]">
            {filters.flaggedOnly ? "Show all" : "Filter to flagged"}
          </button>
        </div>
      </div>
      <div className="max-h-[420px] divide-y divide-[var(--border)] overflow-y-auto">
        {flagged.slice(0, limit).map((i) => {
          const p = data.programBySlug.get(i.p)!;
          return (
            <Link key={`${i.p}-${i.instituteKey}`} href={instituteHref(programBase(i.p), i)} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-3)]">
              <span className="num w-10 shrink-0 pt-0.5 text-right text-xs font-bold" style={{ color: scoreColor(i.score) }}>{fmtScore(i.score, 1)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium leading-tight">{i.instituteName}</div>
                <div className="truncate text-[10px] text-[var(--text-muted)]">
                  {showProgram && <span className="font-semibold" style={{ color: p.color }}>{p.short} · </span>}{i.district}, {i.region}
                </div>
                {i.assessorNote && <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-red-700 dark:text-red-300">{i.assessorNote}</p>}
              </div>
              <Badge color={STATUS_COLORS[i.status] ?? GRADE_COLORS[i.grade]}>{i.status === "Active" ? i.grade : i.status}</Badge>
            </Link>
          );
        })}
        {flagged.length > limit && <div className="px-4 py-2 text-center text-[11px] text-[var(--text-muted)]">+ {flagged.length - limit} more — use “Filter to flagged” and open Institutions</div>}
      </div>
    </Card>
  );
}
