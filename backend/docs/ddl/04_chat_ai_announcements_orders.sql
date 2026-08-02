-- ============================================================================
--  EduIgnite – DDL Part 4: Chat, AI Features, Announcements, Orders
--  Requires Parts 1–3 to have been run first.
-- ============================================================================

-- ============================================================================
-- SECTION 1: CHAT
-- Note: Conversation, ConversationParticipant, Message all use
--       core.models.TimeStampedModel → id (UUID PK) + created_at + updated_at.
--       ConversationParticipant also has a separate 'joined_at' field.
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_conversation (
    id                UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_type VARCHAR(20) NOT NULL DEFAULT 'direct',
    name              VARCHAR(255) NOT NULL DEFAULT '',
    school_id         VARCHAR(50)
                          REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    created_by_id     UUID
                          REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    last_message      TEXT    NOT NULL DEFAULT '',
    last_message_at   TIMESTAMP WITH TIME ZONE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_conversation_school_last_msg_idx
    ON chat_conversation (school_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS chat_conversation_active_created_idx
    ON chat_conversation (is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_conversationparticipant (
    id              UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID        NOT NULL
                        REFERENCES chat_conversation(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    user_id         UUID        NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_read_at    TIMESTAMP WITH TIME ZONE,
    is_muted        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chat_conversationparticipant_conv_user_uniq UNIQUE (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_message (
    id              UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    conversation_id UUID        NOT NULL
                        REFERENCES chat_conversation(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    sender_id       UUID
                        REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    text            TEXT        NOT NULL,
    message_type    VARCHAR(20) NOT NULL DEFAULT 'text',
    attachment      VARCHAR(100),
    is_official     BOOLEAN     NOT NULL DEFAULT FALSE,
    is_read         BOOLEAN     NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMP WITH TIME ZONE,
    reply_to_id     UUID
                        REFERENCES chat_message(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_message_conversation_created_idx ON chat_message (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS chat_message_is_deleted_created_idx   ON chat_message (is_deleted, created_at);
CREATE INDEX IF NOT EXISTS chat_message_sender_created_idx       ON chat_message (sender_id, created_at);

-- ============================================================================
-- SECTION 2: AI FEATURES
-- Note: AIRequest and AIInsight use core.models.TimeStampedModel
--       → id (UUID PK) + created_at + updated_at.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_features_airequest (
    id                 UUID        NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id            UUID        NOT NULL
                           REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    school_id          VARCHAR(50)
                           REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    request_type       VARCHAR(50) NOT NULL,
    prompt             TEXT        NOT NULL,
    response           TEXT        NOT NULL DEFAULT '',
    model_used         VARCHAR(100) NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    tokens_used        INTEGER     NOT NULL DEFAULT 0,
    status             VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message      TEXT        NOT NULL DEFAULT '',
    processing_time_ms INTEGER,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_request_user_created_idx   ON ai_features_airequest (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_request_school_created_idx ON ai_features_airequest (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_request_status_created_idx ON ai_features_airequest (status, created_at);
CREATE INDEX IF NOT EXISTS ai_request_type_created_idx   ON ai_features_airequest (request_type, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_features_aiinsight (
    id           UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    school_id    VARCHAR(50)
                     REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    insight_type VARCHAR(50)  NOT NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT         NOT NULL,
    data         JSONB        NOT NULL DEFAULT '{}',
    target_role  VARCHAR(100) NOT NULL,
    expires_at   TIMESTAMP WITH TIME ZONE,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_insight_school_active_idx  ON ai_features_aiinsight (school_id, is_active);
CREATE INDEX IF NOT EXISTS ai_insight_type_created_idx   ON ai_features_aiinsight (insight_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_insight_expires_active_idx ON ai_features_aiinsight (expires_at, is_active);

-- ============================================================================
-- SECTION 3: ANNOUNCEMENTS
-- Note: Announcement and AnnouncementRead use a local TimeStampedModel
--       → created_at + updated_at. Both get BIGSERIAL auto IDs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS announcements_announcement (
    id             BIGSERIAL PRIMARY KEY,
    school_id      VARCHAR(50)
                       REFERENCES schools(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    sender_id      UUID        NOT NULL
                       REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    title          VARCHAR(255) NOT NULL,
    content        TEXT         NOT NULL,
    target         VARCHAR(20)  NOT NULL,
    target_user_id UUID
                       REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    is_pinned      BOOLEAN      NOT NULL DEFAULT FALSE,
    expires_at     TIMESTAMP WITH TIME ZONE,
    attachment     VARCHAR(100),
    view_count     INTEGER      NOT NULL DEFAULT 0,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS announcements_school_target_idx ON announcements_announcement (school_id, target);
CREATE INDEX IF NOT EXISTS announcements_sender_idx        ON announcements_announcement (sender_id);

CREATE TABLE IF NOT EXISTS announcements_announcementread (
    id              BIGSERIAL PRIMARY KEY,
    announcement_id BIGINT  NOT NULL
                        REFERENCES announcements_announcement(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    user_id         UUID    NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    read_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT announcements_read_announcement_user_uniq UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcements_read_user_read_at_idx
    ON announcements_announcementread (user_id, read_at);

-- ============================================================================
-- SECTION 4: ORDERS
-- Note: Order uses a local TimeStampedModel → created_at + updated_at.
--       Gets BIGSERIAL auto ID.
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders_order (
    id              BIGSERIAL PRIMARY KEY,
    full_name       VARCHAR(255) NOT NULL,
    occupation      VARCHAR(255) NOT NULL,
    school_name     VARCHAR(255) NOT NULL,
    whatsapp_number VARCHAR(20)  NOT NULL,
    email           VARCHAR(254) NOT NULL,
    region          VARCHAR(255) NOT NULL,
    division        VARCHAR(255) NOT NULL,
    sub_division    VARCHAR(255) NOT NULL,
    message         TEXT         NOT NULL DEFAULT '',
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
    processed_by_id UUID
                        REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    processed_at    TIMESTAMP WITH TIME ZONE,
    notes           TEXT         NOT NULL DEFAULT '',
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_order_status_created_idx ON orders_order (status, created_at);
CREATE INDEX IF NOT EXISTS orders_order_email_idx          ON orders_order (email);

-- ============================================================================
-- Done – run 05_feedback_support_remarks_liveclasses.sql next
-- ============================================================================
