"use client";

import { ExternalLink, PlayCircle, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const getYouTubeVideoId = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/embed/")[1] || "";
      }
      return parsed.searchParams.get("v") || "";
    }
    return "";
  } catch {
    return "";
  }
};

const getYouTubeEmbedUrl = (url: string) => {
  const videoId = getYouTubeVideoId(url);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
};

interface TrainingPortalSpotlightProps {
  roleLabel: string;
  tutorialUrl?: string | null;
}

export function TrainingPortalSpotlight({ roleLabel, tutorialUrl }: TrainingPortalSpotlightProps) {
  const safeUrl = (tutorialUrl || "").trim();
  const embedUrl = getYouTubeEmbedUrl(safeUrl);

  if (!safeUrl || !embedUrl) {
    return null;
  }

  return (
    <Card className="overflow-hidden border-none shadow-sm bg-white">
      <CardHeader className="space-y-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-black uppercase tracking-tight text-primary">
          <Youtube className="w-4 h-4 text-red-500" />
          Training Portal
        </CardTitle>
        <CardDescription>
          Practical onboarding content curated for {roleLabel.toLowerCase()}s.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-2xl border bg-slate-950">
          <div className="aspect-video">
            <iframe
              src={embedUrl}
              title="Training portal"
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Watch the preview here, then open the full lesson directly on YouTube.
          </p>
          <Button asChild className="gap-2 rounded-xl">
            <a href={safeUrl} target="_blank" rel="noopener noreferrer">
              <PlayCircle className="w-4 h-4" />
              Watch Full Video
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
