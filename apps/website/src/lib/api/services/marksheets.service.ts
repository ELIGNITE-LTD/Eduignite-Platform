import { apiClient } from '../client';

export type SheetKind = 'grade' | 'class_mark' | 'he_result' | 'rating';

export interface SheetPerson { id: string; name: string; matricule?: string }

export interface SheetReading {
  row: number;
  student_id: string;
  name: string;
  matricule: string;
  status: 'ok' | 'uncertain' | 'blank' | 'absent';
  value: string | null;
  reason?: string;
  confidence?: number | null;
  digits?: Array<{ char: string; confidence: number; alternative?: string }>;
  crop?: string;
  text?: string;
}

export interface SheetReadResult {
  rows: SheetReading[];
  pages_read?: number[];
  pages_total?: number;
  problems?: Array<{ file: string; detail: string }>;
  unmatched?: Array<{ line: string; value: string }>;
  matched?: number;
}

export const marksheetsService = {
  async create(input: {
    kind: SheetKind; title: string; subtitle_lines?: string[]; max_score: number;
    int_digits?: number; decimals?: number; scope?: Record<string, unknown>; student_ids: string[];
  }): Promise<{ id: string; pdf_url: string; rows: SheetPerson[] }> {
    const { data } = await apiClient.post('/marksheets/', input);
    return data;
  },
  async pdf(id: string): Promise<Blob> {
    const { data } = await apiClient.get(`/marksheets/${id}/pdf/`, { responseType: 'blob' });
    return data as Blob;
  },
  async read(id: string, photos: File[]): Promise<SheetReadResult> {
    const body = new FormData();
    photos.forEach((p) => body.append('photos', p));
    const { data } = await apiClient.post(`/marksheets/${id}/read/`, body, { timeout: 120000 });
    return data;
  },
  async importFile(id: string, input: { file?: File; text?: string }): Promise<SheetReadResult> {
    if (input.file) {
      const body = new FormData();
      body.append('file', input.file);
      const { data } = await apiClient.post(`/marksheets/${id}/import/`, body);
      return data;
    }
    const { data } = await apiClient.post(`/marksheets/${id}/import/`, { text: input.text || '' });
    return data;
  },
};
