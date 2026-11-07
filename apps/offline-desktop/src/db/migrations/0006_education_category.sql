-- Adds the school's education category (basic / secondary / higher) to the
-- single-row `schools` table, mirroring the cloud's School.education_category.
-- Additive only, like every migration here. Existing installations are
-- secondary schools, so that is the default and nothing about them changes.
-- The value travels in the migration export (`educationCategory`), where the
-- cloud uses it to import pupils of basic (nursery/primary) schools without
-- login accounts.
ALTER TABLE schools ADD COLUMN education_category TEXT NOT NULL DEFAULT 'secondary'
  CHECK (education_category IN ('basic', 'secondary', 'higher'));
