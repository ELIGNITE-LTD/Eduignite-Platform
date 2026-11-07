import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Languages,
  Library,
  MessageCircle,
  NotebookPen,
  QrCode,
  ShieldCheck,
  Users,
  Wallet,
  WifiOff,
} from "lucide-react";

import { JsonLd } from "@/components/public/json-ld";
import { PageHero, Section, SectionHeading } from "@/components/public/sections";
import {
  faqSchema,
  organizationSchema,
  pageMetadata,
  schemaGraph,
  softwareApplicationSchema,
  webPageSchema,
} from "@/lib/seo";

/**
 * The page for someone searching "school management system in Cameroon".
 *
 * The home page sells EduIgnite to a visitor who already knows the name. This
 * one answers the question a head teacher types into Google before they know
 * any name at all: what these systems do, what a Cameroonian school needs one
 * to handle - GCE and BEPC sequences, two subsystems, two languages, fees in
 * CFA, power and network that come and go - and what it takes to start.
 *
 * Everything here is what the platform actually does. A page that ranks by
 * promising more than the product delivers costs more than it earns.
 */

const PAGE = {
  title: "School Management System in Cameroon | EduIgnite",
  description:
    "Bilingual school management system for nursery, primary and secondary schools in Cameroon: attendance, report cards and fees in CFA. Universities coming soon.",
  path: "/school-management-system-cameroon",
};

export const metadata: Metadata = {
  ...pageMetadata(PAGE),
  alternates: {
    canonical: PAGE.path,
    languages: {
      "en-CM": PAGE.path,
      "fr-CM": "/logiciel-de-gestion-scolaire-cameroun",
      "x-default": PAGE.path,
    },
  },
};

const WHAT_IT_HANDLES = [
  {
    icon: Users,
    title: "Students and admissions",
    body: "One record per learner with guardians, photo and admission details, from the day they are registered to the day they leave. Each student gets a QR-verified ID card.",
  },
  {
    icon: ClipboardCheck,
    title: "Attendance",
    body: "Teachers take the register from a phone in class, period by period. Parents are told the same day when a child is absent, in the app rather than by rumour.",
  },
  {
    icon: NotebookPen,
    title: "Marks and report cards",
    body: "Sequence marks entered once, then averages, positions, remarks and the class profile are calculated for you. Report cards and transcripts print in the official bilingual layout.",
  },
  {
    icon: Wallet,
    title: "Fees and receipts",
    body: "Record a payment in CFA and the receipt prints immediately. The ledger shows at a glance who has paid, who is part-paid and who owes, by class or by school.",
  },
  {
    icon: MessageCircle,
    title: "Messaging and announcements",
    body: "Staff, parents and students in one place, so a notice reaches the people it concerns instead of a WhatsApp group nobody reads.",
  },
  {
    icon: Library,
    title: "Library and documents",
    body: "Lending with automatic overdue tracking, plus every official document the school issues, each one verifiable from its QR code.",
  },
];

const BUILT_FOR_CAMEROON = [
  {
    icon: Languages,
    title: "English and French, everywhere",
    body: "Not a translated menu over an English system. Both languages run through the interface and through the documents the school issues, because a bilingual country issues bilingual paperwork.",
  },
  {
    icon: WifiOff,
    title: "It keeps working when the power does not",
    body: "Registers, payments, receipts and marks recorded during a cut are kept on the device and sync the moment the connection returns. There is also a fully offline desktop edition for schools with no reliable internet at all.",
  },
  {
    icon: ShieldCheck,
    title: "The Cameroonian school year",
    body: "Three terms, six sequences, first and second cycle, the general and technical subsystems, coefficients and the marking scale your teachers already use.",
  },
  {
    icon: QrCode,
    title: "Documents anyone can check",
    body: "A report card, transcript or ID card carries a QR code. Scan it and the platform confirms whether the document is genuine, which matters when a result slip decides an admission.",
  },
];

const COMPARE = [
  ["What the school runs on today", "What changes with EduIgnite"],
  ["Marks in exercise books, averages worked out by hand each sequence", "Marks entered once; averages, positions and remarks calculated"],
  ["Report cards typed in Word, one file per student", "Report cards generated for a whole class in the official layout"],
  ["Fees in a cash book, receipts on a duplicate pad", "Payments recorded once, receipt printed, balance visible per class"],
  ["Parents learn how a child is doing at the end of term", "Parents see attendance, marks and fees as they happen"],
  ["Records in an office, reachable only from that office", "The same records on web, Android and Windows"],
];

