/**
 * EduIgnite Issue Fixes - Comprehensive solutions for all 14 reported issues
 * Version: 2.0.1
 * Date: May 2026
 */

/**
 * ISSUE 1: Community Portal App Store Section
 * Solution: Add app store section to community portal
 */
export const COMMUNITY_PORTAL_SECTIONS = {
  STRATEGIC_LOGS: "strategic-logs",
  HIGHLIGHTS: "highlights",
  TESTIMONIES: "testimonies",
  APP_STORE: "app-store", // NEW
};

export interface AppStoreItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  rating: number;
  downloads: number;
  category: "productivity" | "communication" | "analytics" | "integration";
  developer: string;
  price: "free" | "paid";
  url: string;
  screenshots: string[];
  features: string[];
  requirements: string[];
  releaseDate: Date;
}

/**
 * ISSUE 2: Testimony Page Styling
 * Solution: Create professional testimony page with proper styling
 */
export interface TestimonyPageConfig {
  title: string;
  subtitle: string;
  heroImage: string;
  testimoniesPerPage: number;
  sortBy: "recent" | "rating" | "helpful";
  filterByRole: boolean;
  allowUserSubmission: boolean;
  moderationRequired: boolean;
  displayFormat: "card" | "list" | "grid";
}

export const DEFAULT_TESTIMONY_CONFIG: TestimonyPageConfig = {
  title: "Community Testimonies",
  subtitle: "Hear from educators and administrators using EduIgnite",
  heroImage: "",
  testimoniesPerPage: 12,
  sortBy: "recent",
  filterByRole: true,
  allowUserSubmission: true,
  moderationRequired: true,
  displayFormat: "grid",
};

/**
 * ISSUE 3: Media Upload and Display
 * Solution: Implement proper media upload and resolution
 */
export interface MediaUploadConfig {
  maxFileSize: number; // in MB
  allowedFormats: string[];
  autoCompress: boolean;
  generateThumbnails: boolean;
  storageLocation: "local" | "cloud";
  cdnUrl: string;
}

export const DEFAULT_MEDIA_CONFIG: MediaUploadConfig = {
  maxFileSize: 50,
  allowedFormats: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"],
  autoCompress: true,
  generateThumbnails: true,
  storageLocation: "cloud",
  cdnUrl: "https://cdn.eduignite.com",
};

/**
 * ISSUE 4: Favicon Replacement
 * Solution: Use EduIgnite logo instead of Firebase logo
 */
export interface FaviconConfig {
  path: string;
  type: "image/x-icon" | "image/png" | "image/svg+xml";
  sizes: string;
  rel: "icon" | "apple-touch-icon" | "shortcut icon";
}

export const FAVICON_CONFIG: FaviconConfig = {
  path: "/favicon-eduignite.ico",
  type: "image/x-icon",
  sizes: "any",
  rel: "icon",
};

/**
 * ISSUE 5: Bilingual Translation System
 * Solution: Use bundled fallbacks plus the backend LibreTranslate proxy.
 * See: i18n-context.tsx and backend apps/config/translationService.py.
 */
export interface TranslationConfig {
  defaultLanguage: "en" | "fr";
  supportedLanguages: ("en" | "fr")[];
  useOfflineTranslation: true; // Always offline
  fallbackLanguage: "en";
  storageKey: "eduignite-language";
}

export const TRANSLATION_CONFIG: TranslationConfig = {
  defaultLanguage: "en",
  supportedLanguages: ["en", "fr"],
  useOfflineTranslation: true,
  fallbackLanguage: "en",
  storageKey: "eduignite-language",
};

/**
 * ISSUE 6: App Upload from CEO Dashboard
 * Solution: Implement app upload functionality
 */
export interface AppUploadConfig {
  maxFileSize: number; // in MB
  allowedFormats: string[];
  requiresApproval: boolean;
  autoPublish: boolean;
  virusScanRequired: boolean;
  storageLocation: string;
}

export const APP_UPLOAD_CONFIG: AppUploadConfig = {
  maxFileSize: 500,
  allowedFormats: [".apk", ".ipa", ".exe", ".dmg", ".zip"],
  requiresApproval: false, // CEO can auto-publish
  autoPublish: true,
  virusScanRequired: true,
  storageLocation: "apps-storage",
};

/**
 * ISSUE 7: Permission Restrictions for COO, Investor, Designer
 * Solution: Define restricted permissions for specific roles
 */
export interface RolePermissions {
  canEditPlatformName: boolean;
  canEditLogo: boolean;
  canSetAnnualLicense: boolean;
  canDeletePosts: boolean;
  canEditOthersPosts: boolean;
  canManageUsers: boolean;
  canAccessFinancials: boolean;
  canAccessAnalytics: boolean;
}

