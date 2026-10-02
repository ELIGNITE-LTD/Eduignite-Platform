"use client";

import type { VideoProvider } from "../../../../start/_lib/api";

function toYouTubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed${parsed.pathname}`;
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
      if (parsed.pathname.startsWith("/embed/")) return url;
    }
    return null;
  } catch {
    return null;
  }
}

function toVimeoEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host.endsWith("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}?dnt=1`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Renders a lesson's video generically from `video_provider` + `video_url`:
 * YouTube/Vimeo as an iframe embed, self-hosted as a plain HTML5 <video> tag.
 * One small component instead of three separate players scattered through
 * the page.
 */
export function LessonVideo({
  provider,
  url,
  title,
}: {
  provider: VideoProvider;
  url: string;
  title: string;
}) {
  if (!url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-3xl bg-slate-900/90 text-sm font-semibold text-white/50">
        No video attached to this lesson yet
      </div>
    );
  }

  if (provider === "self_hosted") {
    return (
      <video
        key={url}
        controls
        className="aspect-video w-full rounded-3xl bg-black shadow-xl"
        src={url}
      >
        Your browser does not support the video tag.
      </video>
    );
  }

  const embedUrl = provider === "youtube" ? toYouTubeEmbed(url) : provider === "vimeo" ? toVimeoEmbed(url) : null;

  if (!embedUrl) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-3xl bg-slate-900/90 p-6 text-center text-sm font-bold text-white/70">
        Couldn&apos;t read this video link. Open it directly:
        <a href={url} target="_blank" rel="noreferrer" className="ml-2 underline">
          {url}
        </a>
      </div>
    );
  }

  return (
    <iframe
      key={embedUrl}
      className="aspect-video w-full rounded-3xl bg-black shadow-xl"
      src={embedUrl}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
