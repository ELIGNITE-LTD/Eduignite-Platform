import type { Metadata } from "next";

import { JsonLd } from "@/components/public/json-ld";
import { ContentPage } from "@/components/public/marketing";
import type { ContentSection } from "@/components/public/marketing";
import type { Faq } from "@/lib/marketing-content";
import {
  faqSchema, organizationSchema, pageMetadata, schemaGraph, softwareApplicationSchema, webPageSchema,
} from "@/lib/seo";

const PAGE = {
  title: "Secondary School Management System, Cameroon | EduIgnite",
  description:
    "Secondary school management system for Cameroon: sequences and terms, coefficients, subject teachers, class masters, report cards with QR verification, exams and online classes.",
  path: "/secondary-schools",
};

export const metadata: Metadata = pageMetadata(PAGE);

const SECTIONS: ContentSection[] = [
  {
    id: "academics",
    title: "The Cameroonian secondary school year",
    items: [
      { icon: "calendar", title: "Sequences and terms", body: "Six sequences over three terms, with averages, ranks and remarks calculated for you." },
      { icon: "notebook", title: "Coefficients and subjects", body: "Subjects with coefficients, taught by subject teachers assigned to each class." },
      { icon: "users", title: "Class masters", body: "Each class has a class master who follows its pupils and their results." },
      { icon: "qr", title: "Report cards with QR verification", body: "Official bilingual report cards and transcripts that anyone can verify by scanning the QR code." },
    ],
  },
  {
    id: "teaching",
    title: "Exams, online classes and AI tools",
    items: [
      { icon: "clipboard", title: "Exams and assignments", body: "Set assignments with deadlines and run exams from the same system." },
      { icon: "video", title: "Online classes", body: "Schedule and run live classes, with students and parents notified." },
      { icon: "sparkles", title: "AI exam generator and assistant", body: "Optional AI tools help teachers prepare papers. They need an internet connection." },
    ],
  },
  {
    id: "office",
    title: "Administration, fees and families",
    items: [
      { icon: "layers", title: "Dashboards by role", body: "Principal, discipline master, teachers, bursar, librarian, students and parents each get their own workspace." },
      { icon: "wallet", title: "Fees and mobile money", body: "Fees, receipts and balances in CFA, with mobile money through Fapshi." },
      { icon: "library", title: "Library", body: "Book lending with overdue tracking." },
      { icon: "card", title: "QR student ID cards", body: "Printable ID cards that can be verified." },
      { icon: "globe", title: "School website and admissions", body: "A public website with online enrollment, listed in the EduIgnite directory." },
    ],
  },
];

const FAQ: Faq[] = [
  {
    question: "Is EduIgnite a secondary school management system?",
    answer:
      "Yes. It follows how a Cameroonian secondary school runs: sequences and terms, coefficients, subject teachers, class masters, report cards and transcripts in English and French.",
  },
  {
    question: "Are report cards verifiable?",
    answer: "Yes. Report cards and transcripts carry a QR code. Scanning it opens a public page that confirms the document is genuine, without needing an account.",
  },
  {
    question: "Do the AI tools work offline?",
    answer: "No. AI tools need an internet connection. The rest of the school records can be saved offline and sync when you are back online.",
  },
];

export default function SecondarySchoolsPage() {
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
            crumbs: [{ name: "Home", path: "/" }, { name: "Secondary schools", path: PAGE.path }],
          }),
          faqSchema(FAQ),
        )}
      />
      <ContentPage
        eyebrow="Secondary / Secondaire"
        title="Secondary school management system for Cameroon"
        blurb="Sequences, coefficients, class masters, report cards and exams, in English and French."
        intro="Secondary schools run on subject teachers, class masters and a sequence-based calendar. EduIgnite is organised the same way, so teachers enter marks for their subjects and the school gets complete, verifiable report cards."
        sections={SECTIONS}
        faq={FAQ}
        related={[
          { href: "/features", label: "All features" },
          { href: "/primary-schools", label: "Nursery & primary schools" },
          { href: "/school-websites", label: "School websites" },
          { href: "/schools?level=secondary", label: "Secondary schools on EduIgnite" },
        ]}
      />
    </>
  );
}
