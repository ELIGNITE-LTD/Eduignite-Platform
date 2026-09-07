/**
 * Minimal request/response types for the Companion app.
 *
 * This app only ever talks to three surfaces of the shared EduIgnite backend
 * (auth, offline-licensing, and the public app-versions endpoint), so it
 * deliberately carries a much smaller subset of `apps/mobile/src/lib/api/
 * types.ts` rather than importing across app boundaries — this is a separate
 * Capacitor app with its own dependency tree and build.
 */

export type UserRole =
  | "SCHOOL_ADMIN"
  | "SUB_ADMIN"
  | "TEACHER"
  | "STUDENT"
  | "PARENT"
  | "PLATFORM_EXECUTIVE"
  | string;

export interface SchoolSummary {
  id: string;
  name: string;
}

export interface User {
  id: string;
  matricule?: string;
  name: string;
  email?: string;
  role: UserRole;
  school?: SchoolSummary;
  schoolId?: string | null;
}

export interface LoginRequest {
  matricule: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: User;
}
