"use client";

/**
 * One uploaded app's screen, inside the dashboard.
 *
 * The platform draws everything around the panel — the heading, the app name,
 * the breadcrumb. The app draws only inside it. That is what keeps an uploaded
 * app looking like part of EduIgnite rather than an embedded website.
 */

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Boxes, Lock } from "lucide-react";

import { AppFrame } from "@/components/apps/app-frame";
import { useMyApps } from "@/lib/hooks/useRegistry";

export default function AppScreenView() {
  const params = useParams<{ appKey: string; screenId: string }>();
  const appKey = String(params?.appKey || "");
  const screenId = String(params?.screenId || "");
  const { data: myApps, isLoading } = useMyApps();

  const app = myApps?.apps?.find((entry) => entry.key === appKey);
  const screen = (app as any)?.screens?.find((s: any) => s.id === screenId);

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  }

  // Not having the app is the ordinary case for a school without it, so it
  // gets a plain explanation rather than an error. The server refuses the
  // data and frame calls regardless; this is only what the person sees.
  if (!app) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">This app is not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your school does not have it, or it has been removed. Ask your administrator.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <Boxes className="h-3.5 w-3.5" />
            {app.name}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">
            {screen?.title || app.name}
          </h1>
        </div>
      </div>

      <AppFrame
        appKey={appKey}
        screenId={screenId}
        title={screen?.title || app.name}
      />
    </div>
  );
}
