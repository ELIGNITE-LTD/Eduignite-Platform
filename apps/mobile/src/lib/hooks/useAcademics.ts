import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { academicsService } from "@/lib/api/services/academics.service";

// Academic Years
export function useAcademicYears() {
  return useQuery({
    queryKey: ["academic-years"],
    queryFn: () => academicsService.listAcademicYears(),
  });
}

export function useCurrentAcademicYear() {
  return useQuery({
    queryKey: ["current-academic-year"],
    queryFn: () => academicsService.getCurrentAcademicYear(),
  });
}

export function useCreateAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => academicsService.createAcademicYear(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      queryClient.invalidateQueries({ queryKey: ["current-academic-year"] });
    },
  });
}

export function useSetCurrentAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => academicsService.setCurrentAcademicYear(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      queryClient.invalidateQueries({ queryKey: ["current-academic-year"] });
    },
  });
}

// Terms
export function useTerms(academicYearId?: string) {
  return useQuery({
    queryKey: ["terms", academicYearId],
    queryFn: () => academicsService.listTerms(academicYearId),
  });
}

export function useCurrentTerm() {
  return useQuery({
    queryKey: ["current-term"],
    queryFn: () => academicsService.getCurrentTerm(),
  });
}

export function useCreateTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => academicsService.createTerm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terms"] });
      queryClient.invalidateQueries({ queryKey: ["current-term"] });
    },
  });
}

// Class Subjects
export function useClassSubjects(classId?: string) {
  return useQuery({
    queryKey: ["class-subjects", classId],
    queryFn: () => academicsService.listClassSubjects(classId),
  });
}

export function useCreateClassSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => academicsService.createClassSubject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-subjects"] });
    },
  });
}

// Student Enrollments
export function useStudentEnrollments(studentId?: string, termId?: string) {
  return useQuery({
    queryKey: ["student-enrollments", studentId, termId],
    queryFn: () => academicsService.listStudentEnrollments(studentId, termId),
  });
}

export function useBulkCreateEnrollments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => academicsService.bulkCreateEnrollments(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-enrollments"] });
    },
  });
}

// Subject Grades
export function useSubjectGrades(studentId?: string, termId?: string) {
  return useQuery({
    queryKey: ["subject-grades", studentId, termId],
    queryFn: () => academicsService.listSubjectGrades(studentId, termId),
  });
}

export function useStudentTranscript(studentId: string, termId: string) {
  return useQuery({
    queryKey: ["student-transcript", studentId, termId],
    queryFn: () => academicsService.getStudentTranscript(studentId, termId),
    enabled: !!studentId && !!termId,
  });
}

export function useClassPerformance(classId: string, termId: string) {
  return useQuery({
    queryKey: ["class-performance", classId, termId],
    queryFn: () => academicsService.getClassPerformance(classId, termId),
    enabled: !!classId && !!termId,
  });
}

export function useRecordGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => academicsService.recordGrade(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subject-grades"] });
      queryClient.invalidateQueries({ queryKey: ["student-transcript"] });
      queryClient.invalidateQueries({ queryKey: ["class-performance"] });
    },
  });
}

// Student Promotions
export function useStudentPromotions(params?: string | {
  academic_year?: string;
  status?: string;
  class_id?: string;
  search?: string;
  refresh?: boolean;
}) {
  return useQuery({
    queryKey: ["student-promotions", params],
    queryFn: () => academicsService.listStudentPromotions(params),
  });
}

export function useBulkPromoteStudents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => academicsService.bulkPromoteStudents(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-promotions"] });
    },
  });
}

export function useRecalculateStudentPromotions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { academic_year: string; promotion_average?: number; class_id?: string }) =>
      academicsService.recalculateStudentPromotions(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-promotions"] });
    },
  });
}
