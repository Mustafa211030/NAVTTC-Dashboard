"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m, type TargetAndTransition } from "motion/react";

type Variant = "center" | "top" | "right" | "left" | "full";

const PANEL: Record<Variant, { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition; wrap: string }> = {
  center: { initial: { opacity: 0, scale: 0.97, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, y: 4 }, wrap: "items-center justify-center p-4" },
  top:    { initial: { opacity: 0, scale: 0.98, y: -10 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, y: -6 }, wrap: "items-start justify-center p-4 pt-[11vh]" },
  right:  { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" }, wrap: "justify-end" },
  left:   { initial: { x: "-100%" }, animate: { x: 0 }, exit: { x: "-100%" }, wrap: "justify-start" },
  full:   { initial: { opacity: 0, scale: 0.985 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.99 }, wrap: "items-stretch justify-stretch" },
};

/**
 * Modal / drawer layer with enter and exit animation (AnimatePresence),
 * Escape to close, click-outside to close, scroll lock, and focus moved in
 * on open and returned to the trigger on close.
 */
export function Overlay({ open, onClose, variant = "center", label, children, className = "" }: {
  open: boolean; onClose: () => void; variant?: Variant; label: string; children: React.ReactNode; className?: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => setHost(document.body), []);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close.current(); }
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", k);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(() => {
      if (!panel.current?.contains(document.activeElement))
        (panel.current?.querySelector<HTMLElement>("[autofocus],input,button") ?? panel.current)?.focus();
    }, 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", k);
      document.documentElement.style.overflow = prev;
      returnTo.current?.focus?.();
    };
  }, [open]);

  if (!host) return null;
  const v = PANEL[variant];
  const side = variant === "left" || variant === "right";
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={`no-print fixed inset-0 z-[100] flex ${v.wrap}`}>
          <m.div aria-hidden className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[3px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={() => close.current()} />
          <m.div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
            initial={v.initial} animate={v.animate} exit={v.exit}
            transition={side ? { type: "spring", stiffness: 420, damping: 42 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={`relative outline-none ${className}`}>
            {children}
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    host,
  );
}
