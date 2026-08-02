import { BASE_URL } from "@/lib/api/client";

function getApiOrigin(): string {
  const configuredBase = BASE_URL?.trim();
  if (configuredBase) {
    try {
      return new URL(configuredBase).origin;
    } catch {
      // Fall back below when BASE_URL is not an absolute URL.
    }
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

export function resolveMediaUrl(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}${trimmed}`;
    }
    return `https:${trimmed}`;
  }

  const origin = getApiOrigin();
  if (!origin) return trimmed;

  if (trimmed.startsWith("/")) {
    return `${origin}${trimmed}`;
  }

  return `${origin}/${trimmed.replace(/^\/+/, "")}`;
}