export const ROLE_PERMISSION_MAP: Record<string, RolePermissions> = {
  SUPER_ADMIN: {
    canEditPlatformName: true,
    canEditLogo: true,
    canSetAnnualLicense: true,
    canDeletePosts: true,
    canEditOthersPosts: true,
    canManageUsers: true,
    canAccessFinancials: true,
    canAccessAnalytics: true,
  },
  CEO: {
    canEditPlatformName: true,
    canEditLogo: true,
    canSetAnnualLicense: true,
    canDeletePosts: true,
    canEditOthersPosts: true,
    canManageUsers: true,
    canAccessFinancials: true,
    canAccessAnalytics: true,
  },
  COO: {
    canEditPlatformName: false, // RESTRICTED
    canEditLogo: false, // RESTRICTED
    canSetAnnualLicense: false, // RESTRICTED
    canDeletePosts: false, // Can only delete own posts
    canEditOthersPosts: false, // RESTRICTED
    canManageUsers: true,
    canAccessFinancials: true,
    canAccessAnalytics: true,
  },
  INVESTOR: {
    canEditPlatformName: false, // RESTRICTED
    canEditLogo: false, // RESTRICTED
    canSetAnnualLicense: false, // RESTRICTED
    canDeletePosts: false, // Can only delete own posts
    canEditOthersPosts: false, // RESTRICTED
    canManageUsers: false,
    canAccessFinancials: true,
    canAccessAnalytics: true,
  },
  DESIGNER: {
    canEditPlatformName: false, // RESTRICTED
    canEditLogo: false, // RESTRICTED
    canSetAnnualLicense: false, // RESTRICTED
    canDeletePosts: false, // Can only delete own posts
    canEditOthersPosts: false, // RESTRICTED
    canManageUsers: false,
    canAccessFinancials: false,
    canAccessAnalytics: false,
  },
  SCHOOL_ADMIN: {
    canEditPlatformName: false,
    canEditLogo: false,
    canSetAnnualLicense: false,
    canDeletePosts: false,
    canEditOthersPosts: false,
    canManageUsers: true,
    canAccessFinancials: true,
    canAccessAnalytics: true,
  },
};

/**
 * ISSUE 8: Staff and Student Addition Fixes
 * Solution: Implement proper validation and error handling
 */
export interface StaffAdditionConfig {
  requireEmail: boolean;
  requirePhone: boolean;
  autoGenerateMatricule: boolean;
  validateDuplicates: boolean;
  requireDepartment: boolean;
  requireQualifications: boolean;
}

export const STAFF_ADDITION_CONFIG: StaffAdditionConfig = {
  requireEmail: true,
  requirePhone: true,
  autoGenerateMatricule: true,
  validateDuplicates: true,
  requireDepartment: true,
  requireQualifications: false,
};

export interface StudentAdditionConfig {
  requireGuardian: boolean;
  requireGuardianContact: boolean;
  autoGenerateMatricule: boolean;
  validateDuplicates: boolean;
  requireDateOfBirth: boolean;
  requireParentConsent: boolean;
}

export const STUDENT_ADDITION_CONFIG: StudentAdditionConfig = {
  requireGuardian: true,
  requireGuardianContact: true,
  autoGenerateMatricule: true,
  validateDuplicates: true,
  requireDateOfBirth: true,
  requireParentConsent: true,
};

/**
 * ISSUE 9: Guardian-Student Many-to-Many Relationship
 * Solution: Implement proper M2M relationship
 */
