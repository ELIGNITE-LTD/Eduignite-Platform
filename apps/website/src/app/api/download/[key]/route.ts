/**
 * The endpoint behind every app "Download" button.
 *
 * The installer location comes from the platform's AppVersion record, the
 * same backend-controlled source the download pages read, so CI (or an
 * administrator) changes the link without touching this code. Before sending
 * anyone there it confirms the file really exists, then redirects on this
 * same host: installers are static files served by the web server under
 * /downloads/, so the browser keeps a same-origin stream (the progress bar can
 * read it) and 100+ MB never passes through the Next.js server.
 */

import { NextRequest, NextResponse } from "next/server";
import { APPS, getAppWithLatestRelease } from "@/lib/public-site";

export const dynamic = "force-dynamic";

const DOWNLOAD_HOSTS = new Set(["eduignite.online", "www.eduignite.online"]);

function unavailable(status: number, detail: string) {
  return NextResponse.json({ detail }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const known = APPS.find((app) => app.key === key && app.key !== "web");
  if (!known) return unavailable(404, "Unknown download.");

  const app = await getAppWithLatestRelease(known.key);
  if (!app?.href) return unavailable(404, "This download has not been published yet.");

  let target: URL;
  try {
    target = new URL(app.href);
  } catch {
    return unavailable(503, "This download is not available right now.");
  }
  if (!DOWNLOAD_HOSTS.has(target.hostname) || !target.pathname.startsWith("/downloads/")) {
    return unavailable(503, "This download is not available right now.");
  }

  const probe = await fetch(target.toString(), { method: "HEAD", cache: "no-store" }).catch(() => null);
  if (!probe?.ok) {
    return unavailable(503, "The installer is temporarily unavailable. Please try again in a few minutes.");
  }

  // A path-only Location resolves against whichever host the visitor is on
  // (apex or www), so the download always stays same-origin.
  return new NextResponse(null, {
    status: 302,
    headers: { Location: target.pathname, "Cache-Control": "no-store" },
  });
}
