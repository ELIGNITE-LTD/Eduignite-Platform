import { apiClient } from '../client';

/** One step of the institution setup, as reported by the backend. */
export interface HigherSetupStep {
  key: string;
  done: boolean;
  /** How many records exist for this step (departments, programmes, ...). */
  count?: number;
}

export interface HigherSetupStatus {
  steps: HigherSetupStep[];
  complete: boolean;
}

/**
 * Result of asking the backend how far the setup is. `available` is false
 * while the higher-education service has not been switched on (404), so the
 * screens can still show the checklist instead of an error.
 */
export interface HigherSetupResult {
  available: boolean;
  status: HigherSetupStatus;
}

const EMPTY_STATUS: HigherSetupStatus = { steps: [], complete: false };

function normalizeStatus(raw: unknown): HigherSetupStatus {
  const data = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(data.steps) ? (data.steps as Array<Record<string, unknown>>) : [];
  const steps: HigherSetupStep[] = list
    .filter((s) => typeof s?.key === 'string')
    .map((s) => ({
      key: String(s.key),
      done: Boolean(s.done),
      count: typeof s.count === 'number' ? s.count : undefined,
    }));
  const complete =
    typeof data.complete === 'boolean' ? data.complete : steps.length > 0 && steps.every((s) => s.done);
  return { steps, complete };
}

export const higherEdService = {
  async setupStatus(): Promise<HigherSetupResult> {
    try {
      const { data } = await apiClient.get('/higher-ed/setup-status/');
      return { available: true, status: normalizeStatus(data) };
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) return { available: false, status: EMPTY_STATUS };
      throw error;
    }
  },
};
