import { apiClient } from '../client';
import { API } from '../endpoints';
import {
  Subject,
  SubjectMaterial,
  StudentSubjectEnrollment,
  Sequence,
  Grade,
  ReportCard,
  ClassStatisticsResponse,
  PeriodStatisticsResponse,
  PaginatedResponse,
  ListParams,
  CreateGradeRequest,
  BulkCreateGradesRequest,
  CreateSubjectMaterialRequest,
} from '../types';

type CalendarSequencePayload = {
  name: string;
  term: number;
  start_date: string;
  end_date: string;
  is_active?: boolean;
};

type ConfigureCameroonCalendarPayload = {
  school_id?: string;
  academic_year: string;
  current_term: number;
  sequences: CalendarSequencePayload[];
};

type ConfigureCameroonCalendarResponse = {
  academic_year: string;
  current_term: number;
  sequences: Sequence[];
};

type PublishReportCardsPayload = {
  class_id?: string;
  class_name: string;
  scope: 'SEQUENCE' | 'TERM';
  sequence_id?: string;
  term?: number;
  academic_year?: string;
};

type ApiErrorWithStatus = {
  response?: {
    status?: number;
  };
};

const TERM_SETTING_BY_NUMBER: Record<number, string> = {
  1: 'First',
  2: 'Second',
  3: 'Third',
};

function normalizeSequenceList(data: PaginatedResponse<Sequence> | Sequence[]): Sequence[] {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function shouldFallbackToSequenceUpsert(error: unknown) {
  const status = (error as ApiErrorWithStatus)?.response?.status;
  return status === 404 || status === 405;
}

function normalizeApiList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && Array.isArray((data as { results?: T[] }).results)) {
    return (data as { results: T[] }).results;
  }
  return [];
}

function getEntityId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return getEntityId(record.id || record.uid || record.pk);
  }
  return '';
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getStudentClassId(student: Record<string, unknown>): string {
  return getEntityId(student.school_class_id || student.school_class);
}

function getStudentClassName(student: Record<string, unknown>): string {
  return String(
    student.school_class_name
    || student.class_name
    || student.student_class
    || (student.school_class && typeof student.school_class === 'object'
      ? (student.school_class as Record<string, unknown>).name
      : '')
    || ''
  );
}

function getStudentName(student: Record<string, unknown>): string {
  const user = student.user && typeof student.user === 'object' ? student.user as Record<string, unknown> : {};
  return String(
    student.full_name
    || student.name
    || user.full_name
    || user.name
    || [user.first_name, user.last_name].filter(Boolean).join(' ')
    || 'Student'
  );
}

function getGradeSubjectId(grade: Record<string, unknown>): string {
  return getEntityId(grade.subject || grade.subject_id);
}

function getGradeSequenceId(grade: Record<string, unknown>): string {
  return getEntityId(grade.sequence || grade.sequence_id);
}

function getGradeStudentId(grade: Record<string, unknown>): string {
  return getEntityId(grade.student || grade.student_id);
}

function getGradeTeacherId(grade: Record<string, unknown>): string {
  return getEntityId(grade.teacher || grade.teacher_id);
}

function getGradeClassId(grade: Record<string, unknown>): string {
  return getEntityId(grade.school_class || grade.school_class_id);
}

function getGradeClassName(grade: Record<string, unknown>): string {
  const schoolClass = grade.school_class && typeof grade.school_class === 'object'
    ? grade.school_class as Record<string, unknown>
    : {};
  return String(grade.school_class_name || grade.class_name_snapshot || schoolClass.name || '');
}

function gradeMatchesStudentCurrentClass(grade: Record<string, unknown>, student: Record<string, unknown>): boolean {
  const gradeClassId = getGradeClassId(grade);
  const studentClassId = getStudentClassId(student);
  if (gradeClassId && studentClassId) return gradeClassId === studentClassId;
  const gradeClassName = getGradeClassName(grade);
  if (!gradeClassName) return true;
  return gradeClassName === getStudentClassName(student);
}

function getGradeSubjectName(grade: Record<string, unknown>): string {
  const subject = grade.subject && typeof grade.subject === 'object' ? grade.subject as Record<string, unknown> : {};
  return String(grade.subject_name || subject.name || 'Subject');
}

function getGradeSubjectCode(grade: Record<string, unknown>): string {
  const subject = grade.subject && typeof grade.subject === 'object' ? grade.subject as Record<string, unknown> : {};
  return String(grade.subject_code || subject.code || '-');
}

function getGradeTeacherName(grade: Record<string, unknown>): string {
  const teacher = grade.teacher && typeof grade.teacher === 'object' ? grade.teacher as Record<string, unknown> : {};
  return String(grade.teacher_name || teacher.name || teacher.full_name || '-');
}

function getSequenceSortValue(sequence: Record<string, unknown>): string {
  return `${String(sequence.academic_year || '')}:${Number(sequence.term || 0)}:${String(sequence.name || '')}`;
}

function getTermLabel(term?: number) {
  if (term === 1) return 'First Term';
  if (term === 2) return 'Second Term';
  if (term === 3) return 'Third Term';
  return 'Term';
}

function getAwardLabel(average: number) {
  if (average >= 18) return 'Principal Excellence List';
  if (average >= 16) return 'High Distinction';
  if (average >= 15) return 'Honour Roll';
  if (average >= 14) return 'Merit List';
  return 'Academic Recognition';
}

