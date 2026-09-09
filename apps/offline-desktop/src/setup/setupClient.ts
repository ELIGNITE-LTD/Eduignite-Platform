// Network calls for the installer wizard's Step 1 (connect) and Step 2
// (school search) — Phase A #4. Runs in the main process (not the renderer)
// so it reuses the exact same API base URL config as src/sync/syncClient.ts
// (VITE_OFFLINE_API_BASE_URL, same default) instead of inventing a second
// config mechanism, and so the renderer never needs its own fetch/CORS setup
// — it just calls the `setup:ping` / `setup:searchSchools` IPC channels
// (src/ipc/handlers.ts) exposed via preload, same shape as every other
// window.api.* call.
//
// Both functions catch network failures and return a clear, non-technical
// `{ ok: false, message }` shape rather than throwing a raw fetch/TypeError
// across the IPC boundary — the wizard UI is written by/for non-technical
// school staff (see spec: "a network failure on step 1/2 gives a clear,
// non-technical error message, not a raw exception").

function defaultBaseUrl(): string {
  return process.env.VITE_OFFLINE_API_BASE_URL || 'http://localhost:8000';
}

export interface PingResult {
  ok: boolean;
  message: string;
}

/**
 * Step 1: confirms the configured backend is reachable before asking the
 * technician to search for their school. Hits the public school-search
 * endpoint itself (see searchSchools) with an empty/too-short query, which
 * per the backend's SEARCH_MIN_QUERY_LENGTH just returns `[]` cheaply — no
 * dedicated health-check route needed, and this doubles as a check that the
 * exact endpoint Step 2 depends on is actually there.
 */
export async function pingBackend(
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = defaultBaseUrl()
): Promise<PingResult> {
  try {
    const res = await fetchImpl(`${baseUrl}/api/v1/schools/schools/search/?q=a`, { method: 'GET' });
    if (!res.ok && res.status !== 400) {
      return { ok: false, message: `Could not reach the EduIgnite server (HTTP ${res.status}). Please check your internet connection and try again.` };
    }
    return { ok: true, message: 'Connected to the EduIgnite server.' };
  } catch {
    return {
      ok: false,
      message: 'Could not reach the EduIgnite server. Please check your internet connection and try again.',
    };
  }
}

export interface SchoolSearchResult {
  id: string;
  name: string;
  shortName: string;
  matricule: string | null;
  region_or_town: string;
}

export interface SchoolSearchResponse {
  ok: boolean;
  results: SchoolSearchResult[];
  message?: string;
}

/**
 * Step 2: public, unauthenticated school search — GET
 * /api/v1/schools/schools/search/?q=<query> (backend/apps/schools/views.py,
 * SchoolViewSet.search). Returns `{id, name, shortName, matricule,
 * region_or_town}` rows; `id` is the REAL cloud School.id, which the wizard
 * writes into the local `schools.id` on confirm — see
 * src/pages/setup/SetupSelectSchoolStep.tsx. This endpoint was already
 * merged by the time this was written (Phase A #1, built in parallel) — if
 * that ever regresses, `searchSchools` still degrades to a clear error
 * rather than a raw exception.
 */
export async function searchSchools(
  query: string,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = defaultBaseUrl()
): Promise<SchoolSearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { ok: true, results: [] };
  }

  try {
    const res = await fetchImpl(
      `${baseUrl}/api/v1/schools/schools/search/?q=${encodeURIComponent(trimmed)}`,
      { method: 'GET' }
    );
    if (!res.ok) {
      return {
        ok: false,
        results: [],
        message: `School search is currently unavailable (HTTP ${res.status}). Please try again in a moment.`,
      };
    }
    const results = (await res.json()) as SchoolSearchResult[];
    return { ok: true, results };
  } catch {
    return {
      ok: false,
      results: [],
      message: 'Could not reach the EduIgnite server to search for your school. Please check your internet connection and try again.',
    };
  }
}
