"use client";
import { useEffect, useState, createContext, useContext } from "react";

const ThemeCtx = createContext<{ dark: boolean; toggle: () => void }>({ dark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("navttc-theme") : null;
    const prefers = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    setDark(saved ? saved === "dark" : prefers);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { window.localStorage.setItem("navttc-theme", dark ? "dark" : "light"); } catch { /* private mode */ }
  }, [dark]);

  return <ThemeCtx.Provider value={{ dark, toggle: () => setDark((v) => !v) }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
