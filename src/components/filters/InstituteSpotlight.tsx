"use client";
import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowRight, X, Crosshair, Flag } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { directoryOf, type InstituteEntry } from "@/lib/institutes";
import { rankLabel } from "@/lib/standings";
import { instKey, EMPTY_FILTERS, countActive } from "@/lib/filters";
import { globalInstituteHref, instituteHref, programBase } from "@/lib/portfolio";
import { GRADE_COLORS, STATUS_COLORS, fmtInt, fmtMonth, fmtPct, fmtScore, scoreColor } from "@/config";
import { Badge } from "../ui";
import { IdChip, DeltaArrow } from "./InstitutePicker";
import type { Institute } from "@/types";

/**
 * Focus mode. Pinned under the filter bar on every page whenever the
 * Institute filter is set:
 *   one institute   → identity, journey across programmes, fixed standings
 *   2–5 institutes  → a compact side-by-side comparison
 * Standings are always whole-programme, never filtered.
 */
export function InstituteSpotlight() {
  const { data, filters, patch, setFilters, rows, rowsIgnoring, scope } = useDash();
  const dir = directoryOf(data);
  const onSettings = usePathname().replace(/\/$/, "") === "/settings";
  const selected = filters.institute.map((k) => dir.byKey.get(k)).filter(Boolean) as InstituteEntry[];

  /** Selected institutes that the OTHER filters (or the scope) hide completely. */
  const hidden = useMemo(() => {
    if (!selected.length) return [];
    const visible = new Set(rowsIgnoring(["institute"]).map((r) => r.globalKey));
    return selected.filter((e) => !visible.has(e.key));
  }, [selected, rowsIgnoring]);

  if (!selected.length || onSettings) return null;

  const hasOther = countActive({ ...filters, institute: [] }) > 0;
  const notInScope = scope.program ? selected.filter((e) => !e.records.some((r) => r.p === scope.program!.slug)) : [];

  return (
    <div className="no-print mb-4 space-y-2">
      {notInScope.length > 0 && (
        <Notice>
          <strong>{notInScope.map((e) => e.name).join(", ")}</strong> {notInScope.length === 1 ? "was" : "were"} not assessed in {scope.program!.name}.
          {notInScope.map((e) => (
            <span key={e.key} className="ml-1">It appears in{" "}
              {e.records.map((r, i) => (
                <span key={r.p}>{i ? ", " : ""}<Link className="font-semibold underline" href={programBase(r.p)}>{data.programBySlug.get(r.p)?.short}</Link></span>
              ))}.
            </span>
          ))}
          <Link href="/" className="ml-2 font-semibold underline">View across all programmes</Link>
        </Notice>
      )}
      {hidden.length > 0 && hidden.length > notInScope.length && hasOther && (
        <Notice>
          Other active filters hide <strong>{hidden.filter((h) => !notInScope.includes(h)).map((e) => e.name).join(", ")}</strong>.
          <button onClick={() => setFilters({ ...EMPTY_FILTERS, institute: filters.institute, program: filters.program })} className="ml-2 rounded-md bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700">
            Keep the institute, clear the other filters
          </button>
        </Notice>
      )}
      {selected.length === 1
        ? <Spotlight entry={selected[0]} onClear={() => patch({ institute: [] })} recordsInView={rows.length} />
        : <Compare entries={selected} onRemove={(k) => patch({ institute: filters.institute.filter((x) => x !== k) })} onClear={() => patch({ institute: [] })} />}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" /><div>{children}</div>
    </div>
  );
}

function when(data: ReturnType<typeof useDash>["data"], r: Institute) {
  const p = data.programBySlug.get(r.p)!;
  return r.visitDate ? fmtMonth(r.visitDate) : p.period ? fmtMonth(p.period.to) : p.assessmentDate ? fmtMonth(p.assessmentDate) : "undated";
}

