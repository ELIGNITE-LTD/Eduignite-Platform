BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Founders must already exist from the founder bootstrap.
-- This script fills CEO/CTO operational tabs with compatible live records.

INSERT INTO public.schools (
  id,
  name,
  short_name,
  principal,
  motto,
  description,
  location,
  region,
  division,
  sub_division,
  city_village,
  address,
  phone,
  email,
  status,
  student_count,
  teacher_count
)
VALUES
(
  'EIS-DOU',
  'EduIgnite International School Douala',
  'EISDOU',
  'Dr. Mireille Ndzi',
  'Knowledge, Character, Impact',
  'Flagship EduIgnite partner campus for executive monitoring in Douala.',
  'Douala',
  'Littoral',
  'Wouri',
  'Douala I',
  'Bonanjo',
  '12 Innovation Avenue, Bonanjo',
  '+237670000101',
  'douala-campus@eduignite.com',
  'Active',
  0,
  0
),
(
  'EIS-YDE',
  'EduIgnite International School Yaounde',
  'EISYDE',
  'Mrs. Clarisse Mbah',
  'Discipline, Vision, Excellence',
  'Capital city pilot campus used for governance, support, and announcement flows.',
  'Yaounde',
  'Centre',
  'Mfoundi',
  'Yaounde II',
  'Bastos',
  '25 Founders Boulevard, Bastos',
  '+237670000202',
  'yaounde-campus@eduignite.com',
  'Pending',
  0,
  0
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
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  status = EXCLUDED.status;

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
VALUES
('EIS-DOU', DATE '2027-08-31', 1500, 120, '2026-2027', 'First', TRUE, 5000),
('EIS-YDE', DATE '2027-08-31', 1200, 100, '2026-2027', 'First', TRUE, 5000)
ON CONFLICT (school_id) DO UPDATE
SET
  licence_expiry = EXCLUDED.licence_expiry,
  max_students = EXCLUDED.max_students,
  max_teachers = EXCLUDED.max_teachers,
  academic_year = EXCLUDED.academic_year,
  term = EXCLUDED.term,
  allow_ai_features = EXCLUDED.allow_ai_features,
  ai_request_limit = EXCLUDED.ai_request_limit;

INSERT INTO public.users (
  matricule,
  name,
  email,
  phone,
  whatsapp,
  role,
  school_id,
  password,
  is_license_paid,
  is_active,
  is_staff
)
VALUES
('EISDOU-ADM-0001', 'Mme Sandrine Fokou', 'sandrine.fokou@eduignite.com', '+237670100001', '+237670100001', 'SCHOOL_ADMIN', 'EIS-DOU', '!pending_activation', TRUE, TRUE, TRUE),
('EISDOU-SUB-0001', 'Mr. Patrice Ekani', 'patrice.ekani@eduignite.com', '+237670100002', '+237670100002', 'SUB_ADMIN', 'EIS-DOU', '!pending_activation', TRUE, TRUE, TRUE),
('EISDOU-TEA-0001', 'Mrs. Linda Atanga', 'linda.atanga@eduignite.com', '+237670100003', '+237670100003', 'TEACHER', 'EIS-DOU', '!pending_activation', TRUE, TRUE, FALSE),
('EISDOU-BUR-0001', 'Mr. Joel Tamo', 'joel.tamo@eduignite.com', '+237670100004', '+237670100004', 'BURSAR', 'EIS-DOU', '!pending_activation', TRUE, TRUE, FALSE),
('EISDOU-LIB-0001', 'Mrs. Esther Nfor', 'esther.nfor@eduignite.com', '+237670100005', '+237670100005', 'LIBRARIAN', 'EIS-DOU', '!pending_activation', TRUE, TRUE, FALSE),
('EISYDE-ADM-0001', 'Mrs. Ruth Ndzi', 'ruth.ndzi@eduignite.com', '+237670200001', '+237670200001', 'SCHOOL_ADMIN', 'EIS-YDE', '!pending_activation', TRUE, TRUE, TRUE),
('EISYDE-TEA-0001', 'Mr. Thierry Ndzi', 'thierry.ndzi@eduignite.com', '+237670200002', '+237670200002', 'TEACHER', 'EIS-YDE', '!pending_activation', TRUE, TRUE, FALSE)
ON CONFLICT (matricule) DO UPDATE
SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  whatsapp = EXCLUDED.whatsapp,
  role = EXCLUDED.role,
  school_id = EXCLUDED.school_id,
  is_license_paid = TRUE,
  is_active = TRUE,
  is_staff = EXCLUDED.is_staff;

UPDATE public.schools
SET teacher_count = (
  SELECT COUNT(*)
  FROM public.users u
  WHERE u.school_id = public.schools.id
    AND u.role = 'TEACHER'
)
WHERE id IN ('EIS-DOU', 'EIS-YDE');

INSERT INTO public.announcements_announcement (
  school_id,
  sender_id,
  title,
  content,
  target,
  is_pinned,
  expires_at,
  view_count
)
SELECT
  NULL,
  u.id,
  'Founder Operations Bulletin',
  'CEO and CTO oversight is active. All executive dashboards, school provisioning, and operational monitoring are now enabled for the 2026-2027 cycle.',
  'ALL',
  TRUE,
  NOW() + INTERVAL '90 days',
  0
FROM public.users u
WHERE u.matricule = 'EDU-CEO-0001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.announcements_announcement a
    WHERE a.title = 'Founder Operations Bulletin'
  );

