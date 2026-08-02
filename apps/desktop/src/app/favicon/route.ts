import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FALLBACK_CONTENT_TYPE = "image/png";

function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:8000/api/v1").replace(/\/+$/, "");
}

function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;

  const contentType = match[1] || FALLBACK_CONTENT_TYPE;
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const bytes = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf-8");

  return { bytes, contentType };
}

async function fetchWithTimeout(url: string, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPlatformLogo() {
  const apiBase = getApiBaseUrl();
  const settingsResponse = await fetchWithTimeout(`${apiBase}/platform/settings/`);
  if (!settingsResponse.ok) return null;

  const settings = await settingsResponse.json();
  const logo = typeof settings?.logo === "string" ? settings.logo.trim() : "";
  if (!logo) return null;

  if (logo.startsWith("data:")) {
    return decodeDataUrl(logo);
  }

  const apiOrigin = new URL(apiBase).origin;
  const logoUrl = new URL(logo, apiOrigin).href;
  const logoResponse = await fetchWithTimeout(logoUrl);
  if (!logoResponse.ok) return null;

  const contentType = logoResponse.headers.get("content-type") || FALLBACK_CONTENT_TYPE;
  const bytes = Buffer.from(await logoResponse.arrayBuffer());
  return { bytes, contentType };
}

async function fallbackIcon() {
  const bytes = await readFile(path.join(process.cwd(), "public", "icon.png"));
  return { bytes, contentType: FALLBACK_CONTENT_TYPE };
}

export async function GET() {
  let icon = null;

  try {
    icon = await fetchPlatformLogo();
  } catch {
    icon = null;
  }

  const resolvedIcon = icon || await fallbackIcon();

  return new Response(new Uint8Array(resolvedIcon.bytes), {
    headers: {
      "Content-Type": resolvedIcon.contentType,
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

