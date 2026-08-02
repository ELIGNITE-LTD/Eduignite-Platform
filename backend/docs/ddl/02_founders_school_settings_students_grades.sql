-- ============================================================================
--  EduIgnite – DDL Part 2: Founders, School Settings, Students, Grades
--  Requires Part 1 to have been run first.
-- ============================================================================

-- ============================================================================
-- SECTION 1: FOUNDER PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS founder_profiles (
    id                        BIGSERIAL PRIMARY KEY,
    user_id                   UUID         NOT NULL UNIQUE
                                  REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    founder_title             VARCHAR(255) NOT NULL,
    primary_share_percentage  NUMERIC(6,2) NOT NULL DEFAULT 0,
    is_primary_founder        BOOLEAN      NOT NULL DEFAULT FALSE,
    can_be_removed            BOOLEAN      NOT NULL DEFAULT TRUE,
    has_renewable_shares      BOOLEAN      NOT NULL DEFAULT FALSE,
    share_renewal_period_days INTEGER      NOT NULL DEFAULT 365,
    shares_expire_at          TIMESTAMP WITH TIME ZONE,
    access_level              VARCHAR(20)  NOT NULL DEFAULT 'FULL',
    created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS founder_profiles_is_primary_idx    ON founder_profiles (is_primary_founder);
CREATE INDEX IF NOT EXISTS founder_profiles_can_remove_idx    ON founder_profiles (can_be_removed);
CREATE INDEX IF NOT EXISTS founder_profiles_shares_expire_idx ON founder_profiles (shares_expire_at);
CREATE INDEX IF NOT EXISTS founder_profiles_access_level_idx  ON founder_profiles (access_level);

CREATE TABLE IF NOT EXISTS founder_share_adjustments (
    id          BIGSERIAL PRIMARY KEY,
    founder_id  BIGINT       NOT NULL
                    REFERENCES founder_profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    percentage  NUMERIC(6,2) NOT NULL,
    note        VARCHAR(255) NOT NULL DEFAULT '',
    added_by_id UUID
                    REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    expires_at  TIMESTAMP WITH TIME ZONE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS founder_share_adj_founder_created_idx ON founder_share_adjustments (founder_id, created_at);
CREATE INDEX IF NOT EXISTS founder_share_adj_expires_at_idx      ON founder_share_adjustments (expires_at);

-- ============================================================================
-- SECTION 2: SCHOOL SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS school_settings (
    id                BIGSERIAL PRIMARY KEY,
    school_id         VARCHAR(50) NOT NULL UNIQUE
                          REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    licence_expiry    DATE,
    max_students      INTEGER NOT NULL DEFAULT 500,
    max_teachers      INTEGER NOT NULL DEFAULT 50,
    academic_year     VARCHAR(20) NOT NULL DEFAULT '2024-2025',
    term              VARCHAR(20) NOT NULL DEFAULT 'First',
    allow_ai_features BOOLEAN NOT NULL DEFAULT TRUE,
    ai_request_limit  INTEGER NOT NULL DEFAULT 1000
);

-- ============================================================================
-- SECTION 3: STUDENTS
-- Note: django_extensions TimeStampedModel adds 'created' + 'modified'
--       (NOT created_at / updated_at) for Student and ParentStudentLink.
-- ============================================================================

CREATE TABLE IF NOT EXISTS students_student (
    id                UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id           UUID         NOT NULL UNIQUE
                          REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    school_id         VARCHAR(50)  NOT NULL
                          REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    student_class     VARCHAR(100) NOT NULL,
    class_level       VARCHAR(20)  NOT NULL DEFAULT 'form1',
    section           VARCHAR(50)  NOT NULL DEFAULT 'general',
    date_of_birth     DATE,
    gender            VARCHAR(10)  NOT NULL DEFAULT 'other',
    guardian_name     VARCHAR(255) NOT NULL DEFAULT '',
    guardian_phone    VARCHAR(20)  NOT NULL DEFAULT '',
    guardian_whatsapp VARCHAR(20),
    admission_number  VARCHAR(50)  NOT NULL UNIQUE,
    admission_date    DATE,
    annual_average    NUMERIC(5,2),
    is_on_honour_roll BOOLEAN      NOT NULL DEFAULT FALSE,
    qr_code           VARCHAR(5000),
    created           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS students_student_school_class_idx  ON students_student (school_id, class_level);
CREATE INDEX IF NOT EXISTS students_student_admission_num_idx ON students_student (admission_number);

CREATE TABLE IF NOT EXISTS students_parentstudentlink (
    id           UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    parent_id    UUID        NOT NULL
                     REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    student_id   UUID        NOT NULL
                     REFERENCES students_student(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    relationship VARCHAR(20) NOT NULL,
    is_primary   BOOLEAN     NOT NULL DEFAULT FALSE,
    created      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT students_parentstudentlink_parent_student_uniq UNIQUE (parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS students_parentstudentlink_idx ON students_parentstudentlink (parent_id, student_id);

-- ============================================================================
-- SECTION 4: GRADES
-- Note: Subject, Grade, TermResult, AnnualResult all use django_extensions
--       TimeStampedModel → 'created' + 'modified' columns.
--       Sequence uses its own created_at + updated_at.
-- ============================================================================

CREATE TABLE IF NOT EXISTS grades_subject (
    id          UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    school_id   VARCHAR(50)  NOT NULL
                    REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    name        VARCHAR(255) NOT NULL,
    code        VARCHAR(50)  NOT NULL,
    level       VARCHAR(50)  NOT NULL,
    coefficient NUMERIC(5,2) NOT NULL DEFAULT 1.0,
    teacher_id  UUID
                    REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT grades_subject_school_code_uniq UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS grades_subject_code_idx         ON grades_subject (code);
CREATE INDEX IF NOT EXISTS grades_subject_school_level_idx ON grades_subject (school_id, level);

CREATE TABLE IF NOT EXISTS grades_sequence (
    id            UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    school_id     VARCHAR(50) NOT NULL
                      REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    name          VARCHAR(255) NOT NULL,
    academic_year VARCHAR(20)  NOT NULL,
    term          INTEGER      NOT NULL,
    start_date    DATE         NOT NULL,
    end_date      DATE         NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT grades_sequence_school_year_term_name_uniq
        UNIQUE (school_id, academic_year, term, name)
);

CREATE INDEX IF NOT EXISTS grades_sequence_school_year_active_idx
    ON grades_sequence (school_id, academic_year, is_active);

CREATE TABLE IF NOT EXISTS grades_grade (
    id          UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id  UUID         NOT NULL
                    REFERENCES students_student(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    subject_id  UUID         NOT NULL
                    REFERENCES grades_subject(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    sequence_id UUID         NOT NULL
                    REFERENCES grades_sequence(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    school_id   VARCHAR(50)  NOT NULL
                    REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    score       NUMERIC(5,2) NOT NULL,
    teacher_id  UUID
                    REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    comment     TEXT,
    created     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT grades_grade_student_subject_sequence_uniq
        UNIQUE (student_id, subject_id, sequence_id)
);

CREATE INDEX IF NOT EXISTS grades_grade_student_sequence_idx ON grades_grade (student_id, sequence_id);
CREATE INDEX IF NOT EXISTS grades_grade_subject_sequence_idx ON grades_grade (subject_id, sequence_id);

CREATE TABLE IF NOT EXISTS grades_termresult (
    id              UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id      UUID         NOT NULL
                        REFERENCES students_student(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    school_id       VARCHAR(50)  NOT NULL
                        REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    academic_year   VARCHAR(20)  NOT NULL,
    term            INTEGER      NOT NULL,
    average         NUMERIC(5,2) NOT NULL,
    rank            INTEGER,
    total_students  INTEGER      NOT NULL DEFAULT 0,
    is_promoted     BOOLEAN,
    teacher_comment TEXT,
    created         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT grades_termresult_student_year_term_uniq
        UNIQUE (student_id, academic_year, term)
);

CREATE INDEX IF NOT EXISTS grades_termresult_student_year_idx ON grades_termresult (student_id, academic_year);

CREATE TABLE IF NOT EXISTS grades_annualresult (
    id                UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    student_id        UUID         NOT NULL
                          REFERENCES students_student(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    school_id         VARCHAR(50)  NOT NULL
                          REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    academic_year     VARCHAR(20)  NOT NULL,
    annual_average    NUMERIC(5,2) NOT NULL,
    rank              INTEGER,
    is_on_honour_roll BOOLEAN      NOT NULL DEFAULT FALSE,
    is_promoted       BOOLEAN      NOT NULL,
    created           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT grades_annualresult_student_year_uniq UNIQUE (student_id, academic_year)
);

CREATE INDEX IF NOT EXISTS grades_annualresult_student_year_idx ON grades_annualresult (student_id, academic_year);
CREATE INDEX IF NOT EXISTS grades_annualresult_school_year_idx  ON grades_annualresult (school_id, academic_year);

-- ============================================================================
-- Done – run 03_attendance_fees_library_community.sql next
-- ============================================================================
