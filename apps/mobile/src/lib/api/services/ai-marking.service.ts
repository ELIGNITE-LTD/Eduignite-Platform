import { apiClient } from '../client';

export type MarkingApproach = 'strict' | 'idea_based' | 'conceptual' | 'partial_credit' | 'custom';

export interface MarkQuestion { no: string; max: number; awarded: number; student_answer?: string; comment?: string; correction?: string }

export interface MarkedScript {
  id: string;
  index: number;
  student: string | null;
  student_name: string;
  detected_name: string;
  detected_matricule: string;
  questions: MarkQuestion[];
  total: number;
  feedback: string;
  warning: string;
  failed: boolean;
  edited: boolean;
  status: 'marked' | 'approved';
  published: boolean;
  open_challenges: number;
}

export interface MarkingJob {
  id: string;
  title: string;
  approach: MarkingApproach;
  paper_total: number;
  status: 'uploaded' | 'marking' | 'review' | 'failed';
  script_count: number;
  page_count: number;
  pages_per_script: number;
  estimate_credits: number;
  progress: number;
  error: string;
  created_at: string;
  scope_key: string;
  scripts?: MarkedScript[];
  scheme_text?: string;
  can_afford?: boolean;
  balance?: number;
  unlimited?: boolean;
}

export interface MarkingChallenge {
  id: string;
  script: string;
  job_title: string;
  student_name: string;
  question_no: string;
  message: string;
  status: 'open' | 'resolved';
  response: string;
  new_awarded: number | null;
  question: MarkQuestion | null;
}

export interface MyMarkedPaper {
  id: string;
  title: string;
  student_name: string;
  questions: MarkQuestion[];
  total: number;
  paper_total: number;
  feedback: string;
  published_at: string | null;
  challenges: Array<{ id: string; question_no: string; message: string; status: string; response: string; new_awarded: number | null }>;
}

const BASE = '/ai-marking';
const authorise = { headers: { 'X-AI-Credits-Confirm': '1', 'X-AI-Credits-Client': '1' } };

export const aiMarkingService = {
  async create(input: {
    title: string; approach: MarkingApproach; custom_instructions: string; scheme_text: string; paper_total: number;
    pages_per_script: number; scope_key: string; roster: Array<{ id: string }>; scheme_files: File[]; script_files: File[];
  }): Promise<MarkingJob> {
    const body = new FormData();
    body.append('title', input.title);
    body.append('approach', input.approach);
    body.append('custom_instructions', input.custom_instructions);
    body.append('scheme_text', input.scheme_text);
    body.append('paper_total', String(input.paper_total));
    body.append('pages_per_script', String(input.pages_per_script));
    body.append('scope_key', input.scope_key);
    body.append('roster', JSON.stringify(input.roster));
    input.scheme_files.forEach((f) => body.append('scheme_files', f));
    input.script_files.forEach((f) => body.append('script_files', f));
    const { data } = await apiClient.post(`${BASE}/jobs/`, body, { timeout: 300000 });
    return data;
  },
  async list(scope?: string): Promise<MarkingJob[]> {
    const { data } = await apiClient.get(`${BASE}/jobs/`, { params: scope ? { scope } : undefined });
    return data;
  },
  async get(id: string): Promise<MarkingJob> {
    const { data } = await apiClient.get(`${BASE}/jobs/${id}/`);
    return data;
  },
  async remove(id: string): Promise<void> { await apiClient.delete(`${BASE}/jobs/${id}/`); },
  async start(id: string): Promise<MarkingJob> {
    const { data } = await apiClient.post(`${BASE}/jobs/${id}/start/`, {}, authorise);
    return data;
  },
  async updateScript(id: string, patch: { questions?: MarkQuestion[]; feedback?: string; student?: string | null }): Promise<MarkedScript> {
    const { data } = await apiClient.patch(`${BASE}/scripts/${id}/`, patch);
    return data;
  },
  async approveScript(id: string, approved = true): Promise<MarkedScript> {
    const { data } = await apiClient.post(`${BASE}/scripts/${id}/approve/`, { approved });
    return data;
  },
  async approveAll(jobId: string): Promise<{ approved: number; left: number }> {
    const { data } = await apiClient.post(`${BASE}/jobs/${jobId}/approve-all/`, {});
    return data;
  },
  async publish(jobId: string): Promise<{ published: number }> {
    const { data } = await apiClient.post(`${BASE}/jobs/${jobId}/publish/`, {});
    return data;
  },
  async pdf(path: string): Promise<Blob> {
    const { data } = await apiClient.get(`${BASE}${path}`, { responseType: 'blob' });
    return data as Blob;
  },
  async challenges(status: 'open' | 'resolved' = 'open'): Promise<MarkingChallenge[]> {
    const { data } = await apiClient.get(`${BASE}/challenges/`, { params: { status } });
    return data;
  },
  async respond(id: string, response: string, newAwarded?: number | null): Promise<MarkingChallenge> {
    const { data } = await apiClient.post(`${BASE}/challenges/${id}/respond/`, { response, new_awarded: newAwarded ?? null });
    return data;
  },
  async mine(): Promise<MyMarkedPaper[]> {
    const { data } = await apiClient.get(`${BASE}/my/`);
    return data;
  },
  async challenge(id: string, questionNo: string, message: string): Promise<void> {
    await apiClient.post(`${BASE}/my/${id}/challenge/`, { question_no: questionNo, message });
  },
};
