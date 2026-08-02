import { apiClient } from '../client';
import { API } from '../endpoints';
import type {
  LiveClass,
  LiveClassStats,
  CreateLiveClassRequest,
  PaginatedResponse,
  ListParams,
} from '../types';

export const liveClassesService = {
  /** List all live classes (school-scoped, paginated) */
  getLiveClasses: (params?: ListParams) =>
    apiClient.get<PaginatedResponse<LiveClass>>(API.LIVE_CLASSES.BASE, { params }).then(r => r.data),

  /** Get a single live class by ID */
  getLiveClass: (id: string) =>
    apiClient.get<LiveClass>(API.LIVE_CLASSES.DETAIL(id)).then(r => r.data),

  /** Teacher's own sessions */
  getMyClasses: () =>
    apiClient.get<{ count: number; results: LiveClass[] }>(API.LIVE_CLASSES.MY_CLASSES).then(r => r.data),

  /** Student's enrolled sessions */
  getEnrolledClasses: () =>
    apiClient.get<{ count: number; results: LiveClass[] }>(API.LIVE_CLASSES.ENROLLED).then(r => r.data),

  /** Currently live sessions */
  getLiveNow: () =>
    apiClient.get<{ count: number; results: LiveClass[] }>(API.LIVE_CLASSES.LIVE_NOW).then(r => r.data),

  /** Sessions in the next 7 days */
  getUpcoming: () =>
    apiClient.get<{ count: number; results: LiveClass[] }>(API.LIVE_CLASSES.UPCOMING).then(r => r.data),

  /** Admin/teacher analytics */
  getStats: () =>
    apiClient.get<LiveClassStats>(API.LIVE_CLASSES.STATS).then(r => r.data),

  /** Create a new live class (teacher/admin) */
  createLiveClass: (data: CreateLiveClassRequest) =>
    apiClient.post<LiveClass>(API.LIVE_CLASSES.BASE, data).then(r => r.data),

  /** Update a live class */
  updateLiveClass: (id: string, data: Partial<CreateLiveClassRequest>) =>
    apiClient.patch<LiveClass>(API.LIVE_CLASSES.DETAIL(id), data).then(r => r.data),

  /** Cancel a class (sets status to cancelled) */
  cancelLiveClass: (id: string) =>
    apiClient.delete(API.LIVE_CLASSES.DETAIL(id)).then(r => r.data),

  /** Student enrolls in a class */
  enroll: (id: string) =>
    apiClient.post(API.LIVE_CLASSES.ENROLL(id)).then(r => r.data),

  /** Student unenrolls from a class */
  unenroll: (id: string) =>
    apiClient.post(API.LIVE_CLASSES.UNENROLL(id)).then(r => r.data),

  /** Teacher starts a session (marks as live) */
  startClass: (id: string) =>
    apiClient.post<LiveClass>(API.LIVE_CLASSES.START(id)).then(r => r.data),

  /** Teacher ends a session */
  endClass: (id: string) =>
    apiClient.post<LiveClass>(API.LIVE_CLASSES.END(id)).then(r => r.data),

  /** Cancel via dedicated cancel action */
  cancelClass: (id: string) =>
    apiClient.post(API.LIVE_CLASSES.CANCEL(id)).then(r => r.data),
};
