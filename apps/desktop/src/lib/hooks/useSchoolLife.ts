import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  schoolLifeService,
  type CertificateKind,
  type HealthEntryKind,
  type HealthSheetInput,
} from '@/lib/api/services/school-life.service';

const keys = {
  health: (schoolClass: string) => ['school-life', 'health', schoolClass] as const,
  entries: (student: string) => ['school-life', 'entries', student] as const,
  certificates: (schoolClass: string) => ['school-life', 'certificates', schoolClass] as const,
  pupils: (schoolClass: string) => ['school-life', 'pupils', schoolClass] as const,
};

export function useHealthRows(schoolClass: string, enabled = true) {
  return useQuery({ queryKey: keys.health(schoolClass), queryFn: () => schoolLifeService.listHealth(schoolClass || undefined), enabled });
}

export function useSaveHealth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ student, data }: { student: string; data: HealthSheetInput }) => schoolLifeService.saveHealth(student, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-life', 'health'] }),
  });
}

export function useHealthEntries(student: string) {
  return useQuery({ queryKey: keys.entries(student), queryFn: () => schoolLifeService.listHealthEntries(student), enabled: Boolean(student) });
}

export function useAddHealthEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { student: string; entry_date: string; kind: HealthEntryKind; note: string }) => schoolLifeService.addHealthEntry(data),
    onSuccess: (_r, vars) => qc.invalidateQueries({ queryKey: keys.entries(vars.student) }),
  });
}

export function useDeleteHealthEntry(student: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => schoolLifeService.deleteHealthEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.entries(student) }),
  });
}

export function useCertificates(schoolClass: string, enabled = true) {
  return useQuery({ queryKey: keys.certificates(schoolClass), queryFn: () => schoolLifeService.listCertificates(schoolClass ? { school_class: schoolClass } : {}), enabled });
}

export function useIssueCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { student: string; kind: CertificateKind; remark?: string; academic_year?: string; issued_on?: string }) => schoolLifeService.issueCertificate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-life', 'certificates'] }),
  });
}

export function useDeleteCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => schoolLifeService.deleteCertificate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-life', 'certificates'] }),
  });
}

export function usePupils(schoolClass: string) {
  return useQuery({ queryKey: keys.pupils(schoolClass), queryFn: () => schoolLifeService.listPupils(schoolClass), enabled: Boolean(schoolClass) });
}
