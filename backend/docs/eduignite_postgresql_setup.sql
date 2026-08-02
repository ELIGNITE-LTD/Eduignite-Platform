-- =============================================================================
--  EduIgnite Platform – PostgreSQL Production Setup
--  No demo data. Run each section manually in order.
--
--  ORDER OF EXECUTION:
--    1. Run SECTION 1  connected to 'postgres' database as superuser
--    2. \c eduignite   (switch to the new database)
--    3. Run SECTION 2 onward
--    4. Run Django migrations:  python manage.py migrate
--    5. Run SECTION 4 onward   (indexes, triggers, views need the tables first)
-- =============================================================================


-- =============================================================================
-- SECTION 1 – DATABASE & ROLE  (run as superuser on 'postgres')
-- =============================================================================

-- 1.1  Application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eduignite_user') THEN
    CREATE ROLE eduignite_user
      LOGIN
      PASSWORD 'CHANGE_THIS_STRONG_PASSWORD'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE;
  END IF;
END $$;

-- 1.2  Database
-- (Cannot use DO block for CREATE DATABASE; run this line directly)
CREATE DATABASE eduignite
  OWNER     = eduignite_user
  ENCODING  = 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE   = 'en_US.UTF-8'
  TEMPLATE   = template0;

-- 1.3  Privileges
GRANT ALL PRIVILEGES ON DATABASE eduignite TO eduignite_user;


-- =============================================================================
-- SECTION 2 – EXTENSIONS  (\c eduignite first)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";         -- UUID helpers
CREATE EXTENSION IF NOT EXISTS "pg_trgm";           -- trigram fuzzy search
CREATE EXTENSION IF NOT EXISTS "unaccent";          -- accent-insensitive search
CREATE EXTENSION IF NOT EXISTS "btree_gin";         -- GIN on scalar columns
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- slow query tracking


-- =============================================================================
-- SECTION 3 – SCHEMA PERMISSIONS  (run after extensions)
-- =============================================================================

GRANT ALL ON SCHEMA public TO eduignite_user;


-- =============================================================================
-- SECTION 4 – PERFORMANCE INDEXES
-- Run AFTER:  python manage.py migrate
-- =============================================================================

-- users: fast name search
CREATE INDEX IF NOT EXISTS idx_users_name_trgm
    ON users USING gin (name gin_trgm_ops);

-- users: login lookup
CREATE INDEX IF NOT EXISTS idx_users_matricule
    ON users (matricule);

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users (email);

CREATE INDEX IF NOT EXISTS idx_users_role_school
    ON users (role, school_id);

-- schools: fast name search
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm
    ON schools USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_schools_status_region
    ON schools (status, region);

-- students
CREATE INDEX IF NOT EXISTS idx_student_school_level
    ON students_student (school_id, class_level);

CREATE INDEX IF NOT EXISTS idx_student_admission
    ON students_student (admission_number);

