/**
 * Bulk institute reports, written straight to a PDF file.
 *
 * WHY THIS EXISTS
 * The original bulk report mounted every institute's one-pager into the page
 * (688 institutes ≈ 232,000 DOM nodes) and then opened the browser's print
 * dialog. Printing that document needs ~3.4 GB in Chromium before the print
 * preview makes its own copy, so on an ordinary office PC the tab runs out of
 * memory, the preview never finishes, and nothing can be saved.
 *
 * This builder never touches the DOM. It draws each sheet as vector PDF
 * (text, rules and bars — the same layout as InstituteOnePager) one institute
 * at a time, yields to the browser between sheets so the page stays
 * responsive, and produces ONE file for the whole batch. Memory grows by
 * roughly 15–30 KB per page, so 688 pages is a ~15 MB file built in seconds.
 *
 * jsPDF is imported dynamically: it is only downloaded when someone actually
 * asks for a PDF.
 */
import type { jsPDF as JsPDF } from "jspdf";
import type { AssessmentRow, Institute, Program } from "@/types";
import { gradeOf, TIER_RUBRIC, fmtInt, fmtPct, fmtScore } from "@/config";
import { codeOf } from "@/components/reports/InstituteOnePager";
import type { Standing } from "@/lib/standings";

export interface ReportItem {
  inst: Institute; program: Program; rows: AssessmentRow[];
  /** Fixed whole-programme standing (the filtered view's rank is not the official one). */
  standing?: Standing | null;
}
export interface BuildOptions {
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/* ------------------------------------------------------------------ geometry (mm) */
const PAGE_W = 210, PAGE_H = 297, M = 11, W = PAGE_W - 2 * M, BOTTOM = PAGE_H - 12;
const FILL = { best: [26, 127, 75], mid: [61, 90, 128], worst: [163, 32, 32], track: [221, 227, 234] } as const;
const pt = (n: number) => n * 0.3528; // points → mm

/**
 * The 14 standard PDF fonts only cover WinAnsi. Map the few typographic
 * characters the data uses that fall outside it; anything else unknown is
 * dropped rather than rendered as garbage.
 */
const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const MAP: Record<string, string> = { "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "−": "-", "✓": "v", "★": "*", " ": " " };
function safe(s: unknown): string {
  const str = s === null || s === undefined ? "" : String(s);
  let out = "";
  for (const ch of str) {
    const c = ch.codePointAt(0)!;
    if (MAP[ch] !== undefined) out += MAP[ch];
    else if (c < 256 || WINANSI_EXTRA.includes(ch)) out += ch;
    else if (/\s/.test(ch)) out += " ";
  }
  return out;
}

async function loadImage(url: string): Promise<{ data: string; ratio: number; type: "PNG" | "JPEG" } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
    const ratio = await new Promise<number>((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth / i.naturalHeight || 1); i.onerror = () => res(1); i.src = data; });
    return { data, ratio, type: /png/i.test(blob.type) ? "PNG" : "JPEG" };
  } catch { return null; }
}

export async function buildReportsPdf(items: ReportItem[], opts: BuildOptions = {}): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const [emblem, crest] = await Promise.all([loadImage("/brand/emblem-pakistan.png"), loadImage("/brand/navttc-logo.jpg")]);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({ title: "NAVTTC — Training Provider Institute Verification Reports", creator: "NAVTTC Programme Analytics" });
  doc.setLineHeightFactor(1.15);

  for (let i = 0; i < items.length; i++) {
    if (opts.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (i > 0) doc.addPage();
    drawSheet(doc, autoTable, items[i], emblem, crest);
    if (i % 4 === 3 || i === items.length - 1) {
      opts.onProgress?.(i + 1, items.length);
      // Hand the main thread back so the progress bar paints and clicks register.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Page numbers last, so a sheet that ran onto a second page is counted correctly.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    text(doc, `Page ${p} of ${total}`, PAGE_W / 2, PAGE_H - 6, { size: 6.4, color: 60, align: "center" });
  }
  return doc.output("blob");
}

/* ------------------------------------------------------------------ drawing helpers */

type Rgb = readonly [number, number, number];
interface TextOpts { size?: number; bold?: boolean; color?: number | Rgb; align?: "left" | "center" | "right"; maxWidth?: number }

function text(doc: JsPDF, s: string, x: number, y: number, o: TextOpts = {}) {
  doc.setFont("helvetica", o.bold ? "bold" : "normal");
  doc.setFontSize(o.size ?? 7);
  const c = o.color ?? 0;
  if (typeof c === "number") doc.setTextColor(c, c, c); else doc.setTextColor(c[0], c[1], c[2]);
  doc.text(safe(s), x, y, { align: o.align ?? "left", maxWidth: o.maxWidth, baseline: "alphabetic" });
}

function lines(doc: JsPDF, s: string, width: number, size: number, bold = false): string[] {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  return doc.splitTextToSize(safe(s), width) as string[];
}

function rule(doc: JsPDF, y: number, weight = 0.2, shade = 0) {
  doc.setDrawColor(shade, shade, shade);
  doc.setLineWidth(weight);
  doc.line(M, y, PAGE_W - M, y);
}

function fillRect(doc: JsPDF, x: number, y: number, w: number, h: number, c: Rgb) {
  doc.setFillColor(c[0], c[1], c[2]);
  doc.rect(x, y, w, h, "F");
}

function heading(doc: JsPDF, label: string, y: number): number {
  text(doc, label.toUpperCase(), M, y + pt(6.4), { size: 6.4, bold: true });
  doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.14);
  doc.line(M, y + pt(6.4) + 0.9, PAGE_W - M, y + pt(6.4) + 0.9);
  return y + pt(6.4) + 2.4;
}

