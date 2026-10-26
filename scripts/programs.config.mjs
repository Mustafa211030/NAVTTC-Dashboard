/**
 * PROGRAMME REGISTRY
 * ------------------
 * Every NAVTTC programme the dashboard knows about. To add a programme:
 *
 *   1. mkdir data/programs/<slug>/  and drop the workbook in as source.xlsx
 *   2. add an entry to PROGRAMS below (pick or add a rubric in RUBRICS)
 *   3. npm run data
 *
 * Nothing in src/ is edited. Every page, chart, filter and export reads the
 * registry from the generated portfolio file.
 *
 * Each programme is scored on ITS OWN criteria — the rubric, the attendance
 * rule and the grade overrides recorded in its workbook's "Scoring Criteria"
 * sheet. Cross-programme comparison happens only through the six shared
 * CATEGORIES, expressed as a percentage of each category's own maximum.
 */

/** Six analytical categories shared by every rubric. Labels are the cross-programme vocabulary. */
export const CATEGORIES = [
  { key: "biometricAttendance", label: "Attendance & Biometric", short: "Attendance" },
  { key: "infrastructure",      label: "Infrastructure & Equipment", short: "Infrastructure" },
  { key: "trainer",             label: "Trainer Quality", short: "Trainer" },
  { key: "delivery",            label: "Training Delivery", short: "Delivery" },
  { key: "industry",            label: "Industry Linkage", short: "Industry" },
  { key: "feedback",            label: "Feedback & Impression", short: "Feedback" },
];

/**
 * Rubrics. `match` is tested against the normalised column header (newlines
 * and repeated spaces collapsed). Columns are located by header, not by
 * position, so a programme whose sheet orders its criteria differently still
 * ingests correctly. `cat` assigns each component to a shared category.
 */
