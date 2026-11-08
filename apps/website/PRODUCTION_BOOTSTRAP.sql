BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.platform_settings (
  id,
  name,
  payment_deadline,
  honour_roll_threshold,
  fees,
  tutorial_links,
  maintenance_mode,
  contact_email,
  contact_phone
)
VALUES (
  1,
  'EduIgnite',
  NULL,
  12.00,
  '{"STUDENT":"5000","PARENT":"2500","TEACHER":"10000","BURSAR":"10000","LIBRARIAN":"10000","SCHOOL_ADMIN":"25000","SUB_ADMIN":"15000"}'::jsonb,
  '{"STUDENT":"","TEACHER":"","PARENT":"","SCHOOL_ADMIN":"","SUB_ADMIN":"","BURSAR":"","LIBRARIAN":""}'::jsonb,
  FALSE,
  'info@eduignite.online',
  NULL
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  honour_roll_threshold = EXCLUDED.honour_roll_threshold,
  fees = EXCLUDED.fees,
  tutorial_links = EXCLUDED.tutorial_links,
  maintenance_mode = EXCLUDED.maintenance_mode,
  contact_email = EXCLUDED.contact_email,
  contact_phone = EXCLUDED.contact_phone;

INSERT INTO public.platform_fees (role, amount, currency)
VALUES
  ('STUDENT', 5000.00, 'XAF'),
  ('PARENT', 2500.00, 'XAF'),
  ('TEACHER', 10000.00, 'XAF'),
  ('BURSAR', 10000.00, 'XAF'),
  ('LIBRARIAN', 10000.00, 'XAF'),
  ('SCHOOL_ADMIN', 25000.00, 'XAF'),
  ('SUB_ADMIN', 15000.00, 'XAF')
ON CONFLICT (role) DO UPDATE
SET
  amount = EXCLUDED.amount,
  currency = EXCLUDED.currency;

INSERT INTO public.tutorial_links (role, url, title)
VALUES
  ('STUDENT', 'https://example.com/student-tutorial', 'Student Tutorial'),
  ('TEACHER', 'https://example.com/teacher-tutorial', 'Teacher Tutorial'),
  ('PARENT', 'https://example.com/parent-tutorial', 'Parent Tutorial'),
  ('SCHOOL_ADMIN', 'https://example.com/admin-tutorial', 'School Admin Tutorial'),
  ('SUB_ADMIN', 'https://example.com/sub-admin-tutorial', 'Sub Admin Tutorial'),
  ('BURSAR', 'https://example.com/bursar-tutorial', 'Bursar Tutorial'),
  ('LIBRARIAN', 'https://example.com/librarian-tutorial', 'Librarian Tutorial')
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS users_one_ceo_idx
ON public.users (role)
WHERE role = 'CEO';

CREATE UNIQUE INDEX IF NOT EXISTS users_one_cto_idx
ON public.users (role)
WHERE role = 'CTO';

CREATE OR REPLACE FUNCTION public.protect_eduignite_founders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.matricule IN ('EDU-CEO-0001', 'EDU-CTO-0001') THEN
    RAISE EXCEPTION 'Founder accounts cannot be deleted.';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.matricule IN ('EDU-CEO-0001', 'EDU-CTO-0001') THEN
    IF NEW.matricule <> OLD.matricule THEN
      RAISE EXCEPTION 'Founder matricules cannot be changed.';
    END IF;

    IF NEW.role <> OLD.role THEN
      RAISE EXCEPTION 'Founder roles cannot be changed.';
    END IF;

    IF NEW.is_active <> TRUE THEN
      RAISE EXCEPTION 'Founder accounts cannot be deactivated.';
    END IF;

    IF NEW.is_staff <> TRUE THEN
      RAISE EXCEPTION 'Founder staff access cannot be removed.';
    END IF;

    IF NEW.is_superuser <> TRUE THEN
      RAISE EXCEPTION 'Founder superuser access cannot be removed.';
    END IF;

    NEW.is_license_paid := TRUE;
    NEW.is_active := TRUE;
    NEW.is_staff := TRUE;
    NEW.is_superuser := TRUE;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_eduignite_founders ON public.users;

CREATE TRIGGER trg_protect_eduignite_founders
BEFORE UPDATE OR DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.protect_eduignite_founders();

INSERT INTO public.users (
  id,
  matricule,
  name,
  email,
  role,
  password,
  school_id,
  uid,
  is_license_paid,
  ai_request_count,
  annual_avg,
  is_active,
  is_staff,
  is_superuser,
  date_joined,
  last_login
)
VALUES
(
  gen_random_uuid(),
  'EDU-CEO-0001',
  'EduIgnite Chief Executive Officer',
  'ceo@eduignite.com',
  'CEO',
  '!pending_activation',
  NULL,
  NULL,
  TRUE,
  0,
  NULL,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NULL
),
(
  gen_random_uuid(),
  'EDU-CTO-0001',
  'EduIgnite Chief Technology Officer',
  'cto@eduignite.com',
  'CTO',
  '!pending_activation',
  NULL,
  NULL,
  TRUE,
  0,
  NULL,
  TRUE,
  TRUE,
  TRUE,
  NOW(),
  NULL
)
ON CONFLICT (matricule) DO UPDATE
SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  password = '!pending_activation',
  is_license_paid = TRUE,
  is_active = TRUE,
  is_staff = TRUE,
  is_superuser = TRUE;

INSERT INTO public.schools (
  id,
  name,
  short_name,
  principal,
  principal_user_id,
  motto,
  description,
  location,
  region,
  division,
  sub_division,
  city_village,
  address,
  postal_code,
  phone,
  email,
  status,
  founded_year,
  student_count,
  teacher_count,
  created_at,
  updated_at
)
VALUES (
  'SCH-001',
  'EduIgnite Demonstration School',
  'EIS',
  'Principal Placeholder',
  NULL,
  'Ignite learning',
  'Initial production bootstrap school.',
  'Main Campus',
  'Centre',
  'Mfoundi',
  'Yaounde I',
  'Yaounde',
  'Campus Road',
  NULL,
  '+237670000000',
  'school-admin@eduignite.com',
  'Active',
  2026,
  0,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  principal = EXCLUDED.principal,
  motto = EXCLUDED.motto,
  description = EXCLUDED.description,
  location = EXCLUDED.location,
  region = EXCLUDED.region,
  division = EXCLUDED.division,
  sub_division = EXCLUDED.sub_division,
  city_village = EXCLUDED.city_village,
  address = EXCLUDED.address,
  postal_code = EXCLUDED.postal_code,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  status = EXCLUDED.status,
  founded_year = EXCLUDED.founded_year,
  updated_at = NOW();

INSERT INTO public.school_settings (
  school_id,
  licence_expiry,
  max_students,
  max_teachers,
  academic_year,
  term,
  allow_ai_features,
  ai_request_limit
)
VALUES (
  'SCH-001',
  NULL,
  500,
  50,
  '2026-2027',
  'First',
  TRUE,
  1000
)
ON CONFLICT (school_id) DO UPDATE
SET
  max_students = EXCLUDED.max_students,
  max_teachers = EXCLUDED.max_teachers,
  academic_year = EXCLUDED.academic_year,
  term = EXCLUDED.term,
  allow_ai_features = EXCLUDED.allow_ai_features,
  ai_request_limit = EXCLUDED.ai_request_limit;

INSERT INTO public.users (
  id, matricule, name, email, role, password, school_id, is_license_paid,
  ai_request_count, is_active, is_staff, is_superuser, date_joined
)
VALUES
  (gen_random_uuid(), 'SCH-ADM-0001', 'School Administrator', 'school-admin@eduignite.com', 'SCHOOL_ADMIN', '!pending_activation', 'SCH-001', TRUE, 0, TRUE, TRUE, FALSE, NOW()),
  (gen_random_uuid(), 'SCH-SUB-0001', 'Sub Administrator', 'sub-admin@eduignite.com', 'SUB_ADMIN', '!pending_activation', 'SCH-001', TRUE, 0, TRUE, TRUE, FALSE, NOW()),
  (gen_random_uuid(), 'SCH-TEA-0001', 'Teacher Example', 'teacher@eduignite.com', 'TEACHER', '!pending_activation', 'SCH-001', TRUE, 0, TRUE, FALSE, FALSE, NOW()),
  (gen_random_uuid(), 'SCH-BUR-0001', 'Bursar Example', 'bursar@eduignite.com', 'BURSAR', '!pending_activation', 'SCH-001', TRUE, 0, TRUE, FALSE, FALSE, NOW()),
  (gen_random_uuid(), 'SCH-LIB-0001', 'Librarian Example', 'librarian@eduignite.com', 'LIBRARIAN', '!pending_activation', 'SCH-001', TRUE, 0, TRUE, FALSE, FALSE, NOW()),
  (gen_random_uuid(), 'SCH-PAR-0001', 'Parent Example', 'parent@eduignite.com', 'PARENT', '!pending_activation', 'SCH-001', TRUE, 0, TRUE, FALSE, FALSE, NOW()),
  (gen_random_uuid(), 'SCH-STU-0001', 'Student Example', 'student@eduignite.com', 'STUDENT', '!pending_activation', 'SCH-001', TRUE, 0, TRUE, FALSE, FALSE, NOW())
ON CONFLICT (matricule) DO UPDATE
SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  school_id = EXCLUDED.school_id,
  is_license_paid = EXCLUDED.is_license_paid,
  is_active = EXCLUDED.is_active;

UPDATE public.schools
SET principal_user_id = (
  SELECT id FROM public.users WHERE matricule = 'SCH-ADM-0001'
)
WHERE id = 'SCH-001';

INSERT INTO public.students_student (
  id,
  user_id,
  school_id,
  student_class,
  class_level,
  section,
  date_of_birth,
  gender,
  guardian_name,
  guardian_phone,
  guardian_whatsapp,
  admission_number,
  admission_date,
  annual_average,
  is_on_honour_roll,
  created,
  modified
)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.users WHERE matricule = 'SCH-STU-0001'),
  'SCH-001',
  'Form 5 Science',
  'form5',
  'science',
  DATE '2010-01-15',
  'male',
  'Parent Example',
  '+237671111111',
  '+237671111111',
  'ADM-2026-0001',
  CURRENT_DATE,
  NULL,
  FALSE,
  NOW(),
  NOW()
)
ON CONFLICT (admission_number) DO NOTHING;

