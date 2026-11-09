import Link from "next/link";
import { NAV_LINKS, SITE, fetchPublicContactInfo } from "@/lib/public-site";
import { ContactFooterList } from "@/components/customer-care/contact-grid";
import type { ContactItem } from "@/lib/api/services/customer-care.service";
import { BrandMark } from "./brand";
import { LEGAL_PAGES } from "./legal-page";

// Every app has its own page; linking them here keeps each one a click from
// anywhere on the site, with text that says what the page is.
const APP_LINKS = [
  { href: "/download/mobile", label: "EduIgnite Mobile for Android" },
  { href: "/download/desktop", label: "EduIgnite Desktop for Windows" },
  { href: "/download/offline", label: "EduIgnite Offline" },
  { href: "/download/companion", label: "EduIgnite Companion" },
  { href: "/download", label: "All EduIgnite apps" },
];

const PRODUCT_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/primary-schools", label: "Nursery & primary schools" },
  { href: "/secondary-schools", label: "Secondary schools" },
  { href: "/school-websites", label: "School websites" },
  { href: "/schools", label: "School directory" },
  { href: "/school-management-system-cameroon", label: "School management system Cameroon" },
  { href: "/logiciel-de-gestion-scolaire-cameroun", label: "Logiciel de gestion scolaire" },
];

export async function SiteFooter() {
  const contactItems = (await fetchPublicContactInfo()) as ContactItem[];
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#12314d] text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:grid-cols-6 lg:px-8">
        <div className="md:col-span-3 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            {/* The real mark, on a white tile: the logo's navy shield would
                otherwise disappear against the navy footer. */}
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1">
              <BrandMark size={28} className="h-full w-full object-contain" />
            </span>
            <span className="text-lg font-black tracking-tight">{SITE.name}</span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">{SITE.description}</p>
          <ContactFooterList items={contactItems} />
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#67D0E4]">Product</p>
          <ul className="mt-4 space-y-2.5 text-sm text-white/70">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white">{link.label}</Link>
              </li>
            ))}
          </ul>
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
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {LEGAL_PAGES.map((page) => (
                <li key={page.href}>
                  <Link href={page.href} className="underline-offset-4 hover:text-white hover:underline">
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
