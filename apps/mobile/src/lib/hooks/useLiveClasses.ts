import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { liveClassesService } from '@/lib/api/services/live-classes.service';
import type { CreateLiveClassRequest, ListParams } from '@/lib/api/types';

// ─── Query key factory ────────────────────────────────────────────────────────
const lcKeys = {
  all: ['live-classes'] as const,
  lists: () => [...lcKeys.all, 'list'] as const,
  list: (params?: ListParams) => [...lcKeys.lists(), { ...params }] as const,
  detail: (id: string) => [...lcKeys.all, 'detail', id] as const,
  myClasses: () => [...lcKeys.all, 'mine'] as const,
  enrolled: () => [...lcKeys.all, 'enrolled'] as const,
  liveNow: () => [...lcKeys.all, 'live-now'] as const,
  upcoming: () => [...lcKeys.all, 'upcoming'] as const,
  stats: () => [...lcKeys.all, 'stats'] as const,
};

// ─── Query hooks ──────────────────────────────────────────────────────────────

/** All live classes (paginated) */
export function useLiveClasses(params?: ListParams) {
  return useQuery({
    queryKey: lcKeys.list(params),
    queryFn: () => liveClassesService.getLiveClasses(params),
  });
}

/** Single live class detail */
export function useLiveClass(id: string) {
  return useQuery({
    queryKey: lcKeys.detail(id),
    queryFn: () => liveClassesService.getLiveClass(id),
    enabled: !!id,
  });
}

/** Current teacher's own classes */
export function useMyLiveClasses() {
  return useQuery({
    queryKey: lcKeys.myClasses(),
    queryFn: () => liveClassesService.getMyClasses(),
  });
}

/** Student's enrolled classes */
export function useEnrolledClasses() {
  return useQuery({
    queryKey: lcKeys.enrolled(),
    queryFn: () => liveClassesService.getEnrolledClasses(),
  });
}

/** Currently live sessions — refetch every 30 seconds */
export function useLiveNow() {
  return useQuery({
    queryKey: lcKeys.liveNow(),
    queryFn: () => liveClassesService.getLiveNow(),
    refetchInterval: 30_000,
  });
}

/** Upcoming sessions in next 7 days */
export function useUpcomingClasses() {
  return useQuery({
    queryKey: lcKeys.upcoming(),
    queryFn: () => liveClassesService.getUpcoming(),
  });
}

/** Admin/teacher analytics */
export function useLiveClassStats() {
  return useQuery({
    queryKey: lcKeys.stats(),
    queryFn: () => liveClassesService.getStats(),
  });
}

// ─── Mutation hooks ───────────────────────────────────────────────────────────

/** Create a new live class session */
export function useCreateLiveClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLiveClassRequest) => liveClassesService.createLiveClass(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lcKeys.lists() });
      qc.invalidateQueries({ queryKey: lcKeys.myClasses() });
      qc.invalidateQueries({ queryKey: lcKeys.stats() });
    },
  });
}

/** Update a live class */
export function useUpdateLiveClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateLiveClassRequest> }) =>
      liveClassesService.updateLiveClass(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: lcKeys.detail(id) });
      qc.invalidateQueries({ queryKey: lcKeys.lists() });
    },
  });
}

/** Cancel a live class */
export function useCancelLiveClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => liveClassesService.cancelClass(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lcKeys.all });
    },
  });
}

/** Student enrolls in a class */
export function useEnrollInClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => liveClassesService.enroll(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lcKeys.all });
    },
  });
}

/** Student unenrolls from a class */
export function useUnenrollFromClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => liveClassesService.unenroll(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lcKeys.all });
    },
  });
}

/** Teacher starts a session */
export function useStartClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => liveClassesService.startClass(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: lcKeys.detail(id) });
      qc.invalidateQueries({ queryKey: lcKeys.lists() });
    },
  });
}

/** Teacher ends a session */
export function useEndClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => liveClassesService.endClass(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: lcKeys.detail(id) });
      qc.invalidateQueries({ queryKey: lcKeys.lists() });
    },
  });
}
