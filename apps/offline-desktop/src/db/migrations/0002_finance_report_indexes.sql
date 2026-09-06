-- Adds reporting indexes used by the Financial Management collections report
-- and the Report Cards historical list. Split into its own version so the
-- migration runner's ordering/idempotency behaviour is exercised by more
-- than a single migration (see tests/migrate.test.ts).

CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_report_cards_term_year ON report_cards(term, academic_year);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
