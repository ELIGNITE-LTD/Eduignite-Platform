"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronRight,
  Loader2,
  Megaphone,
  MessageCircle,
  MessageSquareWarning,
  Quote,
  ShieldCheck,
  SquareCheckBig,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BottomNav, BottomNavSpacer } from "@/components/bottom-nav";
import { Card } from "@/components/ui/card";

const AUTHORIZED_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN"];

const WORKSPACE_CARDS = [
  {
    href: "/announcements/",
    icon: Megaphone,
    title: "Announcements",
    description: "View updates and notices sent from EduIgnite's office.",
  },
  {
    href: "/chat/",
    icon: MessageCircle,
    title: "Chat",
    description: "Communicate directly with EduIgnite customer care.",
  },
  {
    href: "/feedback/",
    icon: MessageSquareWarning,
    title: "Feedback",
    description: "Report an issue or suggest an improvement.",
  },
  {
    href: "/testimony/",
    icon: Quote,
    title: "Testimony",
    description: "Share your school's experience with EduIgnite.",
  },
  {
    href: "/surveys/",
    icon: SquareCheckBig,
    title: "Surveys",
    description: "Answer surveys EduIgnite has published for your school.",
  },
] as const;

/**
 * Spec section 5 — the Workspace dashboard: one card per feature (icon,
 * title, short description, consistent treatment, tap feedback), plus a
 * distinct-but-not-dominant "Activate License" row. Moved out of home/page.tsx
 * so Home can stay focused on identity + announcements (spec section 3).
 */
export default function WorkspacePage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAuthorized = AUTHORIZED_ROLES.includes(user?.role || "");

  return (
    <main className="min-h-screen bg-background px-6 pt-10">
      <div className="mx-auto max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-black text-primary-dark">Workspace</h1>
          <p className="mt-1 text-sm text-gray-500">Everything you need to manage your EduIgnite Offline account.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {WORKSPACE_CARDS.map(({ href, icon: Icon, title, description }) => (
            <Link key={href} href={href} className="block">
              <Card interactive className="h-full p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="mt-3 text-sm font-black text-primary-dark">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>
              </Card>
            </Link>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">Licensing</p>
          <Link href={isAuthorized ? "/activate/" : "#"} className={!isAuthorized ? "pointer-events-none" : ""}>
            <Card interactive={isAuthorized} className={"p-4" + (!isAuthorized ? " opacity-60" : "")}>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/20">
                  <ShieldCheck className="h-5 w-5 text-primary-dark" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-primary-dark">Activate License</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {isAuthorized
                      ? "Activate, renew, or manage your Offline desktop license."
                      : "Restricted to your school's administrator account."}
                  </p>
                </div>
                {isAuthorized ? <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" /> : null}
              </div>
            </Card>
          </Link>
          {isAuthorized ? (
            <Link
              href="/device-replacement/"
              className="mt-2 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-gray-500 transition hover:text-primary"
            >
              <span className="inline-flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5" />
                Replacing a device instead?
              </span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <BottomNavSpacer />
      </div>
      <BottomNav />
    </main>
  );
}