export const RUBRICS = {
  /** PMYSDP Batch III — the original 16-component template. Attendance worth 35. */
  "b3-16": {
    label: "16-component template (Attendance 35)",
    components: [
      { key: "biometric",       label: "Biometric Registration", max: 10,  cat: "biometricAttendance", match: /^All PMS Students Registered/i },
      { key: "attendance",      label: "Attendance",             max: 35,  cat: "biometricAttendance", match: /^Attendance Score/i },
      { key: "cctv",            label: "CCTV",                   max: 5,   cat: "infrastructure",      match: /^CCTV/i },
      { key: "trainerPms",      label: "Trainer on PMS Portal",  max: 2.5, cat: "trainer",             match: /^Trainer Registered on PMS/i },
      { key: "trainerDegree",   label: "Trainer Degree",         max: 2.5, cat: "trainer",             match: /^Trainer Relevant Degree/i },
      { key: "trainerExp",      label: "Trainer Experience",     max: 5,   cat: "trainer",             match: /^Trainer Relevant Experience/i },
      { key: "tools",           label: "Tools & Equipment",      max: 5,   cat: "infrastructure",      match: /^Tools & Equipments/i },
      { key: "consumables",     label: "Consumables",            max: 5,   cat: "infrastructure",      match: /^Consumable Items/i },
      { key: "portfolio",       label: "Student Portfolio",      max: 7.5, cat: "delivery",            match: /^Student Portfolio/i },
      { key: "tlmImpl",         label: "TLMs Implemented",       max: 5,   cat: "delivery",            match: /^TLMs Implemented/i },
      { key: "tlmProv",         label: "TLMs Provision",         max: 2.5, cat: "delivery",            match: /^TLMs Full Provision/i },
      { key: "assessment",      label: "Assessment",             max: 2.5, cat: "delivery",            match: /^Assessment/i },
      { key: "indLinkage",      label: "Industrial Linkages",    max: 3.5, cat: "industry",            match: /^Industrial Linkages/i },
      { key: "jobFair",         label: "Job Fair / Engagement",  max: 3.5, cat: "industry",            match: /^Job Fair/i },
      { key: "ojt",             label: "On-Job Training",        max: 3,   cat: "industry",            match: /^OJT/i },
      { key: "studentFeedback", label: "Student Feedback",       max: 2.5, cat: "feedback",            match: /^Students Feedback/i },
    ],
  },

  /** PMYSDP Batch II and the cluster programmes — 15 criteria, Attendance worth 50. */
  "std-15": {
    label: "15-criteria template (Attendance 50)",
    components: [
      { key: "biometric",       label: "Biometric Registration",   max: 10,  cat: "biometricAttendance", match: /^All PMS Students Registered/i },
      { key: "attendance",      label: "Attendance",               max: 50,  cat: "biometricAttendance", match: /^Attendance Score/i },
      { key: "trainerPms",      label: "Trainer on PMS Portal",    max: 5,   cat: "trainer",             match: /^Trainer Registered on PMS/i },
      { key: "trainerDegree",   label: "Trainer Degree",           max: 5,   cat: "trainer",             match: /^Trainer Relevant Degree/i },
      { key: "trainerExp",      label: "Trainer Experience",       max: 5,   cat: "trainer",             match: /^Trainer Relevant Experience/i },
      { key: "tools",           label: "Tools & Equipment",        max: 2.5, cat: "infrastructure",      match: /^Tools & Equipments/i },
      { key: "consumables",     label: "Consumables",              max: 2.5, cat: "infrastructure",      match: /^Consumable Items/i },
      { key: "tlm",             label: "TLMs Provision",           max: 2.5, cat: "delivery",            match: /^TLMs/i },
      { key: "assessment",      label: "Assessment",               max: 2.5, cat: "delivery",            match: /^Assessment/i },
      { key: "biometricDevice", label: "Biometric Device",         max: 2.5, cat: "infrastructure",      match: /^Biometric Installed/i },
      { key: "cctv",            label: "CCTV",                     max: 2.5, cat: "infrastructure",      match: /^CCTV/i },
      { key: "indLinkage",      label: "Industrial Linkages",      max: 2.5, cat: "industry",            match: /^Industrial Linkages/i },
      { key: "jobFair",         label: "Job Fair / Engagement",    max: 2.5, cat: "industry",            match: /^Job Fair/i },
      { key: "ojt",             label: "On-Job Training",          max: 2.5, cat: "industry",            match: /^OJT/i },
      { key: "studentFeedback", label: "Student Feedback",         max: 2.5, cat: "feedback",            match: /^Students Feedback/i },
    ],
  },

  /** PMYSDP Batch I — a different 10-question monitoring checklist plus Attendance (50). */
  "checklist-11": {
    label: "11-criteria checklist (Attendance 50)",
    components: [
      { key: "attendance",      label: "Attendance",                max: 50,  cat: "biometricAttendance", match: /^Attendance Score/i },
      { key: "signBoard",       label: "Programme Sign Board",      max: 2.5, cat: "infrastructure",      match: /^NAVTTC Program Information/i },
      { key: "biometricSync",   label: "Biometric Synced with PMS", max: 10,  cat: "biometricAttendance", match: /^Biometric Device synchronized/i },
      { key: "cctv",            label: "CCTV with IP Link",         max: 5,   cat: "infrastructure",      match: /^CCTV installed/i },
      { key: "enrolmentPms",    label: "Enrolment as per PMS",      max: 5,   cat: "biometricAttendance", match: /^Trainees Enrolment as per/i },
      { key: "labs",            label: "Equipped Labs / Workshops", max: 5,   cat: "infrastructure",      match: /^Well-equipped/i },
      { key: "tlm",             label: "NAVTTC TLMs Provided",      max: 5,   cat: "delivery",            match: /^NAVTTC TLMs provided/i },
      { key: "lessonPlans",     label: "Lesson Plans",              max: 2.5, cat: "delivery",            match: /^Weekly \/ Monthly Lesson Plans/i },
      { key: "courseContent",   label: "Trainees Versed in Content", max: 5,  cat: "delivery",            match: /^Trainees well versed/i },
      { key: "consumables",     label: "Consumables",               max: 5,   cat: "infrastructure",      match: /^Consumables \/ Training Material/i },
      { key: "impression",      label: "Overall Impression",        max: 5,   cat: "feedback",            match: /^Overall Impression/i },
    ],
  },
};

