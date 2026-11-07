import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Handshake } from "lucide-react";

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
const SITE = process.env.NEXT_PUBLIC_APP_URL || "https://eduignite.online";

async function fetchPartner(slug: string) {
  try {
    const res = await fetch(`${API}/partners/public/${encodeURIComponent(slug)}/`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as {
      public_slug: string; public_name: string; public_description: string;
      public_website: string; logo_url: string; type: string; applicant_kind: string;
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await fetchPartner(slug);
  if (!p) return { title: "Partner not found | EduIgnite" };
  const desc = (p.public_description || `${p.public_name} is a ${p.type} partner of EduIgnite.`).slice(0, 160);
  const url = `${SITE}/partners/${p.public_slug}`;
  return {
    title: `${p.public_name} — EduIgnite ${p.type} Partner`,
    description: desc,
    alternates: { canonical: url },
    openGraph: { title: p.public_name, description: desc, url, type: "profile", images: p.logo_url ? [{ url: p.logo_url }] : undefined },
  };
}

export default async function PartnerProfilePage({ params }: Params) {
  const { slug } = await params;
  const p = await fetchPartner(slug);
  if (!p) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: p.public_name,
    description: p.public_description || undefined,
    url: p.public_website || `${SITE}/partners/${p.public_slug}`,
    logo: p.logo_url || undefined,
    memberOf: { "@type": "Organization", name: "EduIgnite" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="border-b border-slate-200 bg-gradient-to-b from-[#EAF3FA] to-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
          <Link href="/partners" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline">
            <ArrowLeft className="h-4 w-4" /> All partners
          </Link>
          <div className="mt-8 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-slate-200">
              {p.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logo_url} alt={p.public_name} className="h-full w-full object-contain p-1" />
              ) : (
                <Handshake className="h-10 w-10 text-[#264D73]" />
              )}
            </div>
            <div>
              <span className="rounded-full bg-[#67D0E4]/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#0E7490]">
                {p.type} Partner
              </span>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-[#12314d] sm:text-4xl">{p.public_name}</h1>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-12">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
          {p.public_description && (
            <p className="whitespace-pre-line text-base leading-relaxed text-slate-700">{p.public_description}</p>
          )}
          {p.public_website && (
            <a href={p.public_website} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#264D73]/20 px-5 py-3 text-sm font-bold text-[#264D73] hover:bg-[#264D73]/5">
              Visit website <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <div className="mt-10 rounded-2xl bg-[#F7F9FC] p-6 text-center">
            <p className="text-sm font-semibold text-slate-600">An official partner of EduIgnite.</p>
            <Link href="/partners" className="mt-3 inline-block text-sm font-bold text-[#264D73] hover:underline">Become a partner →</Link>
          </div>
        </div>
      </section>
    </>
  );
}
