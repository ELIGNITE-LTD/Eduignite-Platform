// Shape of the IPC surface bridged into the renderer as `window.api` by
// electron/preload.ts. Kept as a type-only module (no Node/Electron imports)
// so it can be imported from renderer code, preload code, and the main
// process alike without pulling platform-specific globals into any of them.
//
// Naming convention: one property per functional module (spec section 3),
// each method backed by exactly one `ipcMain.handle('<namespace>:<action>', ...)`
// registered in src/ipc/handlers.ts. Keep this file and handlers.ts in sync.

import type {
  AttendanceRecord,
  AttendanceStatus,
  CatMark,
  ClassStream,
  ClassSubjectTeacher,
  ExamMark,
  FeeTemplate,
  FinancialTransaction,
  Notice,
  Payment,
  PublicUser,
  ReportCard,
  School,
  SchoolClass,
  Student,
  StudentPromotion,
  StructureNode,
  StructureNodeTree,
  Subject,
  Teacher,
} from './types';
import type { AttendanceRateReportRow } from '../domain/attendance';
import type { CollectionsReportRow, StudentBalance } from '../domain/finance';
import type { TermResult } from '../domain/grading';
import type { ClassSubjectAssignmentRow } from '../repositories/subjectRepository';
import type { StructureNodeInput } from '../repositories/structureRepository';
import type { NoticeInput } from '../repositories/noticeRepository';
import type { LicenseGateResult } from '../licensing/gate';
import type { ChallengePurpose, LicenseChallenge } from '../licensing/types';
import type { SyncRunResult } from '../sync/syncClient';
import type { SessionUser } from '../auth/session';
import type { PingResult, SchoolSearchResponse, SchoolSearchResult } from '../setup/setupClient';
import type { CreateFirstAdminInput } from '../setup/setupService';
import type { RecoveryQuestionResult } from '../repositories/userRepository';
import type { SampleDataSummary } from '../setup/sampleDataService';
import type { UserRoleValue } from './roles';

export interface SchoolApi {
  get(): Promise<School | null>;
  // `setup_completed` is excluded -- see schoolRepository.ts's SchoolInput
  // comment; it's flipped only by setup:completeSetup, never by this form.
  upsert(input: Omit<School, 'id' | 'created_at' | 'updated_at' | 'setup_completed'>): Promise<School>;
}

export interface TeachersApi {
  list(schoolId: string): Promise<Teacher[]>;
  create(input: Omit<Teacher, 'id' | 'is_active' | 'created_at' | 'updated_at'>): Promise<Teacher>;
  update(id: string, input: Partial<Omit<Teacher, 'id' | 'is_active' | 'created_at' | 'updated_at'>>): Promise<Teacher>;
  setActive(id: string, isActive: boolean): Promise<Teacher>;
}

export interface ClassesApi {
  list(schoolId: string): Promise<SchoolClass[]>;
  create(input: Omit<SchoolClass, 'id' | 'is_active' | 'created_at' | 'updated_at'>): Promise<SchoolClass>;
  listStreams(classId?: string): Promise<ClassStream[]>;
  createStream(input: Omit<ClassStream, 'id' | 'is_active' | 'created_at' | 'updated_at'>): Promise<ClassStream>;
  updateStream(
    id: string,
    input: Partial<Omit<ClassStream, 'id' | 'is_active' | 'created_at' | 'updated_at'>>
  ): Promise<ClassStream>;
  countEnrollment(classStreamId: string): Promise<number>;
}

export interface SubjectsApi {
  list(schoolId: string): Promise<Subject[]>;
  create(input: Omit<Subject, 'id' | 'is_active' | 'created_at' | 'updated_at'>): Promise<Subject>;
  listForStream(classStreamId: string, academicYear: string): Promise<ClassSubjectAssignmentRow[]>;
  assign(
    input: Omit<ClassSubjectTeacher, 'id' | 'is_active' | 'created_at' | 'updated_at'>
  ): Promise<ClassSubjectTeacher>;
  updateAssignment(
    id: string,
    input: Partial<Pick<ClassSubjectTeacher, 'teacher_id' | 'coefficient' | 'is_compulsory'>>
  ): Promise<ClassSubjectTeacher>;
}

