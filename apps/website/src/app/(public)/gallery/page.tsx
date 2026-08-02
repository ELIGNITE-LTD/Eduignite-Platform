import type { Metadata } from "next";
import { fetchGallery } from "@/lib/public-site";
import { EmptyNotice, PageHero, Section, SectionHeading } from "@/components/public/sections";
import { GalleryTile } from "@/components/public/content-cards";
import { Reveal } from "@/components/public/motion";

export const metadata: Metadata = {
  title: "Gallery | EduIgnite",
  description: "Photos and videos of EduIgnite in schools across Cameroon.",
};

export const revalidate = 600;

export default async function GalleryPage() {
  const items = await fetchGallery();
  const videos = items.filter((i) => i.type === "video");
  const images = items.filter((i) => i.type === "image");

  return (
    <>
      <PageHero
        eyebrow="Gallery"
        title="EduIgnite in the field"
        blurb="Photos and videos from schools using the platform, curated by the EduIgnite team."
      />

      {videos.length > 0 && (
        <Section surface="dark">
          <SectionHeading
            eyebrow="Watch"
            title="Videos"
            blurb="See how EduIgnite works and what it changes for a school."
            tone="light"
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {videos.map((item, i) => (
              <Reveal key={item.id} delay={(i % 2) * 110}>
                <GalleryTile item={item} />
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      <Section surface="grid">
        {images.length > 0 && (
          <SectionHeading
            eyebrow="Photos"
            title="From schools using EduIgnite"
            blurb="Hover or tap a photo to read what it shows."
          />
        )}

        {items.length === 0 ? (
          <EmptyNotice
            title="The gallery is empty for now"
            hint="Photos and videos added as Public Events by the EduIgnite team appear here."
          />
        ) : images.length === 0 ? null : (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((item, i) => (
              <Reveal key={item.id} delay={(i % 3) * 80}>
                <GalleryTile item={item} />
              </Reveal>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
