import { permanentRedirect } from "next/navigation";

/**
 * The old address of a school's public profile. The canonical address is
 * /schools/{slug}; next.config.ts already redirects it with a 308, and this
 * file is the fallback if that rule is ever removed.
 */
export default async function LegacySchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/schools/${encodeURIComponent(slug)}`);
}
