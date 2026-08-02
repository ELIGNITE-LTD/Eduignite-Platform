import { resolveMediaUrl } from "@/lib/media";

/**
 * The real EduIgnite mark is the raster in `/icon.png` (identical bytes to
 * `/icons/eduignite-icon-512.png`).
 *
 * `/eduignite-logo.svg` is a hand-drawn approximation of it, and it sets the
 * wordmark as an SVG `<text>` element. SVG does not embed fonts, so that text
 * is re-rendered in whatever the viewer happens to have — in print, in PDF
 * exports and on machines without Inter it comes out in a fallback face at the
 * wrong weight and spacing, which is why it did not look like the logo. The
 * PNG is therefore the canonical mark; the SVG stays only so that any logo
 * value already stored pointing at it still resolves.
 */
export const EDUIGNITE_LOGO_PNG = "/icon.png";
export const EDUIGNITE_LOGO_MARK = EDUIGNITE_LOGO_PNG;

const FRONTEND_BRAND_ASSETS = [
  "/eduignite-logo.svg",
  EDUIGNITE_LOGO_PNG,
  "/apple-touch-icon.png",
  "/icons/eduignite-icon-192.png",
  "/icons/eduignite-icon-512.png",
];

export function resolvePlatformLogoUrl(logo?: string | null): string {
  const trimmed = logo?.trim();
  if (!trimmed) return EDUIGNITE_LOGO_MARK;

  if (FRONTEND_BRAND_ASSETS.some((asset) => trimmed === asset || trimmed.startsWith(`${asset}?`))) {
    return trimmed;
  }

  return resolveMediaUrl(trimmed) || EDUIGNITE_LOGO_MARK;
}