export interface StudentsApi {
  list(filters: {
    schoolId: string;
    classStreamId?: string;
    status?: Student['status'];
    search?: string;
  }): Promise<Student[]>;
  get(id: string): Promise<Student | null>;
  create(
    input: Omit<
      Student,
      'id' | 'annual_average' | 'is_on_honour_roll' | 'status' | 'created_at' | 'updated_at'
    > & { status?: Student['status'] }
  ): Promise<Student>;
  update(id: string, input: Record<string, unknown>): Promise<Student>;
  listPromotions(studentId: string): Promise<StudentPromotion[]>;
  promoteClass(input: {
    fromClassStreamId: string;
    toClassStreamId: string;
    academicYear: string;
    promotionAverage?: number;
  }): Promise<{
    promotedCount: number;
    repeatedCount: number;
    total: number;
    decisions: { studentId: string; outcome: string; averageScore: number | null; reason: string }[];
  }>;
}

export interface AttendanceApi {
  recordDay(input: {
    classStreamId: string;
    attendanceDate: string;
    term: string;
    academicYear: string;
    recordedBy?: string | null;
    entries: { studentId: string; status: AttendanceStatus; notes?: string }[];
  }): Promise<AttendanceRecord[]>;
  history(filters: {
    studentId?: string;
    classStreamId?: string;
    dateFrom?: string;
    dateTo?: string;
    term?: string;
    academicYear?: string;
  }): Promise<AttendanceRecord[]>;
  rateReport(classStreamId: string, term: string, academicYear: string): Promise<AttendanceRateReportRow[]>;
}

export interface AcademicsApi {
  recordCat(input: {
    studentId: string;
    subjectId: string;
    classStreamId: string;
    term: string;
    academicYear: string;
    catNumber: number;
    score: number;
    maxScore?: number;
    recordedBy?: string | null;
  }): Promise<CatMark>;
  recordExam(input: {
    studentId: string;
    subjectId: string;
    classStreamId: string;
    term: string;
    academicYear: string;
    score: number;
    maxScore?: number;
    recordedBy?: string | null;
  }): Promise<ExamMark>;
  listForStudentTerm(
    studentId: string,
    term: string,
    academicYear: string
  ): Promise<{ cats: CatMark[]; exams: ExamMark[] }>;
}

export interface ReportCardsApi {
  compile(input: {
    studentId: string;
    classStreamId: string;
    term: string;
    academicYear: string;
    promotionAverage?: number;
  }): Promise<ReportCard & { result: TermResult }>;
  compileForStream(
    classStreamId: string,
    term: string,
    academicYear: string,
    promotionAverage?: number
  ): Promise<(ReportCard & { result: TermResult })[]>;
  list(filters: {
    studentId?: string;
    classStreamId?: string;
    term?: string;
    academicYear?: string;
  }): Promise<ReportCard[]>;
  get(id: string): Promise<ReportCard | null>;
  exportPdf(id: string): Promise<{ pdfPath: string }>;
}

