"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { toEmbedUrl } from "@/lib/public-site";

/**
 * A YouTube or Vimeo video that loads only when the visitor asks for it.
 *
 * Until Play is pressed nothing is requested from YouTube or Vimeo, so no
 * third-party cookies are set and nothing about the visitor is sent to them
 * just for opening the page. The player itself uses YouTube's
 * privacy-enhanced domain and Vimeo's do-not-track mode (see `toEmbedUrl`).
 *
 * Links that are not YouTube or Vimeo are never framed: an arbitrary site
 * inside the page could be anything. They open as a plain link instead.
 */
export function VideoEmbed({
  url,
  title,
  className = "",
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = toEmbedUrl(url);
  const label = title || "video";

  if (!embed) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-slate-900 p-6 text-center ${className}`}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#12314d]"
        >
          Watch “{label}” on its website
        </a>
      </div>
    );
  }

  const provider = embed.includes("vimeo") ? "Vimeo" : "YouTube";

  if (playing) {
    const src = `${embed}${embed.includes("?") ? "&" : "?"}autoplay=1`;
    return (
      <iframe
        src={src}
        title={label}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={`h-full w-full border-0 ${className}`}
      />
    );
  }

  return (
    <div className={`relative flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#12314d] to-[#264D73] p-6 text-center ${className}`}>
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3.5 text-base font-bold text-[#12314d] shadow-lg transition-transform hover:scale-105"
      >
        <Play className="h-5 w-5 fill-current" aria-hidden />
        Play video: {label}
      </button>
      <p className="max-w-sm text-xs leading-relaxed text-white/80">
        This video plays from {provider}. Pressing play loads it from {provider}, which may then
        set its own cookies. See our{" "}
        <a href="/cookies" className="font-bold underline">
          Cookie Policy
        </a>
        .
      </p>
    </div>
  );
}
