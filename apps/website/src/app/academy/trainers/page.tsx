import type { Metadata } from "next";
import { pageMetadata, schemaGraph, webPageSchema } from "@/lib/seo";
import { JsonLd } from "@/components/public/json-ld";
import { ShieldCheck } from "lucide-react";
import { fetchTrainers } from "@/app/academy/_lib/public-api";
import { AcademySiteFrame } from "@/app/academy/_components/site-frame";
import { Section, PageHero, EmptyNotice } from "@/components/public/sections";
import { Reveal } from "@/components/public/motion";

const PAGE = {
  title: "EduIgnite Academy Trainers | Verified Instructors",
  description:
    "Meet the verified EduIgnite Academy trainers — the credentialed instructors behind the Academy's role-based courses.",
  path: "/academy/trainers",
};

export const metadata: Metadata = pageMetadata(PAGE);

export const revalidate = 300;

export default async function TrainersDirectoryPage() {
  const trainers = await fetchTrainers();

  return (
    <AcademySiteFrame>
      <JsonLd data={schemaGraph(webPageSchema({ name: PAGE.title, description: PAGE.description, path: PAGE.path, type: "CollectionPage", crumbs: [{ name: "Home", path: "/" }, { name: "Academy", path: "/academy" }, { name: "Trainers", path: "/academy/trainers" }] }))} />
      <PageHero
        eyebrow="Trainer directory"
        title="Meet our verified trainers"
        blurb="Every trainer listed here has been reviewed and verified by the Academy team before their courses go live."
      />

      <Section surface="light">
        {trainers.length === 0 ? (
          <EmptyNotice
            title="No verified trainers yet"
            hint="Trainer profiles appear here once verified in the Academy CMS."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trainers.map((trainer, i) => (
              <Reveal key={trainer.id} delay={(i % 3) * 80}>
                <div className="flex h-full flex-col items-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#67D0E4]/50 hover:shadow-lg">
                  {trainer.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={trainer.photo_url}
                      alt={trainer.name}
                      className="h-20 w-20 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#67D0E4]/15 font-serif text-2xl font-bold text-[#264D73]">
                      {trainer.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-1.5">
                    <p className="font-serif text-base font-bold text-[#12314d]">{trainer.name}</p>
                    {trainer.is_verified && <ShieldCheck className="h-4 w-4 shrink-0 text-[#67D0E4]" />}
                  </div>
                  {trainer.credentials && (
                    <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#67D0E4]">
                      {trainer.credentials}
                    </p>
                  )}
                  {trainer.bio && (
                    <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-slate-600">{trainer.bio}</p>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </Section>
    </AcademySiteFrame>
  );
}
