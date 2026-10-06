import {
  LayoutDashboard, Building2, MapPinned, Wrench, Gauge, Table2, ShieldCheck, BookOpen, FileStack,
  Layers, GitCompareArrows, type LucideIcon,
} from "lucide-react";

export interface NavItem { path: string; label: string; icon: LucideIcon; hint: string; portfolioOnly?: boolean }

/**
 * One module list serves both scopes. Portfolio-only modules (programme
 * comparison, institute journeys) only make sense across programmes.
 */
export const NAV: NavItem[] = [
  { path: "/",             label: "Overview",          icon: LayoutDashboard,  hint: "Headline picture" },
  { path: "/programmes",   label: "Compare Programmes", icon: Layers,          hint: "Side by side", portfolioOnly: true },
  { path: "/institutions", label: "Institutions",      icon: Building2,        hint: "Ranked & flagged" },
  { path: "/journey",      label: "Institute Journeys", icon: GitCompareArrows, hint: "Across batches", portfolioOnly: true },
  { path: "/geography",    label: "Geography",         icon: MapPinned,        hint: "Regions & districts" },
  { path: "/trades",       label: "Trades",            icon: Wrench,           hint: "Enrolment & results" },
  { path: "/performance",  label: "Performance",       icon: Gauge,            hint: "Rubric & drivers" },
  { path: "/explorer",     label: "Data Explorer",     icon: Table2,           hint: "Every record" },
  { path: "/reports",      label: "Bulk Reports",      icon: FileStack,        hint: "One page per institute" },
  { path: "/data-quality", label: "Data Quality",      icon: ShieldCheck,      hint: "Validation report" },
  { path: "/methodology",  label: "Methodology",       icon: BookOpen,         hint: "How numbers are made" },
];

export function navFor(mode: "portfolio" | "program") {
  return NAV.filter((n) => mode === "portfolio" || !n.portfolioOnly);
}

/** Which module is active, given the path inside the scope ("/" or "/trades" …). */
export function activeModule(rest: string): NavItem | undefined {
  if (rest === "/" || rest === "") return NAV[0];
  return NAV.find((n) => n.path !== "/" && rest.startsWith(n.path));
}