INSERT INTO public.announcements_announcement (
  school_id,
  sender_id,
  title,
  content,
  target,
  is_pinned,
  expires_at,
  view_count
)
SELECT
  'EIS-DOU',
  u.id,
  'Douala Campus Go-Live',
  'This school node has been provisioned and is ready for school-admin activation, staffing, and operational onboarding.',
  'SCHOOL_ALL',
  TRUE,
  NOW() + INTERVAL '45 days',
  0
FROM public.users u
WHERE u.matricule = 'EISDOU-ADM-0001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.announcements_announcement a
    WHERE a.title = 'Douala Campus Go-Live'
  );

INSERT INTO public.support_supportcontribution (
  user_id,
  school_id,
  amount,
  currency,
  payment_method,
  phone,
  message,
  status,
  verified_by_id,
  verified_at,
  transaction_reference
)
SELECT
  contributor.id,
  contributor.school_id,
  150000.00,
  'XAF',
  'Mobile Money',
  contributor.phone,
  'Executive contribution allocated to infrastructure rollout and AI enablement.',
  'Verified',
  verifier.id,
  NOW(),
  'SUP-EISDOU-2026-001'
FROM public.users contributor
CROSS JOIN public.users verifier
WHERE contributor.matricule = 'EISDOU-ADM-0001'
  AND verifier.matricule = 'EDU-CEO-0001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.support_supportcontribution s
    WHERE s.transaction_reference = 'SUP-EISDOU-2026-001'
  );

INSERT INTO public.feedback_feedback (
  school_id,
  sender_id,
  subject,
  message,
  status,
  priority,
  resolved_by_id,
  resolved_at,
  resolution_note
)
SELECT
  sender.school_id,
  sender.id,
  'Need timetable rollout confirmation',
  'The campus needs confirmation on the first-term timetable publication workflow and announcement cadence.',
  'Resolved',
  'High',
  resolver.id,
  NOW(),
  'Resolved at founder level and aligned with the go-live bulletin.'
FROM public.users sender
CROSS JOIN public.users resolver
WHERE sender.matricule = 'EISDOU-ADM-0001'
  AND resolver.matricule = 'EDU-CTO-0001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.feedback_feedback f
    WHERE f.subject = 'Need timetable rollout confirmation'
  );

INSERT INTO public.orders_order (
  full_name,
  occupation,
  school_name,
  whatsapp_number,
  email,
  region,
  division,
  sub_division,
  message,
  status,
  processed_by_id,
  processed_at,
  notes
)
SELECT
  'Mrs. Agnes Nchinda',
  'School Proprietor',
  'Future Leaders College Buea',
  '+237670300001',
  'agnes.nchinda@example.com',
  'Southwest',
  'Fako',
  'Buea',
  'Interested in onboarding a new private secondary school onto EduIgnite.',
  'processed',
  processor.id,
  NOW(),
  'Processed by founders for priority onboarding.'
FROM public.users processor
WHERE processor.matricule = 'EDU-CEO-0001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.orders_order o
    WHERE o.email = 'agnes.nchinda@example.com'
  );

INSERT INTO public.community_testimony (
  user_id,
  school_name,
  role_display,
  message,
  status,
  approved_by_id,
  approved_at
)
SELECT
  author.id,
  'EduIgnite International School Douala',
  'School Administrator',
  'Founder oversight and school provisioning made our activation flow fast, clear, and accountable.',
  'approved',
  approver.id,
  NOW()
FROM public.users author
CROSS JOIN public.users approver
WHERE author.matricule = 'EISDOU-ADM-0001'
  AND approver.matricule = 'EDU-CTO-0001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.community_testimony t
    WHERE t.user_id = author.id
      AND t.school_name = 'EduIgnite International School Douala'
  );

COMMIT;
