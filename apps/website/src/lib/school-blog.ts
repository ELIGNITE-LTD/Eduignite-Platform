/**
 * Server-side readers for a school website's blog and configured leadership
 * (backend/apps/school_site_content). Public, no sign-in. Missing or
 * unpublished content simply comes back empty / null; pages show empty states,
 * never samples.
 */
import type { PublicLeader, SchoolLang } from "@/lib/public-schools";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export type BlogCategoryRef = { slug: string; name: string };

export type BlogCard = {
  slug: string;
  title: string;
  excerpt: string;
  cover: string | null;
  category: BlogCategoryRef | null;
  published_at: string | null;
  author_name: string;
  reading_time: number;
};

export type BlogList = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: BlogCard[];
  categories: Array<BlogCategoryRef & { count: number }>;
};

export type BlogPostDetail = BlogCard & {
  /** Already sanitised by the server (allow-list), on write and again on read. */
  body: string;
  updated_at: string;
  seo_title: string;
  seo_description: string;
  previous: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
  is_preview: boolean;
  languages: SchoolLang[];
};

const EMPTY_LIST: BlogList = { count: 0, page: 1, page_size: 9, total_pages: 1, results: [], categories: [] };

export async function fetchBlogList(
  slug: string,
  options: { lang: SchoolLang; page?: number; category?: string; pageSize?: number },
): Promise<BlogList> {
  try {
    const params = new URLSearchParams({ lang: options.lang });
    if (options.page && options.page > 1) params.set("page", String(options.page));
    if (options.category) params.set("category", options.category);
    if (options.pageSize) params.set("page_size", String(options.pageSize));
    const res = await fetch(`${API_BASE}/schools/public/${encodeURIComponent(slug)}/blog/?${params}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return EMPTY_LIST;
    return { ...EMPTY_LIST, ...(await res.json()) };
  } catch {
    return EMPTY_LIST;
  }
}

export async function fetchBlogPost(
  slug: string,
  postSlug: string,
  options: { lang: SchoolLang; postPreview?: string },
): Promise<BlogPostDetail | null> {
  try {
    const params = new URLSearchParams({ lang: options.lang });
    if (options.postPreview) params.set("post_preview", options.postPreview);
    const res = await fetch(
      `${API_BASE}/schools/public/${encodeURIComponent(slug)}/blog/${encodeURIComponent(postSlug)}/?${params}`,
      options.postPreview ? { cache: "no-store" } : { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as BlogPostDetail;
  } catch {
    return null;
  }
}

/** Published article addresses of every published school site, for the sitemap. */
export async function fetchBlogIndex(): Promise<Array<{ school: string; slug: string; published_at: string; updated_at: string }>> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/blog-index/`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * The leadership the school configured (name, title, optional photo, bio).
 * Empty when it configured none, so callers fall back to the derived list.
 */
export async function fetchConfiguredLeadership(slug: string, lang: SchoolLang): Promise<PublicLeader[]> {
  try {
    const res = await fetch(`${API_BASE}/schools/public/${encodeURIComponent(slug)}/leadership/?lang=${lang}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { leaders?: Array<{ name: string; title: string; photo: string | null; bio?: string; order: number }> };
    return (data.leaders ?? []).map((l, index) => ({
      name: l.name,
      title: l.title,
      photo: l.photo ?? null,
      order: typeof l.order === "number" ? l.order : index,
      bio: l.bio || undefined,
    }));
  } catch {
    return [];
  }
}
