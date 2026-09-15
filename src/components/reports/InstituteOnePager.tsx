"use client";
import { useMemo } from "react";
import type { AssessmentRow, Institute } from "@/types";
import { components, categories, meta } from "@/lib/dataset";
import { Letterhead } from "./Letterhead";
import { gradeOf, TIER_RUBRIC, fmtInt, fmtPct, fmtScore } from "@/config";

/**
 * One institute, one A4 sheet, complete record.
 *
 * Every trade row, every one of the 16 score components per trade, every
 * headcount, the category strength/weakness profile and the assessor's note —
 * all on a single printed page under the official government letterhead.
 *
 * This is not the web page shrunk down. In print the screen layout is
 * suppressed entirely (see `.screen-only` in globals.css) and this renders in
 * its place, laid out for paper.
 *
 * Worst case in the current dataset is 11 trades, which fits with room to
 * spare. Beyond roughly 14 the sheet flows to a second page rather than
 * clipping, so nothing is ever lost.
 */

/** Short column codes for the component matrix, in workbook order (S–AH). */
const CODES: Record<string, string> = {
  biometric: "BIO", attendance: "ATT", cctv: "CCTV", trainerPms: "TPMS",
  trainerDegree: "TDEG", trainerExp: "TEXP", tools: "TOOL", consumables: "CONS",
  portfolio: "PORT", tlmImpl: "TLMI", tlmProv: "TLMP", assessment: "ASMT",
  indLinkage: "LINK", jobFair: "FAIR", ojt: "OJT", studentFeedback: "FDBK",
};

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ""));

/** Fills chosen to stay distinguishable on a monochrome office printer. */
const FILL = { best: "#1a7f4b", mid: "#3d5a80", worst: "#a32020", track: "#dde3ea" };

