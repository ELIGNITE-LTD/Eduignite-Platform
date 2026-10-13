"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Handshake, LineChart, LogIn, Share2, Sparkles, Users } from "lucide-react";
import { getPublicPartners, type PublicPartner } from "@/lib/partner/client";

const WHY = [
  { icon: Share2, title: "Extend our reach", note: "Introduce schools and communities to EduIgnite." },
  { icon: Users, title: "Grow together", note: "Marketing, institutional, technology, training and more." },
  { icon: LineChart, title: "See your impact", note: "Track the schools you bring on, from your own portal." },
];

export default function PartnersLanding() {
  const [partners, setPartners] = useState<PublicPartner[]>([]);
  useEffect(() => {
    getPublicPartners().then(setPartners).catch(() => setPartners([]));
  }, []);

  return (
    <>
      {/* Invitation */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-[#EAF3FA] to-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#67D0E4]/40 bg-[#67D0E4]/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#0E7490]">
            <Handshake className="h-4 w-4" /> Partnership programme
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-black tracking-tight text-[#12314d] sm:text-5xl">
            Help expand EduIgnite's educational impact
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            EduIgnite is looking for partners — individuals and organizations — who can help bring quality school
            management to more schools across Cameroon and beyond. If that's you, we'd love to work together.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/partners/apply"
              className="inline-flex items-center gap-2 rounded-full bg-[#12314d] px-7 py-4 text-[15px] font-bold text-white shadow-lg shadow-[#264D73]/20 transition-all hover:-translate-y-0.5 hover:bg-[#1c3c5c]"
            >
              <Sparkles className="h-4 w-4" /> Become a Partner Now
            </Link>
            <Link
              href="/partners/login"
              className="inline-flex items-center gap-2 rounded-full border border-[#264D73]/20 bg-white px-7 py-4 text-[15px] font-bold text-[#264D73] transition-all hover:-translate-y-0.5 hover:border-[#264D73]/40"
            >
              <LogIn className="h-4 w-4" /> Already a Partner? Partner Login
            </Link>
          </div>
        </div>
      </section>

      {/* Why partner */}
      <section className="bg-white py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {WHY.map(({ icon: Icon, title, note }) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#264D73]/8 text-[#264D73]">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-black text-[#12314d]">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Our partners */}
      {partners.length > 0 && (
        <section className="border-t border-slate-200 bg-[#F7F9FC] py-16">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black tracking-tight text-[#12314d]">Our partners</h2>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {partners.map((p) => (
                <Link
                  key={p.public_slug}
                  href={`/partners/${p.public_slug}`}
                  className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#264D73]/8 text-[#264D73]">
                    {p.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.logo_url} alt={p.public_name} className="h-full w-full object-contain p-1" />
                    ) : (
                      <Handshake className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-[#12314d] group-hover:text-[#264D73]">{p.public_name}</p>
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#0E7490]">{p.type}</p>
                    {p.public_description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.public_description}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-white py-16">
        <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-[#12314d] px-8 py-12 text-white">
            <h2 className="text-2xl font-black">Ready to partner with EduIgnite?</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-white/70">
              Tell us a little about you and how you'd like to work together. Our team reviews every application.
            </p>
            <Link
              href="/partners/apply"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[#264D73] hover:bg-slate-50"
            >
              Become a Partner Now <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
