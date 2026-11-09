/**
 * Mobile subset of the website's lib/seo.ts. The app has no public pages, so
 * the only thing the authenticated screens need is the origin of the public
 * website, used to build the links to a school's public site (which the app
 * itself does not host). Override with NEXT_PUBLIC_PUBLIC_SITE_URL.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || "https://eduignite.online").replace(/\/+$/, "");
