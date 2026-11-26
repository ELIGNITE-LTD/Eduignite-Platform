import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { fetchFounder } from "@/lib/public-site";
import { JsonLd } from "@/components/public/json-ld";
import { LinkIcon } from "@/components/public/social-icons";
import { Portrait, isCofounder, roleLabel } from "@/components/public/founders";
import { breadcrumbSchema, pageMetadata, schemaGraph, toDescription } from "@/lib/seo";

// A person's bio is edited by them and must show at once.
// Served from cache and refreshed in the background at most once a minute: the page starts instantly for visitors,
// and a founder's profile edit still shows up within about a minute.
export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const person = await fetchFounder(slug);
  if (!person) return { title: { absolute: "Team member not found | EduIgnite" }, robots: { index: false, follow: true } };
  return pageMetadata({
    title: `${person.name}, ${roleLabel(person)} | EduIgnite`,
    description: toDescription(person.bio, `${person.name} is ${roleLabel(person)} at EduIgnite.`),
    path: `/team/${slug}`,
    image: person.avatar || undefined,
    imageAlt: person.name,
    type: "profile" as never,
  });
}

export default async function TeamMemberPage({ params }: Params) {
  const { slug } = await params;
  const person = await fetchFounder(slug);
  if (!person) notFound();

  const lead = isCofounder(person);
  const links = (person.links ?? []).filter((l) => l.url.startsWith("https://"));
  const paragraphs = (person.bio ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const path = `/team/${slug}`;

  return (
    <article className="bg-white">
      <JsonLd
        data={schemaGraph(
          {
            "@type": "Person",
            name: person.name,
            jobTitle: roleLabel(person),
            ...(person.avatar ? { image: person.avatar } : {}),
            worksFor: { "@type": "Organization", name: "EduIgnite" },
            ...(links.length ? { sameAs: links.map((l) => l.url) } : {}),
          },
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "About", path: "/about" },
            { name: person.name, path },
          ]),
        )}
      />
      <header className="border-b border-slate-200 bg-gradient-to-b from-[#EAF3FA] to-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
          <Link href="/about#leadership" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the team
          </Link>
          <div className="mt-8 flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:text-left">
            <Portrait f={person} size="lg" />
            <div className="min-w-0">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                  lead ? "bg-[#67D0E4]/20 text-[#264D73]" : "bg-slate-100 text-slate-500"
                }`}
              >
                {lead ? "Co-Founder" : "Executive Staff"}
              </span>
              <h1 className="mt-3 font-serif text-3xl font-black leading-tight tracking-tight text-[#12314d] sm:text-4xl">{person.name}</h1>
              <p className="mt-1.5 text-base font-bold text-[#264D73] sm:text-lg">{roleLabel(person)}</p>
              {links.length > 0 && (
                <ul className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start" aria-label={`${person.name} online`}>
                  {links.map((l) => (
                    <li key={l.kind}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-bold text-[#264D73] shadow-sm transition-colors hover:border-[#67D0E4] hover:bg-[#67D0E4]/10 hover:text-[#0E7490] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#264D73]"
                      >
                        <LinkIcon kind={l.kind} className="h-4 w-4" /> {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-14">
        <h2 className="text-[11px] font-black uppercase tracking-[0.28em] text-[#0E7490]">Biography</h2>
        {paragraphs.length > 0 ? (
          <div className="mt-6 space-y-6">
            {paragraphs.map((paragraph, i) => (
              <p
                key={i}
                className={`whitespace-pre-line text-[17px] leading-[1.8] text-slate-700 ${
                  i === 0 ? "text-[19px] font-medium leading-[1.75] text-[#12314d]" : ""
                }`}
              >
                {paragraph}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-slate-500">This profile does not have a bio yet.</p>
        )}

        <nav aria-label="Keep exploring EduIgnite" className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-8">
          <Link href="/about#leadership" className="inline-flex items-center gap-2 font-bold text-[#264D73] hover:underline">
            Meet the rest of the team <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-[#264D73] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#12314d]">
            <Mail className="h-4 w-4" aria-hidden /> Contact EduIgnite
          </Link>
        </nav>
      </div>
    </article>
  );
}
