-- ============================================================================
--  EduIgnite – DDL Part 5: Feedback, Support, Staff Remarks, Live Classes
--  Requires Parts 1–4 to have been run first.
-- ============================================================================

-- ============================================================================
-- SECTION 1: FEEDBACK
-- Note: Feedback and FeedbackResponse use a local TimeStampedModel
--       → created_at + updated_at. Both get BIGSERIAL auto IDs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_feedback (
    id              BIGSERIAL PRIMARY KEY,
    school_id       VARCHAR(50)  NOT NULL
                        REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    sender_id       UUID         NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    subject         VARCHAR(255) NOT NULL,
    message         TEXT         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'New',
    priority        VARCHAR(20)  NOT NULL DEFAULT 'Medium',
    resolved_by_id  UUID
                        REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    resolved_at     TIMESTAMP WITH TIME ZONE,
    resolution_note TEXT         NOT NULL DEFAULT '',
    attachment      VARCHAR(100),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_feedback_school_status_idx ON feedback_feedback (school_id, status);
CREATE INDEX IF NOT EXISTS feedback_feedback_sender_status_idx ON feedback_feedback (sender_id, status);

CREATE TABLE IF NOT EXISTS feedback_feedbackresponse (
    id           BIGSERIAL PRIMARY KEY,
    feedback_id  BIGINT  NOT NULL
                     REFERENCES feedback_feedback(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    responder_id UUID    NOT NULL
                     REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    message      TEXT    NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_response_feedback_idx ON feedback_feedbackresponse (feedback_id);

-- ============================================================================
-- SECTION 2: SUPPORT CONTRIBUTIONS
-- Note: SupportContribution uses a local TimeStampedModel
--       → created_at + updated_at. Gets BIGSERIAL auto ID.
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_supportcontribution (
    id                    BIGSERIAL PRIMARY KEY,
    user_id               UUID          NOT NULL
                              REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    school_id             VARCHAR(50)
                              REFERENCES schools(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    amount                NUMERIC(12,2) NOT NULL,
    currency              VARCHAR(10)   NOT NULL DEFAULT 'XAF',
    payment_method        VARCHAR(20)   NOT NULL,
    phone                 VARCHAR(20)   NOT NULL,
    message               TEXT          NOT NULL DEFAULT '',
    status                VARCHAR(20)   NOT NULL DEFAULT 'New',
    verified_by_id        UUID
                              REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    verified_at           TIMESTAMP WITH TIME ZONE,
    transaction_reference VARCHAR(255)  NOT NULL DEFAULT '',
    created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_contribution_user_status_idx    ON support_supportcontribution (user_id, status);
CREATE INDEX IF NOT EXISTS support_contribution_status_created_idx ON support_supportcontribution (status, created_at);

-- ============================================================================
-- SECTION 3: STAFF REMARKS
-- Note: StaffRemark uses a local TimeStampedModel → created_at + updated_at.
--       Gets BIGSERIAL auto ID.
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_remarks_staffremark (
    id              BIGSERIAL PRIMARY KEY,
    staff_id        UUID        NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    admin_id        UUID        NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    school_id       VARCHAR(50) NOT NULL
                        REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    text            TEXT        NOT NULL,
    remark_type     VARCHAR(20) NOT NULL,
    is_confidential BOOLEAN     NOT NULL DEFAULT FALSE,
    acknowledged    BOOLEAN     NOT NULL DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_remarks_staff_school_idx ON staff_remarks_staffremark (staff_id, school_id);
CREATE INDEX IF NOT EXISTS staff_remarks_admin_school_idx ON staff_remarks_staffremark (admin_id, school_id);

-- ============================================================================
-- SECTION 4: LIVE CLASSES
-- Note: LiveClass and LiveClassEnrollment use django_extensions
--       TimeStampedModel → 'created' + 'modified' columns.
--       Both have explicit UUID PKs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS live_classes_liveclass (
    id               UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    school_id        VARCHAR(50)  NOT NULL
                         REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    title            VARCHAR(255) NOT NULL,
    description      TEXT,
    subject_id       UUID
                         REFERENCES grades_subject(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    subject_name     VARCHAR(255),
    teacher_id       UUID         NOT NULL
                         REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    target_class     VARCHAR(100) NOT NULL,
    meeting_url      VARCHAR(200),
    meeting_id       VARCHAR(255),
    meeting_password VARCHAR(255),
    platform         VARCHAR(50)  NOT NULL DEFAULT 'jitsi',
    start_time       TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER      NOT NULL DEFAULT 60,
    status           VARCHAR(20)  NOT NULL DEFAULT 'upcoming',
    max_participants INTEGER      NOT NULL DEFAULT 50,
    enrolled_count   INTEGER      NOT NULL DEFAULT 0,
    is_recorded      BOOLEAN      NOT NULL DEFAULT FALSE,
    recording_url    VARCHAR(200),
    created          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_classes_school_status_idx      ON live_classes_liveclass (school_id, status);
CREATE INDEX IF NOT EXISTS live_classes_teacher_start_idx      ON live_classes_liveclass (teacher_id, start_time);
CREATE INDEX IF NOT EXISTS live_classes_target_start_idx       ON live_classes_liveclass (target_class, start_time);

CREATE TABLE IF NOT EXISTS live_classes_liveclassenrollment (
    id                UUID    NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    live_class_id     UUID    NOT NULL
                          REFERENCES live_classes_liveclass(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    student_id        UUID    NOT NULL
                          REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    joined_at         TIMESTAMP WITH TIME ZONE,
    left_at           TIMESTAMP WITH TIME ZONE,
    duration_attended INTEGER NOT NULL DEFAULT 0,
    created           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT live_classes_enrollment_class_student_uniq UNIQUE (live_class_id, student_id)
);

-- ============================================================================
-- Done – run 06_jwt_celery_and_post_setup.sql next (final part)
-- ============================================================================
