"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { getTutorialLinkForSurface } from "@/lib/tutorial-links";
import { Youtube, ExternalLink, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Training: the role-specific "how to use your dashboard" YouTube video that
 * previously lived in the footer's Training Portal, now a first-class
 * workspace destination with an embedded player.
 */

function toYouTubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      const shorts = parsed.pathname.match(/^\/(shorts|embed|live)\/([^/?]+)/);
      if (shorts?.[2]) return `https://www.youtube.com/embed/${shorts[2]}`;
    }
    return null;
  } catch {
    return null;
  }
}

export default function TrainingPage() {
  const { user, platformSettings } = useAuth();

  const tutorialUrl = useMemo(
    () =>
      getTutorialLinkForSurface(platformSettings?.tutorialLinks, user?.role, "web") ||
      "https://youtube.com",
    [platformSettings?.tutorialLinks, user?.role]
  );
  const embedUrl = useMemo(() => toYouTubeEmbed(tutorialUrl), [tutorialUrl]);
  const roleLabel = (user?.role || "").replace(/_/g, " ");

  return (
    <div className="pb-4 space-y-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Training</h1>
        <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
          Learn how to use your {roleLabel.toLowerCase()} dashboard, step by step.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        {embedUrl ? (
          <div className="aspect-video w-full bg-black">
            <iframe
              src={embedUrl}
              title="EduIgnite training video"
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-accent/20 p-6 text-center">
            <PlayCircle className="h-12 w-12 text-primary/30" />
            <p className="text-sm font-semibold text-muted-foreground">
              Your training video opens on YouTube.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50">
              <Youtube className="h-5 w-5 text-red-600" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">Training Portal</p>
              <p className="truncate text-xs text-muted-foreground">
                Official guide for {roleLabel.toLowerCase()} accounts
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 rounded-xl border-primary/20 font-bold text-primary"
          >
            <a href={tutorialUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              YouTube
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
