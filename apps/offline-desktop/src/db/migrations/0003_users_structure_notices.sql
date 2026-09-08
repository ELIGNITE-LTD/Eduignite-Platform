-- EduIgnite Offline v2 — Phase A schema additions: staff auth (`users`),
-- the configurable academic structure tree (`structure_nodes`), the login
-- notice board (`notices`), and the installer wizard's completion flag.
--
-- Additive only — never edit 0001_initial_schema.sql or
-- 0002_finance_report_indexes.sql (see src/db/migrate.ts). Column names
-- again mirror the cloud Django field names where a cloud equivalent exists
-- (backend/apps/users/models.py's UserRole values in particular — reused
-- verbatim below so a future migration importer needs no role-mapping
-- table).

-- ---------------------------------------------------------------------------
-- Setup-completion flag on the single-row `schools` table (0001). This is
-- what gates the installer wizard vs. the normal (now auth-gated) app — see
-- src/App.tsx. Nothing in 0001 already tracks this.
-- ---------------------------------------------------------------------------
ALTER TABLE schools ADD COLUMN setup_completed INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Staff accounts (auth). `teachers` (0001) stays a records-only table (no
-- login) — this is the actual login identity. A TEACHER-role account may
-- optionally link to its `teachers` row via `teacher_id` so the app can scope
-- a teacher's visible data (assigned classes/subjects/attendance/marks) using
-- the existing `class_subject_teacher` / `class_streams.class_teacher_id`
-- assignments — see src/repositories/teacherScopeRepository.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  matricule TEXT,
  full_name TEXT NOT NULL,
  email_or_username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  -- Values are the offline-relevant subset of the cloud's UserRole enum
  -- (backend/apps/users/models.py) — reused verbatim, do not invent new
  -- role names here.
  role TEXT NOT NULL CHECK (role IN ('SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (school_id, email_or_username)
);
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_teacher ON users(teacher_id);

-- ---------------------------------------------------------------------------
-- Configurable academic structure tree ("section" / "department" / "level" /
-- whatever the school calls it — free text, school-defined, not every school
-- uses every level; a node's meaning is positional via its ancestors, not
-- hardcoded). Self-referencing, so an arbitrary depth is possible.
--
-- Lower-risk option per the phased contract: `classes`/`class_streams`
-- (0001) are NOT collapsed into this table (that would touch every existing
-- report-card/attendance query that joins on class_stream_id). Instead
-- `classes` gets a nullable FK so the new section/department layers can sit
-- ABOVE the existing classes/streams hierarchy without changing a single
-- existing query.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS structure_nodes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES structure_nodes(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_structure_nodes_school ON structure_nodes(school_id);
CREATE INDEX IF NOT EXISTS idx_structure_nodes_parent ON structure_nodes(parent_id);

ALTER TABLE classes ADD COLUMN parent_structure_node_id TEXT REFERENCES structure_nodes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_classes_parent_structure_node ON classes(parent_structure_node_id);

-- ---------------------------------------------------------------------------
-- Login-screen notice board (spec: Phase B/C branded login + notice board).
-- Kept deliberately simple offline — no targeting/attachments, unlike the
-- cloud's announcements app.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_notices_school_published ON notices(school_id, is_published);
