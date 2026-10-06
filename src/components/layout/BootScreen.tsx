"use client";
import { AlertTriangle } from "lucide-react";

/** Shown while the portfolio file loads (~1 s on first visit, instant after). */
export function BootScreen({ error }: { error: string | null }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--surface-2)] p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-emerald-500 shadow-lg">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 18V12M9 18V8M14 18V10M19 18V5" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
        {error ? (
          <>
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-red-600"><AlertTriangle size={16} /> Could not load the dataset</div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{error}. Run <code>npm run data</code> to generate <code>public/data/portfolio.json</code>, then reload.</p>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold">NAVTTC Programme Analytics</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Loading every programme&apos;s assessment data…</p>
            <div className="mx-auto mt-5 h-1 w-48 overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div className="boot-bar h-full w-1/3 rounded-full bg-brand-500" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