/** Start a continuation page when the next block would not fit. */
function ensure(doc: JsPDF, y: number, need: number): number {
  if (y + need <= BOTTOM) return y;
  doc.addPage();
  return 12;
}

/* ------------------------------------------------------------------ one sheet */

type AutoTable = typeof import("jspdf-autotable").autoTable;
type Img = Awaited<ReturnType<typeof loadImage>>;

function drawSheet(doc: JsPDF, autoTable: AutoTable, { inst, program, rows, standing }: ReportItem, emblem: Img, crest: Img) {
  const grade = gradeOf(inst);
  const components = program.rubric.components;
  const categories = program.rubric.categories.filter((c) => c.max > 0);
  const sum = (k: keyof AssessmentRow) => rows.reduce((a, r) => a + ((r[k] as number) ?? 0), 0);
  let y = 10;

  /* ---- letterhead ---- */
  const LOGO_H = 12;
  if (emblem) doc.addImage(emblem.data, emblem.type, M, y, LOGO_H * emblem.ratio, LOGO_H, "emblem", "FAST");
  if (crest) doc.addImage(crest.data, crest.type, PAGE_W - M - LOGO_H * crest.ratio, y, LOGO_H * crest.ratio, LOGO_H, "crest", "FAST");
  const cx = PAGE_W / 2;
  text(doc, "GOVERNMENT OF PAKISTAN", cx, y + 3.6, { size: 10.5, bold: true, align: "center" });
  text(doc, "NATIONAL VOCATIONAL & TECHNICAL TRAINING COMMISSION", cx, y + 7.2, { size: 8.4, bold: true, align: "center" });
  text(doc, "Headquarters, Plot No. 38, Kirthar Road, Sector H-9/4, Islamabad", cx, y + 9.9, { size: 6.2, align: "center" });
  text(doc, "http://navttc.gov.pk", cx, y + 12.3, { size: 6.2, bold: true, align: "center" });
  y += LOGO_H + 2.4;

  /* ---- identity band ---- */
  rule(doc, y, 0.5);
  const boxW = 38, leftW = W - boxW - 4;
  const nameLines = lines(doc, inst.instituteName, leftW, 11.5, true).slice(0, 2);
  const sub = `Institute ID ${inst.instituteId ?? "not recorded"} · ${inst.district}, ${inst.region} · ${inst.package ?? "—"} · ${inst.assessments} trade${inst.assessments === 1 ? "" : "s"} assessed · ${program.name}`;
  const subLines = lines(doc, sub, leftW, 6.6).slice(0, 2);
  const bandH = Math.max(22, 3.4 + nameLines.length * 4.6 + subLines.length * 2.8 + 2);
  text(doc, "TRAINING PROVIDER INSTITUTE — VERIFICATION REPORT", M, y + 3.4, { size: 5.8, color: 70 });
  let ty = y + 3.4 + 4.6;
  for (const l of nameLines) { text(doc, l, M, ty, { size: 11.5, bold: true }); ty += 4.6; }
  ty -= 1.2;
  for (const l of subLines) { text(doc, l, M, ty, { size: 6.6, color: 50 }); ty += 2.8; }

  // score box: thin border with a heavy left edge, as in the on-screen one-pager
  const bx = PAGE_W - M - boxW, by = y + 1.6, bh = bandH - 3.2;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.21); doc.rect(bx, by, boxW, bh, "S");
  fillRect(doc, bx, by, 0.85, bh, [0, 0, 0]);
  const rx = bx + boxW - 2;
  text(doc, "OVERALL SCORE", rx, by + 3, { size: 5.8, align: "right" });
  text(doc, fmtScore(inst.score, 1), rx, by + 10.2, { size: 19, bold: true, align: "right" });
  text(doc, grade, rx, by + 13.4, { size: 7, bold: true, align: "right" });
  text(doc, TIER_RUBRIC[grade] ?? "", rx, by + 15.6, { size: 5.4, color: 70, align: "right" });
  text(doc, rankText(inst, program, standing), rx, by + 17.8, { size: 5.8, color: 70, align: "right" });
  y += bandH;
  rule(doc, y, 0.21);
  y += 1.6;

  /* ---- assessor note ---- */
  if (inst.assessorNote) {
    const nl = lines(doc, `ASSESSOR NOTE  ${inst.assessorNote}`, W - 4, 7).slice(0, 4);
    const nh = nl.length * 2.9 + 2.2;
    doc.setDrawColor(185, 28, 28); doc.setLineWidth(0.21); doc.rect(M, y, W, nh, "S");
    nl.forEach((l, k) => text(doc, l, M + 2, y + 3.2 + k * 2.9, { size: 7 }));
    y += nh + 1.6;
  }

  /* ---- enrolment and attendance (no utilisation, by request) ---- */
  y = heading(doc, "Enrolment and attendance", y + 1.2);
  const stats: [string, string][] = [
    ["Approved capacity", fmtInt(inst.approvedCapacity)],
    [program.enrolledLabel, fmtInt(inst.enrolled)],
    ["Present", fmtInt(inst.present)],
    ["Absent", fmtInt(inst.absent)],
    ["Dropped out", fmtInt(inst.droppedOut)],
    ["CNIC verified", fmtInt(inst.cnicVerified)],
    ["Attendance %", fmtPct(inst.attendanceRate)],
  ];
  const gap = 0.9, sw = (W - gap * (stats.length - 1)) / stats.length, sh = 8.2;
  stats.forEach(([k, v], idx) => {
    const sx = M + idx * (sw + gap);
    doc.setDrawColor(201, 211, 222); doc.setLineWidth(0.14); doc.rect(sx, y, sw, sh, "S");
    text(doc, k.toUpperCase(), sx + 1, y + 2.6, { size: 5.4, color: 70, maxWidth: sw - 2 });
    text(doc, v, sx + 1, y + 6.8, { size: 9.6, bold: true });
  });
  y += sh + 1.6;

  /* ---- category profile ---- */
  y = heading(doc, "Category profile — achievement against each category maximum", y + 0.6);
  const cats = categories.map((c) => {
    const v = inst.categoryScores[c.key] ?? 0;
    return { ...c, value: v, pct: c.max > 0 ? (v / c.max) * 100 : 0 };
  }).sort((a, b) => b.pct - a.pct);
  const chartW = W * 0.6, LABEL = 34, BAR = chartW - LABEL - 12, ROW = 4.4;
  cats.forEach((c, idx) => {
    const ry = y + idx * ROW;
    const fill = idx === 0 ? FILL.best : idx === cats.length - 1 ? FILL.worst : FILL.mid;
    text(doc, c.label, M + LABEL - 1.4, ry + 2.7, { size: 6, align: "right" });
    fillRect(doc, M + LABEL, ry + 0.4, BAR, 3, FILL.track);
    fillRect(doc, M + LABEL, ry + 0.4, Math.max((c.pct / 100) * BAR, 0.3), 3, fill);
    if (c.pct > 22) text(doc, `${c.value.toFixed(1)} / ${c.max}`, M + LABEL + 1, ry + 2.65, { size: 5.2, bold: true, color: 255 });
    text(doc, `${c.pct.toFixed(0)}%`, M + LABEL + BAR + 1.2, ry + 2.7, { size: 6, bold: true });
  });
  const strongest = cats[0], weakest = cats[cats.length - 1];
  const px = M + chartW + 4, pw = W - chartW - 4;
  ([["STRONGEST CATEGORY", strongest, FILL.best], ["WEAKEST CATEGORY", weakest, FILL.worst]] as const).forEach(([t, c, col], k) => {
    if (!c) return;
    const yy = y + k * 11;
    doc.setDrawColor(51, 51, 51); doc.setLineWidth(0.21); doc.rect(px, yy, pw, 9.6, "S");
    fillRect(doc, px, yy, 0.85, 9.6, col);
    text(doc, t, px + 2.4, yy + 2.6, { size: 5.6, color: 70 });
    text(doc, c.label, px + 2.4, yy + 5.6, { size: 7.6, bold: true, maxWidth: pw - 4 });
    text(doc, `${c.value.toFixed(2)} of ${c.max} · ${c.pct.toFixed(1)}%`, px + 2.4, yy + 8.3, { size: 6.2 });
  });
  y += Math.max(cats.length * ROW, 21) + 2.4;

  /* ---- component strengths and gaps ---- */
  const comps = components.map((c) => {
    const v = inst.components[c.key] ?? 0;
    return { ...c, value: v, pct: c.max > 0 ? (v / c.max) * 100 : 0 };
  }).sort((a, b) => b.pct - a.pct);
  const colW = (W - 6) / 2;
  ([["TOP SCORING COMPONENTS", comps.slice(0, 4), FILL.best], ["LARGEST GAPS", [...comps].reverse().slice(0, 4), FILL.worst]] as const).forEach(([t, list, col], k) => {
    const x0 = M + k * (colW + 6);
    text(doc, t, x0, y + 2.2, { size: 5.8, bold: true });
    list.forEach((c, j) => {
      const yy = y + 3.6 + j * 3.4;
      text(doc, fit(doc, c.label, 31, 6), x0, yy + 2, { size: 6 });
      const bx0 = x0 + 32, bw = colW - 32 - 15;
      fillRect(doc, bx0, yy + 0.6, bw, 1.4, FILL.track);
      fillRect(doc, bx0, yy + 0.6, Math.max(Math.min(c.pct, 100) / 100 * bw, 0.2), 1.4, col);
      text(doc, `${c.value.toFixed(2)} / ${c.max}`, x0 + colW, yy + 2, { size: 5.8, bold: true, align: "right" });
    });
  });
  y += 3.6 + 4 * 3.4 + 1.6;

  /* ---- trade records ---- */
  y = ensure(doc, y, 20);
  y = heading(doc, `Trade records — all ${rows.length} assessment row${rows.length === 1 ? "" : "s"}`, y);
  const tableBase = {
    theme: "plain" as const,
    margin: { left: M, right: M, top: 12, bottom: 14 },
    styles: { font: "helvetica", fontSize: 6.3, cellPadding: { top: 0.45, bottom: 0.45, left: 0.8, right: 0.8 }, textColor: 0, lineColor: [215, 222, 230] as [number, number, number], lineWidth: { bottom: 0.1 }, overflow: "ellipsize" as const },
    headStyles: { fontStyle: "bold" as const, fontSize: 5.9, lineColor: [51, 51, 51] as [number, number, number], lineWidth: { bottom: 0.21 } },
  };
  const right = (from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, k) => [from + k, { halign: "right" as const }]));
  autoTable(doc, {
    ...tableBase,
    startY: y,
    head: [["TRADE", "CODE", "BATCH", "CAP.", "ENR.", "PRES.", "ABS.", "DROP.", "CNIC", "ATT. %", "PRES. %", "SCORE", "ROW"].map((h, k) => ({ content: h, styles: k ? { halign: "right" } : {} }))],
    body: [
      ...rows.map((r) => [safe(r.tradeName), r.tradeCode ?? "", r.batch ?? "—", r.approvedCapacity, r.enrolled, r.present, r.absent, r.droppedOut, r.cnicVerified,
        fmtPct(r.attendanceRate, 0), fmtPct(r.presenceRate, 0), fmtScore(r.tradeScore, 1), r.excelRow].map(String)),
      ["Institute total", "", "", sum("approvedCapacity"), sum("enrolled"), sum("present"), sum("absent"), sum("droppedOut"), sum("cnicVerified"),
        fmtPct(inst.attendanceRate, 0), fmtPct(inst.presenceRate, 0), fmtScore(inst.score, 1), ""].map(String),
    ],
    columnStyles: { 0: { cellWidth: W * 0.31 }, ...right(1, 12), 9: { halign: "right", fontStyle: "bold" }, 11: { halign: "right", fontStyle: "bold" }, 10: { halign: "right", textColor: 85 }, 12: { halign: "right", textColor: 100 } },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === rows.length) { d.cell.styles.fontStyle = "bold"; d.cell.styles.lineWidth = { top: 0.21 }; d.cell.styles.lineColor = [51, 51, 51]; d.cell.styles.textColor = 0; }
    },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 2.4;

  /* ---- component matrix ---- */
  y = ensure(doc, y, 22);
  y = heading(doc, `Score components by trade — all ${components.length} criteria, max 100`, y);
  autoTable(doc, {
    ...tableBase,
    startY: y,
    styles: { ...tableBase.styles, fontSize: 5.7, cellPadding: { top: 0.4, bottom: 0.4, left: 0.45, right: 0.45 } },
    headStyles: { ...tableBase.headStyles, fontSize: 5.5 },
    head: [
      [{ content: "TRADE" }, ...components.map((c) => ({ content: codeOf(c.key, c.label), styles: { halign: "right" as const } })), { content: "TOTAL", styles: { halign: "right" as const } }],
      [{ content: "maximum", styles: { fontStyle: "normal" as const, textColor: 100 } }, ...components.map((c) => ({ content: String(c.max), styles: { halign: "right" as const, fontStyle: "normal" as const, textColor: 100 } })), { content: "100", styles: { halign: "right" as const, fontStyle: "normal" as const, textColor: 100 } }],
    ],
    body: [
      ...rows.map((r) => [safe(r.tradeName.length > 38 ? r.tradeName.slice(0, 37) + "…" : r.tradeName),
        ...components.map((c) => (r.scored ? fmtNum(r.components[c.key] ?? 0) : "—")), fmtScore(r.tradeScore, 1)]),
      ["Institute mean", ...components.map((c) => (inst.components[c.key] ?? 0).toFixed(1)), fmtScore(inst.score, 1)],
    ],
    columnStyles: { 0: { cellWidth: W * 0.26 }, ...right(1, components.length + 1), [components.length + 1]: { halign: "right", fontStyle: "bold" } },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      if (d.row.index === rows.length) { d.cell.styles.fontStyle = "bold"; d.cell.styles.lineWidth = { top: 0.21 }; d.cell.styles.lineColor = [51, 51, 51]; return; }
      const r = rows[d.row.index];
      const comp = components[d.column.index - 1];
      if (r && comp && r.scored && (r.components[comp.key] ?? 0) === 0) { d.cell.styles.textColor = [185, 28, 28]; d.cell.styles.fontStyle = "bold"; }
    },
  });
  y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 1.4;
  const legend = lines(doc, components.map((c) => `${codeOf(c.key, c.label)} ${c.label}`).join("  ·  "), W, 5.5);
  y = ensure(doc, y, legend.length * 2.2 + 10);
  legend.forEach((l, k) => text(doc, l, M, y + 2 + k * 2.2, { size: 5.5, color: 85 }));
  y += legend.length * 2.2 + 2;

  /* ---- provenance ---- */
  rule(doc, y, 0.21, 51);
  const src = `Source: ${program.sourceFile} · sheet "${program.sheet}" · ${program.period ? `visits ${program.period.from} to ${program.period.to}` : program.assessmentDate ? `assessment ${program.assessmentDate}` : "visit date not recorded"}${inst.visitDate ? ` · visited ${inst.visitDate}` : ""}`;
  const half = W / 2 - 3;
  lines(doc, src, half, 5.6).slice(0, 3).forEach((l, k) => text(doc, l, M, y + 2.6 + k * 2.3, { size: 5.6, color: 70 }));
  const r1 = `Attendance % = ${program.attendanceRule.label} · Presence % = Present ÷ ${program.enrolledLabel}`;
  const r2 = `Remarks band: ${TIER_RUBRIC[grade] ?? (inst.gradeOverride ? "workbook override" : "—")} · ${program.rubric.label}${inst.gradeReported && inst.gradeReported !== grade ? ` · workbook states "${inst.gradeReported}"` : ""}`;
  [...lines(doc, r1, half, 5.6), ...lines(doc, r2, half, 5.6)].slice(0, 4).forEach((l, k) => text(doc, l, PAGE_W - M, y + 2.6 + k * 2.3, { size: 5.6, color: 70, align: "right" }));
}

/** Shorten to a width with an ellipsis instead of cutting at a word boundary. */
function fit(doc: JsPDF, s: string, width: number, size: number): string {
  doc.setFont("helvetica", "normal"); doc.setFontSize(size);
  let t = safe(s);
  if (doc.getTextWidth(t) <= width) return t;
  while (t.length > 1 && doc.getTextWidth(t + "…") > width) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

/** "Rank 11 of 184 in PMYSDP B-III", from the fixed whole-programme standings. */
export function rankText(inst: Institute, program: Program, s?: Standing | null): string {
  if (s && s.rank !== null) return `Rank ${s.tiedWith ? "=" : ""}${s.rank} of ${s.of} in ${program.short}`;
  if (s && s.rank === null) return `Not ranked (unscored) · ${program.short}`;
  return `Rank ${inst.rank} of ${program.instituteCount} in ${program.short}`;
}

const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ""));

/** Trigger a browser download for a Blob without holding an extra copy. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