/* ------------------------------------------------------------------ *
 * Programme-wise VTT report rubrics (merged "Batch Wise Report" sheet).
 *
 * That report carries nine summary columns per trade instead of the
 * criterion-level template, plus the VTT score and the NAVTTC penalty score.
 * Two scoring patterns occur in it; the maxima below are the ones the data
 * and the VTT totals imply (no Scoring Criteria sheet ships with the file):
 *
 *  vtt-pmysdp   PMYSDP B-III family, BIITT, Hospitality & Tourism.
 *               The "Attendance" column is 5 points above the attendance
 *               share inside the VTT score on most rows, so attendance is
 *               taken as VTT − (the other criteria). Max 45, as in the
 *               B-III template (Biometric Registration 10 + Attendance 35).
 *  vtt-special  Skilling Youth of Madrassas, Overseas Employment, She Fixes,
 *               Domestic Worker. The nine columns sum exactly to the VTT score.
 * ------------------------------------------------------------------ */
const VTT_MATCH = {
  attendance: /^Attendance$/i, trainer: /^Trainer$/i, tools: /^Tools & Equipment$/i, tlm: /^Portfolio \/ TLM$/i,
  assessment: /^Assessment$/i, biometricDevice: /^Biometric Device$/i, cctv: /^CCTV$/i, indLinkage: /^Industrial Linkages$/i,
  studentFeedback: /^Student Feedback$/i,
};
RUBRICS["vtt-pmysdp"] = {
  label: "VTT summary — PMYSDP pattern (Attendance 45)",
  attendanceFromTotal: true,
  components: [
    { key: "attendance",      label: "Attendance & Biometric", max: 45,  cat: "biometricAttendance", match: VTT_MATCH.attendance },
    { key: "trainer",         label: "Trainer",                max: 10,  cat: "trainer",             match: VTT_MATCH.trainer },
    { key: "tools",           label: "Tools & Equipment",      max: 10,  cat: "infrastructure",      match: VTT_MATCH.tools },
    { key: "tlm",             label: "Portfolio / TLM",        max: 15,  cat: "delivery",            match: VTT_MATCH.tlm },
    { key: "assessment",      label: "Assessment",             max: 2.5, cat: "delivery",            match: VTT_MATCH.assessment },
    { key: "cctv",            label: "CCTV",                   max: 5,   cat: "infrastructure",      match: VTT_MATCH.cctv },
    { key: "indLinkage",      label: "Industrial Linkages",    max: 10,  cat: "industry",            match: VTT_MATCH.indLinkage },
    { key: "studentFeedback", label: "Student Feedback",       max: 2.5, cat: "feedback",            match: VTT_MATCH.studentFeedback },
  ],
};
RUBRICS["vtt-special"] = {
  label: "VTT summary — special initiatives (Attendance 60)",
  components: [
    { key: "attendance",      label: "Attendance",             max: 60,  cat: "biometricAttendance", match: VTT_MATCH.attendance },
    { key: "trainer",         label: "Trainer",                max: 15,  cat: "trainer",             match: VTT_MATCH.trainer },
    { key: "tools",           label: "Tools & Equipment",      max: 5,   cat: "infrastructure",      match: VTT_MATCH.tools },
    { key: "tlm",             label: "Portfolio / TLM",        max: 2.5, cat: "delivery",            match: VTT_MATCH.tlm },
    { key: "assessment",      label: "Assessment",             max: 2.5, cat: "delivery",            match: VTT_MATCH.assessment },
    { key: "biometricDevice", label: "Biometric Device",       max: 2.5, cat: "infrastructure",      match: VTT_MATCH.biometricDevice },
    { key: "cctv",            label: "CCTV",                   max: 2.5, cat: "infrastructure",      match: VTT_MATCH.cctv },
    { key: "indLinkage",      label: "Industrial Linkages",    max: 7.5, cat: "industry",            match: VTT_MATCH.indLinkage },
    { key: "studentFeedback", label: "Student Feedback",       max: 2.5, cat: "feedback",            match: VTT_MATCH.studentFeedback },
  ],
};

/**
 * Multi-programme source workbooks. One sheet holds several programmes,
 * told apart by the Package column; each programme below names its package.
 */
