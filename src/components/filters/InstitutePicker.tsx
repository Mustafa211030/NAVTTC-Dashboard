"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Search, X, Check, AlertTriangle, Crosshair } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { directoryOf, searchInstitutes, type InstituteEntry } from "@/lib/institutes";
import { scoreColor, fmtScore } from "@/config";

export const MAX_INSTITUTES = 5;

/** Monospace ID chip — or a "name-matched" chip where the workbook has no ID. */
export function IdChip({ entry, small }: { entry: Pick<InstituteEntry, "id" | "nameMatched">; small?: boolean }) {
  return entry.id !== null ? (
    <span className={`num shrink-0 rounded bg-[var(--surface-3)] font-mono font-semibold text-[var(--text-muted)] ${small ? "px-1 text-[9.5px]" : "px-1.5 py-0.5 text-[10.5px]"}`}>ID {entry.id}</span>
  ) : (
    <span title="No Institute ID in the workbook — matched on name" className={`shrink-0 rounded border border-dashed border-[var(--border)] text-[var(--text-muted)] ${small ? "px-1 text-[9px]" : "px-1.5 py-0.5 text-[10px]"}`}>name-matched</span>
  );
}

/** Programme dots, in programme colours and order. */
export function ProgramDots({ entry, labels }: { entry: InstituteEntry; labels?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {entry.programs.map((p) => (
        <span key={p.slug} title={p.name} className="inline-flex items-center gap-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {labels && <span className="text-[10px] font-semibold" style={{ color: p.color }}>{p.code}</span>}
        </span>
      ))}
    </span>
  );
}

export function DeltaArrow({ v }: { v: number | null }) {
  if (v === null) return null;
  const flat = Math.abs(v) < 5;
  return <span className={`num text-[10px] font-bold ${flat ? "text-[var(--text-muted)]" : v > 0 ? "text-emerald-600" : "text-red-600"}`}>{flat ? "◆" : v > 0 ? "▲" : "▼"}{Math.abs(v).toFixed(1)}</span>;
}

/**
 * The Institute filter. Type a name or an Institute ID; one entry per real
 * institute across every programme. Up to five can be selected to compare;
 * exactly one switches the dashboard into focus mode.
 */
