/**
 * Security & Personalization Layer System
 * Comprehensive security controls, RBAC, and personalization features
 */

export type UserRole = 
  | "SUPER_ADMIN" 
  | "CEO" 
  | "CTO" 
  | "COO" 
  | "INV" 
  | "DESIGNER"
  | "SCHOOL_ADMIN" 
  | "SUB_ADMIN" 
  | "TEACHER" 
  | "STUDENT" 
  | "PARENT" 
  | "BURSAR" 
  | "LIBRARIAN";

export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string; // e.g., "students", "grades", "fees"
  action: "create" | "read" | "update" | "delete" | "export" | "manage";
}

export interface RolePermissionMapping {
  role: UserRole;
  permissions: Permission[];
}

export interface UserSecurityProfile {
  userId: string;
  role: UserRole;
  permissions: Permission[];
  mfaEnabled: boolean;
  mfaMethod?: "totp" | "sms" | "email";
  lastLoginAt?: Date;
  lastLoginIP?: string;
  loginAttempts: number;
  accountLocked: boolean;
  lockedUntil?: Date;
  passwordChangedAt?: Date;
  sessionTokens: string[];
  apiKeys: Array<{
    key: string;
    createdAt: Date;
    lastUsedAt?: Date;
    active: boolean;
  }>;
}

export interface UserPersonalizationProfile {
  userId: string;
  theme: "light" | "dark" | "auto";
  language: "en" | "fr";
  timezone: string;
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  timeFormat: "12h" | "24h";
  
  // Dashboard preferences
  dashboardLayout: "grid" | "list" | "compact";
  pinnedModules: string[];
  hiddenModules: string[];
  
  // Notification preferences
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  notificationFrequency: "immediate" | "daily" | "weekly" | "never";
  notificationCategories: {
    academic: boolean;
    administrative: boolean;
    financial: boolean;
    security: boolean;
    system: boolean;
  };
  
  // Accessibility
  fontSize: "small" | "normal" | "large" | "extra-large";
  highContrast: boolean;
  reduceMotion: boolean;
  screenReaderOptimized: boolean;
  
  // Privacy
  profileVisibility: "public" | "school" | "private";
  showAcademicData: boolean;
  allowMessaging: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  userId: string;
  userRole: UserRole;
  action: string;
  resource: string;
  resourceId: string;
  changes?: {
    before: any;
    after: any;
  };
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  status: "success" | "failure";
  errorMessage?: string;
}

// ============================================================================
// ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================================

export const ROLE_PERMISSIONS: RolePermissionMapping[] = [
  {
    role: "SUPER_ADMIN",
    permissions: [
      { id: "p1", name: "Manage All Users", description: "Create, update, delete any user", resource: "users", action: "manage" },
      { id: "p2", name: "Manage Schools", description: "Manage all schools on platform", resource: "schools", action: "manage" },
      { id: "p3", name: "Manage Platform Settings", description: "Configure platform-wide settings", resource: "platform", action: "manage" },
      { id: "p4", name: "View All Reports", description: "Access all system reports", resource: "reports", action: "read" },
      { id: "p5", name: "Manage Fees", description: "Configure platform fees", resource: "fees", action: "manage" },
    ],
  },
  {
    role: "SCHOOL_ADMIN",
    permissions: [
      { id: "p6", name: "Manage School Users", description: "Manage users within school", resource: "users", action: "manage" },
      { id: "p7", name: "Manage Students", description: "Create, update, delete students", resource: "students", action: "manage" },
      { id: "p8", name: "Manage Staff", description: "Manage teachers and staff", resource: "staff", action: "manage" },
      { id: "p9", name: "View School Reports", description: "Access school-level reports", resource: "reports", action: "read" },
      { id: "p10", name: "Manage Grades", description: "Manage academic grades", resource: "grades", action: "manage" },
      { id: "p11", name: "Manage Fees", description: "Manage school fees", resource: "fees", action: "manage" },
      { id: "p12", name: "Generate ID Cards", description: "Generate student ID cards", resource: "id-cards", action: "create" },
      { id: "p13", name: "Generate Transcripts", description: "Generate academic transcripts", resource: "transcripts", action: "create" },
    ],
  },
  {
    role: "TEACHER",
    permissions: [
      { id: "p14", name: "View My Students", description: "View assigned students", resource: "students", action: "read" },
      { id: "p15", name: "Enter Grades", description: "Enter and manage grades", resource: "grades", action: "create" },
      { id: "p16", name: "Update Grades", description: "Update existing grades", resource: "grades", action: "update" },
      { id: "p17", name: "View Attendance", description: "View and manage attendance", resource: "attendance", action: "create" },
      { id: "p18", name: "Create Assignments", description: "Create and manage assignments", resource: "assignments", action: "create" },
      { id: "p19", name: "View Reports", description: "View class reports", resource: "reports", action: "read" },
    ],
  },
  {
    role: "STUDENT",
    permissions: [
      { id: "p20", name: "View My Grades", description: "View own grades", resource: "grades", action: "read" },
      { id: "p21", name: "View My Attendance", description: "View own attendance", resource: "attendance", action: "read" },
      { id: "p22", name: "View My Profile", description: "View own profile", resource: "profile", action: "read" },
      { id: "p23", name: "Submit Assignments", description: "Submit assignments", resource: "assignments", action: "create" },
      { id: "p24", name: "View Announcements", description: "View school announcements", resource: "announcements", action: "read" },
    ],
  },
  {
    role: "PARENT",
    permissions: [
      { id: "p25", name: "View Child Grades", description: "View child's grades", resource: "grades", action: "read" },
      { id: "p26", name: "View Child Attendance", description: "View child's attendance", resource: "attendance", action: "read" },
      { id: "p27", name: "View Child Profile", description: "View child's profile", resource: "profile", action: "read" },
      { id: "p28", name: "Pay Fees", description: "Make fee payments", resource: "fees", action: "create" },
      { id: "p29", name: "View Announcements", description: "View school announcements", resource: "announcements", action: "read" },
    ],
  },
  {
    role: "BURSAR",
    permissions: [
      { id: "p30", name: "Manage Fees", description: "Manage fee collections", resource: "fees", action: "manage" },
      { id: "p31", name: "View Financial Reports", description: "View financial reports", resource: "reports", action: "read" },
      { id: "p32", name: "Generate Invoices", description: "Generate fee invoices", resource: "invoices", action: "create" },
      { id: "p33", name: "View Students", description: "View student records", resource: "students", action: "read" },
    ],
  },
];