-- grades
CREATE INDEX IF NOT EXISTS idx_grade_student_seq
    ON grades_grade (student_id, sequence_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_grade_subject_seq
    ON grades_grade (subject_id, sequence_id);

CREATE INDEX IF NOT EXISTS idx_termresult_student_year
    ON grades_termresult (student_id, academic_year, term);

CREATE INDEX IF NOT EXISTS idx_annualresult_school_year
    ON grades_annualresult (school_id, academic_year, annual_average DESC);

-- attendance
CREATE INDEX IF NOT EXISTS idx_attendance_session_date
    ON attendance_attendancesession (school_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_record_student
    ON attendance_attendancerecord (student_id, status);

-- fees & payments
CREATE INDEX IF NOT EXISTS idx_payment_status_school
    ON fees_payment (school_id, status, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_payment_payer
    ON fees_payment (payer_id, status);

-- library
CREATE INDEX IF NOT EXISTS idx_book_available
    ON library_book (school_id, available_copies)
    WHERE available_copies > 0 AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_bookloan_status
    ON library_bookloan (school_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_bookloan_borrower
    ON library_bookloan (borrower_id, status);

-- announcements
CREATE INDEX IF NOT EXISTS idx_announcement_active
    ON announcements_announcement (school_id, target, created_at DESC)
    WHERE (expires_at IS NULL OR expires_at > NOW());

-- chat
CREATE INDEX IF NOT EXISTS idx_message_convo_created
    ON chat_message (conversation_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_message_sender
    ON chat_message (sender_id, created_at DESC)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_conv_participant
    ON chat_conversationparticipant (user_id, conversation_id);

-- AI requests
CREATE INDEX IF NOT EXISTS idx_ai_request_user_type
    ON ai_features_airequest (user_id, request_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_request_school_status
    ON ai_features_airequest (school_id, status, created_at DESC);

-- live classes
CREATE INDEX IF NOT EXISTS idx_liveclass_school_status
    ON live_classes_liveclass (school_id, status, start_time DESC);

-- staff remarks
CREATE INDEX IF NOT EXISTS idx_staff_remark_school
    ON staff_remarks_staffremark (school_id, staff_id);

-- feedback
CREATE INDEX IF NOT EXISTS idx_feedback_school_status
    ON feedback_feedback (school_id, status, priority);

-- parent-student links
CREATE INDEX IF NOT EXISTS idx_parent_student_link
    ON students_parentstudentlink (parent_id, student_id);


-- =============================================================================
-- SECTION 5 – INTEGRITY TRIGGERS
-- =============================================================================

-- ─── 5.1  Auto-sync school.student_count ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_student_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'STUDENT' THEN
    UPDATE schools
    SET student_count = (
      SELECT COUNT(*) FROM users WHERE school_id = NEW.school_id AND role = 'STUDENT'
    )
    WHERE id = NEW.school_id;

  ELSIF TG_OP = 'DELETE' AND OLD.role = 'STUDENT' THEN
    UPDATE schools
    SET student_count = (
      SELECT COUNT(*) FROM users WHERE school_id = OLD.school_id AND role = 'STUDENT'
    )
    WHERE id = OLD.school_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'STUDENT' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
      UPDATE schools SET student_count = (
        SELECT COUNT(*) FROM users WHERE school_id = OLD.school_id AND role = 'STUDENT'
      ) WHERE id = OLD.school_id;
    END IF;
    IF NEW.role = 'STUDENT' THEN
      UPDATE schools SET student_count = (
        SELECT COUNT(*) FROM users WHERE school_id = NEW.school_id AND role = 'STUDENT'
      ) WHERE id = NEW.school_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_count ON users;
CREATE TRIGGER trg_sync_student_count
AFTER INSERT OR UPDATE OF school_id, role OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION fn_sync_student_count();

-- ─── 5.2  Auto-sync school.teacher_count ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_teacher_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'TEACHER' THEN
    UPDATE schools
    SET teacher_count = (
      SELECT COUNT(*) FROM users WHERE school_id = NEW.school_id AND role = 'TEACHER'
    )
    WHERE id = NEW.school_id;

  ELSIF TG_OP = 'DELETE' AND OLD.role = 'TEACHER' THEN
    UPDATE schools
    SET teacher_count = (
      SELECT COUNT(*) FROM users WHERE school_id = OLD.school_id AND role = 'TEACHER'
    )
    WHERE id = OLD.school_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'TEACHER' AND NEW.school_id IS DISTINCT FROM OLD.school_id THEN
      UPDATE schools SET teacher_count = (
        SELECT COUNT(*) FROM users WHERE school_id = OLD.school_id AND role = 'TEACHER'
      ) WHERE id = OLD.school_id;
    END IF;
    IF NEW.role = 'TEACHER' THEN
      UPDATE schools SET teacher_count = (
        SELECT COUNT(*) FROM users WHERE school_id = NEW.school_id AND role = 'TEACHER'
      ) WHERE id = NEW.school_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_teacher_count ON users;
CREATE TRIGGER trg_sync_teacher_count
AFTER INSERT OR UPDATE OF school_id, role OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION fn_sync_teacher_count();

-- ─── 5.3  Auto-update book available_copies on loan change ───────────────────
CREATE OR REPLACE FUNCTION fn_sync_book_copies()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'Active' THEN
    UPDATE library_book
    SET available_copies = GREATEST(available_copies - 1, 0)
    WHERE id = NEW.book_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'Active' AND NEW.status = 'Returned' THEN
      UPDATE library_book
      SET available_copies = LEAST(available_copies + 1, total_copies)
      WHERE id = NEW.book_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_book_copies ON library_bookloan;
CREATE TRIGGER trg_sync_book_copies
AFTER INSERT OR UPDATE OF status ON library_bookloan
FOR EACH ROW EXECUTE FUNCTION fn_sync_book_copies();

-- ─── 5.4  Keep conversation.last_message current ─────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_convo_last_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE chat_conversation
  SET
    last_message    = LEFT(NEW.text, 100),
    last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convo_last_message ON chat_message;
CREATE TRIGGER trg_convo_last_message
AFTER INSERT ON chat_message
FOR EACH ROW
WHEN (NEW.is_deleted = FALSE AND NEW.text IS NOT NULL AND NEW.text <> '')
EXECUTE FUNCTION fn_update_convo_last_message();

-- ─── 5.5  Only one active sequence per school per academic year ───────────────
CREATE OR REPLACE FUNCTION fn_enforce_one_active_sequence()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE grades_sequence
    SET is_active = FALSE
    WHERE school_id     = NEW.school_id
      AND academic_year = NEW.academic_year
      AND id            <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_one_active_sequence ON grades_sequence;
CREATE TRIGGER trg_one_active_sequence
BEFORE INSERT OR UPDATE OF is_active ON grades_sequence
FOR EACH ROW
WHEN (NEW.is_active = TRUE)
EXECUTE FUNCTION fn_enforce_one_active_sequence();

-- ─── 5.6  Prevent duplicate primary parent per student ───────────────────────
CREATE OR REPLACE FUNCTION fn_enforce_one_primary_parent()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_primary = TRUE THEN
    UPDATE students_parentstudentlink
    SET is_primary = FALSE
    WHERE student_id = NEW.student_id
      AND id         <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_one_primary_parent ON students_parentstudentlink;
CREATE TRIGGER trg_one_primary_parent
BEFORE INSERT OR UPDATE OF is_primary ON students_parentstudentlink
FOR EACH ROW
WHEN (NEW.is_primary = TRUE)
EXECUTE FUNCTION fn_enforce_one_primary_parent();

-- ─── 5.7  Auto-stamp updated_at on every user save ───────────────────────────
-- (Only needed if Django's auto_now doesn't cover raw SQL updates)
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to every table that has updated_at
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'schools',
    'school_settings',
    'students_student',
    'grades_subject',
    'grades_grade',
    'grades_termresult',
    'grades_annualresult',
    'attendance_attendancesession',
    'fees_feestructure',
    'fees_payment',
    'library_book',
    'library_bookloan',
    'announcements_announcement',
    'chat_conversation',
    'ai_features_airequest',
    'feedback_feedback',
    'apps_platform_platformsettings'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
       CREATE TRIGGER trg_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;


-- =============================================================================
-- SECTION 6 – REPORTING VIEWS
-- =============================================================================

-- 6.1  Student academic overview
CREATE OR REPLACE VIEW vw_student_performance AS
SELECT
    u.id                   AS user_id,
    u.name                 AS student_name,
    u.matricule,
    s.id                   AS school_id,
    s.name                 AS school_name,
    st.class_level,
    st.section,
    st.admission_number,
    st.annual_average,
    st.is_on_honour_roll,
    COUNT(g.id)            AS grades_recorded,
    ROUND(AVG(g.score), 2) AS current_avg,
    MAX(g.score)           AS best_score,
    MIN(g.score)           AS lowest_score
FROM users u
JOIN students_student st ON st.user_id  = u.id
JOIN schools s           ON s.id        = u.school_id
LEFT JOIN grades_grade g ON g.student_id = st.id
WHERE u.role = 'STUDENT'
GROUP BY u.id, u.name, u.matricule,
         s.id, s.name,
         st.class_level, st.section,
         st.admission_number, st.annual_average, st.is_on_honour_roll;

-- 6.2  Attendance rate per student
CREATE OR REPLACE VIEW vw_attendance_summary AS
SELECT
    u.id                AS user_id,
    u.name              AS student_name,
    u.school_id,
    COUNT(ar.id)        AS total_sessions,
    SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN ar.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
    SUM(CASE WHEN ar.status = 'late'    THEN 1 ELSE 0 END) AS late,
    SUM(CASE WHEN ar.status = 'excused' THEN 1 ELSE 0 END) AS excused,
    ROUND(
      100.0 * SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END)
      / NULLIF(COUNT(ar.id), 0), 2
    ) AS attendance_pct
FROM users u
JOIN students_student st              ON st.user_id   = u.id
JOIN attendance_attendancerecord ar   ON ar.student_id = st.id
WHERE u.role = 'STUDENT'
GROUP BY u.id, u.name, u.school_id;

-- 6.3  Fee collection per school
CREATE OR REPLACE VIEW vw_fee_collection AS
SELECT
    s.id                 AS school_id,
    s.name               AS school_name,
    fs.name              AS fee_name,
    fs.academic_year,
    fs.amount            AS unit_amount,
    COUNT(p.id)          AS total_payments,
    SUM(p.amount)        AS total_received,
    SUM(CASE WHEN p.status = 'confirmed' THEN p.amount ELSE 0 END) AS confirmed,
    SUM(CASE WHEN p.status = 'pending'   THEN p.amount ELSE 0 END) AS pending,
    SUM(CASE WHEN p.status = 'rejected'  THEN p.amount ELSE 0 END) AS rejected
FROM schools s
JOIN fees_feestructure fs ON fs.school_id = s.id
LEFT JOIN fees_payment p  ON p.fee_structure_id = fs.id AND p.school_id = s.id
GROUP BY s.id, s.name, fs.name, fs.academic_year, fs.amount;

-- 6.4  Library utilisation per school
CREATE OR REPLACE VIEW vw_library_utilisation AS
SELECT
    s.id   AS school_id,
    s.name AS school_name,
    COUNT(DISTINCT b.id)                                           AS unique_titles,
    COALESCE(SUM(b.total_copies), 0)                               AS total_copies,
    COALESCE(SUM(b.available_copies), 0)                           AS available_copies,
    COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'Active')      AS active_loans,
    COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'Overdue')     AS overdue_loans,
    COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'Returned')    AS returned_loans
FROM schools s
LEFT JOIN library_book     b  ON b.school_id = s.id AND b.is_active = TRUE
LEFT JOIN library_bookloan bl ON bl.book_id  = b.id
GROUP BY s.id, s.name;

-- 6.5  Communication activity per user
CREATE OR REPLACE VIEW vw_user_communication AS
SELECT
    u.id       AS user_id,
    u.name,
    u.role,
    u.school_id,
    COUNT(DISTINCT cp.conversation_id)  AS conversations,
    COUNT(DISTINCT m.id)                AS messages_sent,
    COUNT(DISTINCT ar.id)               AS announcements_read
FROM users u
LEFT JOIN chat_conversationparticipant cp  ON cp.user_id = u.id
LEFT JOIN chat_message m                   ON m.sender_id = u.id AND m.is_deleted = FALSE
LEFT JOIN announcements_announcementread ar ON ar.user_id = u.id
GROUP BY u.id, u.name, u.role, u.school_id;

-- 6.6  Term rankings per school / year
CREATE OR REPLACE VIEW vw_term_rankings AS
SELECT
    s.name       AS school_name,
    u.name       AS student_name,
    u.matricule,
    st.class_level,
    tr.academic_year,
    tr.term,
    tr.average,
    tr.rank,
    tr.total_students,
    tr.is_promoted,
    tr.teacher_comment
FROM grades_termresult tr
JOIN students_student st ON st.id      = tr.student_id
JOIN users u             ON u.id       = st.user_id
JOIN schools s           ON s.id       = tr.school_id
ORDER BY s.name, tr.academic_year, tr.term, tr.rank;

-- 6.7  Overdue book loans
CREATE OR REPLACE VIEW vw_overdue_loans AS
SELECT
    bl.id,
    s.name                          AS school_name,
    u.name                          AS borrower_name,
    u.matricule                     AS borrower_matricule,
    u.role                          AS borrower_role,
    b.title                         AS book_title,
    bl.issued_date,
    bl.due_date,
    CURRENT_DATE - bl.due_date      AS days_overdue,
    ROUND((CURRENT_DATE - bl.due_date) * 100.0, 2) AS estimated_fine_xaf
FROM library_bookloan bl
JOIN library_book b ON b.id  = bl.book_id
JOIN users u        ON u.id  = bl.borrower_id
JOIN schools s      ON s.id  = bl.school_id
WHERE bl.status = 'Active'
  AND bl.due_date < CURRENT_DATE
ORDER BY days_overdue DESC;

-- 6.8  School dashboard summary (one row per school)
CREATE OR REPLACE VIEW vw_school_dashboard AS
SELECT
    s.id,
    s.name,
    s.status,
    s.region,
    s.student_count,
    s.teacher_count,
    ss.academic_year,
    ss.term,
    ss.licence_expiry,
    ss.allow_ai_features,
    (SELECT COUNT(*) FROM fees_payment p
     WHERE p.school_id = s.id AND p.status = 'confirmed') AS confirmed_payments,
    (SELECT COUNT(*) FROM library_bookloan bl
     JOIN library_book lb ON lb.id = bl.book_id
     WHERE lb.school_id = s.id AND bl.status = 'Active')  AS active_loans,
    (SELECT COUNT(*) FROM announcements_announcement a
     WHERE a.school_id = s.id
       AND (a.expires_at IS NULL OR a.expires_at > NOW())) AS active_announcements,
    (SELECT COUNT(*) FROM chat_conversation c
     WHERE c.school_id = s.id AND c.is_active = TRUE)      AS active_conversations
FROM schools s
LEFT JOIN school_settings ss ON ss.school_id = s.id;


-- =============================================================================
-- SECTION 7 – STORED PROCEDURES & FUNCTIONS
-- =============================================================================

-- 7.1  Recompute term ranks for a school / year / term
CREATE OR REPLACE PROCEDURE sp_compute_term_ranks(
    p_school_id     VARCHAR,
    p_academic_year VARCHAR,
    p_term          INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY school_id, academic_year, term
        ORDER BY average DESC
      ) AS new_rank,
      COUNT(*) OVER (
        PARTITION BY school_id, academic_year, term
      ) AS total
    FROM grades_termresult
    WHERE school_id     = p_school_id
      AND academic_year = p_academic_year
      AND term          = p_term
  )
  UPDATE grades_termresult tr
  SET rank = r.new_rank, total_students = r.total
  FROM ranked r
  WHERE tr.id = r.id;
END;
$$;

-- Usage:  CALL sp_compute_term_ranks('SCHOOL-ID', '2025-2026', 1);

-- 7.2  Recompute annual ranks for a school / year
CREATE OR REPLACE PROCEDURE sp_compute_annual_ranks(
    p_school_id     VARCHAR,
    p_academic_year VARCHAR
)
LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY school_id, academic_year
        ORDER BY annual_average DESC
      ) AS new_rank
    FROM grades_annualresult
    WHERE school_id     = p_school_id
      AND academic_year = p_academic_year
  )
  UPDATE grades_annualresult ar
  SET rank = r.new_rank
  FROM ranked r
  WHERE ar.id = r.id;
