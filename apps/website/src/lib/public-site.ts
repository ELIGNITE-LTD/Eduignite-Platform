/**
 * Configuration for the public (marketing) website.
 *
 * Download links point at the public GitHub releases for each app. The version
 * and size shown on the site are refreshed from the releases API at runtime, so
 * the page never advertises a stale build; the values here are the fallback.
 */

export const SITE = {
  name: "EduIgnite",
  tagline: "One platform for the whole school",
  description:
    "EduIgnite brings students, teachers, parents and staff into one connected system — admissions, attendance, marks, report cards, fees, messaging and more, on web, desktop and mobile.",
  email: "eduignitecmr@gmail.com",
  location: "Bamenda, Cameroon",
  poweredBy: "EduIgnite",
} as const;

/**
 * The account-setup guide offered alongside every app download. A PDF served
 * from /public, generated from the official user manual.
 */
export const SETUP_GUIDE = {
  href: "/EduIgnite-Account-Setup-Guide.pdf",
  name: "EduIgnite Account Setup Guide",
  size: "1.0 MB",
  blurb:
    "Step-by-step help for signing in and setting up your account — for administrators, teachers, students and parents.",
} as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/download", label: "Download" },
  { href: "/gallery", label: "Gallery" },
  { href: "/blog", label: "Blog" },
  { href: "/testimonials", label: "Stories" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export type PublicApp = {
  key: "mobile" | "desktop" | "web" | "offline";
  name: string;
  platform: string;
  blurb: string;
  requirements: string;
  /** Fallback values — refreshed live from GitHub releases where applicable. */
  version: string;
  size: string;
  href: string;
  /** GitHub repo used to look up the newest release (owner/name). */
  repo?: string;
  assetMatch?: string;
  cta: string;
  steps: string[];
  /** ISO date of the release currently advertised, when known. */
  publishedAt?: string;
};

export const APPS: PublicApp[] = [
  {
    key: "mobile",
    name: "EduIgnite Mobile",
    platform: "Android",
    blurb:
      "The full school in your pocket. Parents follow their child, teachers mark and message, students see assignments and results — with offline support.",
    requirements: "Android 7.0 or newer",
    version: "v1.0.51",
    size: "8.2 MB",
    href: "https://eduignite.online/downloads/eduignite-mobile.apk",
    repo: "Ndimih-Boclair-Nghochu/eduignite-real-mobile-application",
    assetMatch: ".apk",
    cta: "Download for Android",
    steps: [
      "Tap the download button to get the APK file.",
      "Open the file and allow installs from your browser if prompted.",
      "Install, then sign in with the matricule your school gave you.",
    ],
  },
  {
    key: "desktop",
    name: "EduIgnite Desktop",
    platform: "Windows",
    blurb:
      "The administrator's command centre. Manage the whole school, print report cards and ID cards, and keep working when the internet drops.",
    requirements: "Windows 10 or 11 (64-bit)",
    version: "v1.0.1",
    size: "79 MB",
    href: "https://eduignite.online/downloads/EduIgnite-Setup-1.0.0.exe",
    repo: "Ndimih-Boclair-Nghochu/Eduignite-desktop-application",
    assetMatch: ".exe",
    cta: "Download for Windows",
    steps: [
      "Download the installer (EduIgnite-Setup).",
      "Run it — if Windows shows a warning, choose “More info → Run anyway”.",
      "Launch EduIgnite and sign in with your school account.",
    ],
  },
  {
    key: "web",
    name: "EduIgnite Web",
    platform: "Any browser",
    blurb:
      "Nothing to install. Open EduIgnite in any modern browser on a phone, tablet or computer and sign straight in.",
    requirements: "Chrome, Edge, Firefox or Safari",
    version: "Always up to date",
    size: "No install",
    href: "/login",
    cta: "Open the web app",
    steps: [
      "Click “Open the web app”.",
      "Sign in with your matricule and password.",
      "Add it to your home screen for quick access.",
    ],
  },
  {
    key: "offline",
    name: "EduIgnite Offline",
    platform: "Windows (offline-first)",
    blurb:
      "Run the whole school with zero internet — student records, attendance, marks, report cards and fees, all stored securely on the office computer. Not a replacement for EduIgnite; a way to start today and move to the cloud whenever you're ready.",
    requirements: "Windows 10 or 11 (64-bit), no internet required",
    // No public release yet — this product is still being built. Deliberately
    // no repo/assetMatch here so getAppsWithLatestReleases() and the download
    // proxy route skip it, same as the "web" entry above.
    version: "Coming soon",
    size: "—",
    href: "/download/offline",
    cta: "See EduIgnite Offline",
    steps: [
      "Download the installer.",
      "Install — it works immediately, no account needed to start.",
      "Activate your free first year using the Companion app's QR scanner once you have your School ID.",
    ],
  },
];

export const FEATURES = [
  { icon: "Users", title: "Student Records", desc: "Complete student profiles with guardians, photos and admission details, plus official QR-verified student ID cards." },
  { icon: "ClipboardCheck", title: "Attendance", desc: "Record daily attendance per class and track presence, absence and lateness across the term." },
  { icon: "NotebookPen", title: "Marks & Report Cards", desc: "Enter sequence marks and generate official bilingual Cameroon report cards with averages, positions, coefficients and remarks." },
  { icon: "ShieldCheck", title: "QR Verification", desc: "Every report card and ID card carries a QR code that anyone can scan to confirm the document is genuine — no login needed." },
  { icon: "GraduationCap", title: "Assignments & Exams", desc: "Set assignments with deadlines, grade submissions, and run online exams with AI-assisted question generation." },
  { icon: "CalendarDays", title: "Timetable", desc: "Build the teaching timetable period by period, and let staff, students and parents see the classes that concern them." },
  { icon: "Video", title: "Live Classes", desc: "Schedule and run live lessons, with the whole class and their parents notified automatically." },
  { icon: "Wallet", title: "Fees & Mobile Money", desc: "Track school fees, accept mobile-money payments, issue receipts and send reminders automatically." },
  { icon: "MessageCircle", title: "Messaging & Groups", desc: "Secure direct and group chat for staff, students and parents, with attachments, reactions and class groups." },
  { icon: "BellRing", title: "Parent Notifications", desc: "Every notification sent to a student also reaches their parents and guardians, addressed by their own child's name." },
  { icon: "Trophy", title: "Honour Roll & Rewards", desc: "Publish end-of-year results, recognise top performers and keep an academic reward registry." },
  { icon: "Archive", title: "Transcripts & Archive", desc: "Official transcripts and a permanent academic archive — past report cards and previous class records stay available after promotion." },
  { icon: "Library", title: "Digital Library", desc: "Catalogue books, manage lending and returns, and let the system chase overdue copies." },
  { icon: "Sparkles", title: "AI Assistance", desc: "Study plans, performance insights, career-orientation reports and exam preparation, powered by AI." },
  { icon: "WifiOff", title: "Works Offline", desc: "Keep working through power and network cuts — changes sync automatically when you reconnect." },
  { icon: "Laptop", title: "EduIgnite Offline", desc: "A separate Windows app for schools with no reliable internet at all — runs the full school locally, free for the first year, and migrates losslessly to the cloud later." },
  { icon: "Languages", title: "Bilingual", desc: "Built for Cameroon with English and French throughout, including official bilingual documents." },
];

export const ROLES = [
  { title: "School Administrators", desc: "Run the whole school from one command centre — students, staff, classes, fees and insights." },
  { title: "Teachers", desc: "Attendance, marks, assignments and exams in a single workflow, with less paperwork." },
  { title: "Students", desc: "Assignments, results, timetable, library and AI study tools in one place." },
  { title: "Parents", desc: "Follow your child's progress, attendance and fees, and get every school message." },
  { title: "Bursars", desc: "Collect fees by mobile money, issue receipts and see revenue at a glance." },
  { title: "Librarians", desc: "Manage the collection and lending with automatic overdue tracking." },
];

export const STEPS = [
  { title: "Get your school account", desc: "Request an account and we set your school up on EduIgnite with your details and branding." },
  { title: "Download the apps", desc: "Install the Windows app for the office and the Android app for staff, students and parents." },
  { title: "Add your school", desc: "Register classes, subjects, staff and students — or let us help you import them." },
  { title: "Run your school", desc: "Take attendance, enter marks, print report cards, collect fees and message families." },
];

/** Newest release info for an app, fetched from the public GitHub releases API. */
export async function fetchLatestRelease(
  repo: string,
  assetMatch: string
): Promise<{ version: string; size: string; href: string; publishedAt: string } | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      // Shared server-side cache: visitors no longer each spend a call against
      // GitHub's unauthenticated rate limit, and the figures are correct on
      // first paint instead of flashing the fallback.
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const asset = (data.assets || []).find((a: any) => String(a.name || "").toLowerCase().endsWith(assetMatch));
    if (!asset) return null;
    const mb = asset.size ? `${(asset.size / (1024 * 1024)).toFixed(1)} MB` : "";
    return {
      version: data.tag_name || "",
      size: mb,
      href: asset.browser_download_url,
      publishedAt: data.published_at || "",
    };
  } catch {
    return null;
  }
}