// ============================================================================
// PERMISSION CHECKING FUNCTIONS
// ============================================================================

export function hasPermission(
  userRole: UserRole,
  resource: string,
  action: "create" | "read" | "update" | "delete" | "export" | "manage"
): boolean {
  const roleMapping = ROLE_PERMISSIONS.find(rm => rm.role === userRole);
  if (!roleMapping) return false;

  return roleMapping.permissions.some(p => {
    if (p.resource !== resource) return false;
    if (p.action === "manage") return true; // "manage" includes all actions
    return p.action === action;
  });
}

export function getPermissionsForRole(userRole: UserRole): Permission[] {
  const roleMapping = ROLE_PERMISSIONS.find(rm => rm.role === userRole);
  return roleMapping?.permissions || [];
}

export function canAccessResource(userRole: UserRole, resource: string): boolean {
  return getPermissionsForRole(userRole).some(p => p.resource === resource);
}

// ============================================================================
// SECURITY FUNCTIONS
// ============================================================================

export function createSecurityProfile(userId: string, role: UserRole): UserSecurityProfile {
  return {
    userId,
    role,
    permissions: getPermissionsForRole(role),
    mfaEnabled: false,
    loginAttempts: 0,
    accountLocked: false,
    sessionTokens: [],
    apiKeys: [],
  };
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript protocol
    .trim();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function generateSessionToken(): string {
  return `SESSION-${Date.now()}-${Math.random().toString(36).substr(2, 32).toUpperCase()}`;
}

export function generateAPIKey(): string {
  return `API-${Date.now()}-${Math.random().toString(36).substr(2, 32).toUpperCase()}`;
}

// ============================================================================
// PERSONALIZATION FUNCTIONS
// ============================================================================

export function createPersonalizationProfile(userId: string): UserPersonalizationProfile {
  return {
    userId,
    theme: "light",
    language: "en",
    timezone: "Africa/Douala",
    dateFormat: "DD/MM/YYYY",
    timeFormat: "24h",
    dashboardLayout: "grid",
    pinnedModules: [],
    hiddenModules: [],
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    notificationFrequency: "immediate",
    notificationCategories: {
      academic: true,
      administrative: true,
      financial: true,
      security: true,
      system: true,
    },
    fontSize: "normal",
    highContrast: false,
    reduceMotion: false,
    screenReaderOptimized: false,
    profileVisibility: "school",
    showAcademicData: true,
    allowMessaging: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function updatePersonalizationProfile(
  profile: UserPersonalizationProfile,
  updates: Partial<UserPersonalizationProfile>
): UserPersonalizationProfile {
  return {
    ...profile,
    ...updates,
    userId: profile.userId, // Prevent userId change
    createdAt: profile.createdAt, // Prevent createdAt change
    updatedAt: new Date(),
  };
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export function createAuditLog(
  userId: string,
  userRole: UserRole,
  action: string,
  resource: string,
  resourceId: string,
  ipAddress: string,
  userAgent: string,
  status: "success" | "failure" = "success",
  errorMessage?: string
): AuditLog {
  return {
    id: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    userId,
    userRole,
    action,
    resource,
    resourceId,
    ipAddress,
    userAgent,
    timestamp: new Date(),
    status,
    errorMessage,
  };
}

export function logSecurityEvent(
  userId: string,
  eventType: "login" | "logout" | "password_change" | "mfa_enabled" | "api_key_created" | "permission_denied",
  details: any
): AuditLog {
  return createAuditLog(
    userId,
    "STUDENT", // Placeholder role
    `Security Event: ${eventType}`,
    "security",
    userId,
    details.ipAddress || "unknown",
    details.userAgent || "unknown",
    "success"
  );
}

// ============================================================================
// EXPORT SECURITY & PERSONALIZATION SYSTEM
// ============================================================================

export default {
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissionsForRole,
  canAccessResource,
  createSecurityProfile,
  validatePassword,
  sanitizeInput,
  validateEmail,
  generateSessionToken,
  generateAPIKey,
  createPersonalizationProfile,
  updatePersonalizationProfile,
  createAuditLog,
  logSecurityEvent,
};
