export interface ComponentDef { key: string; max: number; label: string }
export interface CategoryDef { key: string; label: string; max: number; members: string[] }

export interface AssessmentRow {
  id: string;
  excelRow: number;
  package: string | null;
  programName: string | null;
  region: string;
  district: string;
  instituteId: number;
  instituteName: string;
  tradeName: string;
  tradeNameRaw: string;
  tradeCode: number;
  instituteTradeCode: number | null;
  batch: number | null;
  batchRaw: string | null;
  approvedCapacity: number;
  biometricRegistered: number;
  droppedOut: number;
  present: number;
  absent: number;
  cnicVerified: number;
  verificationRateReported: number | null;
  /** CNIC Verified / Approved Capacity — the official attendance basis. */
  attendanceRate: number | null;
  /** Present / Registered — physical presence, reported separately. */
  presenceRate: number | null;
  dropoutRate: number | null;
  utilizationRate: number | null;
  components: Record<string, number>;
  categoryScores: Record<string, number>;
  tradeScore: number;
  tradeScoreStored: number | null;
}

export interface Institute {
  instituteId: number;
  instituteName: string;
  region: string;
  district: string;
  package: string | null;
  assessments: number;
  trades: string[];
  tradeCodes: number[];
  approvedCapacity: number;
  biometricRegistered: number;
  droppedOut: number;
  present: number;
  absent: number;
  cnicVerified: number;
  attendanceRate: number | null;
  presenceRate: number | null;
  dropoutRate: number | null;
  utilizationRate: number | null;
  score: number;
  scoreStored: number | null;
  gradeReported: string | null;
  assessorNote: string | null;
  categoryScores: Record<string, number>;
  components: Record<string, number>;
  rank: number;
}

export interface QualityIssue {
  severity: "high" | "medium" | "low";
  code: string;
  message: string;
  row: number | null;
  detail: string | null;
}

export interface Repair { row: number; field: string; from: string; to: number; reason: string }

export interface Dataset {
  meta: {
    generatedAt: string; sourceFile: string; sheet: string; assessmentDate: string;
    program: string; rowCount: number; instituteCount: number; columnCount: number;
    headers: string[]; hasTimeDimension: boolean; hasDemographics: boolean;
  };
  components: ComponentDef[];
  categories: CategoryDef[];
  dimensions: {
    regions: string[]; districts: string[]; packages: string[]; batches: number[];
    grades: string[]; trades: { code: number; name: string }[];
    regionDistricts: Record<string, string[]>;
  };
  rows: AssessmentRow[];
  institutes: Institute[];
  quality: {
    totals: { rows: number; institutes: number; cells: number; filledCells: number; completeness: number; issues: number; repairs: number };
    bySeverity: Record<string, number>;
    byCode: Record<string, number>;
    repairs: Repair[];
    issues: QualityIssue[];
  };
}

export interface FilterState {
  region: string[];
  district: string[];
  package: string[];
  trade: number[];
  batch: number[];
  grade: string[];
  search: string;
  scoreMin: number | null;
  scoreMax: number | null;
}