END;
$$;

-- 7.3  Mark all overdue loans for a school
CREATE OR REPLACE PROCEDURE sp_mark_overdue_loans(p_school_id VARCHAR)
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE library_bookloan
  SET status = 'Overdue'
  WHERE school_id = p_school_id
    AND status    = 'Active'
    AND due_date  < CURRENT_DATE;
END;
$$;

-- Usage:  CALL sp_mark_overdue_loans('SCHOOL-ID');
--         CALL sp_mark_overdue_loans(NULL);   -- all schools

-- 7.4  Get full user profile (returns JSON)
CREATE OR REPLACE FUNCTION fn_user_profile(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_user    RECORD;
  v_student RECORD;
BEGIN
  SELECT id, name, email, matricule, role, school_id,
         phone, is_active, is_license_paid, date_joined, last_login
  INTO v_user
  FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  IF v_user.role = 'STUDENT' THEN
    SELECT student_class, class_level, section,
           admission_number, annual_average, is_on_honour_roll
    INTO v_student
    FROM students_student WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'id',              v_user.id,
      'name',            v_user.name,
      'email',           v_user.email,
      'matricule',       v_user.matricule,
      'role',            v_user.role,
      'school_id',       v_user.school_id,
      'class',           v_student.student_class,
      'class_level',     v_student.class_level,
      'section',         v_student.section,
      'admission_no',    v_student.admission_number,
      'annual_average',  v_student.annual_average,
      'honour_roll',     v_student.is_on_honour_roll
    );
  END IF;

  RETURN to_jsonb(v_user);
