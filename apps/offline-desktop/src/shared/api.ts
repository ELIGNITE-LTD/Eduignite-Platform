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
  Payment,
  ReportCard,
  School,
  SchoolClass,
  Student,
  StudentPromotion,
  Subject,
  Teacher,
} from './types';
import type { AttendanceRateReportRow } from '../domain/attendance';
import type { CollectionsReportRow, StudentBalance } from '../domain/finance';
import type { TermResult } from '../domain/grading';
import type { ClassSubjectAssignmentRow } from '../repositories/subjectRepository';
import type { LicenseGateResult } from '../licensing/gate';
import type { ChallengePurpose, LicenseChallenge } from '../licensing/types';
import type { SyncRunResult } from '../sync/syncClient';

export interface SchoolApi {
  get(): Promise<School | null>;
  upsert(input: Omit<School, 'id' | 'created_at' | 'updated_at'>): Promise<School>;
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
}
