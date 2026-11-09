import type { Metadata } from "next";

import { JsonLd } from "@/components/public/json-ld";
import { ContentPage } from "@/components/public/marketing";
import type { ContentSection } from "@/components/public/marketing";
import type { Faq } from "@/lib/marketing-content";
import {
  faqSchema, organizationSchema, pageMetadata, schemaGraph, webPageSchema,
} from "@/lib/seo";

const PAGE = {
  title: "School Website Builder for Cameroon Schools | EduIgnite",
  description:
    "Every school on EduIgnite can publish its own public website with news, events, gallery and online enrollment, and appear in the EduIgnite school directory.",
  path: "/school-websites",
};

export const metadata: Metadata = pageMetadata(PAGE);

const SECTIONS: ContentSection[] = [
  {
    id: "website",
    title: "A public website, part of your school account",
    items: [
      { icon: "globe", title: "Your own address", body: "Published at eduignite.online/schools/your-school, in English and French." },
      { icon: "megaphone", title: "News and blog", body: "Post news and announcements for families and the wider community." },
      { icon: "calendar", title: "Events and gallery", body: "Share upcoming events and photos from school life." },
      { icon: "users", title: "About and leadership", body: "Present the school's story, vision and mission, and the leadership team." },
    ],
  },
  {
    id: "admissions",
    title: "Online admissions",
    blurb: "Families apply from the school's website. Staff review applications inside EduIgnite.",
    items: [
      { icon: "inbox", title: "Enrollment form", body: "The school can switch online enrollment on or off." },
      { icon: "clipboard", title: "Review in one place", body: "Applications arrive in the admissions screen, ready for the school to accept and register." },
    ],
  },
  {
    id: "discovery",
    title: "Be found by families",
    items: [
      { icon: "layers", title: "School directory", body: "Published schools are listed in the EduIgnite school directory, filterable by region and level." },
      { icon: "shield", title: "You decide what is public", body: "A school stays private until it publishes, and chooses which contact details to show. Nothing about pupils or staff records is ever shown." },
    ],
  },
];

const FAQ: Faq[] = [
  {
    question: "Does every school on EduIgnite get a public website?",
    answer:
      "Every school can create one. It becomes public only when the school publishes it, and published schools appear in the EduIgnite school directory.",
  },
  {
    question: "Will my school appear on Google?",
    answer:
      "Published school pages are built so that search engines can read and index them, and they are listed in our sitemap. How and when a search engine shows a page is up to the search engine, and we cannot promise a ranking.",
  },
  {
    question: "Can families apply online?",
    answer: "Yes, if the school turns on online enrollment, families can apply from the school's website and the school reviews the application in EduIgnite.",
  },
];

export default function SchoolWebsitesPage() {
  return (
    <>
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          webPageSchema({
            name: PAGE.title,
            description: PAGE.description,
            path: PAGE.path,
            crumbs: [{ name: "Home", path: "/" }, { name: "School websites", path: PAGE.path }],
          }),
          faqSchema(FAQ),
        )}
      />
      <ContentPage
        eyebrow="School websites"
        title="A public website for every school on EduIgnite"
        blurb="News, events, gallery and online enrollment, published by the school and listed in the school directory."
        sections={SECTIONS}
        faq={FAQ}
        related={[
          { href: "/schools", label: "Browse the school directory" },
          { href: "/features", label: "All features" },
          { href: "/primary-schools", label: "Nursery & primary schools" },
          { href: "/secondary-schools", label: "Secondary schools" },
        ]}
      />
    </>
  );
}
