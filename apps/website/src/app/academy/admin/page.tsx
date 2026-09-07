"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Settings2, BookOpen, ClipboardCheck, Users, Quote, HelpCircle, BarChart3, GraduationCap, ArrowRight } from "lucide-react";
import { getAcademyProfile } from "./_lib/api";
import {
  canSeeAcademyCms,
  canSeeAnalytics,
  canSeeMyCourses,
  canSeeReviewQueue,
} from "./_lib/permissions";

const SECTIONS = [
  {
    href: "/academy/admin/profile",
    title: "Profile Settings",
    description: "Tagline, mission, vision, description, and public logo.",
    icon: Settings2,
    show: canSeeAcademyCms,
  },
  {
    href: "/academy/admin/courses",
    title: "Course Spotlight",
    description: "Feature or unfeature published courses on the public landing page.",
    icon: BookOpen,
    show: canSeeAcademyCms,
  },
  {
    href: "/academy/admin/courses/mine",
    title: "My Courses",
    description: "Build drafts, edit content, and submit courses for review.",
    icon: BookOpen,
    show: canSeeMyCourses,
  },
  {
    href: "/academy/admin/courses/review",
    title: "Review Queue",
    description: "Approve or reject courses pending review before publication.",
    icon: ClipboardCheck,
    show: canSeeReviewQueue,
  },
  {
    href: "/academy/admin/trainers",
    title: "Trainer Profiles",
    description: "Manage trainer bios, photos, credentials, and verification.",
    icon: Users,
    show: canSeeAcademyCms,
  },
  {
    href: "/academy/admin/testimonials",
    title: "Testimonials",
    description: "Approve or reject learner testimonials before they go public.",
    icon: Quote,
    show: canSeeAcademyCms,
  },
  {
    href: "/academy/admin/faqs",
    title: "FAQ Builder",
    description: "Add, edit, and order the public FAQ entries by category.",
    icon: HelpCircle,
    show: canSeeAcademyCms,
  },
  {
    href: "/academy/admin/stats",
    title: "Statistics Overrides",
    description: "Override the public course/learner/certificate counters.",
    icon: BarChart3,
    show: canSeeAnalytics,
  },
] as const;

export default function AcademyAdminOverviewPage() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["academy-admin", "profile-overview"],
    queryFn: getAcademyProfile,
  });

  const visibleSections = SECTIONS.filter((section) => section.show(user?.role));

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
          <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
            <GraduationCap className="w-6 h-6 text-secondary" />
          </div>
          Academy Admin Console
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage the EduIgnite Academy public profile, courses, and governance workflow. Every action here is
          re-checked by the server against your real, granted permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm rounded-2xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Published Courses</p>
            <p className="text-3xl font-black text-primary mt-1">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : profile?.stats.courses_count ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-2xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Learners</p>
            <p className="text-3xl font-black text-primary mt-1">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : profile?.stats.learners_count ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-2xl">
          <CardContent className="p-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Certificates Issued</p>
            <p className="text-3xl font-black text-primary mt-1">
              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : profile?.stats.certificates_count ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="border-none shadow-md hover:shadow-xl transition-shadow h-full rounded-2xl">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div className="p-3 bg-accent/30 rounded-xl">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base font-black text-primary mb-1">{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {visibleSections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
          <GraduationCap className="w-16 h-16 text-primary/10" />
          <p className="text-muted-foreground font-medium max-w-md">
            No Academy admin sections are shown for your role. If you believe you should have Academy CMS or
            governance access, ask a founder (CEO or CTO) to grant you the relevant Academy permission.
          </p>
        </div>
      )}
    </div>
  );
}
