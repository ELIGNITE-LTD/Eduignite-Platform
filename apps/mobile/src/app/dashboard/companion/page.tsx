"use client";

import Link from "next/link";
import {
  Megaphone,
  MessageSquare,
  Quote,
  ScanLine,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

const AUTHORIZED_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN"];

const primaryTiles = [
  {
    href: "/dashboard/companion/activate",
    icon: ShieldCheck,
    title: "Activate / Renew License",
    description: "Scan the offline desktop's QR code to activate a new install or renew an expiring license.",
  },
  {
    href: "/dashboard/companion/device-replacement",
    icon: Wrench,
    title: "Device Replacement",
    description: "Authorized workflow for a hardware failure or upgrade — deactivates the old device, licenses the new one.",
  },
];

// EduIgnite Offline's spec also routes announcements, support requests and
// testimonials through the technician's Companion app. Those features
// already exist elsewhere in this dashboard (Announcements / Feedback /
// Testimonials) — surfaced here rather than duplicated.
const relatedTiles = [
  {
    href: "/dashboard/announcements",
    icon: Megaphone,
    title: "Announcements",
    description: "Platform and policy updates from EduIgnite.",
  },
  {
    href: "/dashboard/feedback",
    icon: MessageSquare,
    title: "Support Requests",
    description: "Log a technical issue or ask EduIgnite for help.",
  },
  {
    href: "/dashboard/testimonials",
    icon: Quote,
    title: "Testimonials",
    description: "Share feedback or a rating about the platform.",
  },
];

export default function CompanionHomePage() {
  const { user } = useAuth();
  const isAuthorized = AUTHORIZED_ROLES.includes(user?.role || "");

  return (
    <div className="space-y-8 pb-20">
      <div>
        <Badge className="mb-3 border-none bg-secondary/20 text-primary">EduIgnite Offline</Badge>
        <h1 className="flex items-center gap-3 text-3xl font-black text-primary">
          <span className="rounded-xl bg-primary p-2 text-white shadow-lg">
            <ScanLine className="h-6 w-6 text-secondary" />
          </span>
          Companion
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Bridge your school's offline desktop app to EduIgnite's cloud using your phone's internet connection —
          activate licenses, renew them, and handle authorized device replacements by scanning QR codes.
        </p>
      </div>

      {!isAuthorized ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Licensing actions are restricted to your school's administrator account. You can still view the
          announcements, support, and testimonials links below.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {primaryTiles.map((tile) => (
          <Link key={tile.href} href={isAuthorized ? tile.href : "#"} className={!isAuthorized ? "pointer-events-none opacity-50" : undefined}>
            <Card className="h-full border-none shadow-xl transition-transform hover:-translate-y-0.5">
              <CardHeader>
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <tile.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{tile.title}</CardTitle>
                <CardDescription>{tile.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-muted-foreground">
          Also from EduIgnite Offline
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {relatedTiles.map((tile) => (
            <Link key={tile.href} href={tile.href}>
              <Card className="h-full border-none shadow-md transition-transform hover:-translate-y-0.5">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
                    <tile.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-primary">{tile.title}</p>
                    <p className="text-xs text-muted-foreground">{tile.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
