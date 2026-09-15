"use client";
import { useId, useState, useCallback } from "react";

/**
 * VTT Global — animated dashboard brand mark.
 *
 * Purely SVG and CSS: no animation library, no image asset, no extra bytes
 * beyond this file. It scales losslessly, adapts to dark mode through the
 * theme tokens, and honours `prefers-reduced-motion` by dropping straight to
 * the finished state rather than animating.
 *
 * The mark is a hexagonal shield holding an ascending bar series with a V
 * chevron cut through it — vocational training reading as measured growth.
 * Idle: the outer ring rotates slowly and a locator dot orbits it. Hover: the
 * bars extend, the shield lifts, a sheen sweeps the wordmark. Click: the whole
 * mark replays its draw-on animation and emits a ripple.
 *
 * This is the application's own brand. It is deliberately NOT used on printed
 * reports, which carry the official Government of Pakistan / NAVTTC
 * letterhead — see components/reports/Letterhead.tsx.
 */
export function BrandLogo({
  collapsed = false,
  size = 34,
  tagline = "Analytics Platform",
}: {
  collapsed?: boolean;
  size?: number;
  /** Small line under the wordmark. Pass an empty string to hide it. */
  tagline?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [replay, setReplay] = useState(0);

  // Re-keying the <g> restarts every CSS animation inside it.
  const onActivate = useCallback(() => setReplay((n) => n + 1), []);

  const g = (n: string) => `${uid}-${n}`;

  return (
    <div
      className={`vttg vttg-${uid}`}
      data-collapsed={collapsed ? "true" : "false"}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      role="img"
      aria-label="VTT Global Analytics Platform"
      tabIndex={0}
    >
      <span className="vttg-mark" style={{ width: size, height: size }}>
        <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
          <defs>
            <linearGradient id={g("shield")} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="55%" stopColor="#1d4ed8" />
              <stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
            <linearGradient id={g("bar")} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#a5f3e4" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <linearGradient id={g("sheen")} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="50%" stopColor="#fff" stopOpacity=".55" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <filter id={g("glow")} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id={g("clip")}>
              <path d="M24 3.2 41.4 13v19.4L24 42.2 6.6 32.4V13z" />
            </clipPath>
          </defs>

          {/* orbit ring — always turning, faster on hover */}
          <g className="vttg-ring">
            <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="1"
              strokeOpacity=".28" strokeDasharray="2.5 5.5" strokeLinecap="round" />
          </g>
          <g className="vttg-orbit">
            <circle cx="24" cy="2" r="1.9" fill="#2dd4bf" filter={`url(#${g("glow")})`} />
          </g>

          <g key={replay} className="vttg-body">
            {/* shield */}
            <path className="vttg-shield" d="M24 3.2 41.4 13v19.4L24 42.2 6.6 32.4V13z"
              fill={`url(#${g("shield")})`} />
            <path d="M24 3.2 41.4 13v19.4L24 42.2 6.6 32.4V13z" fill="none"
              stroke="#fff" strokeOpacity=".22" strokeWidth="1" />

            {/* ascending series */}
            <g clipPath={`url(#${g("clip")})`}>
              <rect className="vttg-bar vttg-b1" x="14.4" y="26" width="4.4" height="8" rx="1.4" fill={`url(#${g("bar")})`} opacity=".92" />
              <rect className="vttg-bar vttg-b2" x="21.8" y="21" width="4.4" height="13" rx="1.4" fill={`url(#${g("bar")})`} opacity=".96" />
              <rect className="vttg-bar vttg-b3" x="29.2" y="16" width="4.4" height="18" rx="1.4" fill={`url(#${g("bar")})`} />
              {/* sheen sweep across the shield face */}
              <rect className="vttg-sweep" x="-24" y="0" width="18" height="48" fill={`url(#${g("sheen")})`} />
            </g>

            {/* V chevron, drawn on */}
            <path className="vttg-chev" d="M15.5 14.2 24 31.4l8.5-17.2" fill="none"
              stroke="#fff" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round"
              pathLength={100} />
          </g>

          {/* click ripple */}
          <circle key={`r${replay}`} className="vttg-ripple" cx="24" cy="24" r="20"
            fill="none" stroke="#2dd4bf" strokeWidth="1.6" />
        </svg>
      </span>

      {!collapsed && (
        <span className="vttg-text">
          <span className="vttg-word">
            <b>VTT</b>
            <i>Global</i>
          </span>
          {tagline && <span className="vttg-tag">{tagline}</span>}
        </span>
      )}

      <style>{`
        .vttg-${uid} {
          display: flex; align-items: center; gap: 9px;
          cursor: pointer; user-select: none; outline: none;
          -webkit-tap-highlight-color: transparent;
        }
        .vttg-${uid} .vttg-mark {
          display: block; position: relative; flex-shrink: 0;
          color: #7dd3fc;
          transition: transform .38s cubic-bezier(.22,.9,.28,1), filter .38s ease;
          transform-origin: 50% 50%;
        }
        .vttg-${uid}:hover .vttg-mark,
        .vttg-${uid}:focus-visible .vttg-mark {
          transform: scale(1.07) rotate(-3deg);
          filter: drop-shadow(0 3px 10px rgba(45,212,191,.45));
        }
        .vttg-${uid}:active .vttg-mark { transform: scale(.96); }
        .vttg-${uid}:focus-visible { box-shadow: 0 0 0 2px #2dd4bf55; border-radius: 10px; }

        .vttg-${uid} svg { display: block; overflow: visible; }

        /* --- idle motion --- */
        .vttg-${uid} .vttg-ring   { transform-origin: 24px 24px; animation: vttg-spin-${uid} 22s linear infinite; }
        .vttg-${uid} .vttg-orbit  { transform-origin: 24px 24px; animation: vttg-spin-${uid} 7s linear infinite; }
        .vttg-${uid}:hover .vttg-ring  { animation-duration: 7s; }
        .vttg-${uid}:hover .vttg-orbit { animation-duration: 2.6s; }
        @keyframes vttg-spin-${uid} { to { transform: rotate(360deg); } }

        .vttg-${uid} .vttg-shield {
          animation: vttg-pop-${uid} .55s cubic-bezier(.2,.9,.3,1.25) both;
          transform-origin: 24px 24px;
        }
        @keyframes vttg-pop-${uid} {
          from { transform: scale(.55) rotate(-16deg); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }

        /* --- bars rise, staggered, and extend on hover --- */
        .vttg-${uid} .vttg-bar {
          transform-origin: 50% 34px;
          animation: vttg-rise-${uid} .62s cubic-bezier(.2,.85,.3,1) both;
          transition: transform .34s cubic-bezier(.2,.85,.3,1);
        }
        .vttg-${uid} .vttg-b1 { animation-delay: .16s; }
        .vttg-${uid} .vttg-b2 { animation-delay: .26s; }
        .vttg-${uid} .vttg-b3 { animation-delay: .36s; }
        @keyframes vttg-rise-${uid} { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .vttg-${uid}:hover .vttg-b1 { transform: scaleY(1.34); }
        .vttg-${uid}:hover .vttg-b2 { transform: scaleY(1.22); }
        .vttg-${uid}:hover .vttg-b3 { transform: scaleY(1.12); }

        /* --- chevron draws itself --- */
        .vttg-${uid} .vttg-chev {
          stroke-dasharray: 100;
          animation: vttg-draw-${uid} .78s cubic-bezier(.5,0,.2,1) .22s both;
        }
        @keyframes vttg-draw-${uid} {
          from { stroke-dashoffset: 100; opacity: .3; }
          to   { stroke-dashoffset: 0;   opacity: 1; }
        }

        /* --- sheen sweeps on hover --- */
        .vttg-${uid} .vttg-sweep { opacity: 0; }
        .vttg-${uid}:hover .vttg-sweep {
          opacity: 1;
          animation: vttg-sweep-${uid} .85s ease-out;
        }
        @keyframes vttg-sweep-${uid} {
          from { transform: translateX(0); }
          to   { transform: translateX(78px); }
        }

        /* --- click ripple --- */
        .vttg-${uid} .vttg-ripple {
          opacity: 0;
          transform-origin: 24px 24px;
          animation: vttg-ripple-${uid} .72s ease-out both;
        }
        @keyframes vttg-ripple-${uid} {
          from { opacity: .8; transform: scale(.62); }
          to   { opacity: 0;  transform: scale(1.45); }
        }

        /* --- wordmark --- */
        .vttg-${uid} .vttg-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.1; }
        .vttg-${uid} .vttg-word {
          position: relative; display: inline-flex; align-items: baseline; gap: 4px;
          font-size: 15px; letter-spacing: -.015em; white-space: nowrap;
        }
        .vttg-${uid} .vttg-word b {
          font-weight: 800; font-style: normal;
          background: linear-gradient(100deg, #ffffff 0%, #bfdbfe 45%, #5eead4 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .vttg-${uid} .vttg-word i {
          font-weight: 400; font-style: normal; font-size: 14px;
          color: #94a3b8; transition: color .3s ease, letter-spacing .3s ease;
        }
        .vttg-${uid}:hover .vttg-word i { color: #5eead4; letter-spacing: .04em; }
        .vttg-${uid} .vttg-word::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.6) 50%, transparent 70%);
          background-size: 220% 100%; background-position: 200% 0;
          -webkit-background-clip: text; background-clip: text; color: transparent;
          pointer-events: none;
        }
        .vttg-${uid}:hover .vttg-word::after { animation: vttg-shine-${uid} .95s ease-out; }
        @keyframes vttg-shine-${uid} { to { background-position: -120% 0; } }

        .vttg-${uid} .vttg-tag {
          font-size: 9px; letter-spacing: .13em; text-transform: uppercase;
          color: #64748b; white-space: nowrap;
          transition: color .3s ease;
        }
        .vttg-${uid}:hover .vttg-tag { color: #94a3b8; }

        @media (prefers-reduced-motion: reduce) {
          .vttg-${uid} *,
          .vttg-${uid} *::after {
            animation: none !important;
            transition: none !important;
          }
          .vttg-${uid} .vttg-mark { transform: none !important; }
        }
      `}</style>
    </div>
  );
}
