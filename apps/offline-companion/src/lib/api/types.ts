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
  short_name?: string;
  principal?: string;
  /** backend/apps/schools -> School.motto, surfaced by build_user_payload() / UserDetailSerializer.get_school(). */
  motto?: string | null;
  /** backend/apps/schools -> School.logo (URL), same source as `motto`. */
  logo?: string | null;
}

export interface User {
  id: string;
  matricule?: string;
  name: string;
  email?: string;
  /** backend/apps/users -> User.phone. Editable via PATCH /users/me/. */
  phone?: string | null;
  /** backend/apps/users -> User.whatsapp. Editable via PATCH /users/me/. */
  whatsapp?: string | null;
  /** backend/apps/users -> User.avatar. A data: URL once uploaded via POST /users/upload_avatar/. */
  avatar?: string | null;
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

// --- Profile (backend/apps/users) ---------------------------------------

export interface UpdateProfileRequest {
  name?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// --- Announcements (backend/apps/announcements) -----------------------

export interface Announcement {
  id: string;
  title: string;
  content: string;
  sender_name?: string;
  sender_role?: string;
  is_pinned?: boolean;
  is_read?: boolean;
  created_at?: string;
}

// --- Testimony (backend/apps/community) --------------------------------

export interface Testimony {
  id: string;
  school_name: string;
  role_display: string;
  message: string;
  rating: number;
  status: "pending" | "approved" | "rejected";
  created_at?: string;
}

export interface CreateTestimonyRequest {
  school_name: string;
  role_display: string;
  message: string;
  rating: number;
}

// --- Feedback (backend/apps/feedback) -----------------------------------

export interface Feedback {
  id: string;
  subject: string;
  message: string;
  category?: string;
  status: "New" | "In_Progress" | "Resolved" | "Closed" | string;
  priority?: "Low" | "Medium" | "High" | "Critical" | string;
  created_at?: string;
}

export interface CreateFeedbackRequest {
  subject: string;
  message: string;
  category?: string;
  priority: "Low" | "Medium" | "High" | "Critical";
}

// --- Chat (backend/apps/chat) -------------------------------------------

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  text: string;
  created_at: string;
  is_read?: boolean;
}

export interface ConversationDetail {
  id: string;
  name?: string;
  conversation_type: "direct" | "group";
  recent_messages: ChatMessage[];
  last_message?: string | null;
  last_message_at?: string | null;
}

// --- Surveys (backend/apps/surveys) --------------------------------------

export interface SurveyListItem {
  id: number;
  title: string;
  description: string;
  question_count: number;
}

export interface SurveyQuestion {
  id: number;
  question_text: string;
  question_type: "TEXT" | "SINGLE_CHOICE";
  options: string[];
}

export interface SurveyDetail {
  id: number;
  title: string;
  description: string;
  questions: SurveyQuestion[];
}

export interface SurveyAnswerInput {
  question_id: number;
  answer_text: string;
}

export interface SurveyResponseSummary {
  id: number;
  survey: number;
  submitted_at: string;
  answers: { question: number; answer_text: string }[];
}
