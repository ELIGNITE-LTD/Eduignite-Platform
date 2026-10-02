import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { SITE } from "@/lib/public-site";
import { LegalPage, type LegalSection } from "@/components/public/legal-page";

const PAGE = {
  title: "Refund Policy | EduIgnite",
  description:
    "When and how EduIgnite refunds payments for AI credits, subscriptions, app purchases and EduIgnite Offline licences, paid by mobile money.",
  path: "/refunds",
};

export const metadata: Metadata = pageMetadata(PAGE);

const UPDATED = "2 October 2026";

const mail = <a href={`mailto:${SITE.email}`}>{SITE.email}</a>;

const SECTIONS: LegalSection[] = [
  {
    id: "scope",
    title: "What this policy covers",
    body: (
      <>
        <p>
          This policy covers payments made to EduIgnite: AI credits, platform subscriptions, school subscriptions, app
          purchases and EduIgnite Offline licence renewals. These are paid by mobile money through our payment provider,
          Fapshi.
        </p>
        <p>
          <strong>School fees are paid to your school, not to EduIgnite.</strong> For a refund of school fees, please ask
          the school.
        </p>
      </>
    ),
  },
  {
    id: "always",
    title: "When we always refund in full",
    body: (
      <ul>
        <li>You were charged but the payment failed, or you were charged twice for the same thing.</li>
        <li>You were charged the wrong amount (we refund the difference).</li>
        <li>You paid, but what you paid for was never provided, for example credits that never reached your account.</li>
      </ul>
    ),
  },
  {
    id: "ai-credits",
    title: "AI credits",
    body: (
      <ul>
        <li>
          Purchased credits that you have not used can be refunded if you ask within 14 days of buying them. If you have
          used some of them, we refund the part you have not used.
        </li>
        <li>Credits that have already been used are not refunded.</li>
        <li>Free daily credits are a gift, have no cash value and cannot be refunded.</li>
      </ul>
    ),
  },
  {
    id: "subscriptions",
    title: "Subscriptions, app purchases and licences",
    body: (
      <ul>
        <li>
          If you ask within 14 days of paying, and the school account, user account, app or licence the payment is for has
          not yet been set up or activated, we refund it in full.
        </li>
        <li>
          After that, if EduIgnite cannot provide the service you paid for, we refund the part of the period that you
          could not use.
        </li>
        <li>We do not refund a subscription part-way through its period because you changed your mind.</li>
      </ul>
    ),
  },
  {
    id: "how",
    title: "How to ask for a refund",
    body: (
      <>
        <p>Write to {mail} and include:</p>
        <ul>
          <li>your name, and the school or account the payment was for;</li>
          <li>the mobile money number you paid from;</li>
          <li>the date and the amount;</li>
          <li>the transaction reference from your payment message, if you have it.</li>
        </ul>
        <p>
          We will reply to tell you whether the refund is approved. Approved refunds are paid back to the mobile money
          number the payment came from, within 30 days of approval. We do not charge any fee for a refund.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your legal rights",
    body: (
      <p>
        This policy does not reduce the rights you have under Cameroonian law, including Law No. 2011/012 of 6 May 2011 on
        consumer protection. If you disagree with a refund decision, write to us and we will look at it again; see also
        our <Link href="/terms">Terms of Use</Link>.
      </p>
    ),
  },
];

export default function RefundsPage() {
  return (
    <LegalPage
      current="/refunds"
      title="Refund Policy"
      updated={UPDATED}
      summary={
        <p>
          When something goes wrong with a payment to EduIgnite, you get your money back. This page explains when else a
          refund is possible and how to ask for one.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
