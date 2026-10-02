import type { Metadata } from "next";
import { SITE_URL } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, GraduationCap, Languages, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { absoluteImage, fetchPublicSchool, schoolPlace, type PublicSchool } from "@/lib/public-schools";
import { resolveMediaUrl } from "@/lib/media";

/**
 * A school's public profile. It lives online and can be found by search
 * engines, but it is deliberately not linked from the site navigation: it is
 * each school's own page, not a section of the EduIgnite website.
 */

export const revalidate = 900;

type Params = { params: Promise<{ slug: string }> };

function summary(school: PublicSchool): string {
  const text = (school.description || school.motto || "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 158 ? `${text.slice(0, 155).trimEnd()}...` : text;
  const place = schoolPlace(school);
  return `${school.name} is a school${place ? ` in ${place}` : ""}, Cameroon.`;
}

function pageTitle(school: PublicSchool): string {
  const place = school.city_village || school.location;
  return place ? `${school.name}, ${place}` : school.name;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const school = await fetchPublicSchool(slug);
  if (!school) return { title: "School not found", robots: { index: false, follow: false } };

  const url = `${SITE_URL}/school/${school.slug}`;
  const description = summary(school);
  const image = absoluteImage(school.banner) || absoluteImage(school.logo);
  const title = pageTitle(school);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "EduIgnite",
      locale: "en_CM",
      images: image ? [{ url: image, alt: school.name }] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
    robots: { index: true, follow: true },
  };
}

function structuredData(school: PublicSchool) {
  const url = `${SITE_URL}/school/${school.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "School",
    name: school.name,
    alternateName: school.short_name || undefined,
    description: summary(school),
    url,
    logo: absoluteImage(school.logo) || undefined,
    image: absoluteImage(school.banner) || absoluteImage(school.logo) || undefined,
    telephone: school.phone || undefined,
    email: school.email || undefined,
    foundingDate: school.founded_year ? String(school.founded_year) : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: school.address || undefined,
      addressLocality: school.city_village || school.location || undefined,
      addressRegion: school.region || undefined,
      postalCode: school.postal_code || undefined,
      addressCountry: "CM",
    },
  };
}

function Fact({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#264D73]" aria-hidden />
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold text-[#12314d]">{value}</dd>
      </div>
    </div>
  );
}

export default async function PublicSchoolPage({ params }: Params) {
  const { slug } = await params;
  const school = await fetchPublicSchool(slug);
  if (!school) notFound();

  const logo = resolveMediaUrl(school.logo);
  const banner = resolveMediaUrl(school.banner);
  const place = schoolPlace(school);
  const paragraphs = (school.description || "").split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  const facts = [
    school.principal ? { icon: UserRound, label: "Principal", value: school.principal } : null,
    school.school_type ? { icon: GraduationCap, label: "School type", value: school.school_type } : null,
    school.subsystem ? { icon: Languages, label: "Subsystem", value: school.subsystem } : null,
    school.founded_year ? { icon: CalendarDays, label: "Founded", value: String(school.founded_year) } : null,
    place ? { icon: MapPin, label: "Location", value: place } : null,
  ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string }[];
  const addressLine = [school.address, school.city_village || school.location, school.postal_code]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <script
        type="application/ld+json"
        // Escaping "<" keeps school-supplied text from ever closing the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(school)).replace(/</g, "\\u003c") }}
      />

      <section className="relative isolate overflow-hidden border-b border-slate-200 bg-[#12314d]">
        {banner ? (
          <img src={banner} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#12314d]/70 via-[#12314d]/80 to-[#12314d]" aria-hidden />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-14 sm:flex-row sm:items-end sm:px-6 lg:px-8 lg:py-20">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white p-3 shadow-xl sm:h-28 sm:w-28">
            {logo ? (
              <img src={logo} alt={`${school.name} logo`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-2xl font-black text-[#264D73]">{(school.short_name || school.name).slice(0, 3)}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#0E7490]">School profile</p>
            <h1 className="mt-3 font-serif text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              {school.name}
            </h1>
            {school.motto ? <p className="mt-3 text-base italic text-white/75">&ldquo;{school.motto}&rdquo;</p> : null}
            {place ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/70">
                <MapPin className="h-4 w-4" aria-hidden /> {place}, Cameroon
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="bg-[#FBFCFE] py-14 lg:py-20">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          <article className="lg:col-span-2">
            <h2 className="font-serif text-2xl font-bold text-[#12314d]">About {school.short_name || school.name}</h2>
            {paragraphs.length ? (
              <div className="mt-5 space-y-4 text-[15px] leading-7 text-slate-700">
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-line">{paragraph}</p>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-[15px] leading-7 text-slate-500">
                {school.name} has not published a description yet.
              </p>
            )}
          </article>

          <aside className="space-y-6">
            {facts.length ? (
              <div className="rounded-3xl border border-slate-200 bg-white px-6 py-3">
                <dl className="divide-y divide-slate-100">
                  {facts.map((fact) => (
                    <Fact key={fact.label} {...fact} />
                  ))}
                </dl>
              </div>
            ) : null}

            {addressLine || school.phone || school.email ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6">
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[#12314d]">Contact</h2>
                <ul className="mt-4 space-y-3 text-sm text-slate-700">
                  {addressLine ? (
                    <li className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#264D73]" aria-hidden />
                      <span>{addressLine}</span>
                    </li>
                  ) : null}
                  {school.phone ? (
                    <li className="flex items-center gap-2.5">
                      <Phone className="h-4 w-4 shrink-0 text-[#264D73]" aria-hidden />
                      <a href={`tel:${school.phone.replace(/\s+/g, "")}`} className="font-semibold hover:text-[#264D73]">
                        {school.phone}
                      </a>
                    </li>
                  ) : null}
                  {school.email ? (
                    <li className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4 shrink-0 text-[#264D73]" aria-hidden />
                      <a href={`mailto:${school.email}`} className="break-all font-semibold hover:text-[#264D73]">
                        {school.email}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <p className="px-1 text-xs leading-relaxed text-slate-500">
              This profile is published by the school on EduIgnite. Staff, students and parents of{" "}
              {school.short_name || school.name} can{" "}
              <Link href="/login" className="font-semibold text-[#264D73] underline underline-offset-2">
                sign in to their account
              </Link>
              .
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
