"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Globe2, Check } from "lucide-react";
import { useDash } from "../providers/FilterProvider";
import { scopeFromPath, programBase } from "@/lib/portfolio";
import { activeModule } from "./nav";
import { fmtCompact, fmtMonth, scoreColor } from "@/config";

/**
 * The scope switcher. Switching keeps you on the same module where it exists
 * in the target scope (Trades → Trades), and carries the filters across.
 */
export function ScopeSwitcher() {
  const { data, scope } = useDash();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);

  const stats = useMemo(() => data.programs.map((p) => {
    const rows = data.rowsByProgram.get(p.slug) ?? [];
    const insts = data.institutes.filter((i) => i.p === p.slug && i.score !== null);
    return {
      p,
      enrolled: rows.reduce((s, r) => s + r.enrolled, 0),
      mean: insts.length ? insts.reduce((s, i) => s + (i.score as number), 0) / insts.length : null,
    };
  }), [data]);

  const go = (slug: string | null) => {
    const { rest } = scopeFromPath(pathname);
    const mod = activeModule(rest);
    const keep = mod && !(slug && mod.portfolioOnly) && !rest.match(/^\/institutions\/./) ? (mod.path === "/" ? "" : mod.path) : "";
    const base = slug ? programBase(slug) : "";
    const qs = search.toString();
    router.push(((base + keep) || "/") + (qs ? `?${qs}` : ""));
    setOpen(false);
  };

  const color = scope.program?.color ?? "#2563eb";

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox"
        className="flex max-w-[60vw] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 pl-1 pr-2 text-xs font-semibold shadow-sm transition hover:border-[color:var(--c)]"
        style={{ ["--c" as string]: color }}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-white" style={{ background: color }}>
          {scope.program ? <span className="text-[8.5px] font-black">{scope.program.badge}</span> : <Globe2 size={13} />}
        </span>
        <span className="truncate">{scope.program ? scope.program.name : "All Programmes"}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div role="listbox" className="rise absolute left-0 top-full z-[60] mt-2 w-[min(92vw,460px)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <button onClick={() => go(null)} role="option" aria-selected={scope.mode === "portfolio"}
            className="flex w-full items-center gap-3 border-b border-[var(--border)] bg-gradient-to-r from-brand-50 to-transparent px-3 py-2.5 text-left hover:from-brand-100 dark:from-brand-700/20">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white"><Globe2 size={17} /></span>
            <span className="flex-1">
              <span className="block text-[13px] font-bold">All Programmes</span>
              <span className="block text-[11px] text-[var(--text-muted)]">Combined analytics across {data.programs.length} programmes · {data.raw.meta.uniqueInstitutes} unique institutes</span>
            </span>
            {scope.mode === "portfolio" && <Check size={15} className="text-brand-600" />}
          </button>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {stats.map(({ p, enrolled, mean }) => (
              <button key={p.slug} onClick={() => go(p.slug)} role="option" aria-selected={scope.program?.slug === p.slug}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[var(--surface-3)]">
                <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[10.5px] text-[var(--text-muted)]">
                    {p.family} · {p.instituteCount} institutes · {fmtCompact(enrolled)} trainees · {p.period ? fmtMonth(p.period.to) : p.assessmentDate ? fmtMonth(p.assessmentDate) : "date n/a"}
                  </span>
                </span>
                <span className="num text-right">
                  <span className="block text-sm font-bold" style={{ color: scoreColor(mean) }}>{mean?.toFixed(1) ?? "—"}</span>
                  <span className="block text-[9px] uppercase tracking-wide text-[var(--text-muted)]">mean</span>
                </span>
                {scope.program?.slug === p.slug && <Check size={15} style={{ color: p.color }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
