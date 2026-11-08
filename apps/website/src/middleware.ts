import { NextResponse, type NextRequest } from "next/server";

/**
 * One address for the site, and the favicon rewrite.
 *
 * Caddy answers on both `eduignite.online` and `www.eduignite.online`, and
 * until now both served the whole site with a 200. To a search engine that is
 * two sites with identical content: the ranking a page earns is split between
 * two addresses, and Google picks whichever it likes - it had indexed the www
 * one while every canonical tag, the sitemap and the Open Graph card all named
 * the bare domain.
 *
 * So www now redirects to the bare domain, permanently. A permanent redirect
 * is what passes the accumulated ranking of the www pages across, rather than
 * stranding it.
 */

const CANONICAL_HOST = "eduignite.online";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";

  if (host.toLowerCase().startsWith("www.")) {
    const url = request.nextUrl.clone();
    url.host = CANONICAL_HOST;
    url.port = "";
    url.protocol = "https";
    return NextResponse.redirect(url, 308);
  }

  if (request.nextUrl.pathname === "/favicon.ico") {
    const url = request.nextUrl.clone();
    url.pathname = "/favicon";
    return NextResponse.rewrite(url);
  }

  // A school site visitor who picks a language keeps it on later pages: the
  // switcher links carry ?lang=, and we remember it in a cookie.
  const lang = request.nextUrl.searchParams.get("lang");
  if (request.nextUrl.pathname.startsWith("/schools/") && (lang === "en" || lang === "fr")) {
    const response = NextResponse.next();
    response.cookies.set("school_lang", lang, { path: "/schools", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the files search engines fetch
  // directly, so the host redirect applies to real pages without adding a hop
  // to every script and image.
  matcher: ["/((?!_next/static|_next/image|favicon/|icons/|images/).*)"],
};
