// Shared domain types used by both the Electron main process (repositories,
// IPC handlers) and the React renderer. Column names mirror the SQLite
// schema (see src/db/migrations/0001_initial_schema.sql) which in turn
// mirrors the cloud Django field names — see README.md.

import type { UserRoleValue } from './roles';

export type Gender = 'male' | 'female' | 'other';
export type StudentStatus = 'active' | 'inactive' | 'graduated' | 'transferred' | 'dismissed';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type PromotionStatus = 'pending' | 'promoted' | 'repeated' | 'graduated' | 'dismissed';
export type TransactionType = 'payment' | 'refund' | 'adjustment' | 'expense';

export interface School {
  id: string;
  name: string;
  short_name: string;
  principal: string;
  motto: string;
  location: string;
  division: string;
  sub_division: string;
  city_village: string;
  address: string;
  postal_code: string | null;
  academic_year: string;
  active_term: string;
  locale: string;
  subscription_currency: string;
  setup_completed: number;
  created_at: string;
  updated_at: string;
}

export interface Teacher {
  id: string;
  school_id: string;
  teacher_number: string;
  first_name: string;
  last_name: string;
  gender: Gender;
  phone: string;
  email: string;
  date_of_joining: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface SchoolClass {
  id: string;
  school_id: string;
  name: string;
  cycle: string;
  display_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ClassStream {
  id: string;
  class_id: string;
  name: string;
  academic_year: string;
  class_teacher_id: string | null;
  capacity: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  school_id: string;
  class_stream_id: string | null;
  admission_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  place_of_birth: string;
  gender: Gender;
  guardian_name: string;
  guardian_phone: string;
  guardian_whatsapp: string | null;
  admission_date: string | null;
  annual_average: number | null;
  is_on_honour_roll: number;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

export interface StudentPromotion {
  id: string;
  student_id: string;
  academic_year: string;
  from_class_stream_id: string | null;
  to_class_stream_id: string | null;
  average_score: number | null;
  status: PromotionStatus;
  remarks: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  school_id: string;
  name: string;
  code: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ClassSubjectTeacher {
  id: string;
  class_stream_id: string;
  subject_id: string;
  teacher_id: string | null;
  academic_year: string;
  coefficient: number;
  is_compulsory: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  class_stream_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  term: string;
  academic_year: string;
  recorded_by: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CatMark {
  id: string;
  student_id: string;
  subject_id: string;
  class_stream_id: string;
  term: string;
  academic_year: string;
  cat_number: number;
  score: number;
  max_score: number;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamMark {
  id: string;
  student_id: string;
  subject_id: string;
  class_stream_id: string;
  term: string;
  academic_year: string;
  score: number;
  max_score: number;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportCardSubjectLine {
  subject_id: string;
  subject_name: string;
  coefficient: number;
  cat_average: number | null;
  exam_score: number | null;
  subject_average: number | null;
  weighted_score: number | null;
}

export interface ReportCard {
  id: string;
  student_id: string;
  class_stream_id: string;
  term: string;
  academic_year: string;
  total_score: number;
  total_coefficient: number;
  average_score: number;
  grade_range: string;
  class_rank: number | null;
  class_size: number | null;
  promotional_eligible: number;
  subjects_snapshot_json: string;
  pdf_path: string | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface FeeTemplate {
  id: string;
  school_id: string;
  class_id: string | null;
  name: string;
  term: string;
  academic_year: string;
  amount: number;
  currency: string;
  due_date: string | null;
  is_mandatory: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  school_id: string;
  student_id: string;
  fee_template_id: string | null;
  amount: number;
  currency: string;
  payment_method: string;
  reference_number: string;
  receipt_number: string;
  payment_date: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransaction {
  id: string;
  school_id: string;
  transaction_type: TransactionType;
  reference_id: string | null;
  amount: number;
  currency: string;
  description: string;
  transaction_date: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Phase A additions: staff auth, the configurable structure tree, notices.
// See src/db/migrations/0003_users_structure_notices.sql.
// ---------------------------------------------------------------------------

export type UserStatus = 'active' | 'disabled';

/** Row shape as stored — includes password_hash. Never send this type across IPC to the renderer. */
export interface UserRow {
  id: string;
  school_id: string;
  teacher_id: string | null;
  matricule: string | null;
  full_name: string;
  email_or_username: string;
  password_hash: string;
  role: UserRoleValue;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

/** Safe-to-expose shape (no password_hash) — what every IPC handler returns to the renderer. */
export type PublicUser = Omit<UserRow, 'password_hash'>;

export interface StructureNode {
  id: string;
  school_id: string;
  parent_id: string | null;
  node_type: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface StructureNodeTree extends StructureNode {
  children: StructureNodeTree[];
}

export interface Notice {
  id: string;
  school_id: string;
  title: string;
  body: string;
  published_by: string | null;
  is_published: number;
  created_at: string;
  updated_at: string;
}
