"use client";

/**
 * The two things in the workspace that point outward.
 *
 * A grid of the public site, for the pages people actually ask about - what
 * EduIgnite is, what it costs to start, where the apps are, what other schools
 * say - each opening in its own tab so nobody loses the work they had open.
 *
 * And an invitation link. Schools here arrive mostly by word of mouth: a
 * teacher who moves, a parent with a child elsewhere, a bursar who knows the
 * bursar next door. The link carries a code that belongs to this account, so
 * when a school arrives through it the introduction is credited to the person
 * who made it, and they can see it land instead of sharing into silence.
 */

import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  Copy,
  Download,
  GraduationCap,
  Images,
  Loader2,
  Mail,
  MessageCircle,
  Quote,
  Share2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { ordersService } from "@/lib/api/services/orders.service";
import { cn } from "@/lib/utils";

/** The public site, as somewhere to send a colleague rather than a menu. */
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://eduignite.online";

type Destination = {
  label: string;
  description: string;
  path: string;
  icon: typeof BookOpen;
};

const DESTINATIONS: Destination[] = [
  {
    label: "The website",
    description: "What EduIgnite is, and what it does for a school.",
    path: "/",
    icon: Building2,
  },
  {
    label: "Academy",
    description: "Courses and training for teachers and students.",
    path: "/academy",
    icon: GraduationCap,
  },
  {
    label: "Downloads",
    description: "The Android and Windows apps, and how to install them.",
    path: "/download",
    icon: Download,
  },
  {
    label: "Stories",
    description: "What schools already using EduIgnite say about it.",
    path: "/testimonials",
    icon: Quote,
  },
  {
    label: "Blog",
    description: "Notes on running a school, and what is new here.",
    path: "/blog",
    icon: BookOpen,
  },
  {
    label: "Gallery",
    description: "Schools, events and the platform in use.",
    path: "/gallery",
    icon: Images,
  },
  {
    label: "About",
    description: "Who builds EduIgnite, and why.",
    path: "/about",
    icon: Users,
  },
  {
    label: "Contact",
    description: "Reach the team directly.",
    path: "/contact",
    icon: Mail,
  },
];

export function ExploreAndRefer() {
  const { user } = useAuth();
  const { toast } = useToast();
  // Students are not part of the referral programme, so they are not shown a
  // link they could share and never be paid for.
  const isStudent = String(user?.role || "").toUpperCase() === "STUDENT";
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const referral = useQuery({
    queryKey: ["my-referral"],
    queryFn: () => ordersService.getMyReferral(),
    staleTime: 1000 * 60 * 5,
    retry: 1,
    enabled: !isStudent,
  });

  const link = referral.data?.link ?? "";

  const message = link
    ? `I use EduIgnite to run our school - student records, attendance, marks, report cards and fees, and it keeps working when the internet does not. If you would like it for your school, request an account here: ${link}`
    : "";

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard access is refused in some webviews; the link is on screen
      // and selectable, so say that rather than failing silently.
      toast({
        title: "Could not copy automatically",
        description: "Select the link above and copy it by hand.",
        variant: "destructive",
      });
    }
  }

  async function shareLink() {
    if (!link) return;
    try {
      await navigator.share({
        title: "EduIgnite for your school",
        text: message,
        url: link,
      });
    } catch {
      /* the person closed the share sheet; nothing to report */
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- The public site ------------------------------------------- */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-black uppercase tracking-tight text-primary">
            EduIgnite on the web
          </CardTitle>
          <CardDescription>
            The public site, for when you need to show someone what this is, or find the apps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DESTINATIONS.map(({ label, description, path, icon: Icon }) => (
              <a
                key={path}
                href={`${SITE_URL}${path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <span className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                </span>
                <span className="text-sm font-black text-foreground">{label}</span>
                <span className="text-xs font-medium leading-relaxed text-muted-foreground">
                  {description}
                </span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---- The invitation link ---------------------------------------- */}
      {isStudent ? null : (
      <Card className="overflow-hidden rounded-3xl border-none shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-primary">
            <Share2 className="h-5 w-5 text-secondary" />
            Invite a school
          </CardTitle>
          <CardDescription>
            Share this link with a school that needs EduIgnite. It is yours, so every school that
            requests an account through it is credited to you.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {referral.isLoading ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing your link…
            </div>
          ) : referral.isError ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
              <span>Your link could not be loaded. It will be here when the connection is back.</span>
              <Button size="sm" variant="secondary" onClick={() => void referral.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all font-mono text-xs font-semibold text-foreground">
                  {link}
                </code>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={copyLink} className="gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  {canShare && (
                    <Button size="sm" variant="secondary" onClick={shareLink} className="gap-1.5">
                      <Share2 className="h-3.5 w-3.5" /> Share
                    </Button>
                  )}
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-xs font-black text-white",
                      "transition-colors hover:bg-[#1eb85a]",
                    )}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ReferralFigure label="Schools referred" value={referral.data?.total ?? 0} />
                <ReferralFigure label="Awaiting contact" value={referral.data?.pending ?? 0} />
                <ReferralFigure label="Contacted" value={referral.data?.contacted ?? 0} />
                <ReferralFigure label="Set up" value={referral.data?.processed ?? 0} highlight />
              </dl>

              <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
                Your link carries a code of its own, never your matricule, so it is safe to post in a
                group. Anyone who opens it lands on the school account request form with you already
                recorded as the person who sent them.{" "}
                <a href="/dashboard/referrals" className="font-bold text-primary underline">
                  See what you earn and when you are paid
                </a>
                .
              </p>
            </>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

function ReferralFigure({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border p-4",
        highlight ? "bg-primary/5" : "bg-card",
      )}
    >
      <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-black tabular-nums",
          highlight ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
