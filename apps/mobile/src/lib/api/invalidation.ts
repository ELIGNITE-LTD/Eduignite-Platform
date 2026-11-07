import { queryClient } from './query-client';

/**
 * One place that decides which cached lists are stale after a write.
 *
 * Pages key their react-query caches in many ways, and a list that was fetched
 * five minutes ago (the default `staleTime`) would otherwise miss a record that
 * was created in another module until the user reloaded. After any successful
 * create / update / delete the matching families of queries are invalidated, so
 * mounted selectors and tables refetch on their own and unmounted ones refetch
 * the next time they open.
 *
 * A write to `/schools/hierarchy/staff/...` therefore refreshes the staff,
 * class and sub-school pickers everywhere, not just on the page that wrote.
 */

const PEOPLE =
  /^(users|staff|students?|record-payment|subscription|cm-|id-card|teacher-student|exam-roster|timetable-(staff|children)|draft-registry-users|school-community|school-stats|class-teachers|student-)/;
const STRUCTURE =
  /^(schools|staff-|student-(hierarchy|sub|picker)|school-classes|cm-classes|timetable|ai-school-classes|class-|record-payment|fee-types-list|fee-structures|school-fee|subscription|teacher-student|class-teachers|exam-roster|sub-schools|hierarchy-)/;
const FEES =
  /^(fees|fee-|bursar|school-fee|student-(fee|school-fees)|my-fees|subscription|record-payment|school-stats)/;
const ACADEMICS =
  /^(grades|grade-|class-subjects|subject|timetable|academic|current-|terms|class-performance|student-(transcript|promotions|enrollments)|exam)/;

const RULES: Array<{ url: RegExp; keys: RegExp[] }> = [
  { url: /\/schools\/(hierarchy|[^/]+\/(sub-schools|classes|staff|students))/, keys: [PEOPLE, STRUCTURE] },
  { url: /\/schools\/timetable/, keys: [STRUCTURE, ACADEMICS] },
  { url: /\/users\//, keys: [PEOPLE, STRUCTURE] },
  { url: /\/students\//, keys: [PEOPLE, STRUCTURE, FEES] },
  { url: /\/fees\//, keys: [FEES] },
  { url: /\/grades\/(subjects|sequences|academic|terms)/, keys: [ACADEMICS, STRUCTURE] },
  { url: /\/(academics|exams)\//, keys: [ACADEMICS] },
];

const NEVER = /\/(auth|ai|ai_features|chat|notifications)\//;

export function patternsForWrite(url: string | undefined): RegExp[] {
  if (!url || NEVER.test(url)) return [];
  const out = new Set<RegExp>();
  for (const rule of RULES) {
    if (rule.url.test(url)) rule.keys.forEach((pattern) => out.add(pattern));
  }
  return Array.from(out);
}

const pending = new Set<RegExp>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const patterns = Array.from(pending);
  pending.clear();
  if (patterns.length === 0) return;
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const head = query.queryKey[0];
      return typeof head === 'string' && patterns.some((pattern) => pattern.test(head));
    },
  });
}

/** Call after a successful non-GET request to `url`. Coalesces bursts of writes. */
export function invalidateAfterWrite(url: string | undefined) {
  const patterns = patternsForWrite(url);
  if (patterns.length === 0) return;
  patterns.forEach((pattern) => pending.add(pattern));
  if (timer === null) timer = setTimeout(flush, 150);
}
