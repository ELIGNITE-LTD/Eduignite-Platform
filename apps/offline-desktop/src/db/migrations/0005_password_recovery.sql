-- Security-question-based password recovery for staff logins (users table).
-- Additive only, per this project's migration convention -- existing rows get
-- NULL security_question/security_answer_hash until they set one (recovery
-- is simply unavailable for those accounts until then, same as any account
-- created before this migration existed).
ALTER TABLE users ADD COLUMN security_question TEXT;
ALTER TABLE users ADD COLUMN security_answer_hash TEXT;
ALTER TABLE users ADD COLUMN failed_recovery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN recovery_locked_until TEXT;
