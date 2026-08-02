/**
 * Same-origin streaming proxy for the app installers.
 *
 * GitHub's release-asset host does not send CORS headers, so a browser cannot
 * read the download stream directly to show progress. This route fetches the
 * newest release asset server-side and streams it straight back — passing the
 * upstream Content-Length through — so the download page can track real bytes
 * received and render an accurate progress bar. The body is piped, never
 * buffered, so even the ~175 MB desktop installer stays light on memory.
 */

import { NextRequest } from "next/server";
import { APPS, fetchLatestRelease } from "@/lib/public-site";

// Always resolve the live asset; never cache the binary itself.
export const dynamic = "force-dynamic";

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname;
    const last = decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
    return last || fallback;
  } catch {
    return fallback;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const app = APPS.find((a) => a.key === key);
  if (!app || !app.repo || !app.assetMatch) {
    return new Response("Unknown download.", { status: 404 });
  }

  // Prefer the newest published asset; fall back to the pinned link.
  const latest = await fetchLatestRelease(app.repo, app.assetMatch);
  const assetUrl = latest?.href || app.href;
  if (!assetUrl) {
    return new Response("This download is not available right now.", { status: 502 });
  }

  const upstream = await fetch(assetUrl, {
    headers: { Accept: "application/octet-stream" },
    redirect: "follow",
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("The installer could not be fetched from the release server.", { status: 502 });
  }

  const filename = filenameFromUrl(assetUrl, `${app.key === "mobile" ? "eduignite-mobile.apk" : "EduIgnite-Setup.exe"}`);
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(upstream.body, { status: 200, headers });
}
