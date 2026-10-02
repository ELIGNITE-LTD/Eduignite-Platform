import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage, LegalTable, type LegalSection } from "@/components/public/legal-page";

const PAGE = {
  title: "Cookie Policy | EduIgnite",
  description:
    "The cookies and browser storage EduIgnite uses, why each one is needed, and why there is no cookie banner: we use no advertising or analytics cookies.",
  path: "/cookies",
};

export const metadata: Metadata = pageMetadata(PAGE);

const UPDATED = "2 October 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "summary",
    title: "Why there is no cookie banner",
    body: (
      <>
        <p>
          EduIgnite uses no advertising cookies, no analytics or tracking cookies, and no social media pixels. Everything
          we keep on your device is either needed for the site to work (such as keeping you signed in) or something you
          asked for (such as your language or offline mode).
        </p>
        <p>
          Storage of that kind does not need a consent banner, so we do not show one. If we ever add anything that is not
          strictly needed, we will ask for your consent first and update this page.
        </p>
      </>
    ),
  },
  {
    id: "what-we-store",
    title: "What we store on your device",
    body: (
      <>
        <p>
          Most of it is kept in your browser&rsquo;s local storage rather than in cookies. It never leaves your device
          except when it is used to sign you in.
        </p>
        <LegalTable
          head={["Name", "What it is for", "Kind", "How long"]}
          rows={[
            [
              <span key="a" className="block space-y-1">
                <code className="block">eduignite_access_token</code>
                <code className="block">eduignite_refresh_token</code>
                <code className="block">eduignite_user</code>
              </span>,
              "Keep you signed in",
              "Local storage",
              "Until you sign out",
            ],
            [<code key="b">eduignite_lang</code>, "Remember the language you chose", "Local storage", "Until you change it"],
            [
              <code key="c">eduignite_remote_translations_v1</code>,
              "Keep translated text so pages open faster",
              "Local storage",
              "Until you clear it",
            ],
            [
              <code key="d">eduignite:app-write-queue</code>,
              "Hold changes made without a connection until they can be sent",
              "Local storage",
              "Until they are sent",
            ],
            [
              <span key="e" className="block space-y-1">
                <code className="block">eduignite_platform</code>
                <code className="block">eduignite_schools</code>
                <span className="block text-xs">and other eduignite_… entries</span>
              </span>,
              "Copies of the settings and content the app has loaded, so it keeps working offline. For a visitor who is not signed in, these hold no personal data.",
              "Local storage",
              "Until you clear it",
            ],
            [
              <code key="f">eduignite_notif_seen_…</code>,
              "Remember which notifications you have already seen",
              "Local storage",
              "Until you clear it",
            ],
            [
              <code key="g">eduignite:intro-seen</code>,
              "Show the opening animation only once per visit",
              "Session storage",
              "Until you close the tab",
            ],
            [
              <code key="h">eduignite_survey_prompt_dismissed…</code>,
              "Remember that you closed a survey invitation",
              "Session storage",
              "Until you close the tab",
            ],
            [<code key="i">sidebar_state</code>, "Remember whether the dashboard menu is open", "Cookie", "7 days"],
            [
              "Offline page copies",
              "Let pages you have visited open without a connection",
              "Browser cache",
              "Until replaced by a newer version",
            ],
            [
              <code key="j">firebaseLocalStorageDb</code>,
              "Technical storage created by Google Firebase, which supports sign-in",
              "Browser database",
              "Until you clear it",
            ],
          ]}
        />
      </>
    ),
  },
  {
    id: "third-parties",
    title: "Other services",
    body: (
      <>
        <p>Some features load another company&rsquo;s service, and only when you use them:</p>
        <ul>
          <li>
            <strong>Videos.</strong> A YouTube or Vimeo video loads only when you press its play button. We use
            YouTube&rsquo;s privacy-enhanced player and Vimeo&rsquo;s do-not-track mode. Once a video plays, that service
            may set its own cookies, under its own policy.
          </li>
          <li>
            <strong>Live classes.</strong> When a teacher&rsquo;s live class uses Jitsi Meet, joining it opens Jitsi,
            which works under its own policy.
          </li>
          <li>
            <strong>Telegram.</strong> If you use the EduIgnite AI bot, Telegram&rsquo;s own terms apply inside Telegram.
          </li>
        </ul>
        <p>The fonts on this website are served from our own domain, not from an outside font service.</p>
      </>
    ),
  },
  {
    id: "control",
    title: "How to control it",
    body: (
      <p>
        You can view and delete cookies and site storage in your browser&rsquo;s settings. Deleting them signs you out
        and removes any offline copies, so make sure your changes have been sent first. Blocking them stops sign-in from
        working, but you can still read this website. More about how we handle data is in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      current="/cookies"
      title="Cookie Policy"
      updated={UPDATED}
      summary={
        <p>
          This page lists everything EduIgnite stores on your device and why. We use no advertising or analytics
          cookies, which is why you do not see a cookie banner.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
