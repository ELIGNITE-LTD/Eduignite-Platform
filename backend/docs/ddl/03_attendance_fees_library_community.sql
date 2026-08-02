-- ============================================================================
--  EduIgnite – DDL Part 3: Attendance, Fees, Library, Community
--  Requires Parts 1 and 2 to have been run first.
-- ============================================================================

-- ============================================================================
-- SECTION 1: ATTENDANCE
-- Note: All three attendance models use django_extensions TimeStampedModel
--       → 'created' + 'modified' columns (not created_at / updated_at).
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance_attendancesession (
    id            UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    school_id     VARCHAR(50) NOT NULL
                      REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    teacher_id    UUID
                      REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    subject_id    UUID
                      REFERENCES grades_subject(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    student_class VARCHAR(100) NOT NULL,
    date          DATE         NOT NULL,
    period        VARCHAR(20)  NOT NULL,
    notes         TEXT,
    created       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT attendance_session_school_teacher_class_date_period_uniq
        UNIQUE (school_id, teacher_id, student_class, date, period)
);

CREATE INDEX IF NOT EXISTS attendance_session_school_date_idx  ON attendance_attendancesession (school_id, date);
CREATE INDEX IF NOT EXISTS attendance_session_teacher_date_idx ON attendance_attendancesession (teacher_id, date);

CREATE TABLE IF NOT EXISTS attendance_attendancerecord (
    id              UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id      UUID        NOT NULL
                        REFERENCES attendance_attendancesession(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    student_id      UUID        NOT NULL
                        REFERENCES students_student(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    status          VARCHAR(20) NOT NULL,
    excuse_note     TEXT,
    notified_parent BOOLEAN     NOT NULL DEFAULT FALSE,
    created         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT attendance_record_session_student_uniq UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS attendance_record_student_session_idx ON attendance_attendancerecord (student_id, session_id);

CREATE TABLE IF NOT EXISTS attendance_teacherattendance (
    id             UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    school_id      VARCHAR(50) NOT NULL
                       REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    teacher_id     UUID        NOT NULL
                       REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    date           DATE        NOT NULL,
    status         VARCHAR(20) NOT NULL,
    check_in_time  TIME,
    check_out_time TIME,
    noted_by_id    UUID
                       REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    created        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT attendance_teacher_school_teacher_date_uniq UNIQUE (school_id, teacher_id, date)
);

CREATE INDEX IF NOT EXISTS attendance_teacher_school_date_idx  ON attendance_teacherattendance (school_id, date);
CREATE INDEX IF NOT EXISTS attendance_teacher_teacher_date_idx ON attendance_teacherattendance (teacher_id, date);

-- ============================================================================
-- SECTION 2: FEES
-- Note: FeeStructure, Payment, Invoice use django_extensions TimeStampedModel
--       → 'created' + 'modified' columns.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fees_feestructure (
    id            UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    school_id     VARCHAR(50)  NOT NULL
                      REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    name          VARCHAR(255) NOT NULL,
    role          VARCHAR(50)  NOT NULL,
    amount        NUMERIC(12,2) NOT NULL,
    currency      VARCHAR(3)   NOT NULL DEFAULT 'XAF',
    academic_year VARCHAR(20)  NOT NULL,
    due_date      DATE,
    is_mandatory  BOOLEAN      NOT NULL DEFAULT TRUE,
    description   TEXT,
    created       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fees_feestructure_school_name_year_uniq UNIQUE (school_id, name, academic_year)
);

CREATE INDEX IF NOT EXISTS fees_feestructure_school_year_idx ON fees_feestructure (school_id, academic_year);

CREATE TABLE IF NOT EXISTS fees_payment (
    id               UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    school_id        VARCHAR(50)   NOT NULL
                         REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    payer_id         UUID          NOT NULL
                         REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    fee_structure_id UUID
                         REFERENCES fees_feestructure(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    bursar_id        UUID
                         REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    amount           NUMERIC(12,2) NOT NULL,
    currency         VARCHAR(3)    NOT NULL DEFAULT 'XAF',
    payment_method   VARCHAR(20)   NOT NULL,
    reference_number VARCHAR(100)  NOT NULL UNIQUE,
    status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
    payment_date     DATE          NOT NULL,
    confirmed_at     TIMESTAMP WITH TIME ZONE,
    notes            TEXT,
    receipt_number   VARCHAR(100)  UNIQUE,
    created          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fees_payment_school_date_idx  ON fees_payment (school_id, payment_date);
CREATE INDEX IF NOT EXISTS fees_payment_payer_status_idx ON fees_payment (payer_id, status);
CREATE INDEX IF NOT EXISTS fees_payment_reference_idx    ON fees_payment (reference_number);

CREATE TABLE IF NOT EXISTS fees_invoice (
    id             UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    payment_id     UUID         NOT NULL UNIQUE
                       REFERENCES fees_payment(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    issued_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    issued_by_id   UUID
                       REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    pdf_file       VARCHAR(100),
    created        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fees_invoice_number_idx ON fees_invoice (invoice_number);

-- ============================================================================
-- SECTION 3: LIBRARY
-- Note: BookCategory has no timestamps (plain models.Model, BIGSERIAL PK).
--       Book and BookLoan use a local TimeStampedModel → created_at + updated_at.
--       All three get BIGSERIAL auto IDs (no explicit UUID PK defined).
-- ============================================================================

CREATE TABLE IF NOT EXISTS library_bookcategory (
    id        BIGSERIAL PRIMARY KEY,
    school_id VARCHAR(50)  NOT NULL
                  REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    name      VARCHAR(100) NOT NULL,
    color     VARCHAR(7)   NOT NULL DEFAULT '#264D73',
    CONSTRAINT library_bookcategory_school_name_uniq UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS library_book (
    id               BIGSERIAL PRIMARY KEY,
    school_id        VARCHAR(50)  NOT NULL
                         REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    title            VARCHAR(255) NOT NULL,
    author           VARCHAR(255) NOT NULL,
    isbn             VARCHAR(20)  UNIQUE,
    category_id      BIGINT
                         REFERENCES library_bookcategory(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    publisher        VARCHAR(255) NOT NULL DEFAULT '',
    publication_year INTEGER,
    total_copies     INTEGER      NOT NULL DEFAULT 1,
    available_copies INTEGER      NOT NULL DEFAULT 1,
    description      TEXT         NOT NULL DEFAULT '',
    cover_image      VARCHAR(2000),
    location         VARCHAR(255) NOT NULL DEFAULT '',
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS library_book_school_active_idx ON library_book (school_id, is_active);
CREATE INDEX IF NOT EXISTS library_book_title_author_idx  ON library_book (title, author);

CREATE TABLE IF NOT EXISTS library_bookloan (
    id            BIGSERIAL PRIMARY KEY,
    school_id     VARCHAR(50) NOT NULL
                      REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    book_id       BIGINT      NOT NULL
                      REFERENCES library_book(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    borrower_id   UUID        NOT NULL
                      REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    librarian_id  UUID
                      REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    issued_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
    due_date      DATE        NOT NULL,
    returned_date DATE,
    status        VARCHAR(20) NOT NULL DEFAULT 'Active',
    fine_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
    fine_paid     BOOLEAN     NOT NULL DEFAULT FALSE,
    notes         TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS library_bookloan_borrower_status_idx ON library_bookloan (borrower_id, status);
CREATE INDEX IF NOT EXISTS library_bookloan_school_status_idx   ON library_bookloan (school_id, status);

-- ============================================================================
-- SECTION 4: COMMUNITY
-- Note: Testimony, CommunityBlog, BlogComment use a local TimeStampedModel
--       → created_at + updated_at. All get BIGSERIAL auto IDs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS community_testimony (
    id             BIGSERIAL PRIMARY KEY,
    user_id        UUID         NOT NULL
                       REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    school_name    VARCHAR(255) NOT NULL,
    role_display   VARCHAR(100) NOT NULL,
    message        TEXT         NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
    approved_by_id UUID
                       REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    approved_at    TIMESTAMP WITH TIME ZONE,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_testimony_status_created_idx ON community_testimony (status, created_at);

CREATE TABLE IF NOT EXISTS community_communityblog (
    id           BIGSERIAL PRIMARY KEY,
    author_id    UUID         NOT NULL
                     REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    title        VARCHAR(255) NOT NULL,
    image        VARCHAR(2000),
    paragraphs   JSONB        NOT NULL DEFAULT '[]',
    is_published BOOLEAN      NOT NULL DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    view_count   INTEGER      NOT NULL DEFAULT 0,
    slug         VARCHAR(300) NOT NULL UNIQUE,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_blog_published_idx ON community_communityblog (is_published, published_at);
CREATE INDEX IF NOT EXISTS community_blog_slug_idx      ON community_communityblog (slug);

CREATE TABLE IF NOT EXISTS community_blogcomment (
    id          BIGSERIAL PRIMARY KEY,
    blog_id     BIGINT  NOT NULL
                    REFERENCES community_communityblog(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    author_id   UUID    NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    content     TEXT    NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_blogcomment_blog_approved_idx ON community_blogcomment (blog_id, is_approved);

-- ============================================================================
-- Done – run 04_chat_ai_announcements_orders.sql next
-- ============================================================================