export function InstitutePicker() {
  const { data, filters, patch, rowsIgnoring, scope } = useDash();
  const dir = directoryOf(data);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  /** Records per institute under every OTHER active filter (and the current scope). */
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rowsIgnoring(["institute"])) m.set(r.globalKey, (m.get(r.globalKey) ?? 0) + 1);
    return m;
  }, [rowsIgnoring]);

  const inScope = useMemo(
    () => (scope.program ? dir.list.filter((e) => e.records.some((r) => r.p === scope.program!.slug)) : dir.list),
    [dir, scope.program]);

  const results = useMemo(() => {
    const hits = searchInstitutes(inScope, q);
    // Matches under the current filters first; the rest stay reachable, dimmed.
    const live = hits.filter((e) => (counts.get(e.key) ?? 0) > 0);
    const dead = hits.filter((e) => !(counts.get(e.key) ?? 0));
    return [...live, ...dead].slice(0, 80);
  }, [inScope, q, counts]);

  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const selected = filters.institute.map((k) => dir.byKey.get(k)).filter(Boolean) as InstituteEntry[];
  const toggle = (k: string) => {
    if (filters.institute.includes(k)) patch({ institute: filters.institute.filter((x) => x !== k) });
    else if (filters.institute.length < MAX_INSTITUTES) patch({ institute: [...filters.institute, k] });
  };

  const label = selected.length === 0 ? null : selected.length === 1 ? selected[0].name : `${selected.length} institutes`;

  return (
    <div className="relative min-w-[220px] flex-[1.4] sm:max-w-sm" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox"
        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
          selected.length ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20" : "border-[var(--border)] bg-[var(--surface)] hover:border-brand-500"}`}>
        <Building2 size={13} className={selected.length ? "text-brand-600" : "text-[var(--text-muted)]"} />
        {label ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate font-semibold text-brand-700 dark:text-brand-100">{label}</span>
            {selected.length === 1 && <IdChip entry={selected[0]} small />}
          </span>
        ) : (
          <span className="flex-1 text-[var(--text-muted)]">Institute — name or ID…</span>
        )}
        {selected.length > 0 && (
          <span role="button" tabIndex={0} aria-label="Clear institute filter"
            onClick={(e) => { e.stopPropagation(); patch({ institute: [] }); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); patch({ institute: [] }); } }}
            className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"><X size={12} /></span>
        )}
      </button>

      {open && (
        <div role="listbox" aria-multiselectable className="rise absolute left-0 top-full z-50 mt-1 w-[min(94vw,480px)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
            <Search size={14} className="text-[var(--text-muted)]" />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or Institute ID…" aria-label="Search institutes"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                if (e.key === "Enter" && results[cursor]) { e.preventDefault(); toggle(results[cursor].key); }
                if (e.key === "Escape") setOpen(false);
              }}
              className="h-10 flex-1 bg-transparent text-[13px] outline-none focus-visible:outline-none" style={{ outline: "none" }} />
            <span className="num text-[10px] text-[var(--text-muted)]">{filters.institute.length}/{MAX_INSTITUTES}</span>
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              {selected.map((e) => (
                <span key={e.key} className="inline-flex max-w-[210px] items-center gap-1 rounded-full bg-brand-600 py-0.5 pl-2 pr-1 text-[10.5px] font-medium text-white">
                  <span className="truncate">{e.name}</span>
                  <button onClick={() => toggle(e.key)} aria-label={`Remove ${e.name}`} className="rounded-full p-0.5 hover:bg-white/20"><X size={10} /></button>
                </span>
              ))}
              <button onClick={() => patch({ institute: [] })} className="ml-auto text-[10.5px] text-[var(--text-muted)] hover:text-[var(--text)]">Clear</button>
            </div>
          )}

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1">
            {results.length === 0 && <div className="px-3 py-8 text-center text-xs text-[var(--text-muted)]">No institute matches “{q}”.</div>}
            {results.map((e, idx) => {
              const on = filters.institute.includes(e.key);
              const n = counts.get(e.key) ?? 0;
              const full = !on && filters.institute.length >= MAX_INSTITUTES;
              return (
                <button key={e.key} data-idx={idx} role="option" aria-selected={on} disabled={full}
                  onMouseEnter={() => setCursor(idx)} onClick={() => toggle(e.key)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    idx === cursor ? "bg-[var(--surface-3)]" : ""} ${n === 0 && !on ? "opacity-55" : ""}`}>
                  <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "border-brand-600 bg-brand-600 text-white" : "border-[var(--border)]"}`}>
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-semibold"><Highlight text={e.name} q={q} /></span>
                      <IdChip entry={e} small />
                      {e.conflict && <span title={`Recorded under different names: ${e.names.join(" · ")}`}><AlertTriangle size={11} className="text-amber-500" /></span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-[var(--text-muted)]">
                      <span>{e.district}, {e.region}</span>
                      <ProgramDots entry={e} labels />
                      <span>{n ? `${n} record${n === 1 ? "" : "s"} in view` : "not in current filters"}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[13px] font-bold" style={{ color: scoreColor(e.latest.score) }}>{fmtScore(e.latest.score, 1)}</span>
                    <DeltaArrow v={e.delta} />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
            <span>↑↓ to move · Enter to select · up to {MAX_INSTITUTES} to compare</span>
            <span>{inScope.length} institutes{scope.program ? ` in ${scope.program.short}` : " · all programmes"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const t = q.trim().replace(/^id\s*/i, "");
  if (!t || /^\d+$/.test(t)) return <>{text}</>;
  const i = text.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-amber-200/70 px-0 text-inherit dark:bg-amber-500/40">{text.slice(i, i + t.length)}</mark>{text.slice(i + t.length)}</>;
}

/**
 * Small crosshair button placed beside institute names across the dashboard.
 * Click: focus on this institute. Shift/Ctrl-click: add it to the comparison.
 */
export function FocusButton({ globalKey, className = "" }: { globalKey: string; className?: string }) {
  const { filters, patch } = useDash();
  const on = filters.institute.includes(globalKey);
  return (
    <button type="button"
      title={on ? "Remove from institute filter" : "Focus on this institute (Shift-click to add to comparison)"}
      aria-label={on ? "Remove from institute filter" : "Focus on this institute"}
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        if (on) patch({ institute: filters.institute.filter((x) => x !== globalKey) });
        else if (e.shiftKey || e.ctrlKey || e.metaKey) patch({ institute: [...filters.institute, globalKey].slice(-MAX_INSTITUTES) });
        else patch({ institute: [globalKey] });
        if (!e.shiftKey) window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className={`no-print grid h-6 w-6 shrink-0 place-items-center rounded-md transition-colors ${on ? "bg-brand-600 text-white" : "text-[var(--text-muted)] hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-700/30"} ${className}`}>
      <Crosshair size={13} />
    </button>
  );
}
