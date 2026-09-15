"use client";
import type { AssessmentRow, FilterState } from "../types";
import { meta } from "./dataset";

/** Builds the filename stem used by every export, e.g. NAVTTC_Geography_Punjab_2026-09-08 */
export function reportName(page: string, f?: FilterState): string {
  const bits = ["NAVTTC", page.replace(/\s+/g, "_")];
  if (f) {
    if (f.region.length) bits.push(f.region.join("-"));
    if (f.district.length) bits.push(f.district.join("-"));
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
  URL.revokeObjectURL(url);
}

const esc = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Flattens an assessment row into the export shape — one column per Excel field. */
export function flattenRow(r: AssessmentRow): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {
    "Excel Row": r.excelRow,
    Package: r.package,
    "Program Name": r.programName,
    Region: r.region,
    District: r.district,
    "Institute ID": r.instituteId,
    "Institute Name": r.instituteName,
    "Trade Name": r.tradeName,
    "Trade Name (as entered)": r.tradeNameRaw.trim(),
    "Trade Code": r.tradeCode,
    "Institute Trade Code": r.instituteTradeCode,
    Batch: r.batch,
    "Batch (as entered)": r.batchRaw,
    "Approved Capacity": r.approvedCapacity,
    "Registered on Biometric": r.biometricRegistered,
    "Dropped Out": r.droppedOut,
    Present: r.present,
    Absent: r.absent,
    "CNIC Verified": r.cnicVerified,
    "Attendance % (CNIC Verified / Approved Capacity)": r.attendanceRate,
    "Presence % (Present / Registered)": r.presenceRate,
    "Dropout Rate": r.dropoutRate,
    "Capacity Utilization": r.utilizationRate,
    "Attendance % (col R, as reported in workbook)": r.verificationRateReported,
  };
  for (const [k, v] of Object.entries(r.components)) out[`Score: ${k}`] = v;
  out["Trade Score (recomputed)"] = r.tradeScore;
  out["Trade Score (as stored in Excel)"] = r.tradeScoreStored;
  return out;
}

export function exportCsv(rows: AssessmentRow[], name: string) {
  if (!rows.length) return;
  const flat = rows.map(flattenRow);
  const headers = Object.keys(flat[0]);
  const body = [headers.map(esc).join(","), ...flat.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
  // BOM so Excel opens UTF-8 correctly
  download(new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8;" }), `${name}.csv`);
}

export function exportJson(rows: AssessmentRow[], name: string, filters: FilterState) {
  const payload = {
    generatedAt: new Date().toISOString(),
    source: meta.sourceFile,
    filters,
    recordCount: rows.length,
    records: rows.map(flattenRow),
  };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${name}.json`);
}

/**
 * Excel export. SheetJS is loaded on demand so the ~400 KB writer never
 * reaches users who only browse the dashboard.
 */
export async function exportXlsx(rows: AssessmentRow[], name: string) {
  if (!rows.length) return;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "NAVTTC Analytics";
  wb.created = new Date();
  const ws = wb.addWorksheet("Filtered Data");
  const flat = rows.map(flattenRow);
  const headers = Object.keys(flat[0]);
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(Math.max(h.length + 2, 12), 42) }));
  flat.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
}

/** PNG of a single chart, at 2x for print sharpness. */
export function downloadDataUrl(dataUrl: string, name: string) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = `${name}.png`;
  document.body.appendChild(a); a.click(); a.remove();
}