const FAQ = [
  {
    question: "What is a school management system?",
    answer:
      "A school management system keeps a school's records and daily work in one place: students and their guardians, staff, attendance, marks, report cards, fees, timetable, library and communication with families. Instead of separate books, files and spreadsheets, the information is entered once and everyone who needs it - the administration, teachers, parents and students - sees the part that concerns them.",
  },
  {
    question: "Does EduIgnite work for schools in Cameroon specifically?",
    answer:
      "Yes. EduIgnite is built for Cameroon rather than adapted to it: English and French throughout, the three-term and six-sequence year, first and second cycle, the general and technical subsystems, fees in CFA, and report cards and transcripts in the official bilingual layout.",
  },
  {
    question: "Does EduIgnite work for nursery and primary schools?",
    answer:
      "Yes. EduIgnite is built for nursery (maternelle), primary (primaire) and secondary (secondaire) schools in Cameroon. Each level keeps its own classes, staff, pupils, attendance, assessments, report cards and fees in the same system, in English and French, so a school with several sections can run them all from one account.",
  },
  {
    question: "Are universities supported?",
    answer:
      "Not yet. University support is coming soon. Today EduIgnite serves nursery, primary and secondary schools. If your institution is a university, contact us and we will tell you when it is ready.",
  },
  {
    question: "Does it work without internet?",
    answer:
      "Yes. Attendance, payments, receipts and marks recorded while the connection is down are kept on the device and sync automatically when it returns. Schools with no reliable internet at all can run the fully offline desktop edition.",
  },
  {
    question: "What does a school need to start?",
    answer:
      "A device with a browser. Nothing has to be installed to use the platform on the web, and there are Android and Windows apps for schools that prefer them. A school requests an account, EduIgnite sets up the school and its administrator account, and the school then registers its own classes, staff and students.",
  },
  {
    question: "Can parents and students see their own information?",
    answer:
      "Yes. Parents and students have their own accounts and see what concerns them: attendance, marks, report cards, fee balance and messages from the school. What each person can see follows their role, so a parent sees their own children and a teacher sees their own classes.",
  },
  {
    question: "Is the data safe, and who can see it?",
    answer:
      "Every account signs in with its own matricule and password, and what it can reach is decided by its role and its school. One school's records are never visible to another school.",
  },
];

export default function SchoolManagementSystemCameroonPage() {
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
            crumbs: [
              { name: "Home", path: "/" },
              { name: "School management system in Cameroon", path: PAGE.path },
            ],
          }),
          faqSchema(FAQ),
        )}
      />

      <PageHero
        eyebrow="For schools across Cameroon"
        title="A school management system built for Cameroon"
        blurb="EduIgnite keeps admissions, attendance, marks, report cards, fees and family messaging in one place for nursery, primary and secondary schools - in English and French, on web, Android and Windows, and through the power and network cuts."
      />

      <Section>
        <div className="mx-auto max-w-3xl space-y-5 text-[1.0625rem] leading-[1.8] text-slate-600">
          <p>
            Most schools in Cameroon already have the information they need. It is simply in
            different places: marks in exercise books, fees in a cash book, admissions in a file,
            and the answer to &ldquo;how is this child doing?&rdquo; somewhere between all three. A
            school management system does not add information. It puts the information the school
            already keeps in one place, so that entering it once is enough.
          </p>
          <p>
            EduIgnite is that system, written for the way Cameroonian schools actually run. It
            covers the whole year, from registering a new student to issuing the transcript, and it
            is used by the administration, the bursar, teachers, parents and students - each seeing
            the part that concerns them. It serves schools at every level: nursery (maternelle),
            primary (primaire) and secondary (secondaire), with universities coming soon.
          </p>
        </div>
      </Section>

      <Section surface="tint">
        <SectionHeading
          eyebrow="What it handles"
          title="The whole school, not one part of it"
          blurb="Each of these is in use in schools today, on the same records, so nothing has to be typed twice."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {WHAT_IT_HANDLES.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-slate-200/70 bg-white p-7 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_18px_36px_-24px_rgba(18,49,77,0.18)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#12314d] text-white">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-[#0B1F33]">{item.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Built for Cameroon"
          title="Why a system built elsewhere rarely fits"
          blurb="A school here needs four things that most school software treats as an afterthought."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {BUILT_FOR_CAMEROON.map((item) => (
            <div key={item.title} className="flex gap-5 rounded-3xl border border-slate-200/70 p-7">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#67D0E4]/15 text-[#12314d]">
                <item.icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0B1F33]">{item.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section surface="tint">
        <SectionHeading
          eyebrow="Before and after"
          title="What actually changes in the office"
          blurb="The work does not disappear. It stops being done twice."
        />
        <div className="mx-auto mt-12 max-w-4xl overflow-x-auto">
          <table className="w-full border-collapse overflow-hidden rounded-2xl bg-white text-left text-[15px]">
            <thead>
              <tr className="bg-[#12314d] text-white">
                {COMPARE[0].map((heading) => (
                  <th key={heading} className="px-6 py-4 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE.slice(1).map(([before, after]) => (
                <tr key={before} className="border-t border-slate-200/70 align-top">
                  <td className="px-6 py-4 text-slate-600">{before}</td>
                  <td className="px-6 py-4 font-medium text-[#0B1F33]">
                    <span className="flex gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#12314d]" />
                      {after}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Questions" title="What schools ask before they start" />
        <div className="mx-auto mt-12 max-w-3xl divide-y divide-slate-200/70">
          {FAQ.map((item) => (
            <div key={item.question} className="py-7">
              <h3 className="text-lg font-bold text-[#0B1F33]">{item.question}</h3>
              <p className="mt-3 text-[15px] leading-[1.8] text-slate-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section surface="tint">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-[#12314d] px-8 py-14 text-center text-white sm:px-14">
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            Bring your school onto EduIgnite
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-white/75">
            Tell us about your school and we will set it up, with your administrator account ready
            to register classes, staff and students.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/school-account-request"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-[15px] font-bold text-[#12314d] transition-transform hover:-translate-y-0.5"
            >
              Request a school account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-4 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
            >
              Download the apps
            </Link>
          </div>
          <p className="mt-8 text-sm text-white/60">
            Also available in French:{" "}
            <Link href="/logiciel-de-gestion-scolaire-cameroun" className="underline underline-offset-4">
              logiciel de gestion scolaire au Cameroun
            </Link>
          </p>
        </div>
      </Section>
    </>
  );
}
