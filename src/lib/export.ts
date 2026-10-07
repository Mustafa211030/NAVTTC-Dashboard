"use client";
import type { AssessmentRow, FilterState, Program } from "../types";

/** Filename stem, e.g. NAVTTC_PMYSDP-B-II_Geography_PUNJAB_2026-10-06 */
export function reportName(page: string, scopeLabel: string, f?: FilterState): string {
  const bits = ["NAVTTC", scopeLabel.replace(/\s+/g, "-"), page.replace(/\s+/g, "_")];
  if (f) {
    if (f.institute.length) bits.push(f.institute.length === 1 ? f.institute[0] : `${f.institute.length}-institutes`);
    if (f.program.length) bits.push(f.program.join("-"));
    if (f.region.length) bits.push(f.region.join("-"));
    if (f.district.length) bits.push(f.district.slice(0, 3).join("-"));
    if (f.grade.length) bits.push(f.grade.join("-"));
  }
  bits.push(new Date().toISOString().slice(0, 10));
  return bits.join("_").replace(/[^\w\-.]/g, "");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(matrix: (string | number | null | undefined)[][], name: string) {
  const body = matrix.map((r) => r.map(esc).join(",")).join("\r\n");
  download(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" }), `${name}.csv`);
}

/** Flattens an assessment row into the export shape. Components are labelled by the row's own rubric. */
export function flattenRow(r: AssessmentRow, programs: Map<string, Program>): Record<string, string | number | null> {
  const p = programs.get(r.p);
  const out: Record<string, string | number | null> = {
    Programme: p?.name ?? r.p,
    "Excel Row": r.excelRow,
    Package: r.package,
    Region: r.region,
    District: r.district,
    Division: r.division,
    Tehsil: r.tehsil,
    "Institute ID": r.instituteId,
    "Institute Name": r.instituteName,
    "Trade Name": r.tradeName,
    "Trade Name (as entered)": r.tradeNameRaw,
    "Trade Code": r.tradeCode,
    "Trade Category": r.tradeCategory,
    "Trade Sector": r.tradeSector,
    "Duration (months)": r.durationMonths,
    "Date of Visit": r.visitDate,
    Batch: r.batch,
    "Approved Capacity": r.approvedCapacity,
    [p?.enrolledLabel ?? "Enrolled"]: r.enrolled,
    "Dropped Out": r.droppedOut,
    Present: r.present,
    Absent: r.absent,
    "CNIC Verified": r.cnicVerified,
    [`Attendance % (${p?.attendanceRule.label ?? "programme rule"})`]: r.attendanceRate,
    "Presence % (Present / Enrolled)": r.presenceRate,
    "CNIC Verified % of Capacity": r.verificationRate,
    "Dropout Rate": r.dropoutRate,
    "Capacity Utilisation": r.utilizationRate,
    "Attendance % (as stored in workbook)": r.attendanceReported,
  };
  for (const c of p?.rubric.components ?? []) out[`Score: ${c.label} (/${c.max})`] = r.scored ? r.components[c.key] ?? null : null;
  out["Trade Score (recomputed)"] = r.tradeScore;
  out["Trade Score (as stored)"] = r.tradeScoreStored;
  out["Recommended for Release"] = r.release;
  for (const [k, v] of Object.entries(r.extra ?? {})) out[`Workbook: ${k}`] = v;
  return out;
}

function matrixOf(rows: AssessmentRow[], programs: Map<string, Program>) {
  const flat = rows.map((r) => flattenRow(r, programs));
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const f of flat) for (const k of Object.keys(f)) if (!seen.has(k)) { seen.add(k); headers.push(k); }
  return { headers, flat };
}

export function exportCsv(rows: AssessmentRow[], programs: Map<string, Program>, name: string) {
  if (!rows.length) return;
  const { headers, flat } = matrixOf(rows, programs);
  downloadCsv([headers, ...flat.map((r) => headers.map((h) => r[h] ?? null))], name);
}

export function exportJson(rows: AssessmentRow[], programs: Map<string, Program>, name: string, filters: FilterState, scope: string) {
  const payload = {
    generatedAt: new Date().toISOString(),
    scope,
    filters,
    recordCount: rows.length,
    records: rows.map((r) => flattenRow(r, programs)),
  };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${name}.json`);
}

/** Excel export. ExcelJS is loaded on demand. One sheet per programme plus an "All" sheet. */
export async function exportXlsx(rows: AssessmentRow[], programs: Map<string, Program>, name: string) {
  if (!rows.length) return;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "NAVTTC Analytics";
  wb.created = new Date();
  const add = (title: string, subset: AssessmentRow[]) => {
    const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"));
    const { headers, flat } = matrixOf(subset, programs);
    ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(Math.max(h.length + 2, 12), 42) }));
    flat.forEach((r) => ws.addRow(r));
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  };
  const slugs = [...new Set(rows.map((r) => r.p))];
  if (slugs.length > 1) add("All programmes", rows);
  for (const s of slugs) add(programs.get(s)?.short ?? s, rows.filter((r) => r.p === s));
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
}

/** PNG of a single chart, at 2x for print sharpness. */
export function downloadDataUrl(dataUrl: string, name: string) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = `${name}.png`;
  document.body.appendChild(a); a.click(); a.remove();
}
