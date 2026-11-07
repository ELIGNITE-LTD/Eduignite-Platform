import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { classTeachersService } from '@/lib/api/services/class-teachers.service';
import type { AssignClassTeacherRequest } from '@/lib/api/types';

const classTeacherKeys = {
  all: ['class-teachers'] as const,
  list: (params?: { class_id?: string; teacher_id?: string }) =>
    [...classTeacherKeys.all, 'list', { ...(params ?? {}) }] as const,
  mine: () => [...classTeacherKeys.all, 'my-classes'] as const,
};

/** Class-teacher assignments (admins see the whole school, teachers their own). */
export function useClassTeachers(params?: { class_id?: string; teacher_id?: string }, enabled = true) {
  return useQuery({
    queryKey: classTeacherKeys.list(params),
    queryFn: () => classTeachersService.list(params),
    enabled,
  });
}

export function useAssignClassTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AssignClassTeacherRequest) => classTeachersService.assign(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classTeacherKeys.all });
    },
  });
}

export function useUnassignClassTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => classTeachersService.unassign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classTeacherKeys.all });
    },
  });
}

/** The calling teacher's classes (basic schools only; disabled otherwise). */
export function useMyClasses(enabled = true) {
  return useQuery({
    queryKey: classTeacherKeys.mine(),
    queryFn: () => classTeachersService.myClasses(),
    enabled,
  });
}
