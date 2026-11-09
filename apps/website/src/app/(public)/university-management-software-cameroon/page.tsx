import type { Metadata } from "next";

import { JsonLd } from "@/components/public/json-ld";
import { ContentPage } from "@/components/public/marketing";
import type { ContentSection } from "@/components/public/marketing";
import type { Faq } from "@/lib/marketing-content";
import {
  faqSchema, organizationSchema, pageMetadata, schemaGraph, softwareApplicationSchema, webPageSchema,
} from "@/lib/seo";

const PAGE = {
  title: "University Management Software in Cameroon | EduIgnite",
  description:
    "Management software for universities and higher institutions in Cameroon: programmes, course units with credits, lecturers, students, semester grading (GPA 4.0 or out of 20), transcripts with QR verification and fees. English and French.",
  path: "/university-management-software-cameroon",
};

export const metadata: Metadata = {
  ...pageMetadata(PAGE),
  alternates: {
    canonical: PAGE.path,
    languages: {
      "en-CM": PAGE.path,
      "fr-CM": "/logiciel-de-gestion-universite-cameroun",
      "x-default": PAGE.path,
    },
  },
};

const SECTIONS: ContentSection[] = [
  {
    id: "academics",
    title: "Programmes, course units and semesters",
    blurb: "The academic structure of a Cameroonian university or higher institution, in one place.",
    items: [
      { icon: "layers", title: "Programmes and departments", body: "Set up the institution's programmes, with faculties or departments where you use them, and register students into the programme they follow." },
      { icon: "notebook", title: "Course units with credits", body: "Define each course unit with its credit value and the semester it belongs to, so results roll up the way your regulations expect." },
      { icon: "calendar", title: "Semesters", body: "Results are organised by semester within each academic year." },
      { icon: "graduation", title: "Cameroonian degree structures", body: "Built with the LMD cycle (Licence, Master, Doctorat) in mind, and usable for HND, BTS and other higher-institution programmes, in the English and French systems." },
    ],
  },
  {
    id: "people",
    title: "Lecturers and students",
    items: [
      { icon: "users", title: "Students", body: "One record per student, with the programme they are enrolled in." },
      { icon: "clipboard", title: "Lecturers", body: "Assign lecturers to course units so the right people enter marks for each one." },
      { icon: "languages", title: "English and French", body: "The interface and the documents the institution issues run in both official languages." },
    ],
  },
  {
    id: "results",
    title: "Grading and transcripts",
    items: [
      { icon: "award", title: "Grading on 4.0 or out of 20", body: "Grade on a 4.0 GPA scale or with marks out of 20, whichever your institution uses." },
      { icon: "qr", title: "Transcripts with QR verification", body: "Transcripts carry a QR code. Scanning it opens a public page that confirms the document is genuine, without needing an account." },
      { icon: "wallet", title: "Fees", body: "Record tuition and other fees in CFA with receipts and balances." },
    ],
  },
  {
    id: "online",
    title: "A public presence",
    items: [
      { icon: "globe", title: "Institution website and directory", body: "Publish a public website for the institution and be listed in the EduIgnite directory, where visitors can filter by higher education." },
    ],
  },
];

const FAQ: Faq[] = [
  {
    question: "Does EduIgnite support universities and higher institutions in Cameroon?",
    answer:
      "Yes. Universities and other higher institutions are a supported segment alongside primary and secondary schools. An institution manages programmes, course units with credits, lecturers, students, semester grading, transcripts and fees.",
  },
  {
    question: "Can we grade on a 4.0 GPA or out of 20?",
    answer:
      "Yes. Both grading approaches are supported, so an institution can use the one its regulations require.",
  },
  {
    question: "Are transcripts verifiable?",
    answer:
      "Yes. Transcripts carry a QR code. Scanning it opens a public page that confirms the document is genuine, without needing an account.",
  },
  {
    question: "Does it work for LMD, HND and BTS programmes?",
    answer:
      "It is structured around programmes, course units, credits and semesters, which fits the LMD cycle (Licence, Master, Doctorat). Institutions running HND, BTS or other programmes can set them up as programmes in the same way. Contact us if you want to confirm the fit for your institution.",
  },
  {
    question: "Is it available in French?",
    answer: "Yes. EduIgnite runs in English and French, in the interface and in the documents issued. See the French page: logiciel de gestion universitaire au Cameroun.",
  },
];

export default function UniversityManagementPage() {
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
            crumbs: [{ name: "Home", path: "/" }, { name: "Universities", path: PAGE.path }],
          }),
          faqSchema(FAQ),
        )}
      />
      <ContentPage
        eyebrow="Universities / Enseignement supérieur"
        title="University management software for Cameroon"
        blurb="Programmes, course units with credits, lecturers, students, semester grading and transcripts with QR verification, in English and French."
        intro="A university or higher institution organises its work around programmes, course units and semesters rather than classes and terms. EduIgnite follows that structure, so lecturers enter results for their course units and the institution can issue verifiable transcripts."
        sections={SECTIONS}
        faq={FAQ}
        related={[
          { href: "/logiciel-de-gestion-universite-cameroun", label: "En français : logiciel de gestion universitaire" },
          { href: "/features", label: "All features" },
          { href: "/secondary-schools", label: "Secondary schools" },
          { href: "/primary-schools", label: "Nursery & primary schools" },
          { href: "/schools?level=higher", label: "Higher institutions on EduIgnite" },
        ]}
      />
    </>
  );
}
