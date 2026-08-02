-- ============================================================================
--  EduIgnite – DDL Part 6: SimpleJWT, Celery Beat/Results + Post-Setup Guide
--  Requires Parts 1–5 to have been run first.
-- ============================================================================

-- ============================================================================
-- SECTION 1: SIMPLEJWT TOKEN BLACKLIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS token_blacklist_outstandingtoken (
    id         BIGSERIAL PRIMARY KEY,
    token      TEXT         NOT NULL UNIQUE,
    jti        VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id    UUID
                   REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS token_blacklist_outstanding_user_idx
    ON token_blacklist_outstandingtoken (user_id);

CREATE TABLE IF NOT EXISTS token_blacklist_blacklistedtoken (
    id             BIGSERIAL PRIMARY KEY,
    blacklisted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    token_id       BIGINT NOT NULL UNIQUE
                       REFERENCES token_blacklist_outstandingtoken(id) ON DELETE CASCADE
                       DEFERRABLE INITIALLY DEFERRED
);

-- ============================================================================
-- SECTION 2: CELERY BEAT SCHEDULE TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS django_celery_beat_clockedschedule (
    id           BIGSERIAL PRIMARY KEY,
    clocked_time TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS django_celery_beat_intervalschedule (
    id     BIGSERIAL PRIMARY KEY,
    every  INTEGER     NOT NULL,
    period VARCHAR(24) NOT NULL
);

CREATE TABLE IF NOT EXISTS django_celery_beat_crontabschedule (
    id             BIGSERIAL PRIMARY KEY,
    minute         VARCHAR(240) NOT NULL DEFAULT '*',
    hour           VARCHAR(96)  NOT NULL DEFAULT '*',
    day_of_week    VARCHAR(64)  NOT NULL DEFAULT '*',
    day_of_month   VARCHAR(124) NOT NULL DEFAULT '*',
    month_of_year  VARCHAR(64)  NOT NULL DEFAULT '*',
    timezone       VARCHAR(63)  NOT NULL DEFAULT 'UTC'
);

CREATE TABLE IF NOT EXISTS django_celery_beat_solarschedule (
    id        BIGSERIAL PRIMARY KEY,
    event     VARCHAR(24)   NOT NULL,
    latitude  NUMERIC(9,6)  NOT NULL,
    longitude NUMERIC(9,6)  NOT NULL,
    CONSTRAINT django_celery_beat_solar_event_lat_long_uniq
        UNIQUE (event, latitude, longitude)
);

CREATE TABLE IF NOT EXISTS django_celery_beat_periodictask (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(200) NOT NULL UNIQUE,
    task             VARCHAR(200) NOT NULL,
    args             TEXT         NOT NULL DEFAULT '[]',
    kwargs           TEXT         NOT NULL DEFAULT '{}',
    queue            VARCHAR(200),
    exchange         VARCHAR(200),
    routing_key      VARCHAR(200),
    headers          TEXT         NOT NULL DEFAULT '{}',
    priority         INTEGER,
    expires          TIMESTAMP WITH TIME ZONE,
    expire_seconds   INTEGER,
    one_off          BOOLEAN      NOT NULL DEFAULT FALSE,
    start_time       TIMESTAMP WITH TIME ZONE,
    enabled          BOOLEAN      NOT NULL DEFAULT TRUE,
    last_run_at      TIMESTAMP WITH TIME ZONE,
    total_run_count  INTEGER      NOT NULL DEFAULT 0,
    date_changed     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    description      TEXT         NOT NULL DEFAULT '',
    clocked_id       BIGINT REFERENCES django_celery_beat_clockedschedule(id)  ON DELETE CASCADE,
    crontab_id       BIGINT REFERENCES django_celery_beat_crontabschedule(id)  ON DELETE CASCADE,
    interval_id      BIGINT REFERENCES django_celery_beat_intervalschedule(id) ON DELETE CASCADE,
    solar_id         BIGINT REFERENCES django_celery_beat_solarschedule(id)    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS django_celery_beat_periodictasks (
    ident       SMALLINT PRIMARY KEY,
    last_update TIMESTAMP WITH TIME ZONE NOT NULL
);

-- ============================================================================
-- SECTION 3: CELERY RESULTS TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS django_celery_results_taskresult (
    id                    BIGSERIAL PRIMARY KEY,
    task_id               VARCHAR(255) NOT NULL UNIQUE,
    periodic_task_name    VARCHAR(255),
    task_name             VARCHAR(255),
    task_args             TEXT,
    task_kwargs           TEXT,
    status                VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
    worker                VARCHAR(100),
    content_type          VARCHAR(128) NOT NULL DEFAULT 'application/json',
    content_encoding      VARCHAR(64)  NOT NULL DEFAULT 'utf-8',
    result                TEXT,
    date_created          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    date_done             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    traceback             TEXT,
    meta                  TEXT,
    hidden                BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS celery_results_task_id_idx ON django_celery_results_taskresult (task_id);

CREATE TABLE IF NOT EXISTS django_celery_results_chordcounter (
    id        BIGSERIAL PRIMARY KEY,
    group_id  VARCHAR(255) NOT NULL UNIQUE,
    sub_tasks TEXT         NOT NULL,
    count     INTEGER      NOT NULL
);

CREATE TABLE IF NOT EXISTS django_celery_results_groupresult (
    id               BIGSERIAL PRIMARY KEY,
    group_id         VARCHAR(255) NOT NULL UNIQUE,
    date_created     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    date_done        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    content_type     VARCHAR(128) NOT NULL DEFAULT 'application/json',
    content_encoding VARCHAR(64)  NOT NULL DEFAULT 'utf-8',
    result           TEXT
);

-- ============================================================================
-- SECTION 4: SUPERUSER BOOTSTRAP
-- ============================================================================
-- Django passwords cannot be inserted as plaintext. After running all 6 DDL
-- files in Neon, create the superuser via the Django shell on your server:
--
--   python manage.py shell -c "
--   from apps.users.models import User
--   u = User(
--       matricule='EI-SUPER-2026-001',
--       name='Platform Super Admin',
--       email='superadmin@eduignite.com',
--       role='SUPER_ADMIN',
--       is_staff=True,
--       is_superuser=True,
--       is_active=True,
--   )
--   u.set_unusable_password()
--   u.save()
--   print('Created:', u.matricule)
--   "
--
-- Then activate by calling:
--   POST /api/v1/auth/activate/
--   { "matricule": "EI-SUPER-2026-001",
--     "new_password": "<your-password>",
--     "confirm_password": "<your-password>" }
--
-- Then log in:
--   POST /api/v1/auth/login/
--   { "matricule": "EI-SUPER-2026-001", "password": "<your-password>" }

-- ============================================================================
-- SECTION 5: MARK ALL MIGRATIONS AS APPLIED
-- ============================================================================
-- After running all 6 DDL files in Neon, fake-apply Django migrations so
-- that 'python manage.py migrate' does not try to recreate existing tables:
--
--   python manage.py migrate --fake
--
-- This records all migrations as applied without executing their SQL.
-- Run this once on your server after the Neon tables are confirmed created.

-- ============================================================================
-- SECTION 6: SEED PLATFORM SETTINGS SINGLETON
-- ============================================================================
-- PlatformSettings is a singleton (pk always = 1). Insert the default row:

INSERT INTO platform_settings (id, name, contact_email, fees, tutorial_links)
VALUES (1, 'EduIgnite', 'eduignitecmr@gmail.com', '{}', '{}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SECTION 7: USEFUL POST-SETUP INTEGRITY CHECKS
-- ============================================================================

-- Count tables created
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- Verify no orphaned school FKs on users
SELECT COUNT(*) AS orphaned_users
FROM users u
WHERE u.school_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM schools s WHERE s.id = u.school_id);

-- Confirm platform_settings singleton exists
SELECT id, name, contact_email FROM platform_settings WHERE id = 1;

-- ============================================================================
-- ALL DONE.
-- Run order: 01 → 02 → 03 → 04 → 05 → 06
-- Then on your server: python manage.py migrate --fake
-- ============================================================================
