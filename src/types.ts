/* ------------------------------------------------------------------ *
 * Portfolio data model — the shape of public/data/portfolio.json,
 * produced by scripts/build-data.mjs. One file, every programme.
 * ------------------------------------------------------------------ */

export type CategoryKey = "biometricAttendance" | "infrastructure" | "trainer" | "delivery" | "industry" | "feedback";

export interface CategoryDef { key: CategoryKey; label: string; short: string }

export interface RubricComponent { key: string; label: string; max: number; cat: CategoryKey; column: number }
export interface RubricCategory { key: CategoryKey; label: string; short: string; max: number; members: string[] }

export interface QualityIssue {
  severity: "high" | "medium" | "low";
  code: string;
  message: string;
  row: number | null;
  detail: string | null;
}
export interface Repair { row: number; field: string; from: string; to: number; reason: string }
export interface ChangeLogEntry {
  row: number | string | null; institute: string | null; trade: string | null; field: string | null;
  from: string | null; to: string | null; reason: string | null;
}

export interface ProgramQuality {
  totals: { rows: number; institutes: number; cells: number; filledCells: number; completeness: number; issues: number; repairs: number; changeLog: number };
  bySeverity: Record<string, number>;
  byCode: Record<string, number>;
  repairs: Repair[];
  issues: QualityIssue[];
  changeLog: ChangeLogEntry[];
}

export interface Program {
  slug: string;
  order: number;
  family: string;
  name: string;
  short: string;
  code: string;
  /** 2–3 character mark used in the sidebar and switcher */
  badge: string;
  fullName: string;
  color: string;
  rubric: { key: string; label: string; components: RubricComponent[]; categories: RubricCategory[] };
  attendanceRule: { key: string; num: string; den: string; label: string };
  enrolledLabel: string;
  assessmentDate: string | null;
  period: { from: string; to: string } | null;
  hasVisitDates: boolean;
  sourceFile: string;
  sheet: string;
  columnCount: number;
  headers: string[];
  extras: string[];
  notes: string[];
  rowCount: number;
  instituteCount: number;
  quality: ProgramQuality;
}

export interface AssessmentRow {
  id: string;
  /** programme slug */
  p: string;
  excelRow: number;
  package: string | null;
  programName: string | null;
  region: string;
  district: string;
  division: string | null;
  tehsil: string | null;
  instituteId: number | null;
  /** unique within the programme */
  instituteKey: string;
  /** links the same institute across programmes */
  globalKey: string;
  instituteName: string;
  tradeNameRaw: string;
  tradeName: string;
  tradeCode: number | null;
  /** unique within the programme */
  tradeKey: string;
  /** normalised name — links the same trade across programmes */
  tradeNorm: string;
  tradeCategory: string | null;
  tradeSector: string | null;
  durationMonths: number | null;
  visitDate: string | null;
  release: string | null;
  batch: number | null;
  batchRaw: string | null;
  approvedCapacity: number;
  enrolled: number;
  droppedOut: number;
  present: number;
  absent: number;
  cnicVerified: number;
  /** attendance numerator/denominator under the programme's own rule */
  attNum: number;
  attDen: number;
  attendanceRate: number | null;
  presenceRate: number | null;
  verificationRate: number | null;
  dropoutRate: number | null;
  utilizationRate: number | null;
  attendanceReported: number | null;
  scored: boolean;
  components: Record<string, number>;
  /** 0–1 share of each shared category's maximum under this programme's rubric */
  categoryPct: Record<CategoryKey, number | null>;
  tradeScore: number | null;
  tradeScoreStored: number | null;
  extra: Record<string, string | number>;
}

export interface Institute {
  p: string;
  instituteKey: string;
  globalKey: string;
  instituteId: number | null;
  instituteName: string;
  region: string;
  district: string;
  division: string | null;
  package: string | null;
  assessments: number;
  trades: string[];
  approvedCapacity: number;
  enrolled: number;
  droppedOut: number;
  present: number;
  absent: number;
  cnicVerified: number;
  attNum: number;
  attDen: number;
  attendanceRate: number | null;
  presenceRate: number | null;
  verificationRate: number | null;
  dropoutRate: number | null;
  utilizationRate: number | null;
  score: number | null;
  scoreStored: number | null;
  grade: string;
  gradeReported: string | null;
  gradeOverride: string | null;
  assessorNote: string | null;
  status: "Active" | "Fake" | "Critical" | "Non-Functional" | "Closed";
  flagged: boolean;
  categoryScores: Record<CategoryKey, number | null>;
  categoryPct: Record<CategoryKey, number | null>;
  components: Record<string, number | null>;
  visitDate: string | null;
  rank: number;
}

export interface Portfolio {
  meta: {
    generatedAt: string;
    programCount: number;
    rowCount: number;
    instituteCount: number;
    uniqueInstitutes: number;
    gradeBands: { label: string; min: number }[];
  };
  categories: CategoryDef[];
  programs: Program[];
  tradeNames: Record<string, string>;
  crossProgramIssues: { id: number; names: string[] }[];
  rows: AssessmentRow[];
  institutes: Institute[];
}

export interface FilterState {
  /** globalKey values — the same institute across every programme (max 5) */
  institute: string[];
  program: string[];
  region: string[];
  district: string[];
  package: string[];
  /** tradeNorm values — the same key works across programmes */
  trade: string[];
  batch: number[];
  grade: string[];
  status: string[];
  search: string;
  scoreMin: number | null;
  scoreMax: number | null;
  flaggedOnly: boolean;
}
