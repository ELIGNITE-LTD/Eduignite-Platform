"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

const LOGO_UPDATED_EVENT = "eduignite:platform-logo-updated";
const LIVE_FAVICON_PATH = "/favicon.ico";

function ensureLink(rel: string, selector = `link[rel="${rel}"]`) {
  let link = document.head.querySelector<HTMLLinkElement>(selector);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  return link;
}

function platformIconHref(revision: string, size?: number) {
  const params = new URLSearchParams({ v: revision });
  if (size) params.set("size", String(size));
  return `${LIVE_FAVICON_PATH}?${params.toString()}`;
}

function getLogoContentType(logo: string) {
  const match = logo.match(/^data:([^;,]+)[;,]/);
  return match?.[1] || "";
}

function withCacheBuster(href: string, revision: string) {
  if (!href || href.startsWith("data:") || href.startsWith("blob:")) return href;
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("favicon_v", revision);
    return url.href;
  } catch {
    return href;
  }
}

function hashCode(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function buildManifest(name: string, revisionKey: string, origin: string) {
  const rootUrl = new URL("/", origin).href;

  return {
    name,
    short_name: name.length > 12 ? "EduIgnite" : name,
    description: "EduIgnite Cameroon secondary school management platform.",
    start_url: rootUrl,
    scope: rootUrl,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a3c6e",
    icons: [
      {
        src: new URL(platformIconHref(revisionKey, 192), origin).href,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: new URL(platformIconHref(revisionKey, 512), origin).href,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}

export function PlatformFavicon() {
  const { platformSettings } = useAuth();
  const [logoOverride, setLogoOverride] = useState("");
  const [revision, setRevision] = useState(() => String(Date.now()));
  const manifestUrlRef = useRef("");

  useEffect(() => {
    const handleLogoUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ logo?: string; revision?: string | number }>).detail;
      if (detail?.logo) setLogoOverride(detail.logo);
      setRevision(String(detail?.revision || Date.now()));
    };

    window.addEventListener(LOGO_UPDATED_EVENT, handleLogoUpdated);
    return () => window.removeEventListener(LOGO_UPDATED_EVENT, handleLogoUpdated);
  }, []);

  useEffect(() => {
    setLogoOverride("");
    setRevision(String(Date.now()));
  }, [platformSettings.logo]);

  const revisionKey = useMemo(() => {
    const sourceRevision = `${revision}-${logoOverride || platformSettings.logo || "fallback"}`;
    return String(Math.abs(hashCode(sourceRevision)));
  }, [logoOverride, platformSettings.logo, revision]);

  useEffect(() => {
    const appName = platformSettings.name || "EduIgnite";
    const logoSetting = (logoOverride || platformSettings.logo || "").trim();
    const uploadedLogo = logoSetting ? resolvePlatformLogoUrl(logoSetting) : "";
    const iconHref = uploadedLogo ? withCacheBuster(uploadedLogo, revisionKey) : platformIconHref(revisionKey);
    const iconType = uploadedLogo ? getLogoContentType(uploadedLogo) : "";

    const favicon = ensureLink("icon");
    favicon.href = iconHref;
    if (iconType) favicon.type = iconType;
    else favicon.removeAttribute("type");
    favicon.setAttribute("sizes", "any");

    const shortcut = ensureLink("shortcut icon", 'link[rel="shortcut icon"]');
    shortcut.href = iconHref;
    if (iconType) shortcut.type = iconType;
    else shortcut.removeAttribute("type");

    const apple = ensureLink("apple-touch-icon");
    apple.href = iconHref;

    const manifest = buildManifest(appName, revisionKey, window.location.origin);
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const manifestUrl = URL.createObjectURL(blob);
    const manifestLink = ensureLink("manifest");
    manifestLink.href = manifestUrl;

    const previousManifestUrl = manifestUrlRef.current;
    manifestUrlRef.current = manifestUrl;
    if (previousManifestUrl) {
      window.setTimeout(() => URL.revokeObjectURL(previousManifestUrl), 1000);
    }

    return () => {
      window.setTimeout(() => URL.revokeObjectURL(manifestUrl), 1000);
    };
  }, [logoOverride, platformSettings.logo, revisionKey, platformSettings.name]);

  return null;
}
