"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, MapPinned, Wrench, Gauge, Table2,
  ShieldCheck, BookOpen, Menu, Moon, Sun, PanelLeftClose, PanelLeft, FileStack,
} from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";
import { BrandLogo } from "./BrandLogo";
import { meta } from "@/lib/dataset";

/**
 * Navigation. Only modules the data actually supports are present — there is
 * no Demographics or Trends route because the workbook has neither a gender
 * field nor a date column (see docs/AUDIT_FINDINGS.md §5).
 */
const NAV = [
  { href: "/",             label: "Overview",     icon: LayoutDashboard, hint: "National picture" },
  { href: "/institutions", label: "Institutions", icon: Building2,       hint: "184 TPIs ranked" },
  { href: "/geography",    label: "Geography",    icon: MapPinned,       hint: "Regions & districts" },
  { href: "/trades",       label: "Trades",       icon: Wrench,          hint: "70 trades" },
  { href: "/performance",  label: "Performance",  icon: Gauge,           hint: "Score components" },
  { href: "/explorer",     label: "Data Explorer",icon: Table2,          hint: "All 698 records" },
  { href: "/reports",      label: "Bulk Reports", icon: FileStack,       hint: "One page per institute" },
  { href: "/data-quality", label: "Data Quality", icon: ShieldCheck,     hint: "Validation report" },
  { href: "/methodology",  label: "Methodology",  icon: BookOpen,        hint: "How numbers are made" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { dark, toggle } = useTheme();

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const current = NAV.find((n) => active(n.href));

  const navList = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon, hint }) => {
        const on = active(href);
        return (
          <Link key={href} href={href} title={collapsed ? label : undefined}
            aria-current={on ? "page" : undefined}
            className={`group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
              on ? "bg-brand-600 text-white font-semibold" : "text-ink-300 hover:bg-white/8 hover:text-white"}`}>
            <Icon size={16} strokeWidth={on ? 2.4 : 2} className="shrink-0" />
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate leading-tight">{label}</span>
                {!on && <span className="block truncate text-[10px] leading-tight text-ink-500">{hint}</span>}
              </span>
            )}
            {collapsed && (
              <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                {label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  /*
   * Application brand. The two official crests are not used here — they are
   * reserved for printed reports, which carry the Government of Pakistan /
   * NAVTTC letterhead (components/reports/Letterhead.tsx).
   */
  const brand = (
    <div className={`border-b border-white/10 px-3 py-3 ${collapsed ? "flex justify-center" : ""}`}>
      <BrandLogo collapsed={collapsed} size={collapsed ? 30 : 34} tagline={meta.program} />
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside data-sidebar
        className={`no-print sticky top-0 hidden h-screen shrink-0 flex-col bg-ink-950 transition-[width] duration-200 lg:flex ${collapsed ? "w-16" : "w-60"}`}>
        {brand}
        {navList}
        <div className="border-t border-white/10 p-2">
          <button onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink-400 hover:bg-white/8 hover:text-white">
            {collapsed ? <PanelLeft size={16} /> : <><PanelLeftClose size={16} /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-black/55" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-ink-950">
            {brand}
            {navList}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-appheader
          className="no-print sticky top-0 z-40 flex h-13 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)]/92 px-4 py-2.5 backdrop-blur-md sm:px-6">
          <button onClick={() => setMobileOpen(true)} aria-label="Open navigation"
            className="rounded-md p-1.5 hover:bg-[var(--surface-3)] lg:hidden">
            <Menu size={17} />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="hidden sm:inline">NAVTTC</span>
            <span className="hidden sm:inline opacity-40">/</span>
            <span className="truncate font-semibold text-[var(--text)]">{current?.label ?? "Dashboard"}</span>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="num hidden rounded-md bg-[var(--surface-3)] px-2 py-1 text-[10px] text-[var(--text-muted)] md:inline">
              Assessment {meta.assessmentDate}
            </span>
            <button onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded-md p-1.5 hover:bg-[var(--surface-3)]">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <main data-printarea className="min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-5">{children}</main>

        <footer className="no-print border-t border-[var(--border)] px-4 py-3 text-[11px] text-[var(--text-muted)] sm:px-6">
          Source: {meta.sourceFile} · {meta.rowCount.toLocaleString()} assessment records across {meta.instituteCount} institutes ·
          Data generated {meta.generatedAt.slice(0, 10)}
        </footer>
      </div>
    </div>
  );
}
