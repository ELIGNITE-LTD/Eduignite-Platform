-- EduIgnite Offline — initial schema.
--
-- Column names deliberately mirror the field names used by the cloud Django
-- models (backend/apps/students, backend/apps/fees, backend/apps/academics,
-- backend/apps/schools) so a future migration importer can map rows 1:1
-- without renaming. All primary keys are TEXT (UUID-v4 strings), matching the
-- cloud's UUIDField primary keys — the same id assigned offline is reused as
-- the cloud row id after migration, satisfying "Identifier Integrity".
--
-- See apps/offline-desktop/README.md ("Schema at a glance") for the mapping
-- notes between local tables and cloud tables where they are not 1:1.

-- ---------------------------------------------------------------------------
-- School profile (single-row config table; one school per installation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,                     -- cloud School ID, e.g. SCH-00125
  name TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  principal TEXT NOT NULL DEFAULT '',
  motto TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  division TEXT NOT NULL DEFAULT '',
  sub_division TEXT NOT NULL DEFAULT '',
  city_village TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  postal_code TEXT,
  academic_year TEXT NOT NULL,             -- e.g. '2025-2026'
  active_term TEXT NOT NULL DEFAULT 'TERM_1',
  locale TEXT NOT NULL DEFAULT 'en',
  subscription_currency TEXT NOT NULL DEFAULT 'XAF',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- Teachers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_number TEXT NOT NULL,            -- local analogue of cloud TCH-2026-042
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'other' CHECK (gender IN ('male', 'female', 'other')),
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  date_of_joining TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (school_id, teacher_number)
);
CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);

-- ---------------------------------------------------------------------------
-- Classes & streams
-- classes = academic level (e.g. "Form 5"); class_streams = the enrollable
-- unit within it (e.g. "Form 5 A"). The cloud's schools.SchoolClass row is
-- closest to class_streams (it carries `name` as the full "Form 5 A" label),
-- so the migration importer maps class_streams -> schools.SchoolClass and
-- folds `classes.name` + `class_streams.name` into SchoolClass.name.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                      -- e.g. 'Form 5', 'Grade 10'
  cycle TEXT NOT NULL DEFAULT 'FIRST',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS class_streams (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                      -- stream label, e.g. 'A', 'Blue'
  academic_year TEXT NOT NULL,
  class_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  capacity INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (class_id, name, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_class_streams_class ON class_streams(class_id);
CREATE INDEX IF NOT EXISTS idx_class_streams_teacher ON class_streams(class_teacher_id);

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_stream_id TEXT REFERENCES class_streams(id) ON DELETE SET NULL,
  admission_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  place_of_birth TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'other' CHECK (gender IN ('male', 'female', 'other')),
  guardian_name TEXT NOT NULL DEFAULT '',
  guardian_phone TEXT NOT NULL DEFAULT '',
  guardian_whatsapp TEXT,
  admission_date TEXT,
  annual_average REAL,
  is_on_honour_roll INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated', 'transferred', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (school_id, admission_number)
);
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class_stream ON students(class_stream_id);
CREATE INDEX IF NOT EXISTS idx_students_admission_number ON students(admission_number);

-- ---------------------------------------------------------------------------
-- Student promotion history (mirrors cloud student_promotions / StudentPromotionRecord)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_promotions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  from_class_stream_id TEXT REFERENCES class_streams(id) ON DELETE SET NULL,
  to_class_stream_id TEXT REFERENCES class_streams(id) ON DELETE SET NULL,
  average_score REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'promoted', 'repeated', 'graduated', 'dismissed')),
  remarks TEXT NOT NULL DEFAULT '',
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_student_promotions_student ON student_promotions(student_id);