END;
$$;

-- Usage:  SELECT fn_user_profile('uuid-here');

-- 7.5  Check if a user has access to a school (same school or executive)
CREATE OR REPLACE FUNCTION fn_can_access_school(
    p_user_id  UUID,
    p_school_id VARCHAR
)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_role     TEXT;
  v_school   TEXT;
BEGIN
  SELECT role, school_id INTO v_role, v_school
  FROM users WHERE id = p_user_id;

  IF v_role IN ('SUPER_ADMIN','CEO','CTO','COO','INV','DESIGNER') THEN
    RETURN TRUE;
  END IF;

  RETURN v_school = p_school_id;
END;
$$;

-- 7.6  Insert an announcement (safe wrapper, avoids raw DML in app code)
CREATE OR REPLACE PROCEDURE sp_create_announcement(
    p_school_id  VARCHAR,
    p_sender_id  UUID,
    p_title      TEXT,
    p_content    TEXT,
    p_target     VARCHAR DEFAULT 'SCHOOL_ALL',
    p_pinned     BOOLEAN DEFAULT FALSE,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO announcements_announcement
    (school_id, sender_id, title, content, target,
     is_pinned, expires_at, view_count, created_at, updated_at)
  VALUES
    (p_school_id, p_sender_id, p_title, p_content, p_target,
     p_pinned, p_expires_at, 0, NOW(), NOW());
END;
$$;


-- =============================================================================
-- SECTION 8 – PRODUCTION PERMISSION HARDENING
-- Run AFTER all tables exist (i.e. after Django migrations)
-- =============================================================================

-- Strip ability to create/alter schema from app user
REVOKE CREATE ON SCHEMA public FROM eduignite_user;

-- Grant DML only on existing tables
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO eduignite_user;

-- Grant sequence usage (needed for auto-increment PKs)
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO eduignite_user;

-- Grant function/procedure execution
GRANT EXECUTE ON ALL FUNCTIONS  IN SCHEMA public TO eduignite_user;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO eduignite_user;

-- Apply same grants to all future objects created by superuser
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO eduignite_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO eduignite_user;


-- =============================================================================
-- SECTION 9 – INTEGRITY AUDIT QUERIES  (run any time to check health)
-- =============================================================================

-- A) Users without a school (should only be platform executives)
SELECT matricule, name, role
FROM users
WHERE school_id IS NULL
  AND role NOT IN ('SUPER_ADMIN','CEO','CTO','COO','INV','DESIGNER')
  AND is_active = TRUE;