export const MERGED_SOURCES = {
  "vtt-2026-10-19": {
    file: "data/sources/merged-program-report-2026-10-19.xlsx",
    label: "Updated - 19102026-Merged_Program_Wise_Report.xlsx",
    sheet: "Batch Wise Report",
    reportDate: "2026-10-19",
  },
};

/**
 * Attendance rules. Each programme states its own in the Scoring Criteria sheet;
 * the Attendance Score band is computed on exactly this ratio.
 */
export const ATTENDANCE_RULES = {
  "cnic/approved":  { num: "cnicVerified", den: "approvedCapacity", label: "CNIC Verified ÷ Approved Capacity" },
  "present/approved": { num: "present",    den: "approvedCapacity", label: "Present ÷ Approved Capacity" },
  "cnic/enrolled":  { num: "cnicVerified", den: "enrolled",         label: "CNIC Verified ÷ Enrolled" },
};

/**
 * The programmes. `order` is chronological where dates are known.
 * `family` groups programmes in the sidebar and on the portfolio page.
 * `color` is the programme's identity colour, used identically on every chart.
 */
export const PROGRAMS = [
  {
    slug: "pmysdp-b1", order: 1, family: "PMYSDP",
    name: "PMYSDP Batch I", short: "PMYSDP B-I", code: "B-I", badge: "B1",
    fullName: "Prime Minister's Youth Skills Development Programme — Batch I",
    rubric: "checklist-11", attendance: "present/approved",
    assessmentDate: null, // derived from Date of Visit
    color: "#0ea5e9",
    sourceLabel: "PMYSDP B1 198 Institutes.xlsx",
  },
  {
    slug: "pmysdp-b2", order: 2, family: "PMYSDP",
    name: "PMYSDP Batch II", short: "PMYSDP B-II", code: "B-II", badge: "B2",
    fullName: "Prime Minister's Youth Skills Development Programme — Batch II",
    rubric: "std-15", attendance: "cnic/approved",
    assessmentDate: null,
    color: "#6366f1",
    sourceLabel: "PMYSDP B2 263 Institutes.xlsx",
  },
  {
    slug: "pmysdp-b3", order: 3, family: "PMYSDP",
    name: "PMYSDP Batch III", short: "PMYSDP B-III", code: "B-III", badge: "B3",
    fullName: "Prime Minister's Youth Skills Development Programme — Batch III",
    rubric: "b3-16", attendance: "cnic/approved",
    assessmentDate: "2026-05-24",
    color: "#10b981",
    sourceLabel: "NAVTTC_-_PMYSDP_Updated_File.xlsx",
    // The 19 Oct 2026 programme-wise report re-scores these same rows and adds
    // NAVTTC penalties. The 16-criterion detail stays from this workbook; the
    // VTT score, penalty and final NAVTTC score come from the report.
    penalties: { source: "vtt-2026-10-19", package: "PMYSDP Batch III" },
    // B3 predates the Grade Override convention: the Grading cell carries the
    // grade plus free-text assessor commentary on following lines.
    gradingCarriesNotes: true,
  },
  {
    slug: "cbtp-b1", order: 4, family: "Cluster Based",
    name: "Cluster Based Training Programme Batch I", short: "CBTP B-I", code: "CBTP-I", badge: "CT1",
    fullName: "Cluster Based Training Programme — Batch I (Punjab)",
    rubric: "std-15", attendance: "cnic/enrolled",
    assessmentDate: null,
    color: "#f59e0b",
    sourceLabel: "Cluster Based Training Program B1.xlsx",
  },
  {
    slug: "cbi-b2", order: 5, family: "Cluster Based",
    name: "Cluster Based Initiative Batch II", short: "CBI B-II", code: "CBI-II", badge: "CB2",
    fullName: "NAVTTC Cluster Based Initiative (CBI) — Batch II",
    rubric: "std-15", attendance: "cnic/enrolled",
    assessmentDate: null,
    color: "#ec4899",
    sourceLabel: "NAVTTC CBI B2 26 Institutes.xlsx",
  },
  {
    slug: "nsis-b2", order: 6, family: "Cluster Based",
    name: "NSIS Industrial Cluster Batch II", short: "NSIS B-II", code: "NSIS-II", badge: "NS2",
    fullName: "NSIS Industrial Cluster — Batch II (AJK)",
    rubric: "std-15", attendance: "cnic/enrolled",
    assessmentDate: null,
    color: "#8b5cf6",
    sourceLabel: "NSIS Industrial Cluster Batch-II AJK.xlsx",
  },
  /* ---- from the 19 Oct 2026 programme-wise VTT report ---- */
  {
    slug: "pmysdp-b3-ext", order: 7, family: "PMYSDP",
    name: "PMYSDP Batch III Extension", short: "PMYSDP B-III Ext", code: "B-III Ext", badge: "3X",
    fullName: "Prime Minister's Youth Skills Development Programme — Batch III Extension",
    rubric: "vtt-pmysdp", attendance: "cnic/approved",
    source: "vtt-2026-10-19", package: "PMYSDP Batch III-Ext",
    assessmentDate: null, color: "#0d9488",
  },
  {
    slug: "pmysdp-b3-it", order: 8, family: "PMYSDP",
    name: "PMYSDP Batch III IT Extension", short: "PMYSDP B-III IT", code: "B-III IT", badge: "3IT",
    fullName: "Prime Minister's Youth Skills Development Programme — Batch III IT Extension",
    rubric: "vtt-pmysdp", attendance: "cnic/approved",
    source: "vtt-2026-10-19", package: "PMYSDP Batch III- IT Ext",
    assessmentDate: null, color: "#65a30d",
  },
  {
    slug: "madrassas-b3", order: 9, family: "Special Initiatives",
    name: "Skilling Youth of Madrassas Batch III", short: "Madrassas B-III", code: "SYM-III", badge: "SM3",
    fullName: "Skilling Youth of Madrassas — Batch III",
    rubric: "vtt-special", attendance: "cnic/approved",
    source: "vtt-2026-10-19", package: "Skilling Youth of Madrassas Batch-III",
    assessmentDate: null, color: "#c026d3",
  },
  {
    slug: "she-fixes-b2", order: 10, family: "Special Initiatives",
    name: "She Fixes Batch II", short: "She Fixes B-II", code: "SF-II", badge: "SF2",
    fullName: "She Fixes — Batch II",
    rubric: "vtt-special", attendance: "cnic/approved",
    source: "vtt-2026-10-19", package: "She Fixes - Batch II",
    assessmentDate: null, color: "#be123c",
  },
  {
    slug: "overseas-b4", order: 11, family: "Special Initiatives",
    name: "Overseas Employment Batch IV", short: "Overseas B-IV", code: "OE-IV", badge: "OE4",
    fullName: "Overseas Employment — Batch IV",
    rubric: "vtt-special", attendance: "cnic/approved",
    source: "vtt-2026-10-19", package: "Overseas employment Batch IV",
    assessmentDate: null, color: "#0891b2",
  },
  {
    slug: "hospitality-b2-ext", order: 12, family: "Special Initiatives",
    name: "Hospitality & Tourism Batch II Extension", short: "H&T B-II Ext", code: "HT-II Ext", badge: "HT2",
    fullName: "Hospitality & Tourism — Batch II (2025) Extension",
    rubric: "vtt-pmysdp", attendance: "cnic/approved",
    source: "vtt-2026-10-19", package: "Hospitality & Tourism Batch II (2025) - Ext",
    assessmentDate: null, color: "#ca8a04",
  },
  {
    slug: "domestic-worker", order: 13, family: "Special Initiatives",
    name: "Domestic Worker Skill Development Programme", short: "Domestic Worker", code: "DWSDP", badge: "DW",
    fullName: "Domestic Worker Skill Development Programme",
    rubric: "vtt-special", attendance: "cnic/approved",
    source: "vtt-2026-10-19", package: "Domestic Worker Skill Development Programme",
    assessmentDate: null, color: "#78716c",
  },
  {
    slug: "biitt-2026", order: 14, family: "Special Initiatives",
    name: "Blended International IT Trainings 2026", short: "BIITT 2026", code: "BIITT", badge: "BI",
    fullName: "Blended International IT Trainings 2026 (BIITT 2026)",
    rubric: "vtt-pmysdp", attendance: "cnic/approved",
    source: "vtt-2026-10-19", package: "Blended International IT Trainings 2026 (BIITT 2026)",
    assessmentDate: null, color: "#2563eb",
  },
];

