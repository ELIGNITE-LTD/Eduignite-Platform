import type { Metadata } from "next";

import { JsonLd } from "@/components/public/json-ld";
import { ContentPage } from "@/components/public/marketing";
import { FEATURE_GROUPS, SITE_FAQ } from "@/lib/marketing-content";
import {
  faqSchema, organizationSchema, pageMetadata, schemaGraph, softwareApplicationSchema, webPageSchema,
} from "@/lib/seo";

const PAGE = {
  title: "School Management Software Features | EduIgnite",
  description:
    "Everything EduIgnite does: attendance, marks, report cards with QR verification, fees and mobile money, parent app, school websites, offline work. Nursery, primary and secondary.",
  path: "/features",
};

export const metadata: Metadata = pageMetadata(PAGE);

export default function FeaturesPage() {
  return (
    <>
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          softwareApplicationSchema(),
          webPageSchema({
            name: PAGE.title,
            description: PAGE.description,
            path: PAGE.path,
            crumbs: [{ name: "Home", path: "/" }, { name: "Features", path: PAGE.path }],
          }),
          faqSchema(SITE_FAQ),
        )}
      />
      <ContentPage
        eyebrow="Features"
        title="Everything an all-in-one school management system should do"
        blurb="EduIgnite covers the academic year, the school office, families, the school's public website and the devices you use, for nursery, primary and secondary schools in Cameroon."
        sections={FEATURE_GROUPS}
        faq={SITE_FAQ}
        faqTitle="Frequently asked questions"
        related={[
          { href: "/primary-schools", label: "Nursery & primary schools" },
          { href: "/secondary-schools", label: "Secondary schools" },
          { href: "/school-websites", label: "School websites" },
          { href: "/schools", label: "School directory" },
          { href: "/school-management-system-cameroon", label: "School management system in Cameroon" },
          { href: "/logiciel-de-gestion-scolaire-cameroun", label: "En français" },
        ]}
      />
    </>
  );
}
