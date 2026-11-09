import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSchool, useSchoolSettings } from '@/lib/hooks/useSchools';
import {
  normalizeEducationCategory,
  type BasicSection,
  type EducationCategory,
} from '@/lib/cameroon-education-system';

const CACHE_PREFIX = 'eduignite:education-category:';

function readCachedCategory(schoolId: string): EducationCategory | undefined {
  if (!schoolId || typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + schoolId);
    return raw === 'basic' || raw === 'secondary' || raw === 'higher' ? raw : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedCategory(schoolId: string, category: EducationCategory) {
  if (!schoolId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + schoolId, category);
  } catch {
    /* storage unavailable: the live value still works */
  }
}

/**
 * The education category ('basic' | 'secondary' | 'higher') of the logged-in
 * user's school. Reads it from the auth context when the user payload carries
 * it, otherwise from the cached school detail query. While that query is still
 * loading it uses the value remembered from the last visit, so a higher
 * education user never sees secondary wording flash up first. Defaults to
 * 'secondary' (the behaviour of every school that existed before categories)
 * only when nothing is known.
 */
export function useEducationCategory(): EducationCategory {
  const { user } = useAuth();
  const school = user?.school as unknown as Record<string, unknown> | undefined;
  const fromUser = school?.education_category ?? school?.educationCategory;
  const schoolId = typeof school?.id === 'string' ? school.id : '';
  const { data } = useSchool(fromUser ? '' : schoolId);
  const live = fromUser ?? data?.education_category ?? data?.educationCategory;
  const resolved = live ? normalizeEducationCategory(live) : undefined;

  useEffect(() => {
    if (resolved) writeCachedCategory(schoolId, resolved);
  }, [resolved, schoolId]);

  return resolved ?? readCachedCategory(schoolId) ?? 'secondary';
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
