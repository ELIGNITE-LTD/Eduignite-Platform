import Link from "next/link";
import { Mail, MapPin } from "lucide-react";
import { NAV_LINKS, SITE } from "@/lib/public-site";
import { BrandMark } from "./brand";

// Every app has its own page; linking them here keeps each one a click from
// anywhere on the site, with text that says what the page is.
const APP_LINKS = [
  { href: "/download/mobile", label: "EduIgnite Mobile for Android" },
  { href: "/download/desktop", label: "EduIgnite Desktop for Windows" },
  { href: "/download/offline", label: "EduIgnite Offline" },
  { href: "/download/companion", label: "EduIgnite Companion" },
  { href: "/download", label: "All EduIgnite apps" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#12314d] text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-5 lg:px-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            {/* The real mark, on a white tile — the logo's navy shield would
                otherwise disappear against the navy footer. */}
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1">
              <BrandMark size={28} className="h-full w-full object-contain" />
            </span>
            <span className="text-lg font-black tracking-tight">{SITE.name}</span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">{SITE.description}</p>
          <div className="mt-5 space-y-2 text-sm text-white/70">
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#67D0E4]" />
              <a href={`mailto:${SITE.email}`} className="hover:text-white">{SITE.email}</a>
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#67D0E4]" /> {SITE.location}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#67D0E4]">Explore</p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/70">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#67D0E4]">Apps</p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/70">
            {APP_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white">{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#67D0E4]">Get started</p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/70">
            <li><Link href="/login" className="hover:text-white">Login</Link></li>
            <li><Link href="/school-account-request" className="hover:text-white">Request a school account</Link></li>
            <li><Link href="/download" className="hover:text-white">Download the apps</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-white/60 sm:flex-row sm:px-6 lg:px-8">
          <p>© {year} {SITE.name}. All rights reserved.</p>
          <p>Powered by {SITE.poweredBy}</p>
        </div>
      </div>
    </footer>
  );
}
