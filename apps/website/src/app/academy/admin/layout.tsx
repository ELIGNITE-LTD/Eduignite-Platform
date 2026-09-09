"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Loader2,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  BookOpen,
  ClipboardCheck,
  Users,
  Quote,
  HelpCircle,
  BarChart3,
  ArrowLeft,
  Menu,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
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

function AcademyAdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;
  const visibleNav = NAV.filter((item) => item.show(user.role));

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-primary text-white">
      <div className="shrink-0 p-4 sm:p-6">
        <Link href="/academy/admin" onClick={onNavigate} className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-xl shrink-0">
            <GraduationCap className="w-6 h-6 text-secondary" />
          </div>
          <div className="min-w-0">
            <p className="font-black uppercase tracking-widest text-sm leading-none truncate">EduIgnite Academy</p>
            <p className="text-[10px] text-white/60 uppercase tracking-[0.2em] mt-1">Admin Console</p>
          </div>
        </Link>
      </div>

      <div className="shrink-0 px-4 sm:px-6 pb-2">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          Back to Main Dashboard
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 sm:px-3 py-2 space-y-1">
        {visibleNav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors",
                active ? "bg-white text-primary shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-white/60")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto shrink-0 border-t border-white/10 p-4">
        <div className="mb-3 flex min-w-0 items-center gap-3 px-2">
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold text-white">{user.name}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              {user.role.replace(/_/g, " ")}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-white/60 hover:bg-white/10 hover:text-white"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          <span>Log Out</span>
        </Button>
      </div>
    </div>
  );
}

export default function AcademyAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  return (
    <div className="flex min-h-dvh flex-col md:flex-row bg-background">
      <aside className="hidden md:flex w-64 shrink-0 h-full">
        <AcademyAdminSidebar />
      </aside>

      <div className="flex-1 flex min-h-dvh flex-col overflow-hidden">
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 bg-primary text-white shrink-0">
          <Link href="/academy/admin" className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-white/10 rounded-lg shrink-0">
              <GraduationCap className="w-5 h-5 text-secondary" />
            </div>
            <span className="font-black uppercase tracking-widest text-sm truncate">EduIgnite Academy</span>
          </Link>
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white shrink-0">
                <Menu className="w-6 h-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 border-none w-[88vw] max-w-80">
              <SheetTitle className="sr-only">Academy Admin Navigation</SheetTitle>
              <AcademyAdminSidebar onNavigate={() => setIsMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