export const gradesService = {
  async getSubjects(params?: ListParams): Promise<PaginatedResponse<Subject>> {
    const { data } = await apiClient.get(API.GRADES.SUBJECTS, { params });
    return data;
  },

  async getStudentSubjectEnrollments(params?: ListParams): Promise<PaginatedResponse<StudentSubjectEnrollment>> {
    const { data } = await apiClient.get(API.GRADES.STUDENT_ENROLLMENTS, { params });
    if (Array.isArray(data)) {
      return { count: data.length, next: null, previous: null, results: data };
    }
    return data;
  },

  async updateStudentSubjectEnrollment(id: string, payload: Partial<StudentSubjectEnrollment>): Promise<StudentSubjectEnrollment> {
    const { data } = await apiClient.patch(API.GRADES.STUDENT_ENROLLMENT_DETAIL(id), payload);
    return data;
  },

  async createSubject(subjectData: Partial<Subject>): Promise<Subject> {
    const { data } = await apiClient.post(API.GRADES.SUBJECTS, subjectData);
    return data;
  },

  async updateSubject(id: string, subjectData: Partial<Subject>): Promise<Subject> {
    const { data } = await apiClient.patch(API.GRADES.SUBJECT_DETAIL(id), subjectData);
    return data;
  },

  async deleteSubject(id: string): Promise<void> {
    await apiClient.delete(API.GRADES.SUBJECT_DETAIL(id));
  },

  async getSubjectMaterials(params?: ListParams): Promise<PaginatedResponse<SubjectMaterial>> {
    const { data } = await apiClient.get(API.GRADES.MATERIALS, { params });
    return data;
  },

  async createSubjectMaterial(materialData: CreateSubjectMaterialRequest): Promise<SubjectMaterial> {
    if (materialData.upload) {
      const formData = new FormData();
      formData.append('subject', materialData.subject);
      formData.append('title', materialData.title);
      formData.append('description', materialData.description || '');
      formData.append('material_type', materialData.material_type);
      formData.append('upload', materialData.upload);
      const { data } = await apiClient.post(API.GRADES.MATERIALS, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    }

    const { data } = await apiClient.post(API.GRADES.MATERIALS, materialData);
    return data;
  },

  async deleteSubjectMaterial(id: string): Promise<void> {
    await apiClient.delete(API.GRADES.MATERIAL_DETAIL(id));
  },

  async downloadSubjectMaterial(id: string): Promise<Blob> {
    const { data } = await apiClient.get(API.GRADES.MATERIAL_DOWNLOAD(id), { responseType: 'blob' });
    return data;
  },

  async getSequences(params?: ListParams): Promise<PaginatedResponse<Sequence>> {
    const { data } = await apiClient.get(API.GRADES.SEQUENCES, { params });
    return data;
  },

  async getActiveSequences(): Promise<PaginatedResponse<Sequence>> {
    return this.getSequences({ is_active: true });
  },

  async createSequence(sequenceData: Partial<Sequence>): Promise<Sequence> {
    const { data } = await apiClient.post(API.GRADES.SEQUENCES, sequenceData);
    return data;
  },

  async updateSequence(id: string, sequenceData: Partial<Sequence>): Promise<Sequence> {
    const { data } = await apiClient.patch(API.GRADES.SEQUENCE_DETAIL(id), sequenceData);
    return data;
  },

  async configureCameroonCalendar(payload: ConfigureCameroonCalendarPayload): Promise<ConfigureCameroonCalendarResponse> {
    if (!payload.school_id) {
      throw new Error('Your school account is missing a school ID, so the academic calendar cannot be saved.');
    }

    try {
      const { data } = await apiClient.patch(API.SCHOOLS.SETTINGS_CALENDAR(payload.school_id), payload);
      return data;
    } catch (error) {
      if (!shouldFallbackToSequenceUpsert(error)) {
        throw error;
      }
      return this.configureCameroonCalendarByExistingRoutes(payload);
    }
  },

  async configureCameroonCalendarByExistingRoutes(payload: ConfigureCameroonCalendarPayload): Promise<ConfigureCameroonCalendarResponse> {
    if (!payload.school_id) {
      throw new Error('Your school account is missing a school ID, so the academic calendar cannot be saved.');
    }

    await apiClient.patch(API.SCHOOLS.SETTINGS(payload.school_id), {
      academic_year: payload.academic_year,
      term: TERM_SETTING_BY_NUMBER[payload.current_term] ?? 'First',
    });

    const sequenceResponse = await apiClient.get(API.GRADES.SEQUENCES, { params: { limit: 200 } });
    const existingSequences = normalizeSequenceList(sequenceResponse.data);
    const savedSequences: Sequence[] = [];
    const usedSequenceIds = new Set<string>();

    for (const sequence of payload.sequences) {
      const body = {
        academic_year: payload.academic_year,
        name: sequence.name,
        term: sequence.term,
        start_date: sequence.start_date,
        end_date: sequence.end_date,
        is_active: Boolean(sequence.is_active),
      };
      const exactExisting = existingSequences.find(
        (item) =>
          !usedSequenceIds.has(item.id) &&
          item.academic_year === payload.academic_year &&
          Number(item.term) === Number(sequence.term) &&
          item.name.trim().toLowerCase() === sequence.name.trim().toLowerCase()
      );
      const termExisting = exactExisting ?? existingSequences.find(
        (item) =>
          !usedSequenceIds.has(item.id) &&
          item.academic_year === payload.academic_year &&
          Number(item.term) === Number(sequence.term)
      );

      if (!termExisting) {
        throw new Error('The backend has not generated all six Cameroon academic sequences yet. Redeploy the backend, open this page again, and save the calendar.');
      }

      usedSequenceIds.add(termExisting.id);
      const { data } = await apiClient.patch(API.GRADES.SEQUENCE_DETAIL(termExisting.id), body);
      savedSequences.push(data);
    }

    return {
      academic_year: payload.academic_year,
      current_term: payload.current_term,
      sequences: savedSequences,
    };
  },

  async getGrades(params?: ListParams): Promise<PaginatedResponse<Grade>> {
    const { data } = await apiClient.get(API.GRADES.GRADES, { params });
    return data;
  },

  async createGrade(gradeData: CreateGradeRequest): Promise<Grade> {
    const { data } = await apiClient.post(API.GRADES.GRADES, gradeData);
    return data;
  },

  async updateGrade(id: string, gradeData: Partial<CreateGradeRequest>): Promise<Grade> {
    const { data } = await apiClient.patch(API.GRADES.GRADE_DETAIL(id), gradeData);
    return data;
  },

  async bulkCreateGrades(bulkData: BulkCreateGradesRequest): Promise<Grade[]> {
    const { data } = await apiClient.post(API.GRADES.BULK_CREATE, bulkData);
    return data;
  },

  async getTeacherGradeSheet(params?: { class_subject_id?: string; sequence_id?: string; term?: string | number }): Promise<any> {
    const { data } = await apiClient.get(API.GRADES.TEACHER_GRADE_SHEET, { params });
    return data;
  },

  async getClassStatistics(params?: { sequence_id?: string }): Promise<ClassStatisticsResponse> {
    return this.getClassStatisticsFromStableEndpoints(params);
  },

  async getPeriodStatistics(params?: {
    scope?: 'SEQUENCE' | 'TERM';
    sequence_id?: string;
    term?: number | string;
    academic_year?: string;
    class_id?: string;
    sub_school_id?: string;
  }): Promise<PeriodStatisticsResponse> {
    const { data } = await apiClient.get(API.GRADES.PERIOD_STATISTICS, { params });
    return data;
  },

  async getClassStatisticsFromStableEndpoints(params?: { sequence_id?: string }): Promise<ClassStatisticsResponse> {
    const [classesResponse, studentsResponse, gradesResponse, sequencesResponse, classSubjectsResponse] = await Promise.all([
      apiClient.get(API.SCHOOLS.HIERARCHY_CLASSES, { params: { limit: 1000 } }),
      apiClient.get(API.STUDENTS.BASE, { params: { limit: 5000 } }),
      apiClient.get(API.GRADES.GRADES, { params: { limit: 10000 } }),
      apiClient.get(API.GRADES.SEQUENCES, { params: { limit: 200 } }),
      apiClient.get(API.SCHOOLS.HIERARCHY_SUBJECTS, { params: { limit: 3000 } }).catch(() => ({ data: [] })),
    ]);

    const classes = normalizeApiList<Record<string, unknown>>(classesResponse.data);
    const students = normalizeApiList<Record<string, unknown>>(studentsResponse.data);
    const allGrades = normalizeApiList<Record<string, unknown>>(gradesResponse.data);
    const sequences = normalizeApiList<Sequence>(sequencesResponse.data);
    const classSubjects = normalizeApiList<Record<string, unknown>>(classSubjectsResponse.data);

    const gradeSequenceIds = new Set(allGrades.map((grade) => getEntityId(grade.sequence)).filter(Boolean));
    const requestedSequence = params?.sequence_id
      ? sequences.find((sequence) => String(sequence.id) === String(params.sequence_id))
      : undefined;
    const selectedSequence = requestedSequence
      || sequences.find((sequence) => Boolean(sequence.is_active) && gradeSequenceIds.has(String(sequence.id)))
      || sequences.find((sequence) => gradeSequenceIds.has(String(sequence.id)))
      || sequences.find((sequence) => Boolean(sequence.is_active))
      || sequences[0]
      || null;
    const selectedSequenceId = selectedSequence ? String(selectedSequence.id) : '';

    const classByKey = new Map<string, Record<string, unknown>>();
    const classKeys: string[] = [];
    const addClassKey = (key: string, schoolClass: Record<string, unknown>) => {
      if (!key || classByKey.has(key)) return;
      classByKey.set(key, schoolClass);
      classKeys.push(key);
    };

    classes.forEach((schoolClass) => {
      const id = getEntityId(schoolClass.id);
      const name = String(schoolClass.name || '');
      addClassKey(id || name, schoolClass);
      if (name) classByKey.set(name, schoolClass);
    });

    const studentsByClass = new Map<string, Record<string, unknown>[]>();
    students.forEach((student) => {
      const classId = getStudentClassId(student);
      const className = getStudentClassName(student);
      let key = classId && classByKey.has(classId) ? classId : '';
      if (!key && className && classByKey.has(className)) key = className;
      if (!key && className) {
        const legacyClass = {
          id: `legacy:${className}`,
          name: className,
          sub_school_id: null,
          sub_school_name: 'Main School',
          total_subjects: 0,
          total_teachers: 0,
          total_students: 0,
        };
        key = String(legacyClass.id);
        addClassKey(key, legacyClass);
        classByKey.set(className, legacyClass);
      }
      if (!key) return;
      if (!studentsByClass.has(key)) studentsByClass.set(key, []);
      studentsByClass.get(key)?.push(student);
    });

    const subjectCountByClass = new Map<string, Set<string>>();
    const teacherIdsByClass = new Map<string, Set<string>>();
    const coefficientByClassSubject = new Map<string, number>();
    classSubjects.forEach((link) => {
      const classId = getEntityId(link.school_class || link.class_id);
      const className = String(link.class_name || '');
      const key = classId && classByKey.has(classId)
        ? classId
        : className && classByKey.has(className)
          ? className
          : '';
      if (!key) return;
      const subjectId = getEntityId(link.subject || link.subject_id);
      if (subjectId) {
        if (!subjectCountByClass.has(key)) subjectCountByClass.set(key, new Set());
        subjectCountByClass.get(key)?.add(subjectId);
        coefficientByClassSubject.set(`${key}:${subjectId}`, toFiniteNumber(link.coefficient, 1));
      }
      const teacherId = getEntityId(link.teacher || link.teacher_id);
      if (teacherId) {
        if (!teacherIdsByClass.has(key)) teacherIdsByClass.set(key, new Set());
        teacherIdsByClass.get(key)?.add(teacherId);
      }
    });

    const studentClassKeyById = new Map<string, string>();
    studentsByClass.forEach((classStudents, key) => {
      classStudents.forEach((student) => {
        const studentId = getEntityId(student.id);
        if (studentId) studentClassKeyById.set(studentId, key);
      });
    });

    const gradesByStudent = new Map<string, Record<string, unknown>[]>();
    const selectedGrades = selectedSequenceId
      ? allGrades.filter((grade) => getEntityId(grade.sequence) === selectedSequenceId)
      : [];
    selectedGrades.forEach((grade) => {
      const studentId = getEntityId(grade.student);
      if (!studentId || !studentClassKeyById.has(studentId)) return;
      const classKey = studentClassKeyById.get(studentId) || '';
      const student = (studentsByClass.get(classKey) || []).find((item) => getEntityId(item.id) === studentId);
      if (student && !gradeMatchesStudentCurrentClass(grade, student)) return;
      if (!gradesByStudent.has(studentId)) gradesByStudent.set(studentId, []);
      gradesByStudent.get(studentId)?.push(grade);
    });

    const rows = classKeys
      .map((key) => {
        const schoolClass = classByKey.get(key);
        if (!schoolClass) return null;
        const classStudents = studentsByClass.get(key) || [];
        const subjectIds = subjectCountByClass.get(key) || new Set<string>();
        const teacherIds = teacherIdsByClass.get(key) || new Set<string>();
        const studentAverages: number[] = [];
        let marksEntered = 0;

        classStudents.forEach((student) => {
          const studentId = getEntityId(student.id);
          const studentGrades = gradesByStudent.get(studentId) || [];
          if (!studentGrades.length) return;
          marksEntered += studentGrades.length;
          let weightedTotal = 0;
          let coefficientTotal = 0;
          studentGrades.forEach((grade) => {
            const subjectId = getEntityId(grade.subject);
            if (subjectId) subjectIds.add(subjectId);
            const teacherId = getEntityId(grade.teacher);
            if (teacherId) teacherIds.add(teacherId);
            const coefficient = coefficientByClassSubject.get(`${key}:${subjectId}`) || 1;
            weightedTotal += toFiniteNumber(grade.score) * coefficient;
            coefficientTotal += coefficient;
          });
          if (coefficientTotal > 0) {
            studentAverages.push(Number((weightedTotal / coefficientTotal).toFixed(2)));
          }
        });

        const declaredStudentCount = toFiniteNumber(schoolClass.total_students, 0);
        const studentCount = Math.max(classStudents.length, declaredStudentCount);
        const declaredSubjectCount = toFiniteNumber(schoolClass.total_subjects, 0);
        const subjectCount = Math.max(subjectIds.size, declaredSubjectCount);
        const declaredTeacherCount = toFiniteNumber(schoolClass.total_teachers, 0);
        const teacherCount = Math.max(teacherIds.size, declaredTeacherCount);
        const averageMark = studentAverages.length
          ? Number((studentAverages.reduce((total, average) => total + average, 0) / studentAverages.length).toFixed(2))
          : 0;
        const performance = Math.round((averageMark / 20) * 100);
        const passCount = studentAverages.filter((average) => average >= 10).length;
        const passRate = studentAverages.length ? Math.round((passCount / studentAverages.length) * 100) : 0;
        const expectedEntries = studentCount * Math.max(subjectCount, 1);
        const completionRate = expectedEntries ? Math.round((marksEntered / expectedEntries) * 100) : 0;
        const id = getEntityId(schoolClass.id) || key;
        const subSchoolId = getEntityId(schoolClass.sub_school || schoolClass.sub_school_id) || null;
        const subSchoolName = String(
          schoolClass.sub_school_name
          || (schoolClass.sub_school && typeof schoolClass.sub_school === 'object'
            ? (schoolClass.sub_school as Record<string, unknown>).name
            : '')
          || 'Main School'
        );

        return {
          id,
          name: String(schoolClass.name || key),
          sub_school_id: subSchoolId,
          sub_school_name: subSchoolName,
          students: studentCount,
          student_count: studentCount,
          teachers: teacherCount,
          teacher_count: teacherCount,
          average_mark: averageMark,
          averageMark,
          performance,
          pass_rate: passRate,
          passRate,
          completion_rate: completionRate,
          completionRate,
          marks_entered: marksEntered,
          marksEntered,
          graded_students: studentAverages.length,
          subjects: subjectCount,
        };
      })
      .filter((row): row is ClassStatisticsResponse['classes'][number] => Boolean(row));

    const gradedRows = rows.filter((row) => row.graded_students > 0);
    const totals = {
      students: rows.reduce((total, row) => total + row.students, 0),
      teachers: rows.reduce((total, row) => total + row.teachers, 0),
      marks_entered: rows.reduce((total, row) => total + row.marks_entered, 0),
      average_mark: gradedRows.length
        ? Number((gradedRows.reduce((total, row) => total + row.average_mark, 0) / gradedRows.length).toFixed(2))
        : 0,
    };

    return {
      sequence: selectedSequence,
      classes: rows,
      totals,
      scale: {
        min: 0,
        max: 20,
        pass_mark: 10,
        system: 'Cameroon secondary education',
      },
    };
  },

  async getReportCard(studentId: string, sequenceId: string): Promise<ReportCard> {
    try {
      const { data } = await apiClient.get(API.GRADES.REPORT_CARD(studentId, sequenceId));
      return data;
    } catch (error) {
      if (!shouldFallbackToSequenceUpsert(error)) {
        throw error;
      }
      return this.getReportCardFromStableEndpoints(studentId, sequenceId);
    }
  },

  async getClassResults(className: string, sequenceId: string, subjectId?: string): Promise<any> {
    return this.getClassResultsFromStableEndpoints(className, [sequenceId], subjectId);
  },

  async getTermClassResults(className: string, term: number, academicYear: string): Promise<any[]> {
    const { data } = await apiClient.get(API.GRADES.SEQUENCES, { params: { limit: 200 } });
    const sequences = normalizeApiList<Sequence>(data)
      .filter((sequence) => Number(sequence.term) === Number(term) && sequence.academic_year === academicYear)
      .sort((a, b) => getSequenceSortValue(a as unknown as Record<string, unknown>).localeCompare(getSequenceSortValue(b as unknown as Record<string, unknown>)));
    return this.getClassResultsFromStableEndpoints(className, sequences.map((sequence) => String(sequence.id)));
  },

  async getClassResultsFromStableEndpoints(className: string, sequenceIds: string[], subjectId?: string): Promise<any[]> {
    const [studentsResponse, gradesResponse, classSubjectsResponse] = await Promise.all([
      apiClient.get(API.STUDENTS.CLASS_LIST(className)).catch(async () => apiClient.get(API.STUDENTS.BASE, { params: { limit: 5000 } })),
      apiClient.get(API.GRADES.GRADES, { params: { limit: 10000 } }),
      apiClient.get(API.SCHOOLS.HIERARCHY_SUBJECTS, { params: { limit: 3000 } }).catch(() => ({ data: [] })),
    ]);

    const classStudents = normalizeApiList<Record<string, unknown>>(studentsResponse.data)
      .filter((student) => getStudentClassName(student) === className || !getStudentClassName(student));
    const grades = normalizeApiList<Record<string, unknown>>(gradesResponse.data);
    const classSubjects = normalizeApiList<Record<string, unknown>>(classSubjectsResponse.data)
      .filter((link) => String(link.class_name || '') === className);
    const sequenceSet = new Set(sequenceIds.map(String).filter(Boolean));
    const coefficientBySubject = new Map<string, number>();
    classSubjects.forEach((link) => {
      const linkSubjectId = getEntityId(link.subject || link.subject_id);
      if (linkSubjectId) coefficientBySubject.set(linkSubjectId, toFiniteNumber(link.coefficient, 1));
    });

    const rows = classStudents.map((student) => {
      const studentId = getEntityId(student.id);
      const studentGrades = grades.filter((grade) => {
        const matchesStudent = getGradeStudentId(grade) === studentId;
        const matchesSequence = sequenceSet.has(getGradeSequenceId(grade));
        const matchesSubject = subjectId ? getGradeSubjectId(grade) === String(subjectId) : true;
        return matchesStudent && matchesSequence && matchesSubject && gradeMatchesStudentCurrentClass(grade, student);
      });

      const gradesBySubject = new Map<string, Record<string, unknown>[]>();
      studentGrades.forEach((grade) => {
        const gradeSubjectId = getGradeSubjectId(grade);
        if (!gradeSubjectId) return;
        if (!gradesBySubject.has(gradeSubjectId)) gradesBySubject.set(gradeSubjectId, []);
        gradesBySubject.get(gradeSubjectId)?.push(grade);
      });

      let weightedTotal = 0;
      let coefficientTotal = 0;
      gradesBySubject.forEach((subjectGrades, gradeSubjectId) => {
        const coefficient = coefficientBySubject.get(gradeSubjectId) || toFiniteNumber(subjectGrades[0]?.coefficient, 1);
        const subjectAverage = subjectGrades.reduce((total, grade) => total + toFiniteNumber(grade.score), 0) / subjectGrades.length;
        weightedTotal += subjectAverage * coefficient;
        coefficientTotal += coefficient;
      });

      const average = coefficientTotal ? Number((weightedTotal / coefficientTotal).toFixed(2)) : 0;
      return {
        student_id: studentId,
        student_name: getStudentName(student),
        admission_number: String(student.admission_number || ''),
        class_name: getStudentClassName(student) || className,
        average,
        rank: null as number | null,
        marks_entered: studentGrades.length,
      };
    });

    const ranked = rows
      .filter((row) => row.average > 0)
      .sort((a, b) => b.average - a.average);
    let lastAverage: number | null = null;
    let lastRank = 0;
    ranked.forEach((row, index) => {
      if (lastAverage === null || row.average !== lastAverage) {
        lastRank = index + 1;
        lastAverage = row.average;
      }
      row.rank = lastRank;
    });

    return rows.sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.student_name.localeCompare(b.student_name);
    });
  },

  async getReportCardFromStableEndpoints(studentId: string, sequenceId: string): Promise<ReportCard> {
    const [studentResponse, gradesResponse, sequenceResponse, classSubjectsResponse] = await Promise.all([
      apiClient.get(API.STUDENTS.DETAIL(studentId)),
      apiClient.get(API.GRADES.GRADES, { params: { limit: 10000 } }),
      apiClient.get(API.GRADES.SEQUENCE_DETAIL(sequenceId)),
      apiClient.get(API.SCHOOLS.HIERARCHY_SUBJECTS, { params: { limit: 3000 } }).catch(() => ({ data: [] })),
    ]);

    const student = studentResponse.data as Record<string, unknown>;
    const sequence = sequenceResponse.data as Sequence;
    const className = getStudentClassName(student);
    const classSubjects = normalizeApiList<Record<string, unknown>>(classSubjectsResponse.data)
      .filter((link) => String(link.class_name || '') === className);
    const coefficientBySubject = new Map<string, number>();
    classSubjects.forEach((link) => {
      const linkSubjectId = getEntityId(link.subject || link.subject_id);
      if (linkSubjectId) coefficientBySubject.set(linkSubjectId, toFiniteNumber(link.coefficient, 1));
    });

    const grades = normalizeApiList<Record<string, unknown>>(gradesResponse.data)
      .filter((grade) =>
        getGradeStudentId(grade) === String(studentId)
        && getGradeSequenceId(grade) === String(sequenceId)
        && gradeMatchesStudentCurrentClass(grade, student)
      );

    let weightedTotal = 0;
    let coefficientTotal = 0;
    const gradeRows = grades.map((grade) => {
      const gradeSubjectId = getGradeSubjectId(grade);
      const coefficient = coefficientBySubject.get(gradeSubjectId) || toFiniteNumber(grade.coefficient, 1);
      const score = toFiniteNumber(grade.score);
      weightedTotal += score * coefficient;
      coefficientTotal += coefficient;
      return {
        subject_id: gradeSubjectId,
        subject_name: getGradeSubjectName(grade),
        subject_code: getGradeSubjectCode(grade),
        teacher_name: getGradeTeacherName(grade),
        score,
        grade_letter: score >= 16 ? 'A' : score >= 14 ? 'B' : score >= 12 ? 'C' : score >= 10 ? 'D' : 'F',
        coefficient,
        total: Number((score * coefficient).toFixed(2)),
        comment: String(grade.comment || ''),
      };
    });
    const average = coefficientTotal ? Number((weightedTotal / coefficientTotal).toFixed(2)) : 0;
    const classResults = className ? await this.getClassResultsFromStableEndpoints(className, [sequenceId]) : [];
    const currentRow = classResults.find((row) => String(row.student_id) === String(studentId));

    return {
      student: {
        ...student,
        name: getStudentName(student),
        class: className,
      },
      sequence,
      grades: gradeRows,
      average,
      rank: currentRow?.rank ?? null,
      total_students: classResults.length,
      promotion_status: average >= 10 ? 'Promoted' : 'Requires Review',
    } as unknown as ReportCard;
  },

  async getTermReportCard(studentId: string, term: number, academicYear: string): Promise<ReportCard> {
    try {
      const { data } = await apiClient.get(API.GRADES.TERM_REPORT_CARD(studentId, term, academicYear));
      return data;
    } catch (error) {
      if (!shouldFallbackToSequenceUpsert(error)) {
        throw error;
      }
    }

    const [studentResponse, gradesResponse, sequencesResponse, classSubjectsResponse] = await Promise.all([
      apiClient.get(API.STUDENTS.DETAIL(studentId)),
      apiClient.get(API.GRADES.GRADES, { params: { limit: 10000 } }),
      apiClient.get(API.GRADES.SEQUENCES, { params: { limit: 200 } }),
      apiClient.get(API.SCHOOLS.HIERARCHY_SUBJECTS, { params: { limit: 3000 } }).catch(() => ({ data: [] })),
    ]);

    const student = studentResponse.data as Record<string, unknown>;
    const className = getStudentClassName(student);
    const sequences = normalizeApiList<Sequence>(sequencesResponse.data)
      .filter((sequence) => Number(sequence.term) === Number(term) && sequence.academic_year === academicYear)
      .sort((a, b) => getSequenceSortValue(a as unknown as Record<string, unknown>).localeCompare(getSequenceSortValue(b as unknown as Record<string, unknown>)));
    const sequenceIds = new Set(sequences.map((sequence) => String(sequence.id)));
    const classSubjects = normalizeApiList<Record<string, unknown>>(classSubjectsResponse.data)
      .filter((link) => String(link.class_name || '') === className);
    const coefficientBySubject = new Map<string, number>();
    classSubjects.forEach((link) => {
      const linkSubjectId = getEntityId(link.subject || link.subject_id);
      if (linkSubjectId) coefficientBySubject.set(linkSubjectId, toFiniteNumber(link.coefficient, 1));
    });

    const studentGrades = normalizeApiList<Record<string, unknown>>(gradesResponse.data)
      .filter((grade) =>
        getGradeStudentId(grade) === String(studentId)
        && sequenceIds.has(getGradeSequenceId(grade))
        && gradeMatchesStudentCurrentClass(grade, student)
      );
    const gradesBySubject = new Map<string, Record<string, unknown>[]>();
    studentGrades.forEach((grade) => {
      const gradeSubjectId = getGradeSubjectId(grade);
      if (!gradeSubjectId) return;
      if (!gradesBySubject.has(gradeSubjectId)) gradesBySubject.set(gradeSubjectId, []);
      gradesBySubject.get(gradeSubjectId)?.push(grade);
    });

    let weightedTotal = 0;
    let coefficientTotal = 0;
    const gradeRows = Array.from(gradesBySubject.entries()).map(([gradeSubjectId, subjectGrades]) => {
      const coefficient = coefficientBySubject.get(gradeSubjectId) || toFiniteNumber(subjectGrades[0]?.coefficient, 1);
      const score = Number((subjectGrades.reduce((total, grade) => total + toFiniteNumber(grade.score), 0) / subjectGrades.length).toFixed(2));
      weightedTotal += score * coefficient;
      coefficientTotal += coefficient;
      return {
        subject_id: gradeSubjectId,
        subject_name: getGradeSubjectName(subjectGrades[0]),
        subject_code: getGradeSubjectCode(subjectGrades[0]),
        teacher_name: getGradeTeacherName(subjectGrades[0]),
        score,
        grade_letter: score >= 16 ? 'A' : score >= 14 ? 'B' : score >= 12 ? 'C' : score >= 10 ? 'D' : 'F',
        coefficient,
        total: Number((score * coefficient).toFixed(2)),
        comment: String(subjectGrades.find((grade) => grade.comment)?.comment || ''),
        sequence_scores: subjectGrades.map((grade) => ({
          sequence_id: getGradeSequenceId(grade),
          score: toFiniteNumber(grade.score),
        })),
      };
    });
    const average = coefficientTotal ? Number((weightedTotal / coefficientTotal).toFixed(2)) : 0;
    const classResults = className ? await this.getTermClassResults(className, term, academicYear) : [];
    const currentRow = classResults.find((row) => String(row.student_id) === String(studentId));

    return {
      student: {
        ...student,
        name: getStudentName(student),
        class: className,
      },
      sequence: {
        id: `term-${term}-${academicYear}`,
        name: `${term === 1 ? 'First' : term === 2 ? 'Second' : 'Third'} Term Report`,
        academic_year: academicYear,
        term,
        is_active: sequences.some((sequence) => Boolean(sequence.is_active)),
        sequences,
        type: 'TERM',
      },
      grades: gradeRows,
      average,
      rank: currentRow?.rank ?? null,
      total_students: classResults.length,
      promotion_status: average >= 10 ? 'Promoted' : 'Requires Review',
      period_type: 'term',
    } as unknown as ReportCard;
  },

  async getTermResults(params?: ListParams): Promise<any> {
    const { data } = await apiClient.get(API.GRADES.TERM_RESULTS, { params });
    return data;
  },

  async getAnnualResults(params?: ListParams): Promise<any> {
    const { data } = await apiClient.get(API.GRADES.ANNUAL_RESULTS, { params });
    return data;
  },

  async publishReportCards(payload: PublishReportCardsPayload): Promise<any> {
    const endpoints = [
      API.GRADES.PUBLISH_REPORT_CARDS_SHORT_ACTION,
      API.GRADES.PUBLISH_REPORT_CARDS_SHORT,
      API.GRADES.PUBLISH_REPORT_CARDS_SHORT_LEGACY,
      API.GRADES.PUBLISH_REPORT_CARDS_ACTION,
      API.GRADES.PUBLISH_REPORT_CARDS_LEGACY,
      API.GRADES.PUBLISH_REPORT_CARDS,
      API.GRADES.PUBLISH_REPORT_CARDS_DRF_ACTION,
    ];
    let lastError: unknown = null;
    for (const endpoint of endpoints) {
      try {
        const { data } = await apiClient.post(endpoint, payload);
        return data;
      } catch (error) {
        lastError = error;
        if (!shouldFallbackToSequenceUpsert(error)) throw error;
      }
    }
    throw lastError;
  },

  // Publish every class in the school for a sequence or term in one action.
  async publishAllReportCards(payload: {
    scope: "SEQUENCE" | "TERM";
    sequence_id?: string;
    term?: number;
    academic_year?: string;
  }): Promise<any> {
    const endpoints = [
      API.GRADES.PUBLISH_ALL_REPORT_CARDS_SHORT_ACTION,
      API.GRADES.PUBLISH_ALL_REPORT_CARDS_SHORT,
      API.GRADES.PUBLISH_ALL_REPORT_CARDS_ACTION,
      API.GRADES.PUBLISH_ALL_REPORT_CARDS,
    ];
    let lastError: unknown = null;
    for (const endpoint of endpoints) {
      try {
        const { data } = await apiClient.post(endpoint, payload);
        return data;
      } catch (error) {
        lastError = error;
        if (!shouldFallbackToSequenceUpsert(error)) throw error;
      }
    }
    throw lastError;
  },

  async getHonourRoll(params?: ListParams): Promise<any> {
    const endpoints = [
      API.GRADES.HONOUR_ROLL,
      API.GRADES.HONOUR_ROLL_LEGACY,
      API.GRADES.HONOUR_ROLL_REWARDS,
    ];
    let lastError: unknown = null;
    for (const endpoint of endpoints) {
      try {
        const { data } = await apiClient.get(endpoint, { params });
        return data;
      } catch (error) {
        lastError = error;
        if (!shouldFallbackToSequenceUpsert(error)) throw error;
      }
    }
    try {
      return await this.getHonourRollFromStableEndpoints(params);
    } catch {
      throw lastError;
    }
  },

  /** Every honour roll a student has ever earned (per term across all years). */
  async getHonourRollHistory(params?: { student_id?: string }): Promise<any> {
    const { data } = await apiClient.get('/grades/grades/honour-roll/history/', { params });
    return data;
  },

  /** Official multi-year transcript for a student (both cycles). */
  async getTranscript(params?: { student_id?: string }): Promise<any> {
    const { data } = await apiClient.get('/grades/grades/transcript/', { params });
    return data;
  },

  async getHonourRollFromStableEndpoints(params?: ListParams): Promise<any> {
    const threshold = toFiniteNumber(params?.threshold, 12);
    const [studentsResponse, gradesResponse, sequencesResponse, classSubjectsResponse] = await Promise.all([
      apiClient.get(API.STUDENTS.BASE, { params: { limit: 5000 } }),
      apiClient.get(API.GRADES.GRADES, { params: { limit: 10000 } }),
      apiClient.get(API.GRADES.SEQUENCES, { params: { limit: 200 } }),
      apiClient.get(API.SCHOOLS.HIERARCHY_SUBJECTS, { params: { limit: 3000 } }).catch(() => ({ data: [] })),
    ]);

    const students = normalizeApiList<Record<string, unknown>>(studentsResponse.data);
    const grades = normalizeApiList<Record<string, unknown>>(gradesResponse.data);
    const sequences = normalizeApiList<Sequence>(sequencesResponse.data);
    const classSubjects = normalizeApiList<Record<string, unknown>>(classSubjectsResponse.data);

    const requestedSequenceId = String(params?.sequence_id || '');
    const term = params?.term ? Number(params.term) : null;
    const academicYear = String(params?.academic_year || '');
    let selectedSequences: Sequence[] = [];
    if (requestedSequenceId) {
      selectedSequences = sequences.filter((sequence) => String(sequence.id) === requestedSequenceId);
    } else if (term && academicYear) {
      selectedSequences = sequences.filter((sequence) => Number(sequence.term) === term && sequence.academic_year === academicYear);
    } else {
      const gradeSequenceIds = new Set(grades.map((grade) => getGradeSequenceId(grade)).filter(Boolean));
      const active = sequences.find((sequence) => Boolean(sequence.is_active) && gradeSequenceIds.has(String(sequence.id)))
        || sequences.find((sequence) => Boolean(sequence.is_active))
        || sequences.find((sequence) => gradeSequenceIds.has(String(sequence.id)))
        || sequences[0];
      selectedSequences = active ? [active] : [];
    }

    const selectedSequenceIds = new Set(selectedSequences.map((sequence) => String(sequence.id)));
    const coefficientByClassSubject = new Map<string, number>();
    classSubjects.forEach((link) => {
      const className = String(link.class_name || '');
      const subjectId = getEntityId(link.subject || link.subject_id);
      if (className && subjectId) {
        coefficientByClassSubject.set(`${className}:${subjectId}`, toFiniteNumber(link.coefficient, 1));
      }
    });

    const rows = students.map((student) => {
      const studentId = getEntityId(student.id);
      const className = getStudentClassName(student);
      const studentGrades = grades.filter((grade) =>
        getGradeStudentId(grade) === studentId
        && selectedSequenceIds.has(getGradeSequenceId(grade))
        && gradeMatchesStudentCurrentClass(grade, student)
      );
      const gradesBySubject = new Map<string, Record<string, unknown>[]>();
      studentGrades.forEach((grade) => {
        const subjectId = getGradeSubjectId(grade);
        if (!subjectId) return;
        if (!gradesBySubject.has(subjectId)) gradesBySubject.set(subjectId, []);
        gradesBySubject.get(subjectId)?.push(grade);
      });
      let weightedTotal = 0;
      let coefficientTotal = 0;
      gradesBySubject.forEach((subjectGrades, subjectId) => {
        const subjectAverage = subjectGrades.reduce((total, grade) => total + toFiniteNumber(grade.score), 0) / subjectGrades.length;
        const coefficient = coefficientByClassSubject.get(`${className}:${subjectId}`) || toFiniteNumber(subjectGrades[0]?.coefficient, 1);
        weightedTotal += subjectAverage * coefficient;
        coefficientTotal += coefficient;
      });
      const average = coefficientTotal ? Number((weightedTotal / coefficientTotal).toFixed(2)) : 0;
      return {
        student,
        studentId,
        average,
        marks: studentGrades.length,
      };
    }).filter((row) => row.average > 0);

    const ranked = rows.sort((a, b) => b.average - a.average);
    let lastAverage: number | null = null;
    let lastRank = 0;
    ranked.forEach((row, index) => {
      if (lastAverage === null || row.average !== lastAverage) {
        lastRank = index + 1;
        lastAverage = row.average;
      }
      (row as typeof row & { rank: number }).rank = lastRank;
    });

    const eligible = ranked.filter((row) => row.average >= threshold);
    const passCount = ranked.filter((row) => row.average >= 10).length;
    const classAverage = ranked.length
      ? Number((ranked.reduce((total, row) => total + row.average, 0) / ranked.length).toFixed(2))
      : 0;
    const firstSequence = selectedSequences[0];
    const periodTerm = term || Number(firstSequence?.term || 0);
    const periodAcademicYear = academicYear || String(firstSequence?.academic_year || '');
    const isTerm = Boolean(term && academicYear);
    const periodLabel = isTerm
      ? `${getTermLabel(periodTerm)} ${periodAcademicYear}`
      : firstSequence?.name || 'Current Sequence';

    return {
      period: {
        scope: isTerm ? 'TERM' : 'SEQUENCE',
        sequence_id: firstSequence ? String(firstSequence.id) : null,
        sequence_name: firstSequence?.name || null,
        term: periodTerm || null,
        term_label: periodTerm ? getTermLabel(periodTerm) : null,
        academic_year: periodAcademicYear,
        sequences: selectedSequences,
      },
      threshold,
      results: eligible.map((row) => {
        const student = row.student;
        const user = student.user && typeof student.user === 'object' ? student.user as Record<string, unknown> : {};
        const className = getStudentClassName(student);
        return {
          id: row.studentId,
          student_id: row.studentId,
          name: getStudentName(student),
          matricule: String(user.matricule || student.matricule || student.admission_number || row.studentId),
          admission_number: String(student.admission_number || ''),
          class: className,
          class_name: className,
          section: String(student.section || student.sub_school_name || 'General'),
          sub_school_name: String(student.sub_school_name || 'Main School'),
          average: row.average,
          rank: (row as typeof row & { rank?: number }).rank,
          total_students: ranked.length,
          award: getAwardLabel(row.average),
          period_label: periodLabel,
          academic_year: periodAcademicYear,
          term: periodTerm || null,
          scope: isTerm ? 'TERM' : 'SEQUENCE',
          school: student.school,
        };
      }),
      summary: {
        eligible: eligible.length,
        total_ranked: ranked.length,
        class_average: classAverage,
        pass_rate: ranked.length ? Math.round((passCount / ranked.length) * 100) : 0,
      },
    };
  },
};