/** Grade bands — identical in every programme's Scoring Criteria sheet. Half-open intervals. */
export const GRADE_BANDS = [
  { label: "Excellent", min: 80 },
  { label: "Very Good", min: 70 },
  { label: "Good",      min: 60 },
  { label: "Average",   min: 50 },
  { label: "Poor",      min: -Infinity },
];

/** Workbook spelling variants of the same district. Keys are lower-case. */
export const DISTRICT_ALIASES = {
  diamir: "Diamer",
  "rajanpur": "Rajan Pur",
  "d.g khan": "Dera Ghazi Khan",
  "dg khan": "Dera Ghazi Khan",
  "rahim yar khan": "Rahimyar Khan",
};

/**
 * Trade spellings that name the same trade. Keys are the normalised spelling
 * (lower case, letters and digits only); values are the display name every
 * programme then shares. Only spelling, abbreviation, word-order and
 * truncation variants are listed — trades with a different scope
 * (e.g. "Cyber Security (CEH)" vs "(CEH, CHFI)") stay separate.
 */
export const TRADE_ALIASES = {
  fiberoptictechniciani: "Fiber Optic Technician",
  fiberoptictechnicianii: "Fiber Optic Technician",
  cloudcomuputingaws: "Cloud Computing - AWS",
  cloudcomuputingmicrosoftazure: "Cloud Computing - Microsoft",
  bakeryandpasterymaking: "Bakery & Pastry Making",
  bakeryandpastrymaking: "Bakery & Pastry Making",
  veterniarypoultaryanddairyassistants: "Veterinary, Poultry & Dairy Assistants",
  veterniarypoultaryandanddairyassistants: "Veterinary, Poultry & Dairy Assistants",
  manualjewellerydesigner: "Manual Jewelry Designer",
  tunnelfarmingand: "Tunnel Farming",
  appliedgisgeographicinfromationsystem: "Applied GIS (Geographic Information System)",
  driverhtv: "HTV Driver",
  generalelectricianii: "General Electrician",
  advancesurveycivilquantity: "Advance Survey (Civil Quantity) Techniques",
  textiledesigningwithcad: "Textile Designing with CAD/CAM",
  honeybeefarmmanager: "Honey Bee Farm Manager / Bee Farming",
  dairyfarmmanager: "Dairy Farm Manager and Dairy Business",
  dairyfarmmanageranddairybusiness: "Dairy Farm Manager and Dairy Business",
  advancepythonprogramming: "Advance Python Programming & Applications",
  fullstack: "Full Stack Development",
  travelandtourism: "Travel and Tourism Manager Program",
  baristaskills: "Barista Skills (Fast Food)",
  advancedwelding: "Advanced Welding [SMAW & GTAW (6G & 6GR)]",
  earlychildhoodeducationwithcertification: "Early Childhood Education",
  industrialstitching: "Industrial Stitching Machine Operator",
  chineselanguage: "Chinese Language (HSK 1& 2)",
  heavymachineryoperator: "Heavy Machinery Operator (including Bulldozer, Loader, Crane, Dozzier, Grader, Excavator etc)",
  ecommerceamazonebayalibabadarazetc: "eCommerce",
  networkadministratorcisco: "Network Administrator (CISCO, HUAWEI, IBM)",
};

/**
 * Institutes recorded without an ID (CBI Batch II) that are the same
 * institute as an ID'd one elsewhere, spelled differently. Key: normalised
 * name. Value: the Institute ID they belong to.
 */
export const INSTITUTE_LINKS = {
  gvttcskardu: 556,                       // = Govt. Vocational and Technical Training Center (GVTTC) Skardu
  sakeenaitandtevtsectorinstitute: 10807, // = SAKEENA IT & TVET SECTOR INSTITUTE, Muzaffarabad
  skilldevelopmentcenter: 30432,          // = Skill Development Center Rawalakot (same district)
};

/** Display-name corrections for obvious typos the workbooks agree on. Key: Institute ID. */
export const INSTITUTE_NAME_FIXES = {
  10383: "Adan Institute of Technology (Islamabad Campus)", // workbooks: "Adan institute of technology(Islambad campus)"
};