/**
 * Every app with its advertised version, size and link refreshed from the
 * newest published release. Falls back to the values above for any app whose
 * release cannot be read, so the page always offers a working download.
 */
export async function getAppsWithLatestReleases(): Promise<PublicApp[]> {
  return Promise.all(
    APPS.map(async (app) => {
      if (!app.repo || !app.assetMatch) return app;
      const latest = await fetchLatestRelease(app.repo, app.assetMatch);
      if (!latest) return app;
      return {
        ...app,
        version: latest.version || app.version,
        size: latest.size || app.size,
        href: latest.href || app.href,
        publishedAt: latest.publishedAt || undefined,
      };
    })
  );
}

/** The single app for a dedicated download page, with its latest release. */
export async function getAppWithLatestRelease(key: PublicApp["key"]): Promise<PublicApp | null> {
  const app = APPS.find((a) => a.key === key);
  if (!app) return null;
  if (!app.repo || !app.assetMatch) return app;
  const latest = await fetchLatestRelease(app.repo, app.assetMatch);
  if (!latest) return app;
  return {
    ...app,
    version: latest.version || app.version,
    size: latest.size || app.size,
    href: latest.href || app.href,
    publishedAt: latest.publishedAt || undefined,
  };
}

/** Headline platform figures shown on the home page. */
export type PlatformStats = {
  schools: number;
  students: number;
  teachers: number;
  users: number;
  regions: number;
};

