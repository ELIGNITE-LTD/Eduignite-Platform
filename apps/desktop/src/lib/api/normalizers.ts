import type { FounderProfile, PlatformSettings, School, User } from "./types";
import { resolveMediaUrl } from "@/lib/media";
import { normalizeTutorialLinksRecord } from "@/lib/tutorial-links";

export function normalizeSchool(school: Record<string, any> | undefined | null): School | undefined {
  if (!school) return undefined;

  return {
    ...(school as School),
    id: school.id ?? "",
    name: school.name ?? "",
    short_name: school.short_name ?? school.shortName ?? "",
    shortName: school.shortName ?? school.short_name ?? "",
    principal: school.principal ?? "",
    motto: school.motto ?? "",
    logo: resolveMediaUrl(school.logo),
    banner: resolveMediaUrl(school.banner),
    description: school.description ?? "",
    location: school.location ?? "",
    region: school.region ?? "",
    division: school.division ?? "",
    sub_division: school.sub_division ?? school.subDivision ?? "",
    subDivision: school.subDivision ?? school.sub_division ?? "",
    city_village: school.city_village ?? school.cityVillage ?? "",
    cityVillage: school.cityVillage ?? school.city_village ?? "",
    address: school.address ?? "",
    postal_code: school.postal_code ?? school.postalCode ?? "",
    postalCode: school.postalCode ?? school.postal_code ?? "",
    phone: school.phone ?? "",
    email: school.email ?? "",
    status: school.status ?? "",
    student_count: school.student_count ?? school.studentCount ?? 0,
    studentCount: school.studentCount ?? school.student_count ?? 0,
    teacher_count: school.teacher_count ?? school.teacherCount ?? 0,
    teacherCount: school.teacherCount ?? school.teacher_count ?? 0,
    is_drafted: school.is_drafted ?? school.isDrafted ?? false,
    isDrafted: school.isDrafted ?? school.is_drafted ?? false,
    drafted_at: school.drafted_at ?? school.draftedAt ?? null,
    draftedAt: school.draftedAt ?? school.drafted_at ?? null,
    draft_delete_after: school.draft_delete_after ?? school.draftDeleteAfter ?? null,
    draftDeleteAfter: school.draftDeleteAfter ?? school.draft_delete_after ?? null,
    draft_reason: school.draft_reason ?? school.draftReason ?? "",
    draftReason: school.draftReason ?? school.draft_reason ?? "",
    draft_reminder_count: school.draft_reminder_count ?? school.draftReminderCount ?? 0,
    draftReminderCount: school.draftReminderCount ?? school.draft_reminder_count ?? 0,
  };
}

export function normalizeUser(user: Record<string, any> | undefined | null): User {
  const school = normalizeSchool(user?.school);

  return {
    ...(user as User),
    id: user?.id ?? "",
    uid: user?.uid ?? "",
    matricule: user?.matricule ?? "",
    avatar: resolveMediaUrl(user?.avatar),
    phone: user?.phone ?? "",
    whatsapp: user?.whatsapp ?? "",
    name: user?.name ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "STUDENT",
    school,
    schoolId: user?.schoolId ?? user?.school_id ?? school?.id ?? null,
    school_id: user?.school_id ?? user?.schoolId ?? school?.id ?? null,
    isLicensePaid: user?.isLicensePaid ?? user?.is_license_paid ?? false,
    is_license_paid: user?.is_license_paid ?? user?.isLicensePaid ?? false,
    aiRequestCount: user?.aiRequestCount ?? user?.ai_request_count ?? 0,
    ai_request_count: user?.ai_request_count ?? user?.aiRequestCount ?? 0,
    annualAvg: user?.annualAvg ?? user?.annual_avg,
    annual_avg: user?.annual_avg ?? user?.annualAvg,
    isPlatformExecutive: user?.isPlatformExecutive ?? user?.is_platform_executive,
    is_platform_executive: user?.is_platform_executive ?? user?.isPlatformExecutive,
    isSchoolAdmin: user?.isSchoolAdmin ?? user?.is_school_admin,
    is_school_admin: user?.is_school_admin ?? user?.isSchoolAdmin,
    is_drafted: user?.is_drafted ?? user?.isDrafted ?? false,
    isDrafted: user?.isDrafted ?? user?.is_drafted ?? false,
    drafted_at: user?.drafted_at ?? user?.draftedAt ?? null,
    draftedAt: user?.draftedAt ?? user?.drafted_at ?? null,
    draft_delete_after: user?.draft_delete_after ?? user?.draftDeleteAfter ?? null,
    draftDeleteAfter: user?.draftDeleteAfter ?? user?.draft_delete_after ?? null,
    draft_reason: user?.draft_reason ?? user?.draftReason ?? "",
    draftReason: user?.draftReason ?? user?.draft_reason ?? "",
    draft_reminder_count: user?.draft_reminder_count ?? user?.draftReminderCount ?? 0,
    draftReminderCount: user?.draftReminderCount ?? user?.draft_reminder_count ?? 0,
  };
}

export function normalizeFounder(founder: Record<string, any> | undefined | null): FounderProfile {
  return {
    ...(founder as FounderProfile),
    id: founder?.id ?? "",
    user_id: founder?.user_id ?? "",
    matricule: founder?.matricule ?? "",
    name: founder?.name ?? "",
    email: founder?.email ?? "",
    phone: founder?.phone ?? "",
    whatsapp: founder?.whatsapp ?? "",
    role: founder?.role ?? "INV",
    avatar: resolveMediaUrl(founder?.avatar),
    founder_title: founder?.founder_title ?? "",
    primary_share_percentage: founder?.primary_share_percentage ?? "0",
    additional_share_percentage: founder?.additional_share_percentage ?? "0",
    total_share_percentage: founder?.total_share_percentage ?? "0",
    is_primary_founder: founder?.is_primary_founder ?? false,
    can_be_removed: founder?.can_be_removed ?? false,
    is_active: founder?.is_active ?? true,
    has_renewable_shares: founder?.has_renewable_shares ?? false,
    share_renewal_period_days: founder?.share_renewal_period_days ?? 0,
    shares_expire_at: founder?.shares_expire_at ?? null,
    is_share_expired: founder?.is_share_expired ?? false,
    days_until_share_expiry: founder?.days_until_share_expiry ?? null,
    access_level: founder?.access_level ?? "FULL",
    share_adjustments: founder?.share_adjustments ?? [],
    created_at: founder?.created_at ?? "",
    updated_at: founder?.updated_at ?? "",
  };
}

export function normalizePlatformSettings(
  settings: Record<string, any> | undefined | null
): PlatformSettings {
  return {
    ...(settings as PlatformSettings),
    name: settings?.name ?? "EduIgnite",
    logo: resolveMediaUrl(settings?.logo),
    payment_deadline: settings?.payment_deadline ?? settings?.paymentDeadline ?? "",
    paymentDeadline: settings?.paymentDeadline ?? settings?.payment_deadline ?? "",
    honour_roll_threshold:
      settings?.honour_roll_threshold ?? settings?.honourRollThreshold ?? 12,
    honourRollThreshold:
      settings?.honourRollThreshold ?? settings?.honour_roll_threshold ?? 12,
    fees: settings?.fees ?? {},
    tutorial_links: normalizeTutorialLinksRecord(
      settings?.tutorial_links ?? settings?.tutorialLinks ?? {}
    ),
    tutorialLinks: normalizeTutorialLinksRecord(
      settings?.tutorialLinks ?? settings?.tutorial_links ?? {}
    ),
  };
}
