"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Loader2, GraduationCap, LayoutDashboard, Settings2, BookOpen, ClipboardCheck, Users, Quote, HelpCircle, BarChart3 } from "lucide-react";
import {
  canSeeAcademyCms,
  canSeeAnalytics,
  canSeeMyCourses,
  canSeeReviewQueue,
} from "./_lib/permissions";

const NAV = [
  { href: "/academy/admin", label: "Overview", icon: LayoutDashboard, show: () => true },
  { href: "/academy/admin/profile", label: "Profile Settings", icon: Settings2, show: canSeeAcademyCms },
  { href: "/academy/admin/courses", label: "Course Spotlight", icon: BookOpen, show: canSeeAcademyCms },
  { href: "/academy/admin/courses/mine", label: "My Courses", icon: BookOpen, show: canSeeMyCourses },
  { href: "/academy/admin/courses/review", label: "Review Queue", icon: ClipboardCheck, show: canSeeReviewQueue },
  { href: "/academy/admin/trainers", label: "Trainers", icon: Users, show: canSeeAcademyCms },
  { href: "/academy/admin/testimonials", label: "Testimonials", icon: Quote, show: canSeeAcademyCms },
  { href: "/academy/admin/faqs", label: "FAQ Builder", icon: HelpCircle, show: canSeeAcademyCms },
  { href: "/academy/admin/stats", label: "Statistics", icon: BarChart3, show: canSeeAnalytics },
] as const;

export default function AcademyAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login?next=/academy/admin");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary opacity-30" />
        <p className="text-primary/40 font-black uppercase text-[10px] tracking-[0.3em]">Loading Academy Console</p>
      </div>
    );
  }

  if (!user) return null;

  const visibleNav = NAV.filter((item) => item.show(user.role));

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/academy/admin" className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <GraduationCap className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <p className="font-black uppercase tracking-widest text-sm leading-none">EduIgnite Academy</p>
              <p className="text-[10px] text-white/60 uppercase tracking-[0.2em] mt-1">Admin Console</p>
            </div>
          </Link>
          <div className="text-right">
            <p className="text-xs font-bold">{user.name}</p>
            <p className="text-[10px] text-white/60 uppercase tracking-widest">{user.role.replace(/_/g, " ")}</p>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap gap-1 pb-3 overflow-x-auto">
          {visibleNav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors",
                  active ? "bg-white text-primary shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
