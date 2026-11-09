import type { Metadata } from "next";

import { JsonLd } from "@/components/public/json-ld";
import { ContentPage } from "@/components/public/marketing";
import type { ContentSection } from "@/components/public/marketing";
import type { Faq } from "@/lib/marketing-content";
import {
  faqSchema, organizationSchema, pageMetadata, schemaGraph, softwareApplicationSchema, webPageSchema,
} from "@/lib/seo";

const PAGE = {
  title: "Nursery & Primary School Management Software, Cameroon | EduIgnite",
  description:
    "School management software for nursery (maternelle) and primary schools in Cameroon: class-teacher registers, one-screen marks, conduct, health records, certificates. English and French.",
  path: "/primary-schools",
};

export const metadata: Metadata = pageMetadata(PAGE);

const SECTIONS: ContentSection[] = [
  {
    id: "class-teacher",
    title: "Built around the class teacher",
    blurb: "In a nursery or primary school one teacher looks after one class. EduIgnite works the same way.",
    items: [
      { icon: "users", title: "My class", body: "A class teacher is assigned to a class, not to subjects, and sees only that class's pupils." },
      { icon: "clipboard", title: "Class registers", body: "Take the daily register for the whole class from one screen." },
      { icon: "notebook", title: "Marks for all subjects on one screen", body: "A single grid per class instead of one screen per subject." },
    ],
  },
  {
    id: "records",
    title: "Pupil records and end of year",
    items: [
      { icon: "heart", title: "Conduct and health records", body: "Record conduct and each pupil's health information alongside their academic record." },
      { icon: "award", title: "Certificates", body: "Issue certificates for pupils from the same system." },
      { icon: "layers", title: "Promotion by class level", body: "Move pupils up through the school's class levels at the end of the year." },
      { icon: "notebook", title: "Report cards", body: "Report cards in English or French, with QR verification." },
      { icon: "users", title: "Pupils without a login", body: "Young pupils do not need their own account: parents and guardians follow them from theirs." },
    ],
  },
  {
    id: "school-life",
    title: "Fees, parents and the school website",
    items: [
      { icon: "wallet", title: "Fees and receipts", body: "Fees, instalments and receipts in CFA, with mobile money through Fapshi." },
      { icon: "message", title: "Parent portal and announcements", body: "Parents see attendance, results and fee balances and receive school notices." },
      { icon: "globe", title: "A public website for the school", body: "News, events, gallery and online enrollment, listed in the EduIgnite directory." },
    ],
  },
];

const FAQ: Faq[] = [
  {
    question: "Does EduIgnite work for nursery and primary schools?",
    answer:
      "Yes. A nursery or primary school (maternelle and primaire) uses a class-teacher workflow: the teacher is assigned to a class and handles its register, marks for all subjects, conduct, health records and report cards.",
  },
  {
    question: "Do primary teachers have to be assigned to subjects?",
    answer: "No. In nursery and primary schools a teacher is assigned to a class, which keeps the screens few and simple.",
  },
  {
    question: "Can a school run nursery, primary and secondary sections?",
    answer: "A school chooses its level when its account is set up. Contact us if your school has more than one section.",
  },
];

export default function PrimarySchoolsPage() {
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
            crumbs: [{ name: "Home", path: "/" }, { name: "Nursery & primary schools", path: PAGE.path }],
          }),
          faqSchema(FAQ),
        )}
      />
      <ContentPage
        eyebrow="Nursery & Primary / Maternelle et primaire"
        title="Nursery and primary school management software for Cameroon"
        blurb="Simple screens for class teachers, clear records for the head teacher, and a parent app for families."
        intro="EduIgnite treats nursery and primary schools as their own thing. Teachers get a small number of large screens for their class, and the school keeps registers, marks, conduct, health records, certificates and fees in one place."
        sections={SECTIONS}
        faq={FAQ}
        related={[
          { href: "/features", label: "All features" },
          { href: "/secondary-schools", label: "Secondary schools" },
          { href: "/school-websites", label: "School websites" },
          { href: "/schools?level=primary", label: "Nursery & primary schools on EduIgnite" },
        ]}
      />
    </>
  );
}