INSERT INTO public.students_parentstudentlink (
  id,
  parent_id,
  student_id,
  relationship,
  is_primary,
  created,
  modified
)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.users WHERE matricule = 'SCH-PAR-0001'),
  (SELECT id FROM public.students_student WHERE admission_number = 'ADM-2026-0001'),
  'father',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (parent_id, student_id) DO UPDATE
SET
  relationship = EXCLUDED.relationship,
  is_primary = EXCLUDED.is_primary,
  modified = NOW();

INSERT INTO public.grades_subject (
  id,
  school_id,
  name,
  code,
  level,
  coefficient,
  teacher_id,
  is_active,
  created,
  modified
)
VALUES
  (gen_random_uuid(), 'SCH-001', 'Mathematics', 'MATH-F5', 'Form 5', 5.00, (SELECT id FROM public.users WHERE matricule = 'SCH-TEA-0001'), TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'SCH-001', 'Physics', 'PHYS-F5', 'Form 5', 4.00, (SELECT id FROM public.users WHERE matricule = 'SCH-TEA-0001'), TRUE, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.grades_sequence (
  id,
  school_id,
  name,
  academic_year,
  term,
  start_date,
  end_date,
  is_active,
  created_at,
  updated_at
)
VALUES (
  gen_random_uuid(),
  'SCH-001',
  'Sequence 1',
  '2026-2027',
  1,
  DATE '2026-09-01',
  DATE '2026-10-15',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (school_id, academic_year, term, name) DO NOTHING;

INSERT INTO public.fees_feestructure (
  id,
  school_id,
  name,
  role,
  amount,
  currency,
  academic_year,
  due_date,
  is_mandatory,
  description,
  created,
  modified
)
VALUES
  (gen_random_uuid(), 'SCH-001', 'School Fees 2026-2027', 'STUDENT', 150000.00, 'XAF', '2026-2027', DATE '2026-10-31', TRUE, 'Annual tuition', NOW(), NOW()),
  (gen_random_uuid(), 'SCH-001', 'Parent Access Fee 2026-2027', 'PARENT', 5000.00, 'XAF', '2026-2027', DATE '2026-10-31', TRUE, 'Parent portal access', NOW(), NOW()),
  (gen_random_uuid(), 'SCH-001', 'Teacher Access Fee 2026-2027', 'TEACHER', 10000.00, 'XAF', '2026-2027', DATE '2026-10-31', TRUE, 'Teacher portal access', NOW(), NOW())
ON CONFLICT (school_id, name, academic_year) DO NOTHING;

INSERT INTO public.library_bookcategory (
  id,
  school_id,
  name,
  color
)
VALUES
  (DEFAULT, 'SCH-001', 'Science', '#264D73'),
  (DEFAULT, 'SCH-001', 'Literature', '#67D0E4')
ON CONFLICT DO NOTHING;

INSERT INTO public.library_book (
  id,
  school_id,
  title,
  author,
  isbn,
  category_id,
  publisher,
  publication_year,
  total_copies,
  available_copies,
  description,
  location,
  is_active,
  created_at,
  updated_at
)
VALUES (
  DEFAULT,
  'SCH-001',
  'Fundamentals of Mathematics',
  'EduIgnite Press',
  '9780000000001',
  (SELECT id FROM public.library_bookcategory WHERE school_id = 'SCH-001' AND name = 'Science' LIMIT 1),
  'EduIgnite Press',
  2026,
  10,
  10,
  'Bootstrap library title',
  'Shelf A1',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (isbn) DO NOTHING;

INSERT INTO public.public_events (
  id,
  type,
  title,
  description,
  url,
  is_active,
  "order",
  created_at,
  updated_at
)
VALUES (
  DEFAULT,
  'news',
  'EduIgnite Platform Live',
  'Initial production launch event.',
  'https://example.com/launch',
  TRUE,
  1,
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

COMMIT;