-- ---------------------------------------------------------------------------
-- Subjects (catalog) + per-class-stream teacher/coefficient mapping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS class_subject_teacher (
  id TEXT PRIMARY KEY,
  class_stream_id TEXT NOT NULL REFERENCES class_streams(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  academic_year TEXT NOT NULL,
  coefficient INTEGER NOT NULL DEFAULT 2,
  is_compulsory INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (class_stream_id, subject_id, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_cst_class_stream ON class_subject_teacher(class_stream_id);
CREATE INDEX IF NOT EXISTS idx_cst_subject ON class_subject_teacher(subject_id);
CREATE INDEX IF NOT EXISTS idx_cst_teacher ON class_subject_teacher(teacher_id);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_records (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_stream_id TEXT NOT NULL REFERENCES class_streams(id) ON DELETE CASCADE,
  attendance_date TEXT NOT NULL,           -- ISO date, 'YYYY-MM-DD'
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'excused')),
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  recorded_by TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_class_stream_date ON attendance_records(class_stream_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id);

-- ---------------------------------------------------------------------------
-- Academic records: CATs (continuous assessments) and exam marks.
-- Both mirror the shape of the cloud's SubjectGrade (score / max_score, /20
-- scale by default) but are kept as two tables per the product spec.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cats (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_stream_id TEXT NOT NULL REFERENCES class_streams(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  cat_number INTEGER NOT NULL DEFAULT 1,
  score REAL NOT NULL,
  max_score REAL NOT NULL DEFAULT 20,
  recorded_by TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (student_id, subject_id, term, academic_year, cat_number)
);
CREATE INDEX IF NOT EXISTS idx_cats_student_term ON cats(student_id, term, academic_year);
CREATE INDEX IF NOT EXISTS idx_cats_subject ON cats(subject_id);

CREATE TABLE IF NOT EXISTS exam_marks (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_stream_id TEXT NOT NULL REFERENCES class_streams(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL DEFAULT 20,
  recorded_by TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (student_id, subject_id, term, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_exam_marks_student_term ON exam_marks(student_id, term, academic_year);
CREATE INDEX IF NOT EXISTS idx_exam_marks_subject ON exam_marks(subject_id);

-- ---------------------------------------------------------------------------
-- Report cards (compiled, immutable snapshot per student per term)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_cards (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_stream_id TEXT NOT NULL REFERENCES class_streams(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  total_score REAL NOT NULL,
  total_coefficient REAL NOT NULL,
  average_score REAL NOT NULL,
  grade_range TEXT NOT NULL,               -- e.g. 'Excellent', 'Good', 'Average', 'Weak'
  class_rank INTEGER,
  class_size INTEGER,
  promotional_eligible INTEGER NOT NULL DEFAULT 0,
  subjects_snapshot_json TEXT NOT NULL,    -- frozen per-subject breakdown used to render the PDF
  pdf_path TEXT,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (student_id, term, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_report_cards_student ON report_cards(student_id);

-- ---------------------------------------------------------------------------
-- Financial management
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_templates (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XAF',
  due_date TEXT,
  is_mandatory INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_fee_templates_class ON fee_templates(class_id, academic_year, term);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_template_id TEXT REFERENCES fee_templates(id) ON DELETE SET NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XAF',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference_number TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  payment_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (school_id, receipt_number)
);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_fee_template ON payments(fee_template_id);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('payment', 'refund', 'adjustment', 'expense')),
  reference_id TEXT,                       -- e.g. payments.id when transaction_type = 'payment'
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XAF',
  description TEXT NOT NULL DEFAULT '',
  transaction_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_school_date ON financial_transactions(school_id, transaction_date);

-- ---------------------------------------------------------------------------
-- Seam tables for later agents (do not implement licensing/sync logic here)
-- ---------------------------------------------------------------------------

-- Licensing agent will read/write rows here (install_date, last_seen_timestamp,
-- status, signed_certificate, device_id, etc.). Simple key/value so the
-- licensing schema can evolve without another migration touching this table.
CREATE TABLE IF NOT EXISTS license_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sync agent will enqueue local writes here for later upload. `op` is one of
-- 'insert' | 'update' | 'delete'; `payload_json` carries the row snapshot.
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_unsynced ON sync_queue(synced_at);
