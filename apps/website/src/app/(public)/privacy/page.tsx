import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/public-site";
import { LegalPage, LegalTable, type LegalSection } from "@/components/public/legal-page";

const PAGE = {
  title: "Privacy Policy | EduIgnite",
  description:
    "How EduIgnite collects, uses, shares and protects personal data, including students' data, and the rights you have over it under Cameroonian law.",
  path: "/privacy",
};

export const metadata: Metadata = pageMetadata(PAGE);

const UPDATED = "2 October 2026";

const mail = (
  <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
);

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          EduIgnite is a school management platform used by schools in Cameroon. It is run from {SITE.location}.
          In this policy, &ldquo;EduIgnite&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean the team that operates
          the platform, this website, the EduIgnite apps and the EduIgnite AI bot on Telegram.
        </p>
        <p>You can reach us about anything in this policy at {mail}.</p>
      </>
    ),
  },
  {
    id: "our-two-roles",
    title: "Our two roles: for schools, and on our own account",
    body: (
      <>
        <p>
          <strong>For schools.</strong> A school that uses EduIgnite decides what information it records about its
          students, parents and staff (for example class lists, marks, attendance and fee records) and why. The school
          is responsible for that information and for having the right to use it, including the consent of parents or
          guardians for students under 18. We store and process it on the school&rsquo;s behalf and only to run the
          platform for that school. Questions about these records are best sent to the school first; we will help the
          school answer them.
        </p>
        <p>
          <strong>On our own account.</strong> We are responsible for the information we collect for our own purposes:
          messages sent through this website, requests for a school account, EduIgnite Academy accounts, AI assistant
          and AI credit records, the Telegram bot, payments made to EduIgnite, and stories submitted for publication.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <p>We collect only what each feature needs:</p>
        <LegalTable
          head={["Where it comes from", "What we collect"]}
          rows={[
            ["Contact form on this website", "Your name, email address, the subject and your message."],
            [
              "School account request",
              "Your name and role, the school's name, an email address, a WhatsApp number, the school's region, division and sub-division, your message, and the referral code of the link you followed, if any.",
            ],
            [
              "User accounts (created by a school)",
              "Name, matricule or login, role, school, email and phone number where given, profile photo where added, and your password, which is stored only in hashed form.",
            ],
            [
              "School records (entered by the school)",
              "Student profiles and guardians, admission details, photos, attendance, marks, report cards, transcripts, ID cards, assignments and exam work, timetable, library loans, fee records and receipts, and staff records.",
            ],
            [
              "Messages and community",
              "Chat messages and attachments, announcements, notifications, community posts, and stories you submit for publication.",
            ],
            [
              "AI assistant and AI credits",
              "The questions you ask, the answers given, photos of questions you send, and a record of the credits each request used.",
            ],
            [
              "EduIgnite AI on Telegram",
              "Your Telegram user ID, username, display name and language, your recent conversation with the bot, and, if you buy credits, the phone number you give for payment.",
            ],
            [
              "Payments to EduIgnite",
              "The mobile money number used, the amount, what it paid for, and the payment provider's transaction reference. We never see or store your mobile money PIN.",
            ],
            ["EduIgnite Academy", "Your name, email address, password (hashed), course progress, quiz results and certificates."],
            [
              "Technical data",
              "Our servers record the IP address and the page or service requested, to keep the platform secure and working. See the Cookie Policy for what is kept on your device.",
            ],
          ]}
        />
        <p>
          We do not use advertising or analytics trackers, and we do not build profiles of visitors for marketing.
        </p>
      </>
    ),
  },
  {
    id: "why-we-use-it",
    title: "Why we use it",
    body: (
      <>
        <ul>
          <li>To run the platform for schools, on their instructions.</li>
          <li>To reply to your messages and to review and set up school accounts.</li>
          <li>To answer AI questions and to count and charge AI credits.</li>
          <li>To take payments, issue receipts and handle refunds.</li>
          <li>To publish stories, but only those whose authors agreed to publication and that our team approved.</li>
          <li>To keep the platform secure, prevent misuse and fix problems.</li>
          <li>To meet our legal obligations, for example keeping payment records.</li>
        </ul>
        <p>
          Cameroon&rsquo;s Law No. 2024/017 of 23 December 2024 on personal data protection sets out when personal data
          may be used. We rely on your consent (which is why our forms ask for it), on the instructions of your school
          for school records, or on a legal obligation. You can withdraw consent at any time by writing to {mail}; this
          does not affect what was done before you withdrew it.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children and students",
    body: (
      <>
        <p>
          Most students on EduIgnite are under 18. Under Cameroonian law, using a minor&rsquo;s personal data needs the
          consent of a parent or legal guardian. Schools are responsible for obtaining that consent for the records they
          keep and for any photo of a student they publish.
        </p>
        <p>
          If you are under 18, please ask a parent or guardian before you create an EduIgnite Academy account or use the
          EduIgnite AI bot on Telegram. If you believe a child&rsquo;s data has been given to us without the right
          consent, write to {mail} and we will look into it and remove it where appropriate.
        </p>
      </>
    ),
  },
  {
    id: "ai",
    title: "The AI assistant",
    body: (
      <>
        <p>
          When you ask the EduIgnite AI assistant a question, the question (and any photo of it you send) is passed to
          our AI provider, Groq, to produce the answer. Photos are used only to answer that question and are not kept by
          EduIgnite afterwards. The text of your questions and answers is kept in your account history.
        </p>
        <p>
          Please do not put sensitive personal information, such as health details, in your questions. AI answers can be
          wrong: check important answers with a teacher.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>
          We do not sell personal data. We share it only with the service providers that run parts of EduIgnite for us,
          and only what each one needs:
        </p>
        <LegalTable
          head={["Provider", "What it does for us", "Where"]}
          rows={[
            ["Amazon Web Services", "Hosts our servers, database and stored files", "United States"],
            ["Groq", "Produces AI answers", "United States"],
            ["Brevo", "Sends our emails", "France (European Union)"],
            ["Google (Gmail and Firebase)", "Sends some emails; supports sign-in and push notifications", "Worldwide"],
            ["Fapshi", "Takes mobile money payments made to EduIgnite", "Cameroon"],
            ["Cloudinary", "Hosts some images shown on the website", "United States"],
            ["Telegram", "Carries your conversation with the EduIgnite AI bot, if you use it", "Worldwide"],
            ["YouTube and Vimeo", "Play a video, only after you press play", "Worldwide"],
            ["Jitsi Meet", "Runs a live class, when a teacher uses a Jitsi link", "Worldwide"],
          ]}
        />
        <p>
          Inside a school, people see only what their role allows: for example, parents see their own children&rsquo;s
          records. We may also disclose information when the law requires it, for example on a valid order from a
          Cameroonian court or authority.
        </p>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Data stored outside Cameroon",
    body: (
      <>
        <p>
          Our main servers are in the United States, and some providers above work from other countries. Cameroonian law
          requires that personal data sent abroad keeps an adequate level of protection, and provides for authorisation
          of such transfers by the personal data protection authority. We choose providers that protect data with
          encryption and access controls, and we will complete the formalities the authority requires as its procedures
          come into effect.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <>
        <ul>
          <li>
            <strong>School records:</strong> for as long as the school uses EduIgnite. When a school leaves, we delete
            its records or hand them back, as the school chooses, unless the law requires us to keep something longer.
          </li>
          <li>
            <strong>Messages from this website and account requests:</strong> for as long as needed to deal with them,
            and no longer than two years.
          </li>
          <li>
            <strong>Payment records:</strong> for as long as accounting and tax rules require.
          </li>
          <li>
            <strong>AI history and Telegram conversations:</strong> until you, or your school, delete them, or the account
            is closed.
          </li>
          <li>
            <strong>Server logs:</strong> for a short period, then they are deleted.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <>
        <ul>
          <li>Every connection to EduIgnite is encrypted (HTTPS).</li>
          <li>Our database is encrypted at rest.</li>
          <li>Stored files are kept in private storage and are shown through short-lived links, not public addresses.</li>
          <li>Passwords are stored only in hashed form, never in plain text.</li>
          <li>Access inside a school follows each person&rsquo;s role.</li>
        </ul>
        <p>
          No system is perfectly secure. If a breach puts your data at risk, we will inform the personal data protection
          authority without delay, as Cameroonian law requires, and tell the people affected.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <p>You can ask us to:</p>
        <ul>
          <li>tell you what personal data we hold about you, and give you a copy;</li>
          <li>correct data that is wrong or incomplete;</li>
          <li>delete your data, where we are not required to keep it;</li>
          <li>stop using your data, or withdraw a consent you gave;</li>
          <li>remove a story or post of yours from the website.</li>
        </ul>
        <p>
          Write to {mail}. We may ask you to confirm who you are, and we will answer within one month. For records kept
          by your school, we will pass your request to the school and help it reply. You may also complain to
          Cameroon&rsquo;s personal data protection authority.
        </p>
      </>
    ),
  },
  {
    id: "device-storage",
    title: "Cookies and storage on your device",
    body: (
      <p>
        We store only what is needed to keep you signed in, remember your language and let the apps work offline. We use
        no advertising or analytics cookies. The <Link href="/cookies">Cookie Policy</Link> lists everything.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        When we change this policy we update the date at the top of this page. If a change affects how we use your data
        in an important way, we will also tell users inside EduIgnite before it takes effect.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      current="/privacy"
      title="Privacy Policy"
      updated={UPDATED}
      summary={
        <p>
          This page explains what personal data EduIgnite collects, why, who we share it with, how long we keep it and
          the rights you have. In short: we collect only what each feature needs, we never sell it, and we use no
          advertising or analytics trackers.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