function Spotlight({ entry, onClear, recordsInView }: { entry: InstituteEntry; onClear: () => void; recordsInView: number }) {
  const { data, scope, rows } = useDash();
  const latest = entry.latest;
  const lp = data.programBySlug.get(latest.p)!;
  const ls = data.standings.get(instKey(latest.p, latest.instituteKey));
  const inView = useMemo(() => {
    const enrolled = rows.reduce((s, r) => s + r.enrolled, 0);
    const an = rows.reduce((s, r) => s + r.attNum, 0), ad = rows.reduce((s, r) => s + r.attDen, 0);
    return { enrolled, trades: new Set(rows.map((r) => r.tradeNorm)).size, attendance: ad ? an / ad : null };
  }, [rows]);
  const flags = entry.records.filter((r) => r.flagged);

  return (
    <div className="rise relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${entry.programs.map((p) => p.color).join(", ")}${entry.programs.length === 1 ? ", transparent" : ""})` }} />
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 p-3.5">
        {/* identity */}
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-brand-600"><Crosshair size={12} /> Institute focus</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold leading-tight">{entry.name}</h2>
            <IdChip entry={entry} />
            {entry.conflict && <span title={entry.names.join(" · ")} className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"><AlertTriangle size={10} /> name differs across programmes — verify</span>}
          </div>
          <div className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">{entry.district}, {entry.region} · assessed in {entry.records.length} programme{entry.records.length === 1 ? "" : "s"}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span><span className="text-[var(--text-muted)]">In view </span><strong className="num">{fmtInt(recordsInView)}</strong> trade rows</span>
            <span><span className="text-[var(--text-muted)]">Enrolled </span><strong className="num">{fmtInt(inView.enrolled)}</strong></span>
            <span><span className="text-[var(--text-muted)]">Trades </span><strong className="num">{inView.trades}</strong></span>
            <span><span className="text-[var(--text-muted)]">Attendance </span><strong className="num">{fmtPct(inView.attendance)}</strong></span>
            {flags.length > 0 && <span className="inline-flex items-center gap-1 font-semibold text-red-600"><Flag size={11} />{flags.length} flagged record{flags.length === 1 ? "" : "s"}</span>}
          </div>
        </div>

        {/* journey */}
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {entry.records.map((r, i) => {
            const p = data.programBySlug.get(r.p)!;
            const st = data.standings.get(instKey(r.p, r.instituteKey));
            const prev = i > 0 ? entry.records[i - 1] : null;
            const d = prev && prev.score !== null && r.score !== null ? r.score - prev.score : null;
            const current = scope.program?.slug === r.p;
            return (
              <div key={r.p} className="flex items-center gap-1">
                {i > 0 && <ArrowRight size={13} className="shrink-0 text-[var(--text-muted)]" />}
                <Link href={instituteHref(programBase(r.p), r)}
                  className={`block min-w-[112px] rounded-lg border px-2.5 py-1.5 transition-colors hover:bg-[var(--surface-3)] ${current ? "border-2" : "border-[var(--border)]"}`}
                  style={current ? { borderColor: p.color } : undefined}>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold" style={{ color: p.color }}>
                    <span>{p.code}</span><span className="font-medium text-[var(--text-muted)]">{when(data, r)}</span>
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="num text-lg font-extrabold leading-none" style={{ color: scoreColor(r.score) }}>{fmtScore(r.score, 1)}</span>
                    <DeltaArrow v={d} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: GRADE_COLORS[r.grade] }} />
                    <span className="text-[10px] font-semibold">{r.grade}</span>
                    {r.status !== "Active" && <span className="text-[9.5px] font-bold" style={{ color: STATUS_COLORS[r.status] }}>· {r.status}</span>}
                  </div>
                  <div className="num mt-0.5 text-[10px] text-[var(--text-muted)]">{rankLabel(st)} / {st?.of ?? p.instituteCount}</div>
                </Link>
              </div>
            );
          })}
        </div>

        {/* latest standing */}
        <div className="min-w-[170px]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Latest standing · {lp.short}</div>
          <div className="num mt-0.5 text-xl font-extrabold leading-none">{rankLabel(ls)} <span className="text-xs font-semibold text-[var(--text-muted)]">of {ls?.of ?? "—"}</span></div>
          {ls?.topShare !== null && ls?.topShare !== undefined && (
            <>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(2, (1 - ls.topShare) * 100)}%` }} />
              </div>
              <div className="mt-1 text-[10.5px] text-[var(--text-muted)]">
                Top {Math.max(1, Math.round(ls.topShare * 100))}% · district #{ls.districtRank ?? "—"}/{ls.districtOf} · vs mean{" "}
                <span className={latest.score !== null && ls.programMean !== null && latest.score >= ls.programMean ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                  {latest.score !== null && ls.programMean !== null ? `${latest.score - ls.programMean >= 0 ? "+" : ""}${(latest.score - ls.programMean).toFixed(1)}` : "—"}
                </span>
              </div>
            </>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <Link href={globalInstituteHref(entry.key)} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700">Full profile <ArrowRight size={12} /></Link>
            <button onClick={onClear} aria-label="Leave institute focus" className="rounded-lg border border-[var(--border)] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-3)]"><X size={13} /></button>
          </div>
        </div>
      </div>
      {latest.assessorNote && (
        <div className="border-t border-[var(--border)] bg-red-50/60 px-3.5 py-1.5 text-[11px] text-red-800 dark:bg-red-950/30 dark:text-red-200">
          <strong>{lp.short} note:</strong> {latest.assessorNote}
        </div>
      )}
    </div>
  );
}

function Compare({ entries, onRemove, onClear }: { entries: InstituteEntry[]; onRemove: (k: string) => void; onClear: () => void }) {
  const { data } = useDash();
  const progs = data.programs.filter((p) => entries.some((e) => e.records.some((r) => r.p === p.slug)));
  return (
    <div className="rise overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3.5 py-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-brand-600"><Crosshair size={12} /> Comparing {entries.length} institutes</div>
        <button onClick={onClear} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]">Clear all</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Institute</th>
              {progs.map((p) => <th key={p.slug} className="px-3 py-1.5 text-right text-[10px] font-bold" style={{ color: p.color }}>{p.code} score · rank</th>)}
              <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Change</th>
              <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Enrolled (all)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.key} className="border-b border-[var(--border)] last:border-0">
                <td className="max-w-[300px] px-3 py-1.5">
                  <div className="flex items-center gap-1.5"><Link href={globalInstituteHref(e.key)} className="truncate font-semibold hover:underline">{e.name}</Link><IdChip entry={e} small /></div>
                  <div className="text-[10px] text-[var(--text-muted)]">{e.district}, {e.region}</div>
                </td>
                {progs.map((p) => {
                  const r = e.records.find((x) => x.p === p.slug);
                  const st = r ? data.standings.get(instKey(r.p, r.instituteKey)) : null;
                  return (
                    <td key={p.slug} className="num px-3 py-1.5 text-right">
                      {r ? (<><span className="font-bold" style={{ color: scoreColor(r.score) }}>{fmtScore(r.score, 1)}</span> <span className="text-[10px] text-[var(--text-muted)]">{rankLabel(st)}/{st?.of}</span></>) : <span className="text-[var(--text-muted)]">—</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right"><DeltaArrow v={e.delta} /></td>
                <td className="num px-3 py-1.5 text-right">{fmtInt(e.records.reduce((s, r) => s + r.enrolled, 0))}</td>
                <td className="px-2 py-1.5 text-right">
                  <span className="mr-1"><Badge color={GRADE_COLORS[e.latest.grade]}>{e.latest.grade}</Badge></span>
                  <button onClick={() => onRemove(e.key)} aria-label={`Remove ${e.name}`} className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-3)]"><X size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
