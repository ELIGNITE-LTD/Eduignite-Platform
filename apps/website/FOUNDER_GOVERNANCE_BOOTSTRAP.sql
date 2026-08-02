BEGIN;

-- Primary founder profiles for the protected CEO and CTO accounts.
-- Run this after applying Django migrations, including users.0002.

INSERT INTO public.founder_profiles (
  user_id,
  founder_title,
  primary_share_percentage,
  is_primary_founder,
  can_be_removed,
  created_at,
  updated_at
)
SELECT
  u.id,
  'Chief Executive Officer & Co-Founder',
  40.00,
  TRUE,
  FALSE,
  NOW(),
  NOW()
FROM public.users u
WHERE u.matricule = 'EDU-CEO-0001'
ON CONFLICT (user_id) DO UPDATE
SET
  founder_title = EXCLUDED.founder_title,
  primary_share_percentage = EXCLUDED.primary_share_percentage,
  is_primary_founder = TRUE,
  can_be_removed = FALSE,
  updated_at = NOW();

INSERT INTO public.founder_profiles (
  user_id,
  founder_title,
  primary_share_percentage,
  is_primary_founder,
  can_be_removed,
  created_at,
  updated_at
)
SELECT
  u.id,
  'Chief Technology Officer & Co-Founder',
  27.00,
  TRUE,
  FALSE,
  NOW(),
  NOW()
FROM public.users u
WHERE u.matricule = 'EDU-CTO-0001'
ON CONFLICT (user_id) DO UPDATE
SET
  founder_title = EXCLUDED.founder_title,
  primary_share_percentage = EXCLUDED.primary_share_percentage,
  is_primary_founder = TRUE,
  can_be_removed = FALSE,
  updated_at = NOW();

COMMIT;

-- Optional manual secondary-founder example:
-- This mirrors what the new Founder Governance dashboard now does automatically.
--
-- WITH new_founder AS (
--   INSERT INTO public.users (
--     id,
--     matricule,
--     name,
--     email,
--     phone,
--     whatsapp,
--     role,
--     password,
--     is_license_paid,
--     is_active,
--     is_staff,
--     date_joined
--   )
--   VALUES (
--     gen_random_uuid(),
--     'EDU-FND-INV-0001',
--     'Example Secondary Founder',
--     'founder@example.com',
--     '+237670400001',
--     '+237670400001',
--     'INV',
--     '!pending_activation',
--     TRUE,
--     TRUE,
--     FALSE,
--     NOW()
--   )
--   RETURNING id
-- )
-- INSERT INTO public.founder_profiles (
--   user_id,
--   founder_title,
--   primary_share_percentage,
--   is_primary_founder,
--   can_be_removed,
--   created_at,
--   updated_at
-- )
-- SELECT
--   id,
--   'Strategic Investor Founder',
--   6.50,
--   FALSE,
--   TRUE,
--   NOW(),
--   NOW()
-- FROM new_founder;
