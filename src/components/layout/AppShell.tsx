"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, Moon, Sun, PanelLeftClose, PanelLeft, Search, ChevronRight, Globe2 } from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";
import { useDash } from "../providers/FilterProvider";
import { BrandLogo } from "./BrandLogo";
import { ChatWidget } from "../chat/ChatWidget";
import { navFor, activeModule } from "./nav";
import { ScopeSwitcher } from "./ScopeSwitcher";
import { CommandPalette } from "./CommandPalette";
import { scopeFromPath, programBase } from "@/lib/portfolio";
import { fmtMonth, scoreColor } from "@/config";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  const { data, scope } = useDash();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { dark, toggle } = useTheme();

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const { rest } = scopeFromPath(pathname);
  const current = activeModule(rest);
  const withQs = (href: string) => (qs ? `${href}?${qs}` : href);

  /** Programme summary for the sidebar: institutes and mean institute score. */
  const progStats = useMemo(() => new Map(data.programs.map((p) => {
    const insts = data.institutes.filter((i) => i.p === p.slug && i.score !== null);
    const mean = insts.length ? insts.reduce((s, i) => s + (i.score as number), 0) / insts.length : null;
    return [p.slug, { mean, n: p.instituteCount }];
  })), [data]);

  const families = useMemo(() => {
    const m = new Map<string, typeof data.programs>();
    for (const p of data.programs) { if (!m.has(p.family)) m.set(p.family, []); m.get(p.family)!.push(p); }
    return [...m.entries()];
  }, [data]);

  const moduleLinks = (base: string, mode: "portfolio" | "program", accent: string) => (
    <div className={`mt-0.5 space-y-0.5 ${collapsed ? "" : "ml-3 border-l border-white/10 pl-2"}`}>
      {navFor(mode).map(({ path, label, icon: Icon }) => {
        const href = (base + (path === "/" ? "" : path)) || "/";
        const on = current?.path === path;
        return (
          <Link key={path} href={withQs(href)} title={collapsed ? label : undefined} aria-current={on ? "page" : undefined}
            className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] transition-colors ${
              on ? "bg-white/12 font-semibold text-white" : "text-ink-300 hover:bg-white/6 hover:text-white"}`}>
            {on && <span className="absolute -left-[9px] top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: accent }} />}
            <Icon size={15} strokeWidth={on ? 2.4 : 2} className="shrink-0" style={on ? { color: accent } : undefined} />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
            {collapsed && (
              <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">{label}</span>
            )}
          </Link>
        );
      })}
    </div>
  );

  const sidebar = (
    <>
      <div className={`border-b border-white/10 px-3 py-3 ${collapsed ? "flex justify-center" : ""}`}>
        <BrandLogo collapsed={collapsed} size={collapsed ? 30 : 34} tagline="NAVTTC Programme Analytics" />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Main">
        {!collapsed && <div className="px-2 pb-1 pt-1 text-[9.5px] font-bold uppercase tracking-[.14em] text-ink-500">Portfolio</div>}
        <Link href={withQs("/")} title={collapsed ? "All Programmes" : undefined}
          className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] transition-colors ${
            scope.mode === "portfolio" ? "bg-gradient-to-r from-brand-600 to-brand-500 font-semibold text-white shadow-md" : "text-ink-200 hover:bg-white/6"}`}>
          <Globe2 size={16} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1">All Programmes</span>
              <span className="num rounded bg-black/20 px-1.5 text-[10px]">{data.programs.length}</span>
            </>
          )}
        </Link>
        {scope.mode === "portfolio" && moduleLinks("", "portfolio", "#7fb0ff")}

        {families.map(([family, progs]) => (
          <div key={family} className="mt-3">
            {!collapsed && <div className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-[.14em] text-ink-500">{family}</div>}
            {progs.map((p) => {
              const on = scope.program?.slug === p.slug;
              const st = progStats.get(p.slug)!;
              return (
                <div key={p.slug}>
                  <Link href={withQs(programBase(p.slug))} title={collapsed ? p.name : undefined}
                    className={`group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors ${
                      on ? "bg-white/10 font-semibold text-white" : "text-ink-300 hover:bg-white/6 hover:text-white"}`}>
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[8.5px] font-black text-white" style={{ background: p.color }}>
                      {p.badge}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate">{p.short}</span>
                        <span className="num text-[10px] text-ink-500">{st.n}</span>
                        <span className="num w-8 rounded px-1 text-right text-[10px] font-bold" style={{ color: scoreColor(st.mean) }}>
                          {st.mean?.toFixed(0) ?? "—"}
                        </span>
                      </>
                    )}
                  </Link>
                  {on && moduleLinks(programBase(p.slug), "program", p.color)}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );

  const accent = scope.program?.color ?? "#2563eb";
  const period = scope.program
    ? scope.program.period ? `${fmtMonth(scope.program.period.from)} – ${fmtMonth(scope.program.period.to)}` : scope.program.assessmentDate ? fmtMonth(scope.program.assessmentDate) : "Date not recorded"
    : (() => {
        const ds = data.programs.flatMap((p) => [p.period?.from, p.period?.to, p.assessmentDate]).filter(Boolean).sort() as string[];
        return ds.length ? `${fmtMonth(ds[0])} – ${fmtMonth(ds[ds.length - 1])}` : "";
      })();

  return (
    <div className="flex min-h-screen">
      <aside data-sidebar
        className={`no-print sticky top-0 hidden h-screen shrink-0 flex-col bg-ink-950 transition-[width] duration-200 lg:flex ${collapsed ? "w-16" : "w-64"}`}>
        {sidebar}
        <div className="border-t border-white/10 p-2">
          <button onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12px] text-ink-400 hover:bg-white/8 hover:text-white">
            {collapsed ? <PanelLeft size={16} /> : <><PanelLeftClose size={16} /> Collapse</>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-black/55" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-ink-950">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-appheader className="no-print sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/88 backdrop-blur-md">
          <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}55 60%, transparent)` }} />
          <div className="flex h-12 items-center gap-2 px-4 sm:px-6">
            <button onClick={() => setMobileOpen(true)} aria-label="Open navigation" className="rounded-md p-1.5 hover:bg-[var(--surface-3)] lg:hidden">
              <Menu size={17} />
            </button>
            <ScopeSwitcher />
            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-xs text-[var(--text-muted)] sm:flex">
              <ChevronRight size={13} className="opacity-50" />
              <span className="truncate font-semibold text-[var(--text)]">{current?.label ?? "Dashboard"}</span>
            </nav>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:border-brand-500 md:flex">
                <Search size={13} /> Search institutes, pages…
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 text-[10px]">Ctrl K</kbd>
              </button>
              <button onClick={() => setPaletteOpen(true)} aria-label="Search" className="rounded-md p-1.5 hover:bg-[var(--surface-3)] md:hidden"><Search size={16} /></button>
              {period && <span className="num hidden rounded-md bg-[var(--surface-3)] px-2 py-1 text-[10px] text-[var(--text-muted)] xl:inline">{period}</span>}
              <button onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className="rounded-md p-1.5 hover:bg-[var(--surface-3)]">
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>
        </header>

        <main data-printarea className="min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-5">{children}</main>

        <footer className="no-print border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--text-muted)] sm:px-6">
          {scope.program
            ? <>Source: {scope.program.sourceFile} · {scope.program.rowCount.toLocaleString()} assessment records · {scope.program.instituteCount} institutes · rubric: {scope.program.rubric.label}</>
            : <>{data.programs.length} programmes · {data.raw.meta.rowCount.toLocaleString()} assessment records · {data.raw.meta.instituteCount} programme-institutes ({data.raw.meta.uniqueInstitutes} unique)</>}
          {" "}· Data generated {data.raw.meta.generatedAt.slice(0, 10)}
        </footer>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ChatWidget />
    </div>
  );
}
