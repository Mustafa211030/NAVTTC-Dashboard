"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { Menu, Moon, Sun, PanelLeftClose, PanelLeftOpen, Search, ChevronRight, Globe2, Settings, X } from "lucide-react";
import { useTheme, usePrefs } from "../providers/ThemeProvider";
import { useDash } from "../providers/FilterProvider";
import { BrandLogo } from "./BrandLogo";
import { ChatWidget } from "../chat/ChatWidget";
import { navFor, activeModule } from "./nav";
import { ScopeSwitcher } from "./ScopeSwitcher";
import { CommandPalette } from "./CommandPalette";
import { AlertsCenter } from "./AlertsCenter";
import { Overlay } from "../Overlay";
import { IconButton, Kbd, Popover } from "../ui";
import { scopeFromPath, programBase } from "@/lib/portfolio";
import { fmtMonth, fmtDate, scoreColor } from "@/config";

const COLLAPSE_KEY = "navttc-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  const { data, scope } = useDash();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => { try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* ignore */ } }, []);
  const toggleCollapsed = () => setCollapsed((v) => { try { window.localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch { /* ignore */ } return !v; });

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Settings → Start-up: open a chosen programme when the app starts at "/".
  const { prefs, loaded } = usePrefs();
  const router = useRouter();
  useEffect(() => {
    if (!loaded) return;
    try {
      if (window.sessionStorage.getItem("navttc-landed")) return;
      window.sessionStorage.setItem("navttc-landed", "1");
    } catch { return; }
    if (prefs.landing !== "portfolio" && pathname === "/" && !qs && data.programBySlug.has(prefs.landing)) router.replace(programBase(prefs.landing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
      if ((e.ctrlKey || e.metaKey) && e.key === "\\") { e.preventDefault(); toggleCollapsed(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const { rest } = scopeFromPath(pathname);
  const current = activeModule(rest);
  const isSettings = pathname.replace(/\/$/, "") === "/settings";
  const accent = scope.program?.color ?? "var(--brand-500)";

  const crumbs = useMemo(() => {
    const c: { label: string; href?: string }[] = [];
    if (isSettings) return [{ label: "Settings" }];
    c.push({ label: current?.label ?? "Dashboard", href: rest.match(/^\/institutions\/./) ? scope.href(current?.path ?? "/") : undefined });
    if (rest.match(/^\/institutions\/./)) c.push({ label: "Institute profile" });
    return c;
  }, [current, rest, scope, isSettings]);

  const sidebar = (rail: boolean) => (
    <Sidebar rail={rail} qs={qs} current={current?.path ?? (isSettings ? "/settings" : "/")} isSettings={isSettings}
      onCollapse={toggleCollapsed} />
  );

  return (
    <div className="flex min-h-screen lg:gap-3 lg:p-3">
      {/* Desktop: floating obsidian-glass sidebar */}
      <aside data-sidebar
        className={`no-print sticky top-3 hidden h-[calc(100vh-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-[rgb(9_13_22/.94)] text-white shadow-[0_20px_50px_-20px_rgb(2_6_15/.6)] ring-1 ring-white/[.07] backdrop-blur-xl transition-[width] duration-300 ease-[var(--ease-out-expo)] lg:flex ${collapsed ? "w-[68px]" : "w-[252px]"}`}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60" style={{ background: "radial-gradient(260px 140px at 20% 0%, color-mix(in oklab, var(--brand-500) 30%, transparent), transparent)" }} />
        {sidebar(collapsed)}
      </aside>

      {/* Mobile: slide-in drawer */}
      <Overlay open={mobileOpen} onClose={() => setMobileOpen(false)} variant="left" label="Navigation"
        className="flex h-full w-[min(300px,86vw)] flex-col bg-[#090d16] text-white">
        <div data-sidebar className="flex h-full flex-col">
          <IconButton label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute right-2 top-3 z-10 text-white/70 hover:bg-white/10 hover:text-white"><X size={16} /></IconButton>
          <LayoutGroup id="mobile-nav">{sidebar(false)}</LayoutGroup>
        </div>
      </Overlay>

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-appheader className="no-print glass sticky top-0 z-40 border-x-0 border-t-0 lg:top-3 lg:rounded-2xl lg:border-x lg:border-t lg:shadow-[var(--shadow-card)]">
          <div aria-hidden className="absolute inset-x-6 bottom-0 h-px lg:inset-x-8" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.55 }} />
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <IconButton label="Open navigation" onClick={() => setMobileOpen(true)} className="lg:hidden"><Menu size={17} /></IconButton>
            <ScopeSwitcher />
            <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-xs md:flex">
              {crumbs.map((c, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1">
                  <ChevronRight size={13} className="shrink-0 text-[var(--text-subtle)]" />
                  {c.href ? <Link href={c.href + (qs ? `?${qs}` : "")} className="truncate text-[var(--text-muted)] hover:text-[var(--text)]">{c.label}</Link>
                    : <span aria-current={i === crumbs.length - 1 ? "page" : undefined} className="truncate font-semibold">{c.label}</span>}
                </span>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => setPaletteOpen(true)}
                className="ctl hidden h-9 w-[clamp(180px,22vw,300px)] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 px-3 text-xs text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)] md:flex">
                <Search size={14} /> <span className="flex-1 truncate text-left">Search institutes, IDs, pages…</span>
                <span className="flex gap-0.5"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
              </button>
              <IconButton label="Search" onClick={() => setPaletteOpen(true)} className="md:hidden"><Search size={16} /></IconButton>
              <DataStatus />
              <AlertsCenter />
              <ThemeButton />
              <Link href={"/settings" + (qs ? `?${qs}` : "")} aria-label="Settings" title="Settings"
                className={`ctl hidden h-8 w-8 place-items-center rounded-lg hover:bg-[var(--surface-3)] hover:text-[var(--text)] sm:grid ${isSettings ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                <Settings size={16} />
              </Link>
            </div>
          </div>
        </header>

        <main data-printarea className="min-w-0 flex-1 px-3 pb-6 pt-3 sm:px-5 lg:px-1 lg:pt-3">{children}</main>

        <footer className="no-print flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-4 text-[11px] text-[var(--text-muted)] lg:px-1">
          <span className="inline-flex items-center gap-1.5"><span className="live-dot text-emerald-500" aria-hidden /> Data current</span>
          <span aria-hidden>·</span>
          {scope.program
            ? <span>{scope.program.sourceFile} · {scope.program.rowCount.toLocaleString()} records · {scope.program.instituteCount} institutes · {scope.program.rubric.label}</span>
            : <span>{data.programs.length} programmes · {data.raw.meta.rowCount.toLocaleString()} records · {data.raw.meta.instituteCount} programme-institutes ({data.raw.meta.uniqueInstitutes} unique)</span>}
          <span aria-hidden>·</span>
          <span>Generated {fmtDate(data.raw.meta.generatedAt.slice(0, 10))}</span>
        </footer>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ChatWidget />
    </div>
  );
}

/* ------------------------------------------------------------------ sidebar */

function Sidebar({ rail, qs, current, isSettings, onCollapse }: {
  rail: boolean; qs: string; current: string; isSettings: boolean; onCollapse: () => void;
}) {
  const { data, scope } = useDash();
  const withQs = (href: string) => (qs ? `${href}?${qs}` : href);

  const progStats = useMemo(() => new Map(data.programs.map((p) => {
    const insts = data.institutes.filter((i) => i.p === p.slug && i.score !== null);
    const mean = insts.length ? insts.reduce((s, i) => s + (i.score as number), 0) / insts.length : null;
    return [p.slug, { mean, n: p.instituteCount }];
  })), [data]);

  const families = useMemo(() => {
    const mm = new Map<string, typeof data.programs>();
    for (const p of data.programs) { if (!mm.has(p.family)) mm.set(p.family, []); mm.get(p.family)!.push(p); }
    return [...mm.entries()];
  }, [data]);

  const moduleLinks = (base: string, mode: "portfolio" | "program", color: string) => (
    <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
      <div className={`space-y-px pb-1 pt-0.5 ${rail ? "" : "ml-[15px] border-l border-white/[.08] pl-2"}`}>
        {navFor(mode).map(({ path, label, icon: Icon }) => {
          const href = (base + (path === "/" ? "" : path)) || "/";
          const on = !isSettings && current === path;
          return (
            <NavLink key={path} href={withQs(href)} label={label} rail={rail} on={on} color={color}>
              <Icon size={15} strokeWidth={on ? 2.3 : 1.9} className="shrink-0" style={on ? { color } : undefined} />
            </NavLink>
          );
        })}
      </div>
    </m.div>
  );

  const section = (t: string) => !rail
    ? <div className="px-2.5 pb-1.5 pt-4 text-[9.5px] font-bold uppercase tracking-[.16em] text-white/35">{t}</div>
    : <div className="mx-auto my-3 h-px w-6 bg-white/10" />;

  return (
    <>
      <div className={`relative flex h-16 shrink-0 items-center ${rail ? "justify-center px-2" : "px-4"}`}>
        <BrandLogo collapsed={rail} size={rail ? 30 : 32} tagline="NAVTTC Programme Analytics" />
      </div>

      <nav className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-2.5 pb-3 [scrollbar-width:none]" aria-label="Main">
        {section("Workspace")}
        <Link href={withQs("/")} title={rail ? "All Programmes" : undefined} aria-current={scope.mode === "portfolio" && current === "/" ? "page" : undefined}
          className={`group relative flex items-center gap-2.5 rounded-xl px-2 py-2 text-[13px] transition-colors ${rail ? "justify-center" : ""} ${
            scope.mode === "portfolio" ? "text-white" : "text-white/70 hover:bg-white/[.06] hover:text-white"}`}>
          {scope.mode === "portfolio" && <span aria-hidden className="bg-accent-grad absolute inset-0 rounded-xl opacity-90 shadow-[0_8px_24px_-8px_var(--brand-500)]" />}
          <Globe2 size={16} className="relative shrink-0" />
          {!rail && (
            <>
              <span className="relative flex-1 font-semibold">All Programmes</span>
              <span className="num relative rounded-md bg-black/25 px-1.5 text-[10px]">{data.programs.length}</span>
            </>
          )}
        </Link>
        <AnimatePresence initial={false}>
          {scope.mode === "portfolio" && <div key="pf">{moduleLinks("", "portfolio", "#a5b4fc")}</div>}
        </AnimatePresence>

        {families.map(([family, progs]) => (
          <div key={family}>
            {section(family)}
            {progs.map((p) => {
              const on = scope.program?.slug === p.slug;
              const st = progStats.get(p.slug)!;
              return (
                <div key={p.slug}>
                  <Link href={withQs(programBase(p.slug))} title={rail ? `${p.name} · mean ${st.mean?.toFixed(1) ?? "—"}` : undefined}
                    className={`group relative flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[12.5px] transition-colors ${rail ? "justify-center" : ""} ${
                      on ? "bg-white/[.08] font-semibold text-white ring-1 ring-inset ring-white/[.06]" : "text-white/65 hover:bg-white/[.05] hover:text-white"}`}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[8.5px] font-black text-white shadow-sm transition-transform duration-200 group-hover:scale-105"
                      style={{ background: `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 60%, black))` }}>
                      {p.badge}
                    </span>
                    {!rail && (
                      <>
                        <span className="min-w-0 flex-1 truncate">{p.short}</span>
                        <span className="num text-[10px] text-white/40">{st.n}</span>
                        <span className="num w-7 text-right text-[10.5px] font-bold" style={{ color: scoreColor(st.mean) }}>{st.mean?.toFixed(0) ?? "—"}</span>
                      </>
                    )}
                  </Link>
                  <AnimatePresence initial={false}>
                    {on && <div key={p.slug}>{moduleLinks(programBase(p.slug), "program", p.color)}</div>}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="relative shrink-0 space-y-px border-t border-white/[.07] p-2.5">
        <NavLink href={withQs("/settings")} label="Settings" rail={rail} on={isSettings} color="#a5b4fc">
          <Settings size={15} className="shrink-0" />
        </NavLink>
        <button type="button" onClick={onCollapse} aria-label={rail ? "Expand sidebar" : "Collapse sidebar"} title={`${rail ? "Expand" : "Collapse"} (Ctrl \\)`}
          className={`ctl hidden w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px] text-white/50 hover:bg-white/[.06] hover:text-white lg:flex ${rail ? "justify-center" : ""}`}>
          {rail ? <PanelLeftOpen size={15} /> : <><PanelLeftClose size={15} /> Collapse</>}
        </button>
      </div>
    </>
  );
}

/** Nav row with a shared sliding active pill (Motion layoutId). */
function NavLink({ href, label, rail, on, color, children }: { href: string; label: string; rail: boolean; on: boolean; color: string; children: React.ReactNode }) {
  return (
    <Link href={href} title={rail ? label : undefined} aria-current={on ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-2 py-[6px] text-[12.5px] transition-colors duration-150 ${rail ? "justify-center" : ""} ${
        on ? "font-semibold text-white" : "text-white/60 hover:text-white"}`}>
      {on && (
        <m.span layoutId="nav-active" aria-hidden className="absolute inset-0 rounded-lg bg-white/[.09] ring-1 ring-inset ring-white/[.07]"
          transition={{ type: "spring", stiffness: 520, damping: 42 }}>
          <span className="absolute -left-[3px] top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        </m.span>
      )}
      {!on && <span aria-hidden className="absolute inset-0 rounded-lg bg-white/0 transition-colors group-hover:bg-white/[.05]" />}
      <span className="relative flex items-center">{children}</span>
      {!rail && <span className="relative min-w-0 flex-1 truncate">{label}</span>}
      {rail && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-[#151e2e] px-2 py-1 text-xs text-white opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:opacity-100">{label}</span>
      )}
    </Link>
  );
}

/* ------------------------------------------------------------------ header bits */

function ThemeButton() {
  const { dark, toggle } = useTheme();
  return (
    <IconButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle} className="overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <m.span key={dark ? "sun" : "moon"} initial={{ y: 12, rotate: -40, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: -12, rotate: 40, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="grid place-items-center">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </m.span>
      </AnimatePresence>
    </IconButton>
  );
}

/** Live status: freshness of the dataset and each source workbook. */
function DataStatus() {
  const { data, scope } = useDash();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const span = (() => {
    const ds = scope.programs.flatMap((p) => [p.period?.from, p.period?.to, p.assessmentDate]).filter(Boolean).sort() as string[];
    return ds.length ? `${fmtMonth(ds[0])} – ${fmtMonth(ds[ds.length - 1])}` : "Undated";
  })();
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="ctl hidden h-8 items-center gap-2 rounded-lg px-2.5 text-[11px] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] xl:flex">
        <span className="live-dot text-emerald-500" aria-hidden />
        <span className="num">{span}</span>
      </button>
      <Popover open={open} anchor={ref} onClose={close} width={320} placement="bottom-end" label="Data sources">
        <div className="border-b border-[var(--border)] px-3.5 py-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold"><span className="live-dot text-emerald-500" /> All sources loaded</div>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Generated {fmtDate(data.raw.meta.generatedAt.slice(0, 10))} · {data.raw.meta.rowCount.toLocaleString()} records</p>
        </div>
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {data.programs.map((p) => (
            <li key={p.slug} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.short}</span>
                <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{p.sourceFile}</span>
              </span>
              <span className="num text-right text-[10.5px] text-[var(--text-muted)]">{p.rowCount}<span className="block">{p.period ? fmtMonth(p.period.to) : p.assessmentDate ? fmtMonth(p.assessmentDate) : "undated"}</span></span>
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--border)] p-1.5">
          <Link href="/data-quality" onClick={close} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
            Validation report <ChevronRight size={13} />
          </Link>
        </div>
      </Popover>
    </>
  );
}

