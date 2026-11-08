import { apiClient } from '../client';

/** Basic Education "school life": pupil health records and certificates. */

export interface HealthRow {
  student: string;
  student_name: string;
  student_matricule: string;
  school_class: string | null;
  class_name: string;
  has_record: boolean;
  blood_group: string;
  allergies: string;
  conditions: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  doctor_name: string;
  doctor_phone: string;
  notes: string;
  updated_at: string | null;
}

export type HealthSheetInput = Partial<
  Pick<
    HealthRow,
    | 'blood_group' | 'allergies' | 'conditions' | 'emergency_contact_name'
    | 'emergency_contact_phone' | 'doctor_name' | 'doctor_phone' | 'notes'
  >
>;

export type HealthEntryKind = 'illness' | 'injury' | 'checkup' | 'medication' | 'other';

export interface HealthEntry {
  id: string;
  student: string;
  student_name: string;
  entry_date: string;
  kind: HealthEntryKind;
  note: string;
  recorded_by_name: string;
}

export type CertificateKind = 'merit' | 'attendance' | 'conduct' | 'completion' | 'enrolment';

export interface PupilCertificate {
  id: string;
  student: string;
  student_name: string;
  student_matricule: string;
  class_name: string;
  number: string;
  kind: CertificateKind;
  kind_label: string;
  issued_on: string;
  academic_year: string;
  remark: string;
  issued_by_name: string;
}

export interface PupilOption {
  id: string;
  name: string;
}

const list = <T,>(data: any): T[] => (Array.isArray(data) ? data : data?.results ?? []);

export const schoolLifeService = {
  async listHealth(schoolClass?: string): Promise<HealthRow[]> {
    const { data } = await apiClient.get('/students/health-profiles/', {
      params: schoolClass ? { school_class: schoolClass } : {},
    });
    return list<HealthRow>(data);
  },

  async saveHealth(studentId: string, payload: HealthSheetInput): Promise<HealthRow> {
    const { data } = await apiClient.put(`/students/health-profiles/${studentId}/`, payload);
    return data;
  },

  async listHealthEntries(studentId: string): Promise<HealthEntry[]> {
    const { data } = await apiClient.get('/students/health-entries/', { params: { student: studentId } });
    return list<HealthEntry>(data);
  },

  async addHealthEntry(payload: { student: string; entry_date: string; kind: HealthEntryKind; note: string }): Promise<HealthEntry> {
    const { data } = await apiClient.post('/students/health-entries/', payload);
    return data;
  },

  async deleteHealthEntry(id: string): Promise<void> {
    await apiClient.delete(`/students/health-entries/${id}/`);
  },

  async listCertificates(params: { school_class?: string } = {}): Promise<PupilCertificate[]> {
    const { data } = await apiClient.get('/students/certificates/', { params });
    return list<PupilCertificate>(data);
  },

  async issueCertificate(payload: {
    student: string; kind: CertificateKind; remark?: string; academic_year?: string; issued_on?: string;
  }): Promise<PupilCertificate> {
    const { data } = await apiClient.post('/students/certificates/', payload);
    return data;
  },

  async deleteCertificate(id: string): Promise<void> {
    await apiClient.delete(`/students/certificates/${id}/`);
  },

  async listPupils(schoolClass: string): Promise<PupilOption[]> {
    const { data } = await apiClient.get('/students/students/', { params: { school_class: schoolClass, page_size: 500 } });
    return list<any>(data).map((s) => ({ id: String(s.id), name: s.full_name || s.name || '' }));
  },
};
