/**
 * Public school profiles (backend/apps/schools/public_profile.py). Readable
 * without signing in; the backend only returns schools whose profile is live
 * and only their own descriptive and contact details.
 */

export type PublicSchool = {
  slug: string;
  name: string;
  short_name: string;
  motto: string;
  description: string;
  logo: string | null;
  banner: string | null;
  principal: string;
  location: string;
  region: string;
  division: string;
  sub_division: string;
  city_village: string;
  address: string;
  postal_code: string | null;
  phone: string;
  email: string;
  school_type: string;
  subsystem: string;
  founded_year: number | null;
  updated_at: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export async function fetchPublicSchool(slug: string): Promise<PublicSchool | null> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/${encodeURIComponent(slug)}/`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicSchool;
  } catch {
    return null;
  }
}

export type PublicStaffMember = { name: string; title: string; avatar: string | null };

/**
 * A school's opt-in public staff directory. Returns people only when the school
 * enabled its directory and each staff member personally opted in; names,
 * titles and photos only, never contact details.
 */
export async function fetchPublicSchoolStaff(
  slug: string,
): Promise<{ enabled: boolean; staff: PublicStaffMember[] }> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/${encodeURIComponent(slug)}/staff/`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return { enabled: false, staff: [] };
    return (await res.json()) as { enabled: boolean; staff: PublicStaffMember[] };
  } catch {
    return { enabled: false, staff: [] };
  }
}

export async function fetchPublicSchoolIndex(): Promise<{ slug: string; updated_at: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** An image address search engines and link previews can fetch (never a data: URL). */
export function absoluteImage(url?: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** "Buea, South West": the most specific place plus the region. */
export function schoolPlace(school: PublicSchool): string {
  return [school.city_village || school.location, school.region].filter(Boolean).join(", ");
}
