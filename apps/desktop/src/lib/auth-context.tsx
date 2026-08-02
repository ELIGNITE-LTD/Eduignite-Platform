"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/api/services/auth.service";
import { usersService } from "@/lib/api/services/users.service";
import { platformService } from "@/lib/api/services/platform.service";
import { communityService } from "@/lib/api/services/community.service";
import { ordersService } from "@/lib/api/services/orders.service";
import { supportService } from "@/lib/api/services/support.service";
import { staffRemarksService } from "@/lib/api/services/staff-remarks.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { feedbackService } from "@/lib/api/services/feedback.service";
import { announcementsService } from "@/lib/api/services/announcements.service";
import { setTokens, clearTokens } from "@/lib/api/client";
import { normalizePlatformSettings, normalizeUser } from "@/lib/api/normalizers";
import { resolveMediaUrl } from "@/lib/media";
import {
  normalizeTutorialLinksRecord,
  type TutorialLinkTargets,
} from "@/lib/tutorial-links";

export type UserRole = "SUPER_ADMIN" | "CEO" | "CTO" | "COO" | "INV" | "DESIGNER" | "SCHOOL_ADMIN" | "SUB_ADMIN" | "TEACHER" | "STUDENT" | "PARENT" | "BURSAR" | "LIBRARIAN";

export const RESTRICTED_ROLES = ["COO", "INV", "DESIGNER"] as const;
export const EXECUTIVE_ROLES = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"] as const;
export const SCHOOL_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "STUDENT", "PARENT", "BURSAR", "LIBRARIAN"] as const;

export const isRestrictedRole = (role?: string | null) =>
  Boolean(role && RESTRICTED_ROLES.includes(role as (typeof RESTRICTED_ROLES)[number]));

export const isCEOCTO = (role?: string | null) =>
  Boolean(role && ["CEO", "CTO", "SUPER_ADMIN"].includes(role));

export const isSchoolRole = (role?: string | null) =>
  Boolean(role && SCHOOL_ROLES.includes(role as (typeof SCHOOL_ROLES)[number]));

export interface SchoolInfo {
  id: string;
  name: string;
  shortName: string;
  principal: string;
  motto: string;
  logo: string;
  banner: string;
  description: string;
  location: string;
  region: string;
  division: string;
  subDivision: string;
  cityVillage: string;
  address: string;
  postalCode?: string;
  phone: string;
  email: string;
  matricule?: string;
  status: string;
}

export interface PlatformFees {
  STUDENT: string;
  PARENT: string;
  TEACHER: string;
  BURSAR: string;
  LIBRARIAN: string;
  SCHOOL_ADMIN: string;
  SUB_ADMIN: string;
}

export type TutorialLinks = Record<
  "STUDENT" | "TEACHER" | "PARENT" | "SCHOOL_ADMIN" | "SUB_ADMIN" | "BURSAR" | "LIBRARIAN",
  TutorialLinkTargets
>;

interface PlatformSettings {
  name: string;
  logo: string;
  paymentDeadline: string;
  fees: PlatformFees;
  tutorialLinks: TutorialLinks;
  honourRollThreshold: number;
}

export interface User {
  id: string;
  uid: string;
  name: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  role: UserRole;
  schoolId: string | null;
  avatar?: string;
  school?: SchoolInfo;
  isLicensePaid: boolean;
  aiRequestCount?: number;
  annualAvg?: number;
  annual_avg?: number;
}

export interface Testimony {
  id: string;
  userId: string;
  name: string;
  profileImage: string;
  role: string;
  schoolName: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  approvedAt?: Date | null;
  createdAt: Date;
}

export interface CommunityBlog {
  id: string;
  title: string;
  senderName: string;
  senderRole: string;
  senderAvatar: string;
  image?: string;
  video_url?: string;
  paragraphs: string[];
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  comments?: any[];
  createdAt: Date;
}

export interface Feedback {
  id: string;
  subject: string;
  message: string;
  schoolName: string;
  schoolId: string;
  schoolLogo: string;
  senderName: string;
  senderRole: string;
  senderAvatar: string;
  status: "New" | "Resolved";
  createdAt: Date;
}