export function InstituteOnePager({
  inst, rows, pageNumber = 1, pageCount = 1,
}: {
  inst: Institute;
  rows: AssessmentRow[];
  /**
   * Page numbering is rendered by the report, not by the browser.
   *
   * `@page { margin: 0 }` in globals.css suppresses Chrome's injected header
   * and footer — which is the only way to remove the print date, the document
   * title and the page URL — and that removes its page counter along with
   * them. Since every institute occupies exactly one sheet, the position in
   * the batch is the page number, so we can print it accurately ourselves.
   */
  pageNumber?: number;
  pageCount?: number;
}) {
  const grade = gradeOf(inst);
  const sum = (k: keyof AssessmentRow) => rows.reduce((a, r) => a + ((r[k] as number) ?? 0), 0);

  /** Categories as a percentage of their own maximum, so unequal weights compare fairly. */
  const catRanked = useMemo(
    () => categories
      .map((c) => {
        const v = inst.categoryScores[c.key] ?? 0;
        return { ...c, value: v, pct: c.max > 0 ? (v / c.max) * 100 : 0 };
      })
      .sort((a, b) => b.pct - a.pct),
    [inst]);

  const compRanked = useMemo(
    () => components
      .map((c) => {
        const v = inst.components[c.key] ?? 0;
        return { ...c, value: v, pct: c.max > 0 ? (v / c.max) * 100 : 0 };
      })
      .sort((a, b) => b.pct - a.pct),
    [inst]);

  const strongest = catRanked[0];
  const weakest = catRanked[catRanked.length - 1];

  const stats: [string, string][] = [
    ["Approved capacity", fmtInt(inst.approvedCapacity)],
    ["Registered", fmtInt(inst.biometricRegistered)],
    ["Present", fmtInt(inst.present)],
    ["Absent", fmtInt(inst.absent)],
    ["Dropped out", fmtInt(inst.droppedOut)],
    ["CNIC verified", fmtInt(inst.cnicVerified)],
    ["Attendance %", fmtPct(inst.attendanceRate)],
    ["Utilization %", fmtPct(inst.utilizationRate)],
  ];

  /* Category chart drawn as SVG so it stays crisp at any print resolution. */
  const ROW = 15, PAD = 4, LABEL = 96, BAR_X = 100, BAR_W = 168;
  const chartH = catRanked.length * ROW + PAD;

  return (
    <div className="onepager">
      <Letterhead variant="print" />

      {/* ---- institute identity ---- */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "8pt", borderTop: "1.4pt solid #000", borderBottom: "0.6pt solid #000", padding: "3pt 0", marginTop: "3pt" }}>
        <div style={{ maxWidth: "73%" }}>
          <div style={{ fontSize: "5.8pt", textTransform: "uppercase", letterSpacing: ".08em", color: "#444" }}>
            Training Provider Institute — Verification Report
          </div>
          <div style={{ fontSize: "11.5pt", fontWeight: 700, lineHeight: 1.12, marginTop: "1.5pt" }}>{inst.instituteName}</div>
          <div style={{ fontSize: "6.6pt", color: "#333", marginTop: "1pt" }}>
            Institute ID {inst.instituteId} · {inst.district}, {inst.region} · {inst.package ?? "—"} ·{" "}
            {inst.assessments} trade{inst.assessments === 1 ? "" : "s"} assessed · {meta.program}
          </div>
        </div>
        <div className="band" style={{ textAlign: "right", minWidth: "104pt" }}>
          <div style={{ fontSize: "5.8pt", textTransform: "uppercase", letterSpacing: ".04em" }}>Overall score</div>
          <div style={{ fontSize: "19pt", fontWeight: 800, lineHeight: 1 }}>{fmtScore(inst.score, 1)}</div>
          <div style={{ fontSize: "7pt", fontWeight: 700, marginTop: "1pt" }}>{grade}</div>
          <div style={{ fontSize: "5.4pt", color: "#444" }}>{TIER_RUBRIC[grade] ?? ""}</div>
          <div style={{ fontSize: "5.8pt", color: "#444" }}>Rank {inst.rank} of {meta.instituteCount}</div>
        </div>
      </div>

      {inst.assessorNote && (
        <div className="note" style={{ marginTop: "4pt" }}>
          <span style={{ fontWeight: 700, fontSize: "6.2pt", textTransform: "uppercase", letterSpacing: ".04em" }}>Assessor note </span>
          <span style={{ fontSize: "7pt" }}>{inst.assessorNote}</span>
        </div>
      )}

      {/* ---- headcounts ---- */}
      <h2>Enrolment and attendance</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "2.5pt" }}>
        {stats.map(([k, v]) => (
          <div className="stat" key={k}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
          </div>
        ))}
      </div>

      {/* ---- category profile: the strength / weakness picture ---- */}
      <h2>Category profile — achievement against each category maximum</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: "6pt", alignItems: "start" }}>
        <svg viewBox={`0 0 ${BAR_X + BAR_W + 28} ${chartH}`} style={{ width: "100%", height: "auto" }} role="img"
          aria-label={`Category achievement for ${inst.instituteName}`}>
          {catRanked.map((c, i) => {
            const y = i * ROW;
            const w = Math.max((c.pct / 100) * BAR_W, 0.6);
            const fill = i === 0 ? FILL.best : i === catRanked.length - 1 ? FILL.worst : FILL.mid;
            return (
              <g key={c.key}>
                <text x={LABEL} y={y + 8.4} textAnchor="end" fontSize="5.6" fill="#111">{c.label}</text>
                <rect x={BAR_X} y={y + 2.4} width={BAR_W} height={7.6} fill={FILL.track} />
                <rect x={BAR_X} y={y + 2.4} width={w} height={7.6} fill={fill} />
                <text x={BAR_X + BAR_W + 3} y={y + 8.4} fontSize="5.6" fontWeight="700" fill="#111">{c.pct.toFixed(0)}%</text>
                {c.pct > 22 && (
                  <text x={BAR_X + 2.5} y={y + 8.3} fontSize="4.9" fill="#fff" fontWeight="700">
                    {c.value.toFixed(1)} / {c.max}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div style={{ display: "grid", gap: "3pt" }}>
          <div className="band" style={{ borderLeftColor: FILL.best }}>
            <div style={{ fontSize: "5.6pt", textTransform: "uppercase", letterSpacing: ".04em", color: "#444" }}>Strongest category</div>
            <div style={{ fontSize: "7.6pt", fontWeight: 700 }}>{strongest.label}</div>
            <div style={{ fontSize: "6.2pt" }}>{strongest.value.toFixed(2)} of {strongest.max} · {strongest.pct.toFixed(1)}%</div>
          </div>
          <div className="band" style={{ borderLeftColor: FILL.worst }}>
            <div style={{ fontSize: "5.6pt", textTransform: "uppercase", letterSpacing: ".04em", color: "#444" }}>Weakest category</div>
            <div style={{ fontSize: "7.6pt", fontWeight: 700 }}>{weakest.label}</div>
            <div style={{ fontSize: "6.2pt" }}>{weakest.value.toFixed(2)} of {weakest.max} · {weakest.pct.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      {/* ---- component-level strengths and gaps ---- */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7pt", marginTop: "4pt" }}>
        {([
          ["Top scoring components", compRanked.slice(0, 4), FILL.best],
          ["Largest gaps", [...compRanked].reverse().slice(0, 4), FILL.worst],
        ] as const).map(([title, list, color]) => (
          <div key={title}>
            <div style={{ fontSize: "5.8pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: "1.6pt" }}>{title}</div>
            {list.map((c) => (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: "3pt", marginBottom: "1.3pt" }}>
                <span style={{ fontSize: "6pt", width: "56pt", flexShrink: 0 }}>{c.label}</span>
                <span style={{ flex: 1, height: "3.4pt", background: FILL.track, position: "relative", display: "block" }}>
                  <span style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${Math.min(c.pct, 100)}%`, background: color }} />
                </span>
                <span style={{ fontSize: "5.8pt", fontWeight: 700, width: "36pt", textAlign: "right", flexShrink: 0 }}>
                  {c.value.toFixed(2)} / {c.max}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ---- every trade row ---- */}
      <h2>Trade records — all {rows.length} assessment row{rows.length === 1 ? "" : "s"}</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: "31%" }}>Trade</th>
            <th className="r">Code</th><th className="r">Batch</th><th className="r">Cap.</th>
            <th className="r">Reg.</th><th className="r">Pres.</th><th className="r">Abs.</th>
            <th className="r">Drop.</th><th className="r">CNIC</th><th className="r">Att. %</th><th className="r">Pres. %</th>
            <th className="r">Score</th><th className="r">Row</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.tradeName}</td>
              <td className="r">{r.tradeCode}</td>
              <td className="r">{r.batch ?? "—"}</td>
              <td className="r">{r.approvedCapacity}</td>
              <td className="r">{r.biometricRegistered}</td>
              <td className="r">{r.present}</td>
              <td className="r">{r.absent}</td>
              <td className="r">{r.droppedOut}</td>
              <td className="r">{r.cnicVerified}</td>
              <td className="r" style={{ fontWeight: 700 }}>{fmtPct(r.attendanceRate, 0)}</td>
              <td className="r" style={{ color: "#555" }}>{fmtPct(r.presenceRate, 0)}</td>
              <td className="r" style={{ fontWeight: 700 }}>{fmtScore(r.tradeScore, 1)}</td>
              <td className="r" style={{ color: "#666" }}>{r.excelRow}</td>
            </tr>
          ))}
          <tr className="tot">
            <td>Institute total</td><td className="r" /><td className="r" />
            <td className="r">{sum("approvedCapacity")}</td>
            <td className="r">{sum("biometricRegistered")}</td>
            <td className="r">{sum("present")}</td>
            <td className="r">{sum("absent")}</td>
            <td className="r">{sum("droppedOut")}</td>
            <td className="r">{sum("cnicVerified")}</td>
            <td className="r">{fmtPct(inst.attendanceRate, 0)}</td>
            <td className="r">{fmtPct(inst.presenceRate, 0)}</td>
            <td className="r">{fmtScore(inst.score, 1)}</td>
            <td className="r" />
          </tr>
        </tbody>
      </table>

      {/* ---- every component, for every trade ---- */}
      <h2>Score components by trade — all 16 components, max 100</h2>
      <table className="matrix">
        <thead>
          <tr>
            <th style={{ width: "26%" }}>Trade</th>
            {components.map((c) => <th key={c.key} className="r" title={c.label}>{CODES[c.key]}</th>)}
            <th className="r">Total</th>
          </tr>
          <tr>
            <th style={{ fontWeight: 400, color: "#666" }}>maximum</th>
            {components.map((c) => (
              <th key={c.key} className="r" style={{ fontWeight: 400, color: "#666", borderBottom: "0.6pt solid #333" }}>{c.max}</th>
            ))}
            <th className="r" style={{ fontWeight: 400, color: "#666" }}>100</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.tradeName.length > 38 ? r.tradeName.slice(0, 37) + "…" : r.tradeName}</td>
              {components.map((c) => {
                const v = r.components[c.key];
                return <td key={c.key} className={`r${v === 0 ? " zero" : ""}`}>{n(v)}</td>;
              })}
              <td className="r" style={{ fontWeight: 700 }}>{fmtScore(r.tradeScore, 1)}</td>
            </tr>
          ))}
          <tr className="tot">
            <td>Institute mean</td>
            {components.map((c) => <td key={c.key} className="r">{(inst.components[c.key] ?? 0).toFixed(1)}</td>)}
            <td className="r">{fmtScore(inst.score, 1)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: "5.5pt", color: "#555", marginTop: "1.5pt" }}>
        {components.map((c) => `${CODES[c.key]} ${c.label}`).join("  ·  ")}
      </div>

      {/* ---- provenance ---- */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8pt", borderTop: "0.6pt solid #333", marginTop: "5pt", paddingTop: "2.5pt", fontSize: "5.6pt", color: "#444" }}>
        <span>Source: {meta.sourceFile} · sheet &ldquo;{meta.sheet}&rdquo; · assessment {meta.assessmentDate}</span>
        <span style={{ textAlign: "right" }}>
          Attendance % = CNIC Verified ÷ Approved Capacity · Presence % = Present ÷ Registered
          <br />
          Remarks band: {TIER_RUBRIC[grade] ?? "—"} · official NAVTTC rubric
          {inst.gradeReported && inst.gradeReported !== grade ? ` · workbook states “${inst.gradeReported}”` : ""}
        </span>
      </div>

      {/* ---- page footer: page number only, pinned to the bottom of the sheet ---- */}
      <div className="page-foot" style={{ textAlign: "center", fontSize: "6.4pt", color: "#333" }}>
        {pageCount > 1 ? `Page ${pageNumber} of ${pageCount}` : `Page ${pageNumber}`}
      </div>
    </div>
  );
}