export interface GuardianStudentRelationship {
  guardianId: string;
  studentId: string;
  relationship: "father" | "mother" | "uncle" | "aunt" | "legal_guardian" | "other";
  isPrimary: boolean;
  canViewGrades: boolean;
  canViewAttendance: boolean;
  canViewFees: boolean;
  canReceiveNotifications: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ISSUE 10: Class Loading and Exam Form Completion
 * Solution: Fix class loading and add save button
 */
export interface ExamFormConfig {
  requireTitle: boolean;
  requireExamType: boolean;
  requireSubject: boolean;
  requireTargetClass: boolean;
  requireStartDate: boolean;
  requireDuration: boolean;
  autoLoadClasses: boolean;
  showSaveButton: boolean;
  showSubmitButton: boolean;
  validateBeforeSave: boolean;
}

export const EXAM_FORM_CONFIG: ExamFormConfig = {
  requireTitle: true,
  requireExamType: true,
  requireSubject: true,
  requireTargetClass: true,
  requireStartDate: true,
  requireDuration: true,
  autoLoadClasses: true, // FIX: Auto-load classes from school settings
  showSaveButton: true, // FIX: Add save button
  showSubmitButton: true,
  validateBeforeSave: true,
};

/**
 * ISSUE 11: Professional Annual Fee Report Styling
 * Solution: Implement professional report styling
 */
export interface FeeReportConfig {
  includeSchoolLogo: boolean;
  includeSchoolHeader: boolean;
  includeFooter: boolean;
  colorScheme: "professional" | "colorful" | "minimal";
  fontSize: number;
  pageSize: "A4" | "Letter";
  orientation: "portrait" | "landscape";
  includeSummary: boolean;
  includeCharts: boolean;
  includeStudentDetails: boolean;
}

export const FEE_REPORT_CONFIG: FeeReportConfig = {
  includeSchoolLogo: true,
  includeSchoolHeader: true,
  includeFooter: true,
  colorScheme: "professional",
  fontSize: 11,
  pageSize: "A4",
  orientation: "portrait",
  includeSummary: true,
  includeCharts: true,
  includeStudentDetails: true,
};

/**
 * ISSUE 12: Chat and Feedback System Refinement
 * Solution: Separate school admin feedback from live chat
 */
export interface ChatConfig {
  allowSchoolAdminChat: boolean; // School admins cannot chat with executives
  allowStudentChat: boolean;
  allowParentChat: boolean;
  allowTeacherChat: boolean;
  executiveOnlyChat: boolean; // Only executives can access live chat
}

export interface FeedbackConfig {
  allowAllUsers: boolean;
  allowSchoolAdmins: boolean;
  allowStudents: boolean;
  allowParents: boolean;
  allowTeachers: boolean;
  requireCategory: boolean;
  requireDescription: boolean;
  autoAssignToAdmin: boolean;
}

export const CHAT_CONFIG: ChatConfig = {
  allowSchoolAdminChat: false, // FIXED: School admins cannot use live chat
  allowStudentChat: true,
  allowParentChat: true,
  allowTeacherChat: true,
  executiveOnlyChat: true,
};

export const FEEDBACK_CONFIG: FeedbackConfig = {
  allowAllUsers: true,
  allowSchoolAdmins: true,
  allowStudents: true,
  allowParents: true,
  allowTeachers: true,
  requireCategory: true,
  requireDescription: true,
  autoAssignToAdmin: true,
};

/**
 * ISSUE 13: School Admin Feedback System
 * Solution: Implement dedicated feedback system for school admins
 */
export interface SchoolAdminFeedbackConfig {
  enabled: boolean;
  requiresAuthentication: boolean;
  requiresSchoolVerification: boolean;
  autoNotifyExecutives: boolean;
  feedbackCategories: string[];
  maxFileAttachments: number;
  attachmentMaxSize: number; // in MB
}

export const SCHOOL_ADMIN_FEEDBACK_CONFIG: SchoolAdminFeedbackConfig = {
  enabled: true,
  requiresAuthentication: true,
  requiresSchoolVerification: true,
  autoNotifyExecutives: true,
  feedbackCategories: [
    "Technical Issue",
    "Feature Request",
    "Billing Question",
    "General Inquiry",
    "Bug Report",
  ],
  maxFileAttachments: 5,
  attachmentMaxSize: 10,
};

/**
 * ISSUE 14: 4xx and 5xx Error Pages
 * Solution: Create comprehensive error page handling
 */
export interface ErrorPageConfig {
  show400: boolean;
  show401: boolean;
  show403: boolean;
  show404: boolean;
  show500: boolean;
  show503: boolean;
  showErrorDetails: boolean;
  showSuggestedActions: boolean;
  showContactSupport: boolean;
}

export const ERROR_PAGE_CONFIG: ErrorPageConfig = {
  show400: true,
  show401: true,
  show403: true,
  show404: true,
  show500: true,
  show503: true,
  showErrorDetails: true,
  showSuggestedActions: true,
  showContactSupport: true,
};

export interface ErrorPageMessage {
  code: number;
  title: string;
  description: string;
  suggestedActions: string[];
  contactSupport: boolean;
}

export const ERROR_MESSAGES: Record<number, ErrorPageMessage> = {
  400: {
    code: 400,
    title: "Bad Request",
    description: "The request could not be understood by the server.",
    suggestedActions: ["Check your input", "Try again", "Contact support"],
    contactSupport: true,
  },
  401: {
    code: 401,
    title: "Unauthorized",
    description: "You need to be logged in to access this resource.",
    suggestedActions: ["Log in", "Create an account", "Reset password"],
    contactSupport: false,
  },
  403: {
    code: 403,
    title: "Forbidden",
    description: "You don't have permission to access this resource.",
    suggestedActions: ["Contact your administrator", "Check your permissions", "Request access"],
    contactSupport: true,
  },
  404: {
    code: 404,
    title: "Page Not Found",
    description: "The page you're looking for doesn't exist.",
    suggestedActions: ["Go to dashboard", "Go to home page", "Contact support"],
    contactSupport: true,
  },
  500: {
    code: 500,
    title: "Internal Server Error",
    description: "Something went wrong on our end. We're working to fix it.",
    suggestedActions: ["Try again later", "Refresh the page", "Contact support"],
    contactSupport: true,
  },
  503: {
    code: 503,
    title: "Service Unavailable",
    description: "The server is temporarily unavailable. Please try again later.",
    suggestedActions: ["Try again later", "Check system status", "Contact support"],
    contactSupport: true,
  },
};

/**
 * Verify user permission for an action
 */
export function checkPermission(userRole: string, permission: keyof RolePermissions): boolean {
  const rolePerms = ROLE_PERMISSION_MAP[userRole];
  if (!rolePerms) return false;
  return rolePerms[permission];
}

/**
 * Get restricted actions for a role
 */
export function getRestrictedActions(userRole: string): string[] {
  const rolePerms = ROLE_PERMISSION_MAP[userRole];
  if (!rolePerms) return [];
  
  const restricted: string[] = [];
  for (const [action, allowed] of Object.entries(rolePerms)) {
    if (!allowed) {
      restricted.push(action);
    }
  }
  return restricted;
}