export interface Order {
  id: string;
  fullName: string;
  occupation: string;
  schoolName: string;
  whatsappNumber: string;
  email: string;
  region: string;
  division: string;
  subDivision: string;
  status: "pending" | "processed";
  createdAt: Date;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target: string;
  targetUid?: string;
  senderName: string;
  senderRole: string;
  senderAvatar: string;
  createdAt: Date;
  senderUid: string;
}

export interface SupportContribution {
  id: string;
  uid: string;
  userName: string;
  userRole: string;
  userAvatar: string;
  schoolName: string;
  amount: number;
  method: string;
  phone: string;
  message: string;
  status: "New" | "Verified";
  createdAt: Date;
}

export interface PersonalChat {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatar: string;
  receiverId: string;
  text: string;
  timestamp: string;
  isOfficial: boolean;
}

export interface PublicEvent {
  id: string;
  type: "video" | "image";
  title: string;
  description: string;
  url: string;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  comments?: any[];
}

export interface StaffRemark {
  id: string;
  staffId: string;
  adminName: string;
  text: string;
  date: string;
}

interface AuthContextType {
  user: User | null;
  platformSettings: PlatformSettings;
  testimonials: Testimony[];
  communityBlogs: CommunityBlog[];
  feedbacks: Feedback[];
  orders: Order[];
  announcements: Announcement[];
  supportContributions: SupportContribution[];
  personalChats: PersonalChat[];
  schools: SchoolInfo[];
  publicEvents: PublicEvent[];
  staffRemarks: StaffRemark[];
  login: (matricule: string, password: string) => Promise<void>;
  activateAccount: (matricule: string, password: string, confirmPassword: string) => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  updateSchool: (updates: Partial<SchoolInfo>) => Promise<void>;
  updatePlatformSettings: (updates: Partial<PlatformSettings>) => Promise<void>;
  markLicensePaid: () => Promise<void>;
  incrementAiRequest: () => Promise<void>;
  addTestimony: (testimony: Omit<Testimony, "id" | "status" | "createdAt">) => Promise<void>;
  approveTestimony: (id: string) => Promise<void>;
  deleteTestimony: (id: string) => Promise<void>;
  addCommunityBlog: (blog: Omit<CommunityBlog, "id" | "createdAt">) => Promise<void>;
  deleteCommunityBlog: (id: string) => Promise<void>;
  addFeedback: (feedback: Omit<Feedback, "id" | "status" | "createdAt">) => Promise<void>;
  resolveFeedback: (id: string) => Promise<void>;
  deleteFeedback: (id: string) => Promise<void>;
  addOrder: (order: Omit<Order, "id" | "status" | "createdAt">) => Promise<void>;
  processOrder: (id: string) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  addAnnouncement: (ann: Omit<Announcement, "id" | "createdAt">) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  addSchool: (school: Omit<SchoolInfo, "status">) => Promise<void>;
  toggleSchoolStatus: (id: string) => Promise<void>;
  deleteSchool: (id: string) => Promise<void>;
  addSupport: (contribution: Omit<SupportContribution, "id" | "status" | "createdAt">) => Promise<void>;
  verifySupport: (id: string) => Promise<void>;
  deleteSupport: (id: string) => Promise<void>;
  addPublicEvent: (event: Omit<PublicEvent, "id">) => Promise<void>;
  deletePublicEvent: (id: string) => Promise<void>;
  addStaffRemark: (remark: Omit<StaffRemark, "id" | "date">) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_FEES: PlatformFees = {
  STUDENT: "5000",
  PARENT: "2500",
  TEACHER: "10000",
  BURSAR: "10000",
  LIBRARIAN: "10000",
  SCHOOL_ADMIN: "25000",
  SUB_ADMIN: "15000",
};

const DEFAULT_TUTORIALS: TutorialLinks = {
  STUDENT: { web: "", mobile: "" },
  TEACHER: { web: "", mobile: "" },
  PARENT: { web: "", mobile: "" },
  SCHOOL_ADMIN: { web: "", mobile: "" },
  SUB_ADMIN: { web: "", mobile: "" },
  BURSAR: { web: "", mobile: "" },
  LIBRARIAN: { web: "", mobile: "" },
};

const PLATFORM_DEFAULTS: PlatformSettings = {
  name: "EduIgnite",
  logo: "",
  paymentDeadline: "",
  fees: DEFAULT_FEES,
  tutorialLinks: DEFAULT_TUTORIALS,
  honourRollThreshold: 12.0,
};

const mapSchoolInfo = (school: any): SchoolInfo | undefined => {
  if (!school) return undefined;
  return {
    id: school.id ?? "",
    name: school.name ?? "",
    shortName: school.shortName ?? school.short_name ?? "",
    principal: school.principal ?? "",
    motto: school.motto ?? "",
    logo: resolveMediaUrl(school.logo),
    banner: resolveMediaUrl(school.banner),
    description: school.description ?? "",
    location: school.location ?? "",
    region: school.region ?? "",
    division: school.division ?? "",
    subDivision: school.subDivision ?? school.sub_division ?? "",
    cityVillage: school.cityVillage ?? school.city_village ?? "",
    address: school.address ?? "",
    postalCode: school.postalCode ?? school.postal_code,
    phone: school.phone ?? "",
    email: school.email ?? "",
    status: school.status ?? "",
  };
};

const mapPlatformSettingsRecord = (settings: any): PlatformSettings => ({
  name: settings?.name ?? PLATFORM_DEFAULTS.name,
  logo: resolveMediaUrl(settings?.logo),
  paymentDeadline: settings?.paymentDeadline ?? settings?.payment_deadline ?? "",
  fees: {
    ...DEFAULT_FEES,
    ...(settings?.fees ?? {}),
  },
  tutorialLinks: {
    ...DEFAULT_TUTORIALS,
    ...normalizeTutorialLinksRecord(
      settings?.tutorialLinks ?? settings?.tutorial_links ?? {},
      Object.keys(DEFAULT_TUTORIALS)
    ),
  } as TutorialLinks,
  honourRollThreshold: Number(settings?.honourRollThreshold ?? settings?.honour_roll_threshold ?? PLATFORM_DEFAULTS.honourRollThreshold),
});

const mapTestimonyRecord = (testimony: any): Testimony => ({
  id: testimony?.id ?? "",
  userId: testimony?.user?.id ?? testimony?.author?.id ?? testimony?.user ?? testimony?.userId ?? "",
  name: testimony?.name ?? testimony?.user_name ?? testimony?.user?.name ?? testimony?.author?.name ?? "Anonymous",
  profileImage: resolveMediaUrl(testimony?.profileImage ?? testimony?.user_avatar ?? testimony?.user?.avatar ?? testimony?.author?.avatar),
  role: testimony?.role ?? testimony?.role_display ?? testimony?.user?.role ?? testimony?.author?.role ?? "",
  schoolName: testimony?.schoolName ?? testimony?.school_name ?? "",
  message: testimony?.message ?? testimony?.content ?? "",
  status: testimony?.status ?? "pending",
  approvedAt: testimony?.approved_at ? new Date(testimony.approved_at) : null,
  createdAt: new Date(testimony?.createdAt ?? testimony?.created_at ?? Date.now()),
});

const mapCommunityBlogRecord = (blog: any): CommunityBlog => ({
  id: blog?.id ?? "",
  title: blog?.title ?? "",
  senderName: blog?.senderName ?? blog?.author_name ?? blog?.author?.name ?? "",
  senderRole: blog?.senderRole ?? blog?.author_role ?? blog?.author?.role ?? "",
  senderAvatar: resolveMediaUrl(blog?.senderAvatar ?? blog?.author_avatar ?? blog?.author?.avatar),
  image: resolveMediaUrl(blog?.image) || undefined,
  video_url: resolveMediaUrl(blog?.video_url) || blog?.video_url || undefined,
  paragraphs: Array.isArray(blog?.paragraphs) ? blog.paragraphs : [],
  like_count: Number(blog?.like_count ?? 0),
  comment_count: Number(blog?.comment_count ?? 0),
  liked_by_me: Boolean(blog?.liked_by_me),
  comments: Array.isArray(blog?.comments) ? blog.comments : [],
  createdAt: new Date(blog?.createdAt ?? blog?.created_at ?? Date.now()),
});

const mapFeedbackRecord = (feedback: any): Feedback => ({
  id: feedback?.id ?? "",
  subject: feedback?.subject ?? "",
  message: feedback?.message ?? "",
  schoolName: feedback?.schoolName ?? feedback?.school?.name ?? "",
  schoolId: feedback?.schoolId ?? feedback?.school ?? "",
  schoolLogo: resolveMediaUrl(feedback?.schoolLogo ?? feedback?.school?.logo),
  senderName: feedback?.senderName ?? feedback?.sender?.name ?? "",
  senderRole: feedback?.senderRole ?? feedback?.sender?.role ?? "",
  senderAvatar: resolveMediaUrl(feedback?.senderAvatar ?? feedback?.sender?.avatar),
  status: feedback?.status ?? "New",
  createdAt: new Date(feedback?.createdAt ?? feedback?.created_at ?? Date.now()),
});

const mapOrderRecord = (order: any): Order => ({
  id: order?.id ?? "",
  fullName: order?.fullName ?? order?.full_name ?? "",
  occupation: order?.occupation ?? "",
  schoolName: order?.schoolName ?? order?.school_name ?? "",
  whatsappNumber: order?.whatsappNumber ?? order?.whatsapp_number ?? "",
  email: order?.email ?? "",
  region: order?.region ?? "",
  division: order?.division ?? "",
  subDivision: order?.subDivision ?? order?.sub_division ?? "",
  status: order?.status ?? "pending",
  createdAt: new Date(order?.createdAt ?? order?.created_at ?? Date.now()),
});

const mapAnnouncementRecord = (announcement: any): Announcement => ({
  id: announcement?.id ?? "",
  title: announcement?.title ?? "",
  content: announcement?.content ?? "",
  target: announcement?.target ?? "",
  targetUid: announcement?.targetUid ?? announcement?.target_user,
  senderName: announcement?.senderName ?? announcement?.sender?.name ?? "",
  senderRole: announcement?.senderRole ?? announcement?.sender?.role ?? "",
  senderAvatar: resolveMediaUrl(announcement?.senderAvatar ?? announcement?.sender?.avatar),
  senderUid: announcement?.senderUid ?? announcement?.sender?.uid ?? "",
  createdAt: new Date(announcement?.createdAt ?? announcement?.created_at ?? Date.now()),
});

const mapSupportRecord = (support: any): SupportContribution => ({
  id: support?.id ?? "",
  uid: support?.uid ?? support?.user?.uid ?? "",
  userName: support?.userName ?? support?.user?.name ?? "",
  userRole: support?.userRole ?? support?.user?.role ?? "",
  userAvatar: resolveMediaUrl(support?.userAvatar ?? support?.user?.avatar),
  schoolName: support?.schoolName ?? support?.school?.name ?? "",
  amount: Number(support?.amount ?? 0),
  method: support?.method ?? support?.payment_method ?? "",
  phone: support?.phone ?? "",
  message: support?.message ?? "",
  status: support?.status ?? "New",
  createdAt: new Date(support?.createdAt ?? support?.created_at ?? Date.now()),
});

const mapPublicEventRecord = (event: any): PublicEvent => ({
  id: event?.id ?? "",
  type: event?.type ?? "image",
  title: event?.title ?? "",
  description: event?.description ?? "",
  url: resolveMediaUrl(event?.url),
  like_count: Number(event?.like_count ?? 0),
  comment_count: Number(event?.comment_count ?? 0),
  liked_by_me: Boolean(event?.liked_by_me),
  comments: Array.isArray(event?.comments) ? event.comments : [],
});

const mapStaffRemarkRecord = (remark: any): StaffRemark => ({
  id: remark?.id ?? "",
  staffId: remark?.staffId ?? remark?.staff ?? "",
  adminName: remark?.adminName ?? remark?.admin?.name ?? "",
  text: remark?.text ?? "",
  date: remark?.date ?? remark?.created_at ?? "",
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userData, setUserData] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [schools, setSchools] = useState<SchoolInfo[]>([]);
  const [testimonials, setTestimonials] = useState<Testimony[]>([]);
  const [communityBlogs, setCommunityBlogs] = useState<CommunityBlog[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [personalChats, setPersonalChats] = useState<PersonalChat[]>([]);
  const [supportContributions, setSupportContributions] = useState<SupportContribution[]>([]);
  const [publicEvents, setPublicEvents] = useState<PublicEvent[]>([]);
  const [staffRemarks, setStaffRemarks] = useState<StaffRemark[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(PLATFORM_DEFAULTS);

  const router = useRouter();

  useEffect(() => {
    const loadPublicPlatformData = async () => {
      try {
        const [settings, eventsResponse, blogsResponse, testimoniesResponse] = await Promise.all([
          platformService.getPlatformSettings(),
          platformService.getPublicEvents(),
          communityService.getBlogs(),
          communityService.getTestimonies(),
        ]);

        setPlatformSettings(mapPlatformSettingsRecord(normalizePlatformSettings(settings)));
        setPublicEvents((eventsResponse?.results ?? []).map(mapPublicEventRecord));
        setCommunityBlogs((blogsResponse?.results ?? []).map(mapCommunityBlogRecord));
        setTestimonials((testimoniesResponse?.results ?? []).map(mapTestimonyRecord));
      } catch (error) {
        console.error("Failed to load public platform data", error);
      }
    };

    loadPublicPlatformData();
  }, []);

  useEffect(() => {
    const CACHE_KEY = "eduignite_user";

    const readCachedUser = (): User | null => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? (JSON.parse(raw) as User) : null;
      } catch {
        return null;
      }
    };
    const cacheUser = (u: User) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(u));
      } catch {
        /* ignore quota */
      }
    };
    const mapUser = (user: any): User => ({
      id: user.id || "",
      uid: user.uid || `user_${user.id}`,
      name: user.name || "",
      email: user.email || "",
      phone: user.phone,
      whatsapp: user.whatsapp,
      role: (user.role as UserRole) || "STUDENT",
      schoolId: user.schoolId || null,
      avatar: resolveMediaUrl(user.avatar),
      school: mapSchoolInfo(user.school),
      isLicensePaid: user.isLicensePaid || false,
      aiRequestCount: user.aiRequestCount,
      annualAvg: user.annualAvg,
    });