/**
 * Live platform-wide counts from the public stats endpoint.
 *
 * Returns null when the API cannot be reached, and the page then hides the
 * figures entirely. A marketing page must never show invented or stale-zero
 * numbers, so there is deliberately no hard-coded fallback here.
 */
export async function fetchPlatformStats(): Promise<PlatformStats | null> {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  try {
    const res = await fetch(`${base}/platform/public-stats/`, {
      // Matches the server-side cache window, so the site stays fresh
      // without querying the database on every visit.
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const stats: PlatformStats = {
      schools: Number(data.schools) || 0,
      students: Number(data.students) || 0,
      teachers: Number(data.teachers) || 0,
      users: Number(data.users) || 0,
      regions: Number(data.regions) || 0,
    };
    // An all-zero response means the platform has no live data to show yet;
    // showing zeros would read as a broken page.
    return stats.users > 0 ? stats : null;
  } catch {
    return null;
  }
}


/* ------------------------------------------------------------------ *
 * Public content — testimonials, blog and gallery.
 *
 * All of it comes from what founders have already approved or published in
 * their own accounts: testimonies approved in the Testimonials screen, posts
 * published in Community, and images/videos curated as Public Events. Nothing
 * on the marketing site is authored separately from the platform.
 * ------------------------------------------------------------------ */

export type Testimonial = {
  id: string;
  name: string;
  role: string;
  school: string;
  message: string;
  rating: number;
  avatar: string;
};

export type BlogSummary = {
  slug: string;
  title: string;
  image: string;
  video_url: string;
  excerpt: string;
  author: string;
  /** Profile picture of the person who posted it, when they have one. */
  author_avatar: string;
  /** Their platform role — "Teacher", "School Administrator", a founder title… */
  author_role: string;
  published_at: string;
};

export type BlogPost = Omit<BlogSummary, "excerpt"> & { paragraphs: string[] };

export type GalleryItem = {
  id: string;
  type: "image" | "video";
  title: string;
  description: string;
  url: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/**
 * Fetch public JSON, returning `fallback` whenever the API cannot be read.
 * Pass revalidate = 0 to always fetch live (no cache) for data that must
 * reflect changes immediately.
 */
async function publicJson<T>(path: string, fallback: T, revalidate = 600): Promise<T> {
  try {
    const init: RequestInit =
      revalidate === 0 ? { cache: "no-store" } : { next: { revalidate } };
    const res = await fetch(`${API_BASE}${path}`, init);
    if (!res.ok) return fallback;
    const data = await res.json();
    return (data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function fetchTestimonials(): Promise<Testimonial[]> {
  return publicJson<Testimonial[]>("/platform/public-testimonials/", []);
}

export function fetchBlogPosts(): Promise<BlogSummary[]> {
  return publicJson<BlogSummary[]>("/platform/public-blog/", []);
}

export function fetchGallery(): Promise<GalleryItem[]> {
  return publicJson<GalleryItem[]>("/platform/public-gallery/", []);
}

export type Founder = {
  name: string;
  title: string;
  role: string;
  avatar: string;
  is_primary: boolean;
  /**
   * Only the CEO and CTO co-founded EduIgnite; everyone else is executive
   * staff. Optional because older backends do not send it — the client falls
   * back to `role`, which every version returns.
   */
  is_cofounder?: boolean;
};

export function fetchFounders(): Promise<Founder[]> {
  // revalidate = 0: founder/executive profile edits and activations must show
  // on the public site immediately, with no cache delay.
  return publicJson<Founder[]>("/platform/public-founders/", [], 0);
}

/** Submit the public contact form. Client-side; returns a friendly message. */
export async function submitContactMessage(payload: {
  name: string;
  email: string;
  subject?: string;
  message: string;
}): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${API_BASE}/platform/public-contact/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, detail: data?.detail || (res.ok ? "Message sent." : "Could not send your message.") };
  } catch {
    return { ok: false, detail: "Could not reach the server. Please try again." };
  }
}

export async function fetchBlogPost(slug: string): Promise<BlogPost | null> {
  return publicJson<BlogPost | null>(`/platform/public-blog/${slug}/`, null);
}

/** Turn a YouTube/Vimeo link into something an <iframe> can embed. */
export function toEmbedUrl(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube.com/embed${parsed.pathname}`;
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (parsed.pathname.startsWith("/embed/")) return url;
    }
    if (host.endsWith("vimeo.com")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}
