import { apiClient } from '../client';

export type Severity = 'info' | 'warning' | 'critical';
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved' | 'ignored';

export interface WatchCheck { key: string; label: string; status: 'ok' | 'warn' | 'fail'; detail: string; latency_ms: number | null; checked_at: string; since: string }
export interface WatchHour { hour: string; requests: number; errors_5xx: number; errors_4xx: number; slow: number; client_errors: number; login_failures: number }

export interface WatchOverview {
  state: 'healthy' | 'degraded' | 'critical';
  open: { critical: number; warning: number; info: number };
  checks: WatchCheck[];
  monitor_last_run: string | null;
  series: WatchHour[];
  schools: Array<{ id: string; name: string; incidents: number; events: number }>;
  security_open: number;
  recipients: Array<{ name: string; email: string; role: string }>;
  last_alerts: Array<{ kind: string; subject: string; sent_at: string; delivered: number; to: number }>;
}

export interface WatchIncident {
  id: string; category: string; category_label: string; severity: Severity; status: IncidentStatus; source: string; title: string; message: string;
  count: number; affected_users: number; affected_schools: number; school_name: string; first_seen: string; last_seen: string; alert_count: number; acknowledged_by: string;
  details?: Record<string, unknown>; schools?: Array<{ id: string; name: string }>; notes?: Array<{ at: string; by: string; text: string }>;
  resolved_at?: string | null; alerts?: Array<{ kind: string; sent_at: string; delivered: number; to: number }>;
}

export const watchService = {
  async overview(): Promise<WatchOverview> { return (await apiClient.get('/watch/overview/')).data; },
  async incidents(params: Record<string, string>): Promise<{ count: number; page: number; results: WatchIncident[] }> {
    return (await apiClient.get('/watch/incidents/', { params })).data;
  },
  async incident(id: string): Promise<WatchIncident> { return (await apiClient.get(`/watch/incidents/${id}/`)).data; },
  async act(id: string, input: { action?: 'acknowledge' | 'resolve' | 'ignore' | 'reopen'; note?: string }): Promise<WatchIncident> {
    return (await apiClient.post(`/watch/incidents/${id}/action/`, input)).data;
  },
  async runChecks(): Promise<WatchOverview> { return (await apiClient.post('/watch/run-checks/', {})).data; },
  async testAlert(): Promise<{ recipients: string[]; delivered: number }> { return (await apiClient.post('/watch/test-alert/', {})).data; },
  async alertLog(): Promise<Array<{ kind: string; subject: string; sent_at: string; delivered: number; recipients: string[] }>> {
    return (await apiClient.get('/watch/alerts/')).data;
  },
};