export interface FinanceApi {
  listFeeTemplates(
    schoolId: string,
    filters?: { classId?: string; term?: string; academicYear?: string }
  ): Promise<FeeTemplate[]>;
  createFeeTemplate(input: Omit<FeeTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<FeeTemplate>;
  recordPayment(input: {
    schoolId: string;
    studentId: string;
    feeTemplateId?: string | null;
    amount: number;
    currency: string;
    paymentMethod: string;
    referenceNumber?: string;
    paymentDate: string;
    notes?: string;
  }): Promise<Payment>;
  listPaymentsForStudent(studentId: string): Promise<Payment[]>;
  getBalance(input: {
    studentId: string;
    classId: string | null;
    term: string;
    academicYear: string;
  }): Promise<StudentBalance>;
  listTransactions(filters: { schoolId: string; dateFrom?: string; dateTo?: string }): Promise<
    FinancialTransaction[]
  >;
  collectionsReport(schoolId: string, term: string, academicYear: string): Promise<CollectionsReportRow[]>;
  exportReceiptPdf(paymentId: string): Promise<{ pdfPath: string }>;
}

export interface LicenseApi {
  check(): Promise<{ status: string; readOnly: boolean; message: string }>;
}

export interface LicensingApi {
  /** Full licensing gate result, re-evaluated fresh on every call (cheap KV reads + one signature check). */
  getStatus(): Promise<LicenseGateResult>;
  /** This machine's computed hardware fingerprint + the currently-configured school id (if any). */
  getDeviceInfo(): Promise<{ deviceId: string; schoolId: string | null }>;
  /** Generates a fresh, short-lived (5 min) QR activation challenge for the given purpose. */
  generateChallenge(purpose: ChallengePurpose, previousDeviceId?: string): Promise<LicenseChallenge>;
  /**
   * Verifies + installs a License Certificate obtained from the companion
   * app's response QR (or the paste-code fallback). `responseJson` is the
   * raw JSON text of `{ certificate: { payload, signature } }`.
   */
  installCertificateResponse(responseJson: string): Promise<LicenseGateResult>;
}

export interface SyncApi {
  /** Drains the local sync_queue against the backend, chunked + resumable. See src/sync/syncClient.ts. */
  run(): Promise<SyncRunResult>;
}

export interface ShellApi {
  /** Opens an http(s) URL in the OS's default browser (never navigates the app window itself). */
  openExternal(url: string): Promise<void>;
}

// In-app auto-update (electron/autoUpdate.ts on the main-process side,
// src/components/AppUpdateDialog.tsx on the renderer side). Distinct from
// LicenseApi/LicensingApi and from src/update/checkForUpdate.ts's
// backend-driven blocked/available check -- this is the electron-updater-
// backed "here's a real installable update" flow.
export interface UpdateAvailablePayload {
  version: string;
  releaseNotes: string | null;
}

export interface UpdateProgressPayload {
  /** 0-100. */
  percent: number;
}

export interface UpdateDownloadedPayload {
  version: string;
}

export interface UpdateErrorPayload {
  /** Already a plain-language, non-technical message -- safe to show as-is. */
  message: string;
}

/** Unsubscribe callback returned by every `update.on*` subscription below. */
export type Unsubscribe = () => void;

export interface UpdateApi {
  /** Starts downloading the update electron-updater already found (only ever called after the user clicks "Update Now"). */
  download(): Promise<void>;
  /** Restarts the app and installs the already-downloaded update. Only meaningful after `onDownloaded` has fired. */
  quitAndInstall(): Promise<void>;
  onAvailable(callback: (payload: UpdateAvailablePayload) => void): Unsubscribe;
  onProgress(callback: (payload: UpdateProgressPayload) => void): Unsubscribe;
  onDownloaded(callback: (payload: UpdateDownloadedPayload) => void): Unsubscribe;
  onError(callback: (payload: UpdateErrorPayload) => void): Unsubscribe;
}

export interface AuthApi {
  /** Throws a generic (anti-enumeration) error on a bad username or password. */
  login(emailOrUsername: string, password: string): Promise<SessionUser>;
  logout(): Promise<void>;
  /** The in-memory main-process session, or null if nobody is logged in. Call on every app startup/reload. */
  currentSession(): Promise<SessionUser | null>;
  /**
   * Step 1 of password recovery — no auth required (this exists precisely
   * for a signed-out user). `available: false` covers both "no such
   * account" and "no security question set" identically, and `question` is
   * a decoy in either case, so this can never be used to enumerate accounts.
   */
  getRecoveryQuestion(emailOrUsername: string): Promise<RecoveryQuestionResult>;
  /**
   * Step 2 — verifies the answer and sets `newPassword` on success. Throws
   * a generic error on a wrong account/answer, or a lockout error after too
   * many failed attempts on that account (see userRepository.ts).
   */
  resetPassword(emailOrUsername: string, securityAnswer: string, newPassword: string): Promise<void>;
}

export interface UsersApi {
  /** Every staff login account at this school (SCHOOL_ADMIN/SUB_ADMIN only). */
  list(schoolId: string): Promise<PublicUser[]>;
  /** Creates an additional staff login (SCHOOL_ADMIN only) — see userRepository.ts's createUser. */
  create(input: {
    school_id: string;
    teacher_id?: string | null;
    full_name: string;
    email_or_username: string;
    password: string;
    role: UserRoleValue;
    security_question?: string;
    security_answer?: string;
  }): Promise<PublicUser>;
  setStatus(id: string, status: 'active' | 'disabled'): Promise<PublicUser>;
}

export interface SampleDataApi {
  /** True if a previous seed's rows are still present. */
  hasSample(): Promise<boolean>;
  /** Populates this school with a small set of real, deletable sample records — see setup/sampleDataService.ts. */
  seed(): Promise<SampleDataSummary>;
  /** Removes every row seed() created, by the same recognisable naming it used to create them. */
  clear(): Promise<void>;
}

export interface SetupApi {
  /** Step 1: confirms the backend is reachable. */
  ping(): Promise<PingResult>;
  /** Step 2: public school search (min 2 chars). */
  searchSchools(query: string): Promise<SchoolSearchResponse>;
  /** Step 2 (confirm): writes the REAL cloud School.id into the local `schools` row. */
  confirmSchool(input: SchoolSearchResult): Promise<School>;
  /** Step 4: creates the installation's first SCHOOL_ADMIN account. */
  createFirstAdmin(input: CreateFirstAdminInput): Promise<PublicUser>;
  /** Step 5: flips `schools.setup_completed`, handing control to the normal auth-gated app. */
  completeSetup(): Promise<School>;
}

export interface StructureApi {
  list(schoolId: string): Promise<StructureNode[]>;
  tree(schoolId: string): Promise<StructureNodeTree[]>;
  create(input: StructureNodeInput): Promise<StructureNode>;
  update(
    id: string,
    input: Partial<Pick<StructureNode, 'node_type' | 'name' | 'sort_order' | 'is_active'>>
  ): Promise<StructureNode>;
  move(id: string, newParentId: string | null): Promise<StructureNode>;
  delete(id: string): Promise<void>;
}

export interface BackupApi {
  /**
   * Prompts for a save location (native dialog), then writes one
   * self-contained backup archive there. `passphrase` protects the bundled
   * encryption key material -- required, at least 8 characters. Resolves
   * `{ canceled: true }` if the admin dismisses the save dialog.
   */
  create(passphrase: string): Promise<
    { canceled: true } | { canceled: false; outputPath: string; schoolName: string; createdAt: string }
  >;
  /**
   * Prompts for a backup file to open (native dialog), validates it
   * completely against `passphrase` before touching anything live, then
   * atomically replaces the local database. Resolves `{ canceled: true }`
   * if the admin dismisses the open dialog; throws a plain-language Error
   * (never a raw exception) if validation fails for any reason.
   */
  restore(passphrase: string): Promise<
    { canceled: true } | { canceled: false; schoolName: string; restoredAt: string }
  >;
}

export interface NoticesApi {
  /** Unauthenticated -- called from the login screen itself. */
  listPublished(schoolId: string): Promise<Notice[]>;
  listAll(schoolId: string): Promise<Notice[]>;
  create(input: NoticeInput): Promise<Notice>;
  setPublished(id: string, isPublished: boolean): Promise<Notice>;
}

export interface EduIgniteApi {
  school: SchoolApi;
  teachers: TeachersApi;
  classes: ClassesApi;
  subjects: SubjectsApi;
  students: StudentsApi;
  attendance: AttendanceApi;
  academics: AcademicsApi;
  reportCards: ReportCardsApi;
  finance: FinanceApi;
  license: LicenseApi;
  licensing: LicensingApi;
  sync: SyncApi;
  shell: ShellApi;
  update: UpdateApi;
  auth: AuthApi;
  setup: SetupApi;
  structure: StructureApi;
  notices: NoticesApi;
  backup: BackupApi;
  users: UsersApi;
  sampleData: SampleDataApi;
}
