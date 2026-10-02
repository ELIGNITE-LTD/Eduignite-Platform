import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/public-site";
import { LegalPage, type LegalSection } from "@/components/public/legal-page";

const PAGE = {
  title: "Terms of Use | EduIgnite",
  description:
    "The terms for using EduIgnite: the website, the web, desktop and mobile apps, the AI assistant, the Telegram bot and EduIgnite Academy.",
  path: "/terms",
};

export const metadata: Metadata = pageMetadata(PAGE);

const UPDATED = "2 October 2026";

const mail = <a href={`mailto:${SITE.email}`}>{SITE.email}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: "about",
    title: "About these terms",
    body: (
      <>
        <p>
          These terms apply when you use EduIgnite: this website, the EduIgnite web, desktop and mobile apps, EduIgnite
          Offline and Companion, the AI assistant, the EduIgnite AI bot on Telegram and EduIgnite Academy. EduIgnite is
          run from {SITE.location} and you can reach us at {mail}.
        </p>
        <p>
          By using EduIgnite you agree to these terms. Please also read our{" "}
          <Link href="/privacy">Privacy Policy</Link>, which explains how we handle personal data.
        </p>
      </>
    ),
  },
  {
    id: "who-can-use",
    title: "Who can use EduIgnite",
    body: (
      <>
        <p>
          Schools use EduIgnite under an agreement with us, and give accounts to their staff, students and parents. If
          your school gave you an account, you may use it for school purposes while the school allows it.
        </p>
        <p>
          Anyone may read this website. If you are under 18, you need the agreement of a parent or guardian to create an
          EduIgnite Academy account, to use the Telegram bot, or to buy anything from us.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <ul>
        <li>Keep your password private and do not let anyone else sign in as you.</li>
        <li>Tell your school, or us at {mail}, straight away if you think someone else has used your account.</li>
        <li>You are responsible for what is done with your account unless it was used without your fault.</li>
      </ul>
    ),
  },
  {
    id: "schools",
    title: "What schools are responsible for",
    body: (
      <ul>
        <li>The accuracy of the records they enter, and the documents they issue from them.</li>
        <li>
          Having the right to record each person&rsquo;s data, including the consent of a parent or guardian for students
          under 18, and for publishing any photo of a student.
        </li>
        <li>Deciding who in the school has which role, and removing access when someone leaves.</li>
        <li>Keeping their own copies of documents they must be able to produce, such as report cards.</li>
      </ul>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You must not use EduIgnite to:</p>
        <ul>
          <li>break the law, or harass, threaten or insult anyone;</li>
          <li>post content that is false, hateful, sexual, violent, or that you have no right to share;</li>
          <li>see or change records your role does not give you access to;</li>
          <li>try to get around security, overload the service, or copy data from it automatically;</li>
          <li>cheat in an exam or assessment, for example by using the AI assistant where your teacher has not allowed it.</li>
        </ul>
        <p>We may remove content and suspend accounts that break these rules.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "Content you add",
    body: (
      <>
        <p>
          What you write or upload stays yours. You allow us to store it, show it to the people it is meant for and make
          the copies needed to run EduIgnite. A story you submit for publication is shown on this website only if you
          agreed to that and our team approved it, and you can ask us to remove it at any time.
        </p>
        <p>Only upload photos and documents you have the right to share.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "The AI assistant",
    body: (
      <>
        <p>
          The AI assistant is a study aid. Its answers are produced automatically and can be wrong or incomplete, so check
          important answers with a teacher and do not rely on them alone for decisions about exams, health or money.
        </p>
        <p>
          Using the assistant may use AI credits. Free daily credits reset each day and cannot be carried over, exchanged
          or refunded. Purchased credits are covered by our <Link href="/refunds">Refund Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "payments",
    title: "Prices and payments",
    body: (
      <>
        <p>
          EduIgnite charges for some services: platform subscriptions, school subscriptions, app purchases, licences for
          EduIgnite Offline and AI credits. The price and what it pays for are shown before you pay, and you confirm the
          payment on your phone. Payments to EduIgnite are taken by mobile money through our payment provider, Fapshi.
        </p>
        <p>
          School fees are paid to the school, not to EduIgnite. Questions about school fees should go to the school.
          Refunds of payments made to EduIgnite are explained in our <Link href="/refunds">Refund Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: "offline",
    title: "EduIgnite Offline licences",
    body: (
      <p>
        An EduIgnite Offline licence is tied to the school and to the computer it is activated on. The first year is free;
        later years are renewed through the Companion tools. A licence may not be copied, shared with another school or
        used to get around activation.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: (
      <p>
        We work to keep EduIgnite running, but we cannot promise it will always be available or free of errors.
        Maintenance, power and network problems can interrupt it. We improve EduIgnite over time and may change or
        remove features; if a change takes away something a school has paid for, we will tell the school first.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Our software and brand",
    body: (
      <p>
        The EduIgnite software, name, logo and website belong to EduIgnite. You may use them only as part of using
        EduIgnite. Documents a school produces with EduIgnite, such as report cards, belong to the school.
      </p>
    ),
  },
  {
    id: "ending",
    title: "Suspension and closing an account",
    body: (
      <p>
        You can stop using EduIgnite at any time; ask your school, or write to {mail}, to close your account. We may
        suspend or close an account that breaks these terms, after a warning unless the problem is serious or urgent.
        When a school leaves EduIgnite, its records are deleted or handed back as described in the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Our responsibility",
    body: (
      <p>
        We are responsible for providing EduIgnite with reasonable care. As far as the law allows, we are not responsible
        for losses caused by how a school or user uses EduIgnite, by wrong information entered by others, or by events
        outside our control. Nothing in these terms limits the rights you have under Cameroonian law, including Law No.
        2011/012 of 6 May 2011 on consumer protection, or any responsibility that the law does not allow us to exclude.
      </p>
    ),
  },
  {
    id: "law",
    title: "Law and disputes",
    body: (
      <p>
        These terms are governed by the law of the Republic of Cameroon. If you have a complaint, please write to {mail}{" "}
        first so we can try to settle it with you. If we cannot, the dispute will go to the competent courts of Cameroon.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        When we change these terms we update the date at the top of this page. If a change is important, we will tell
        users inside EduIgnite before it takes effect. If you keep using EduIgnite after that, the new terms apply.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      current="/terms"
      title="Terms of Use"
      updated={UPDATED}
      summary={
        <p>
          These are the rules for using EduIgnite. They explain what we provide, what schools and users are responsible
          for, how payments work and what happens if something goes wrong.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
