import { apiClient } from "../client";
import { API } from "../endpoints";

export const academicsService = {
  // Academic Years
  async listAcademicYears(params?: Record<string, any>) {
    const { data } = await apiClient.get("/academics/academic-years/", { params });
    return data;
  },

  async getCurrentAcademicYear() {
    const { data } = await apiClient.get("/academics/academic-years/current/");
    return data;
  },

  async createAcademicYear(payload: any) {
    const { data } = await apiClient.post("/academics/academic-years/", payload);
    return data;
  },

  async setCurrentAcademicYear(id: string) {
    const { data } = await apiClient.post(`/academics/academic-years/${id}/set_current/`);
    return data;
  },

  // Terms
  async listTerms(academicYearId?: string) {
    const params = academicYearId ? { academic_year: academicYearId } : {};
    const { data } = await apiClient.get("/academics/terms/", { params });
    return data;
  },

  async getCurrentTerm() {
    const { data } = await apiClient.get("/academics/terms/current/");
    return data;
  },

  async createTerm(payload: any) {
    const { data } = await apiClient.post("/academics/terms/", payload);
    return data;
  },

  // Class Subjects
  async listClassSubjects(classId?: string) {
    const params = classId ? { school_class: classId } : {};
    const { data } = await apiClient.get("/academics/class-subjects/", { params });
    return data;
  },

  async createClassSubject(payload: any) {
    const { data } = await apiClient.post("/academics/class-subjects/", payload);
    return data;
  },

  async updateClassSubject(id: string, payload: any) {
    const { data } = await apiClient.patch(`/academics/class-subjects/${id}/`, payload);
    return data;
  },

  // Student Enrollments
  async listStudentEnrollments(studentId?: string, termId?: string) {
    const params: Record<string, any> = {};
    if (studentId) params.student = studentId;
    if (termId) params.term = termId;
    const { data } = await apiClient.get("/academics/student-enrollments/", { params });
    return data;
  },

  async bulkCreateEnrollments(payload: any) {
    const { data } = await apiClient.post("/academics/student-enrollments/bulk_create/", payload);
    return data;
  },

  // Subject Grades
  async listSubjectGrades(studentId?: string, termId?: string) {
    const params: Record<string, any> = {};
    if (studentId) params.student = studentId;
    if (termId) params.term = termId;
    const { data } = await apiClient.get("/academics/subject-grades/", { params });
    return data;
  },

  async recordGrade(payload: any) {
    const { data } = await apiClient.post("/academics/subject-grades/", payload);
    return data;
  },

  async getStudentTranscript(studentId: string, termId: string) {
    const { data } = await apiClient.get("/academics/subject-grades/student_transcript/", {
      params: { student_id: studentId, term_id: termId },
    });
    return data;
  },

  async getClassPerformance(classId: string, termId: string) {
    const { data } = await apiClient.get("/academics/subject-grades/class_performance/", {
      params: { class_id: classId, term_id: termId },
    });
    return data;
  },

  // Student Promotions
  async listStudentPromotions(params?: {
    academic_year?: string;
    status?: string;
    class_id?: string;
    search?: string;
    refresh?: boolean;
  } | string) {
    const normalizedParams = typeof params === "string" ? { academic_year: params } : params || {};
    const { data } = await apiClient.get("/students/students/promotions/", { params: normalizedParams });
    return data;
  },

  async bulkPromoteStudents(payload: any) {
    const { data } = await apiClient.post("/students/students/bulk-promote-selected/", payload);
    return data;
  },

  /** Commit the decision that the selected learners repeat their current class. */
  async bulkRepeatStudents(payload: any) {
    const { data } = await apiClient.post("/students/students/bulk-repeat-selected/", payload);
    return data;
  },

  async recalculateStudentPromotions(payload: {
    academic_year: string;
    promotion_average?: number;
    class_id?: string;
  }) {
    const { data } = await apiClient.post("/students/students/recalculate-promotions/", payload);
    return data;
  },
};