-- B) Students with no Student profile record
SELECT u.matricule, u.name, u.school_id
FROM users u
WHERE u.role = 'STUDENT'
  AND NOT EXISTS (SELECT 1 FROM students_student st WHERE st.user_id = u.id);

-- C) Students with no parent link
SELECT u.matricule, u.name, u.school_id
FROM users u
JOIN students_student st ON st.user_id = u.id
WHERE u.role = 'STUDENT'
  AND NOT EXISTS (
      SELECT 1 FROM students_parentstudentlink l WHERE l.student_id = st.id
  );

-- D) Schools missing settings
SELECT id, name
FROM schools
WHERE NOT EXISTS (SELECT 1 FROM school_settings ss WHERE ss.school_id = id);

-- E) Teachers assigned to no active subject
SELECT u.matricule, u.name, u.school_id
FROM users u
WHERE u.role = 'TEACHER'
  AND NOT EXISTS (
      SELECT 1 FROM grades_subject gs
      WHERE gs.teacher_id = u.id AND gs.is_active = TRUE
  );

-- F) Overdue loans not yet flagged
SELECT bl.id, u.name AS borrower, b.title,
       bl.due_date, CURRENT_DATE - bl.due_date AS days_overdue
FROM library_bookloan bl
JOIN library_book b ON b.id = bl.book_id
JOIN users u        ON u.id = bl.borrower_id
WHERE bl.status = 'Active' AND bl.due_date < CURRENT_DATE
ORDER BY days_overdue DESC;

