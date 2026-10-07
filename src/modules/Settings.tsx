"use client";
import { useState } from "react";
import { Sun, Moon, Monitor, Palette, Gauge, Rocket, HardDrive, Keyboard, RotateCcw, Check } from "lucide-react";
import { usePrefs, ACCENTS, type ThemePref, type Density, type MotionPref } from "@/components/providers/ThemeProvider";
import { useDash } from "@/components/providers/FilterProvider";
import { Card, Seg, Toggle, Button, Kbd } from "@/components/ui";

type Tab = "appearance" | "behaviour" | "data" | "shortcuts";

/**
 * Preferences. All panels share one grid cell, so switching tabs never
 * changes the page height (no layout shift) — inactive panels are hidden
 * with visibility, and the active one fades in.
 */
export function SettingsModule() {
  const [tab, setTab] = useState<Tab>("appearance");
  const { prefs, set, reset } = usePrefs();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="t-eyebrow text-brand-600">Preferences</div>
          <h1 className="t-title mt-1">Settings</h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">Saved in this browser only. Nothing here changes the data or other people&apos;s view.</p>
        </div>
        <Button size="sm" onClick={reset}><RotateCcw size={13} /> Restore defaults</Button>
      </div>

      <div className="mb-4 overflow-x-auto">
        <Seg size="md" value={tab} onChange={setTab} label="Settings section" options={[
          { value: "appearance", label: "Appearance" },
          { value: "behaviour", label: "Motion & charts" },
          { value: "data", label: "Start-up & data" },
          { value: "shortcuts", label: "Shortcuts" },
        ]} />
      </div>

      <div className="grid">
        <Panel active={tab === "appearance"}>
          <Section icon={Sun} title="Theme" hint="System follows your operating system and switches automatically.">
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
              {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as [ThemePref, string, typeof Sun][]).map(([v, l, I]) => (
                <ThemeCard key={v} value={v} label={l} icon={I} on={prefs.theme === v} onClick={() => set({ theme: v })} />
              ))}
            </div>
          </Section>
          <Section icon={Palette} title="Accent" hint="Buttons, active states, focus rings and highlights. Programme colours are fixed.">
            <div role="radiogroup" aria-label="Accent colour" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ACCENTS.map((a) => {
                const on = prefs.accent === a.value;
                return (
                  <button key={a.value} type="button" role="radio" aria-checked={on} onClick={() => set({ accent: a.value })}
                    className={`ctl flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-xs font-medium ${on ? "border-transparent ring-2 ring-brand-500" : "border-[var(--border)] hover:border-[var(--border-strong)]"}`}>
                    <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${a.swatch[0]}, ${a.swatch[1]})` }}>
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                    {a.label}
                  </button>
                );
              })}
            </div>
          </Section>
          <Section icon={Gauge} title="Density" hint="Spacing between cards and inside them. Compact fits more on a laptop screen.">
            <Seg size="md" value={prefs.density} onChange={(v: Density) => set({ density: v })} label="Density" options={[
              { value: "compact", label: "Compact" }, { value: "default", label: "Default" }, { value: "comfortable", label: "Comfortable" },
            ]} />
          </Section>
        </Panel>

        <Panel active={tab === "behaviour"}>
          <Section icon={Rocket} title="Motion" hint="Reduced removes page transitions, count-ups and chart animation. System follows the OS accessibility setting.">
            <Seg size="md" value={prefs.motion} onChange={(v: MotionPref) => set({ motion: v })} label="Motion" options={[
              { value: "system", label: "System" }, { value: "full", label: "Full" }, { value: "reduced", label: "Reduced" },
            ]} />
          </Section>
          <Section icon={Gauge} title="Charts">
            <Toggle checked={prefs.chartLabels} onChange={(v) => set({ chartLabels: v })} label="Show values on bars and lines"
              description="Turn off for a cleaner look; values stay available in tooltips and in each chart's data table." />
          </Section>
        </Panel>

        <Panel active={tab === "data"}>
          <Section icon={Rocket} title="Start-up view" hint="Where the dashboard opens when you start at the home page. Links with a programme or filters in them always open as shared.">
            <LandingPicker />
          </Section>
          <Section icon={HardDrive} title="Stored in this browser">
            <StorageRow label="Alert read state" hint="Which alerts you have marked as read." prefix="navttc-alerts-seen" />
            <StorageRow label="Table column layouts" hint="Hidden / shown columns in every data table." prefix="navttc-cols-" />
            <StorageRow label="Sidebar state" hint="Collapsed or expanded." prefix="navttc-sidebar" />
          </Section>
        </Panel>

        <Panel active={tab === "shortcuts"}>
          <Section icon={Keyboard} title="Keyboard shortcuts">
            <dl className="divide-y divide-[var(--border)]">
              {[
                [["Ctrl", "K"], "Search programmes, institutes, IDs, pages"],
                [["Ctrl", "\\"], "Collapse or expand the sidebar"],
                [["↑", "↓", "↵"], "Move through and open search results"],
                [["←", "→"], "Switch options in any segmented control"],
                [["Shift", "click"], "Add an institute to the comparison (crosshair buttons)"],
                [["Esc"], "Close any menu, drawer or dialog"],
              ].map(([keys, what]) => (
                <div key={what as string} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
                  <dt className="text-[var(--text-muted)]">{what as string}</dt>
                  <dd className="flex shrink-0 gap-1">{(keys as string[]).map((k) => <Kbd key={k}>{k}</Kbd>)}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div aria-hidden={!active} inert={!active}
      className={`space-y-3 transition-[opacity,translate] duration-300 ease-[var(--ease-out-expo)] [grid-area:1/1] ${active ? "visible translate-y-0 opacity-100" : "invisible translate-y-1 opacity-0"}`}>
      {children}
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }: { icon: typeof Sun; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--brand-500)_12%,transparent)] text-brand-600"><Icon size={15} /></span>
        <div>
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function ThemeCard({ value, label, icon: Icon, on, onClick }: { value: ThemePref; label: string; icon: typeof Sun; on: boolean; onClick: () => void }) {
  const pane = (dark: boolean) => (
    <div className={`flex h-full ${dark ? "bg-[#090d16]" : "bg-[#f4f6fa]"}`}>
      <div className="m-1 w-5 rounded-md bg-[#0b1120]" />
      <div className="flex-1 space-y-1 p-1.5">
        <div className={`h-2 w-3/5 rounded ${dark ? "bg-[#1f2937]" : "bg-white"}`} />
        <div className="grid grid-cols-2 gap-1">
          <div className={`h-6 rounded ${dark ? "bg-[#111827]" : "bg-white"}`} /><div className={`h-6 rounded ${dark ? "bg-[#111827]" : "bg-white"}`} />
        </div>
        <div className="bg-accent-grad h-1.5 w-2/5 rounded" />
      </div>
    </div>
  );
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={`ctl overflow-hidden rounded-xl border text-left ${on ? "border-transparent ring-2 ring-brand-500" : "border-[var(--border)] hover:border-[var(--border-strong)]"}`}>
      <div className="h-20 overflow-hidden border-b border-[var(--border)]">
        {value === "system" ? <div className="grid h-full grid-cols-2">{pane(false)}{pane(true)}</div> : pane(value === "dark")}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium"><Icon size={13} /> {label}{on && <Check size={13} className="ml-auto text-brand-600" />}</div>
    </button>
  );
}

function LandingPicker() {
  const { data } = useDash();
  const { prefs, set } = usePrefs();
  const opts = [{ value: "portfolio", label: "All Programmes", color: "var(--brand-500)", sub: "Combined portfolio" },
    ...data.programs.map((p) => ({ value: p.slug, label: p.name, color: p.color, sub: `${p.family} · ${p.instituteCount} institutes` }))];
  return (
    <div role="radiogroup" aria-label="Start-up view" className="grid gap-2 sm:grid-cols-2">
      {opts.map((o) => {
        const on = prefs.landing === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => set({ landing: o.value })}
            className={`ctl flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${on ? "border-transparent bg-[color-mix(in_oklab,var(--brand-500)_7%,var(--surface))] ring-2 ring-brand-500" : "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"}`}>
            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: o.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold">{o.label}</span>
              <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{o.sub}</span>
            </span>
            {on && <Check size={15} className="text-brand-600" />}
          </button>
        );
      })}
    </div>
  );
}

function StorageRow({ label, hint, prefix }: { label: string; hint: string; prefix: string }) {
  const [done, setDone] = useState(false);
  const clear = () => {
    try {
      for (const k of Object.keys(window.localStorage)) if (k.startsWith(prefix)) window.localStorage.removeItem(k);
    } catch { /* ignore */ }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[13px] font-medium">{label}</div>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>
      </div>
      <Button size="sm" variant={done ? "subtle" : "default"} onClick={clear}>{done ? <><Check size={13} /> Cleared</> : "Clear"}</Button>
    </div>
  );
}
