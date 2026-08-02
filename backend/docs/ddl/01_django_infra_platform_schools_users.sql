-- ============================================================================
--  EduIgnite – DDL Part 1: Django Infrastructure, Platform, Schools, Users
--  Run in Neon SQL editor. No demo data. Schema-only.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================================
-- SECTION 1: DJANGO INFRASTRUCTURE
-- ============================================================================

CREATE TABLE IF NOT EXISTS django_migrations (
    id      BIGSERIAL PRIMARY KEY,
    app     VARCHAR(255) NOT NULL,
    name    VARCHAR(255) NOT NULL,
    applied TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS django_content_type (
    id        SERIAL PRIMARY KEY,
    app_label VARCHAR(100) NOT NULL,
    model     VARCHAR(100) NOT NULL,
    CONSTRAINT django_content_type_app_label_model_uniq UNIQUE (app_label, model)
);

CREATE TABLE IF NOT EXISTS auth_permission (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    content_type_id INTEGER NOT NULL REFERENCES django_content_type(id) DEFERRABLE INITIALLY DEFERRED,
    codename        VARCHAR(100) NOT NULL,
    CONSTRAINT auth_permission_content_type_codename_uniq UNIQUE (content_type_id, codename)
);

CREATE TABLE IF NOT EXISTS auth_group (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS auth_group_permissions (
    id            BIGSERIAL PRIMARY KEY,
    group_id      INTEGER NOT NULL REFERENCES auth_group(id) DEFERRABLE INITIALLY DEFERRED,
    permission_id INTEGER NOT NULL REFERENCES auth_permission(id) DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT auth_group_permissions_group_permission_uniq UNIQUE (group_id, permission_id)
);

CREATE TABLE IF NOT EXISTS django_session (
    session_key  VARCHAR(40) PRIMARY KEY,
    session_data TEXT NOT NULL,
    expire_date  TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS django_session_expire_date_idx ON django_session (expire_date);

-- ============================================================================
-- SECTION 2: PLATFORM SETTINGS (no FK dependencies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_settings (
    id                    SERIAL PRIMARY KEY,
    name                  VARCHAR(255) NOT NULL DEFAULT 'EduIgnite',
    logo                  TEXT,
    payment_deadline      DATE,
    honour_roll_threshold NUMERIC(5,2) NOT NULL DEFAULT 12.0,
    fees                  JSONB NOT NULL DEFAULT '{}',
    tutorial_links        JSONB NOT NULL DEFAULT '{}',
    maintenance_mode      BOOLEAN NOT NULL DEFAULT FALSE,
    contact_email         VARCHAR(254) NOT NULL DEFAULT 'eduignitecmr@gmail.com',
    contact_phone         VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS platform_fees (
    id       BIGSERIAL PRIMARY KEY,
    role     VARCHAR(50) NOT NULL UNIQUE,
    amount   NUMERIC(10,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'XAF'
);

CREATE TABLE IF NOT EXISTS tutorial_links (
    id    BIGSERIAL PRIMARY KEY,
    role  VARCHAR(50) NOT NULL,
    url   VARCHAR(200) NOT NULL,
    title VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS public_events (
    id          BIGSERIAL PRIMARY KEY,
    type        VARCHAR(20) NOT NULL,
    title       VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    url         VARCHAR(200) NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    "order"     INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SECTION 3: SCHOOLS  (principal_user_id FK added after users table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS schools (
    id            VARCHAR(50)  PRIMARY KEY,
    name          VARCHAR(255) NOT NULL UNIQUE,
    short_name    VARCHAR(50)  NOT NULL,
    principal     VARCHAR(255) NOT NULL,
    motto         VARCHAR(255) NOT NULL DEFAULT '',
    logo          TEXT,
    banner        TEXT,
    description   TEXT         NOT NULL DEFAULT '',
    location      VARCHAR(255) NOT NULL,
    region        VARCHAR(100) NOT NULL,
    division      VARCHAR(100) NOT NULL,
    sub_division  VARCHAR(100) NOT NULL,
    city_village  VARCHAR(100) NOT NULL,
    address       VARCHAR(255) NOT NULL,
    postal_code   VARCHAR(20),
    phone         VARCHAR(20)  NOT NULL,
    email         VARCHAR(254) NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'Pending',
    founded_year  INTEGER,
    student_count INTEGER      NOT NULL DEFAULT 0,
    teacher_count INTEGER      NOT NULL DEFAULT 0,
    matricule     VARCHAR(50)  UNIQUE,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    -- principal_user_id added via ALTER TABLE after users table is created
);

CREATE INDEX IF NOT EXISTS schools_status_idx ON schools (status);
CREATE INDEX IF NOT EXISTS schools_region_idx ON schools (region);

-- ============================================================================
-- SECTION 4: USERS  (school_id FK references schools)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id               UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
    password         VARCHAR(128) NOT NULL,
    last_login       TIMESTAMP WITH TIME ZONE,
    is_superuser     BOOLEAN      NOT NULL DEFAULT FALSE,
    uid              VARCHAR(255) UNIQUE,
    matricule        VARCHAR(50)  NOT NULL UNIQUE,
    name             VARCHAR(255) NOT NULL,
    email            VARCHAR(254) NOT NULL UNIQUE,
    phone            VARCHAR(20),
    whatsapp         VARCHAR(20),
    role             VARCHAR(50)  NOT NULL DEFAULT 'STUDENT',
    school_id        VARCHAR(50)  REFERENCES schools(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    avatar           TEXT,
    is_license_paid  BOOLEAN      NOT NULL DEFAULT FALSE,
    ai_request_count INTEGER      NOT NULL DEFAULT 0,
    annual_avg       NUMERIC(5,2),
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    is_staff         BOOLEAN      NOT NULL DEFAULT FALSE,
    date_joined      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_matricule_idx ON users (matricule);
CREATE INDEX IF NOT EXISTS users_email_idx     ON users (email);
CREATE INDEX IF NOT EXISTS users_role_idx      ON users (role);
CREATE INDEX IF NOT EXISTS users_school_idx    ON users (school_id);

-- Now add the circular FK from schools → users
ALTER TABLE schools
    ADD COLUMN IF NOT EXISTS principal_user_id UUID
        REFERENCES users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX IF NOT EXISTS schools_principal_user_uniq
    ON schools (principal_user_id) WHERE principal_user_id IS NOT NULL;

-- ============================================================================
-- SECTION 5: DJANGO AUTH M2M TABLES (PermissionsMixin)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users_user_groups (
    id       BIGSERIAL PRIMARY KEY,
    user_id  UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    group_id INTEGER NOT NULL REFERENCES auth_group(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT users_user_groups_user_group_uniq UNIQUE (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS users_user_user_permissions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    permission_id INTEGER NOT NULL REFERENCES auth_permission(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT users_user_user_permissions_user_perm_uniq UNIQUE (user_id, permission_id)
);

-- ============================================================================
-- SECTION 6: DJANGO ADMIN LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS django_admin_log (
    id              SERIAL PRIMARY KEY,
    action_time     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    object_id       TEXT,
    object_repr     VARCHAR(200) NOT NULL,
    action_flag     SMALLINT NOT NULL,
    change_message  TEXT NOT NULL,
    content_type_id INTEGER REFERENCES django_content_type(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS django_admin_log_user_idx         ON django_admin_log (user_id);
CREATE INDEX IF NOT EXISTS django_admin_log_content_type_idx ON django_admin_log (content_type_id);

-- ============================================================================
-- Done – run 02_founders_school_settings_students_grades.sql next
-- ============================================================================