    const restoreSession = async () => {
      const accessToken =
        localStorage.getItem("eduignite_access_token") || localStorage.getItem("access_token");
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      // Offline-first: render the cached account immediately so the app is
      // usable without waiting for (or requiring) the network.
      const cached = readCachedUser();
      if (cached) {
        setUserData(cached);
        setIsLoading(false);
      }

      try {
        const user = normalizeUser(await authService.getCurrentUser());
        if (user) {
          const mappedUser = mapUser(user);
          setUserData(mappedUser);
          cacheUser(mappedUser);
        }
      } catch (error: any) {
        const offline = !error?.response; // no response => network/offline
        if (offline) {
          // Stay signed in on the cached profile; data syncs when back online.
          if (!cached) setUserData(null);
        } else if (error.response?.status === 401) {
          try {
            await authService.refreshToken();
            const user = normalizeUser(await authService.getCurrentUser());
            if (user) {
              const mappedUser = mapUser(user);
              setUserData(mappedUser);
              cacheUser(mappedUser);
            }
          } catch (refreshError: any) {
            if (!refreshError?.response) {
              // Offline during refresh — keep the cached session.
              if (!cached) setUserData(null);
            } else {
              clearTokens();
              setUserData(null);
            }
          }
        } else {
          // Non-auth server error — keep the cached session if we have one.
          if (!cached) setUserData(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const loadAuthenticatedData = async () => {
      if (!userData) {
        setStaffRemarks([]);
        return;
      }

      try {
        const requests: Promise<any>[] = [];

        if (["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"].includes(userData.role)) {
          requests.push(
            schoolsService
              .getSchools()
              .then((response) => {
                setSchools((response?.results ?? []).map(mapSchoolInfo).filter(Boolean) as SchoolInfo[]);
              })
              .catch((error) => {
                console.error("Failed to load schools for authenticated context", error);
              })
          );
        } else if (userData.school) {
          setSchools([userData.school]);
        }

        requests.push(
          (userData.role === "SCHOOL_ADMIN" || userData.role === "SUB_ADMIN" || userData.role === "SUPER_ADMIN" || userData.role === "CEO" || userData.role === "CTO" || userData.role === "COO"
            ? staffRemarksService.getRemarks()
            : staffRemarksService.getMyRemarks()
          )
            .then((response) => {
              const remarks = Array.isArray(response) ? response : response?.results ?? [];
              setStaffRemarks(remarks.map(mapStaffRemarkRecord));
            })
            .catch((error) => {
              console.error("Failed to load staff remarks for authenticated context", error);
              setStaffRemarks([]);
            })
        );

        await Promise.allSettled(requests);
      } catch (error) {
        console.error("Failed to load authenticated context data", error);
      }
    };

    loadAuthenticatedData();
  }, [userData]);

  const login = async (matricule: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authService.login(matricule, password);
      if (response.access && response.refresh) {
        setTokens(response.access, response.refresh);
      }

      const user = normalizeUser(await authService.getCurrentUser());
      if (user) {
        const mappedUser: User = {
          id: user.id || "",
          uid: user.uid || `user_${user.id}`,
          name: user.name || "",
          email: user.email || "",
          phone: user.phone,
          whatsapp: user.whatsapp,
          role: (user.role as UserRole) || "STUDENT",
          schoolId: user.schoolId || null,
          avatar: resolveMediaUrl(user.avatar),
          school: mapSchoolInfo(user.school),
          isLicensePaid: user.isLicensePaid || false,
          aiRequestCount: user.aiRequestCount,
          annualAvg: user.annualAvg,
        };
        setUserData(mappedUser);
        try {
          localStorage.setItem("eduignite_user", JSON.stringify(mappedUser));
        } catch {
          /* ignore quota */
        }

        const boardRoles = ["CEO", "CTO", "COO", "INV", "SUPER_ADMIN", "DESIGNER"];
        router.push(boardRoles.includes(mappedUser.role) ? "/dashboard" : "/welcome");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const activateAccount = async (matricule: string, password: string, confirmPassword: string) => {
    setIsLoading(true);
    try {
      const response = await authService.activateAccount(matricule, password, confirmPassword);
      if (response.access && response.refresh) {
        setTokens(response.access, response.refresh);
      }

      const user = normalizeUser(await authService.getCurrentUser());
      if (user) {
        const mappedUser: User = {
          id: user.id || "",
          uid: user.uid || `user_${user.id}`,
          name: user.name || "",
          email: user.email || "",
          phone: user.phone,
          whatsapp: user.whatsapp,
          role: (user.role as UserRole) || "STUDENT",
          schoolId: user.schoolId || null,
          avatar: resolveMediaUrl(user.avatar),
          school: mapSchoolInfo(user.school),
          isLicensePaid: user.isLicensePaid || false,
          aiRequestCount: user.aiRequestCount,
          annualAvg: user.annualAvg,
        };
        setUserData(mappedUser);
        try {
          localStorage.setItem("eduignite_user", JSON.stringify(mappedUser));
        } catch {
          /* ignore quota */
        }

        const boardRoles = ["CEO", "CTO", "COO", "INV", "SUPER_ADMIN", "DESIGNER"];
        router.push(boardRoles.includes(mappedUser.role) ? "/dashboard" : "/welcome");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!userData) return;
    try {
      if (Object.keys(updates).length === 1 && typeof updates.avatar !== "undefined") {
        setUserData((prev) => (prev ? { ...prev, avatar: resolveMediaUrl(updates.avatar) } : prev));
        return;
      }

      const savedUser = await usersService.updateProfile(updates);
      const newUser: User = {
        ...userData,
        id: savedUser.id || userData.id,
        uid: savedUser.uid || userData.uid,
        name: savedUser.name || userData.name,
        email: savedUser.email || userData.email,
        phone: savedUser.phone,
        whatsapp: savedUser.whatsapp,
        role: (savedUser.role as UserRole) || userData.role,
        schoolId: (savedUser as any).schoolId || userData.schoolId,
        avatar: resolveMediaUrl(savedUser.avatar),
        school: mapSchoolInfo((savedUser as any).school) ?? userData.school,
        isLicensePaid: (savedUser as any).isLicensePaid ?? userData.isLicensePaid,
        aiRequestCount: (savedUser as any).aiRequestCount ?? userData.aiRequestCount,
        annualAvg: (savedUser as any).annualAvg ?? userData.annualAvg,
      };
      setUserData(newUser);
    } catch (error) {
      console.error("Failed to update user", error);
      throw error;
    }
  };

  const updateSchool = async (updates: Partial<SchoolInfo>) => {
    if (!userData || !userData.school) return;
    try {
      const savedSchool = await schoolsService.updateSchool(userData.school.id, {
        name: updates.name,
        short_name: updates.shortName,
        principal: updates.principal,
        motto: updates.motto,
        logo: updates.logo,
        banner: updates.banner,
        description: updates.description,
        location: updates.location,
        region: updates.region,
        division: updates.division,
        sub_division: updates.subDivision,
        city_village: updates.cityVillage,
        address: updates.address,
        postal_code: updates.postalCode,
        phone: updates.phone,
        email: updates.email,
        status: updates.status,
      } as any);

      const mappedSchool = mapSchoolInfo(savedSchool);
      if (!mappedSchool) return;

      setSchools((prev) =>
        prev.some((school) => school.id === mappedSchool.id)
          ? prev.map((school) => (school.id === mappedSchool.id ? mappedSchool : school))
          : [mappedSchool, ...prev]
      );

      setUserData((prev) => (prev ? { ...prev, school: mappedSchool } : prev));
    } catch (error) {
      console.error("Failed to update school", error);
      throw error;
    }
  };

  const updatePlatformSettings = async (updates: Partial<PlatformSettings>) => {
    if (Object.keys(updates).length === 1 && typeof updates.logo !== "undefined") {
      setPlatformSettings((prev) =>
        mapPlatformSettingsRecord({
          ...prev,
          logo: updates.logo,
        })
      );
      return;
    }

    const savedSettings = await platformService.updatePlatformSettings({
      name: updates.name,
      logo: updates.logo,
      payment_deadline: updates.paymentDeadline,
      honour_roll_threshold: updates.honourRollThreshold,
      fees: updates.fees as any,
      tutorial_links: updates.tutorialLinks,
    });
    setPlatformSettings(mapPlatformSettingsRecord(savedSettings));
  };

  const markLicensePaid = async () => await updateUser({ isLicensePaid: true });
  const incrementAiRequest = async () => {
    if (!userData) return;
    await updateUser({ aiRequestCount: (userData.aiRequestCount || 0) + 1 });
  };

  const addTestimony = async (t: Omit<Testimony, "id" | "status" | "createdAt">) => {
    const created = await communityService.createTestimony({
      school_name: t.schoolName,
      role_display: t.role,
      message: t.message,
    });
    setTestimonials((prev) => [mapTestimonyRecord(created), ...prev]);
  };

  const approveTestimony = async (id: string) => {
    await communityService.approveTestimony(id);
    setTestimonials((prev) => prev.map((t) => (t.id === id ? { ...t, status: "approved" } : t)));
  };

  const deleteTestimony = async (id: string) => {
    await communityService.rejectTestimony(id);
    setTestimonials((prev) => prev.filter((t) => t.id !== id));
  };

  const addCommunityBlog = async (b: Omit<CommunityBlog, "id" | "createdAt">) => {
    const created = await communityService.createBlog({
      title: b.title,
      image: b.image,
      video_url: b.video_url,
      paragraphs: b.paragraphs,
    });
    let published = created;
    if (!((created as any)?.is_published || (created as any)?.isPublished) && (created as any)?.id) {
      try {
        published = await communityService.publishBlog((created as any).id);
      } catch {
        // The backend may already auto-publish executive posts while older serializers omit the flag.
        published = created;
      }
    }
    setCommunityBlogs((prev) => [mapCommunityBlogRecord(published), ...prev]);
  };

  const deleteCommunityBlog = async (id: string) => {
    await communityService.deleteBlog(id);
    setCommunityBlogs((prev) => prev.filter((b) => b.id !== id));
  };

  const addFeedback = async (f: Omit<Feedback, "id" | "status" | "createdAt">) => {
    const created = await feedbackService.createFeedback({
      subject: f.subject,
      message: f.message,
      priority: "Medium",
    });
    setFeedbacks((prev) => [mapFeedbackRecord(created), ...prev]);
  };

  const resolveFeedback = async (id: string) => {
    const resolved = await feedbackService.resolveFeedback(id);
    setFeedbacks((prev) => prev.map((f) => (f.id === id ? mapFeedbackRecord(resolved) : f)));
  };

  const deleteFeedback = async (id: string) => {
    setFeedbacks((prev) => prev.filter((f) => f.id !== id));
  };

  const addOrder = async (o: Omit<Order, "id" | "status" | "createdAt">) => {
    const created = await ordersService.createOrder({
      full_name: o.fullName,
      occupation: o.occupation,
      school_name: o.schoolName,
      whatsapp_number: o.whatsappNumber,
      email: o.email,
      region: o.region,
      division: o.division,
      sub_division: o.subDivision,
      message: "",
    } as any);
    setOrders((prev) => [mapOrderRecord(created), ...prev]);
  };

  const processOrder = async (id: string) => {
    const processed = await ordersService.processOrder(id);
    setOrders((prev) => prev.map((o) => (o.id === id ? mapOrderRecord(processed) : o)));
  };

  const deleteOrder = async (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const addAnnouncement = async (a: Omit<Announcement, "id" | "createdAt">) => {
    const created = await announcementsService.createAnnouncement({
      title: a.title,
      content: a.content,
      target: a.target,
      target_user: a.targetUid,
    });
    setAnnouncements((prev) => [mapAnnouncementRecord(created), ...prev]);
  };

  const deleteAnnouncement = async (id: string) => {
    await announcementsService.deleteAnnouncement(id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const addSchool = async (s: Omit<SchoolInfo, "status">) => {
    const created = await schoolsService.createSchool({
      name: s.name,
      short_name: s.shortName,
      principal: s.principal,
      motto: s.motto,
      description: s.description,
      location: s.location,
      region: s.region,
      division: s.division,
      sub_division: s.subDivision,
      city_village: s.cityVillage,
      address: s.address,
      phone: s.phone,
      email: s.email,
      logo: s.logo,
      banner: s.banner,
    });
    const mappedSchool = mapSchoolInfo(created);
    if (mappedSchool) {
      setSchools((prev) => [mappedSchool, ...prev]);
    }
  };

  const toggleSchoolStatus = async (id: string) => {
    const updated = await schoolsService.toggleSchoolStatus(id);
    const mappedSchool = mapSchoolInfo(updated);
    if (!mappedSchool) return;
    setSchools((prev) => prev.map((s) => (s.id === id ? mappedSchool : s)));
  };

  const deleteSchool = async (id: string) => {
    await schoolsService.deleteSchool(id);
    setSchools((prev) => prev.filter((s) => s.id !== id));
  };

  const addSupport = async (c: Omit<SupportContribution, "id" | "status" | "createdAt">) => {
    const created = await supportService.createSupport({
      amount: c.amount,
      payment_method: c.method,
      phone: c.phone,
      message: c.message,
    });
    setSupportContributions((prev) => [mapSupportRecord(created), ...prev]);
  };

  const verifySupport = async (id: string) => {
    const verified = await supportService.verifySupport(id);
    const mappedSupport = mapSupportRecord(verified);
    setSupportContributions((prev) => prev.map((c) => (c.id === id ? mappedSupport : c)));
  };

  const deleteSupport = async (id: string) => {
    setSupportContributions((prev) => prev.filter((c) => c.id !== id));
  };

  const addPublicEvent = async (e: Omit<PublicEvent, "id">) => {
    const created = await platformService.createPublicEvent(e);
    setPublicEvents((prev) => [mapPublicEventRecord(created), ...prev]);
  };

  const deletePublicEvent = async (id: string) => {
    await platformService.deletePublicEvent(id);
    setPublicEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const addStaffRemark = async (r: Omit<StaffRemark, "id" | "date">) => {
    const created = await staffRemarksService.createRemark({
      staff: r.staffId as any,
      text: r.text,
    });
    setStaffRemarks((prev) => [mapStaffRemarkRecord(created), ...prev]);
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error("Logout error (continuing)", error);
    } finally {
      clearTokens();
      setUserData(null);
      setStaffRemarks([]);
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: userData,
        platformSettings,
        testimonials,
        communityBlogs,
        feedbacks,
        orders,
        announcements,
        personalChats,
        supportContributions,
        schools,
        publicEvents,
        staffRemarks,
        login,
        activateAccount,
        updateUser,
        updateSchool,
        updatePlatformSettings,
        markLicensePaid,
        incrementAiRequest,
        addTestimony,
        approveTestimony,
        deleteTestimony,
        addCommunityBlog,
        deleteCommunityBlog,
        addFeedback,
        resolveFeedback,
        deleteFeedback,
        addOrder,
        processOrder,
        deleteOrder,
        addAnnouncement,
        deleteAnnouncement,
        addSchool,
        toggleSchoolStatus,
        deleteSchool,
        addSupport,
        verifySupport,
        deleteSupport,
        addPublicEvent,
        deletePublicEvent,
        addStaffRemark,
        logout,
        isAuthenticated: !!userData,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
