"use client";
import { useEffect, useState, createContext, useContext, useCallback, useMemo } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

/* ------------------------------------------------------------------ *
 * Preferences: theme, accent, density, motion and landing scope.
 *
 * Stored per browser (localStorage) — they are viewer conveniences, not
 * shared state. The same keys are read by PREFS_SCRIPT before first paint,
 * so a reload never flashes the wrong theme.
 * ------------------------------------------------------------------ */

export type ThemePref = "light" | "dark" | "system";
export type Density = "compact" | "default" | "comfortable";
export type MotionPref = "system" | "full" | "reduced";
export type Accent = "indigo" | "cyan" | "emerald" | "blue";

export interface Prefs {
  theme: ThemePref;
  density: Density;
  motion: MotionPref;
  accent: Accent;
  /** "portfolio" or a programme slug opened when the app starts at "/". */
  landing: string;
  /** Chart value labels on marks. */
  chartLabels: boolean;
}

export const DEFAULT_PREFS: Prefs = { theme: "system", density: "default", motion: "system", accent: "indigo", landing: "portfolio", chartLabels: true };
const KEY = "navttc-prefs";

export const ACCENTS: { value: Accent; label: string; swatch: [string, string] }[] = [
  { value: "indigo", label: "Indigo", swatch: ["#6366f1", "#06b6d4"] },
  { value: "cyan", label: "Cyan", swatch: ["#06b6d4", "#6366f1"] },
  { value: "emerald", label: "Emerald", swatch: ["#10b981", "#06b6d4"] },
  { value: "blue", label: "Blue", swatch: ["#3b82f6", "#8b5cf6"] },
];

/** Runs in <head> before paint. Kept tiny and dependency-free. */
export const PREFS_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}");var o=localStorage.getItem("navttc-theme");var t=p.theme||o||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);if(p.accent&&p.accent!=="indigo")e.dataset.accent=p.accent;if(p.density&&p.density!=="default")e.dataset.density=p.density;if(p.motion==="reduced")e.dataset.motion="reduced";}catch(_){}})();`;

function read(): Prefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    const legacy = window.localStorage.getItem("navttc-theme");
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return { ...DEFAULT_PREFS, ...(legacy && !p.theme ? { theme: legacy as ThemePref } : {}), ...p };
  } catch { return DEFAULT_PREFS; }
}

interface Ctx {
  prefs: Prefs;
  set: (p: Partial<Prefs>) => void;
  reset: () => void;
  /** Resolved theme. */
  dark: boolean;
  toggle: () => void;
  reducedMotion: boolean;
  /** true once stored preferences have been read */
  loaded: boolean;
}

const PrefsCtx = createContext<Ctx>({
  prefs: DEFAULT_PREFS, set: () => {}, reset: () => {}, dark: false, toggle: () => {}, reducedMotion: false, loaded: false,
});

// Only the features we use (animate, exit, layout/layoutId, drag-free) —
// loaded after first paint as its own chunk.
const loadFeatures = () => import("@/lib/motion-features").then((m) => m.default);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [systemDark, setSystemDark] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);
  // Until stored prefs are read, leave the DOM exactly as PREFS_SCRIPT set it.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPrefs(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSystemDark(mq.matches); setSystemReduced(rm.matches); setLoaded(true);
    const a = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    const b = (e: MediaQueryListEvent) => setSystemReduced(e.matches);
    mq.addEventListener("change", a); rm.addEventListener("change", b);
    return () => { mq.removeEventListener("change", a); rm.removeEventListener("change", b); };
  }, []);

  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);
  const reducedMotion = prefs.motion === "reduced" || (prefs.motion === "system" && systemReduced);

  useEffect(() => {
    if (!loaded) return;
    const el = document.documentElement;
    el.classList.toggle("dark", dark);
    if (prefs.accent === "indigo") delete el.dataset.accent; else el.dataset.accent = prefs.accent;
    if (prefs.density === "default") delete el.dataset.density; else el.dataset.density = prefs.density;
    if (prefs.motion === "reduced") el.dataset.motion = "reduced"; else delete el.dataset.motion;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#090d16" : "#f4f6fa");
  }, [loaded, dark, prefs.accent, prefs.density, prefs.motion]);

  const persist = (p: Prefs) => {
    try { window.localStorage.setItem(KEY, JSON.stringify(p)); window.localStorage.removeItem("navttc-theme"); } catch { /* private mode */ }
  };
  const set = useCallback((p: Partial<Prefs>) => setPrefs((prev) => { const next = { ...prev, ...p }; persist(next); return next; }), []);
  const reset = useCallback(() => { setPrefs(DEFAULT_PREFS); persist(DEFAULT_PREFS); }, []);

  // Theme switch through a view transition: one cross-fade instead of every
  // surface animating its colour separately.
  const toggle = useCallback(() => {
    const flip = () => set({ theme: dark ? "light" : "dark" });
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (!d.startViewTransition || reducedMotion) flip(); else d.startViewTransition(flip);
  }, [dark, set, reducedMotion]);

  const value = useMemo<Ctx>(() => ({ prefs, set, reset, dark, toggle, reducedMotion, loaded }), [prefs, set, reset, dark, toggle, reducedMotion, loaded]);

  return (
    <PrefsCtx.Provider value={value}>
      <LazyMotion features={loadFeatures} strict>
        <MotionConfig reducedMotion={reducedMotion ? "always" : "never"} transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.7 }}>
          {children}
        </MotionConfig>
      </LazyMotion>
    </PrefsCtx.Provider>
  );
}

export const usePrefs = () => useContext(PrefsCtx);
export const useTheme = () => {
  const { dark, toggle } = useContext(PrefsCtx);
  return { dark, toggle };
};