-- G) User counts by role
SELECT role, COUNT(*) AS total
FROM users
GROUP BY role ORDER BY total DESC;

-- H) Active conversations with message counts
SELECT
    COALESCE(c.school_id, 'PLATFORM') AS scope,
    c.conversation_type,
    COUNT(*)          AS conversations,
    SUM(
      (SELECT COUNT(*) FROM chat_message m
       WHERE m.conversation_id = c.id AND NOT m.is_deleted)
    )                 AS total_messages
FROM chat_conversation c
WHERE c.is_active = TRUE
GROUP BY c.school_id, c.conversation_type
ORDER BY total_messages DESC;


-- =============================================================================
-- SECTION 10 – BACKUP COMMANDS  (run from shell, not psql)
-- =============================================================================

/*
  ── Full backup ─────────────────────────────────────────────────────────────
  pg_dump -U eduignite_user -d eduignite -F c -Z 9 \
    -f /backups/eduignite_$(date +%Y%m%d_%H%M%S).dump

  ── Restore ─────────────────────────────────────────────────────────────────
  pg_restore -U eduignite_user -d eduignite --clean --if-exists \
    /backups/eduignite_20260419_020000.dump

  ── Table-level backup (e.g. grades only) ───────────────────────────────────
  pg_dump -U eduignite_user -d eduignite -t grades_grade \
    -F c -f /backups/grades_$(date +%Y%m%d).dump

  ── Automated daily cron (postgres system user) ──────────────────────────────
  0 2 * * * pg_dump -U eduignite_user -d eduignite -F c -Z 9 \
    -f /backups/eduignite_$(date +\%Y\%m\%d_\%H\%M\%S).dump \
    && find /backups -name "*.dump" -mtime +30 -delete
*/


-- =============================================================================
-- END
-- =============================================================================
