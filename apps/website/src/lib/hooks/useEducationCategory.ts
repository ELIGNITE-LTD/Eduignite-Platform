import { useAuth } from '@/lib/auth-context';
import { useSchool, useSchoolSettings } from '@/lib/hooks/useSchools';
import {
  normalizeEducationCategory,
  type BasicSection,
  type EducationCategory,
} from '@/lib/cameroon-education-system';

/**
 * The education category ('basic' | 'secondary' | 'higher') of the logged-in
 * user's school. Reads it from the auth context when the user payload carries
 * it, otherwise from the cached school detail query. Defaults to 'secondary'
 * (the behaviour of every school that existed before categories) until known.
 */
export function useEducationCategory(): EducationCategory {
  const { user } = useAuth();
  const school = user?.school as unknown as Record<string, unknown> | undefined;
  const fromUser = school?.education_category ?? school?.educationCategory;
  const schoolId = typeof school?.id === 'string' ? school.id : '';
  const { data } = useSchool(fromUser ? '' : schoolId);
  return normalizeEducationCategory(fromUser ?? data?.education_category ?? data?.educationCategory);
}

/** Enabled sections (nursery/primary) of a basic school; both when unset. */
export function useBasicSections(): BasicSection[] {
  const { user } = useAuth();
  const category = useEducationCategory();
  const schoolId = typeof user?.school?.id === 'string' ? user.school.id : '';
  const { data } = useSchoolSettings(category === 'basic' ? schoolId : '');
  const chosen = (data?.sections ?? []).filter(
    (s): s is BasicSection => s === 'nursery' || s === 'primary',
  );
  return chosen.length ? chosen : ['nursery', 'primary'];
}
