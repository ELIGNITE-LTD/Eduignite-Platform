"use client";

import Image from "next/image";

interface MediaRendererProps {
  imageUrl?: string | null;
  videoUrl?: string | null;
  alt?: string;
  className?: string;
  aspectClassName?: string;
}

const getYouTubeEmbed = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${parsed.pathname.replace("/", "")}`;
    }
    if (parsed.hostname.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop();
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }
  } catch {
    return "";
  }
  return "";
};

const getVimeoEmbed = (url: string) => {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("vimeo.com")) return "";
    const videoId = parsed.pathname.split("/").filter(Boolean).pop();
    return videoId ? `https://player.vimeo.com/video/${videoId}` : "";
  } catch {
    return "";
  }
};

const isDirectVideo = (url: string) =>
  /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url) || url.startsWith("data:video/");

export function MediaRenderer({
  imageUrl,
  videoUrl,
  alt = "Community media",
  className = "",
  aspectClassName = "aspect-video",
}: MediaRendererProps) {
  const video = (videoUrl || "").trim();
  const image = (imageUrl || "").trim();
  const youtube = video ? getYouTubeEmbed(video) : "";
  const vimeo = video ? getVimeoEmbed(video) : "";

  if (youtube || vimeo) {
    return (
      <div className={`relative w-full overflow-hidden rounded-xl bg-slate-950 ${aspectClassName} ${className}`}>
        <iframe
          src={youtube || vimeo}
          title={alt}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  if (video && isDirectVideo(video)) {
    return (
      <video
        className={`w-full rounded-xl bg-slate-950 object-cover ${className}`}
        controls
        playsInline
        preload="metadata"
        poster={image || undefined}
      >
        <source src={video} />
      </video>
    );
  }

  if (image) {
    return (
      <div className={`relative w-full overflow-hidden rounded-xl bg-slate-100 ${aspectClassName} ${className}`}>
        <Image src={image} alt={alt} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" unoptimized />
      </div>
    );
  }

  return null;
}
