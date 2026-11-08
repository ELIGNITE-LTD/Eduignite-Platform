import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { PlatformProvider } from "@/lib/platform-context";
import { DataProvider } from "@/lib/data-context";
import { I18nProvider } from "@/lib/i18n-context";
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from "@/firebase/client-provider";
import { TopProgressBar } from "@/components/layout/progress-bar";
import { AppProviders } from "@/app/providers";
import { ServiceWorkerRegistration } from "@/components/offline/service-worker-registration";
import { PlatformFavicon } from "@/components/shared/platform-favicon";
import { Suspense } from "react";
import { SITE_URL } from "@/lib/seo";
import { Inter, Newsreader, Instrument_Serif } from "next/font/google";

/*
  The three faces are downloaded once at build time and served from our own
  domain, so a visit never sends the reader's address to Google's font servers.
  Inter carries the UI and body copy. Newsreader is the editorial serif behind
  every `font-serif` heading: it reads as documents and records, which is what
  this platform issues. Instrument Serif is kept for display-size headlines
  (`font-display`), where its high contrast lands.
*/
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const SITE_NAME = "EduIgnite";
const SITE_TITLE = "EduIgnite | Bilingual School Management System, Cameroon";
const SITE_DESCRIPTION =
  "Complete bilingual (English/French) school management system for nursery, primary and secondary schools in Cameroon. Universities coming soon.";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s | EduIgnite",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "school management system",
    "Cameroon school software",
    "student information system",
    "report cards",
    "school fees management",
    "attendance tracking",
    "bilingual school platform",
    "EduIgnite",
    "education SaaS",
    "nursery school management",
    "primary school management software",
    "secondary school administration",
    "maternelle",
    "primaire",
    "école primaire",
    "gestion scolaire",
    "logiciel scolaire Cameroun",
    "gestion école primaire Cameroun",
  ],
  authors: [{ name: "EduIgnite", url: "mailto:info@eduignite.online" }],
  creator: "EduIgnite",
  publisher: "EduIgnite",
  category: "education",
  metadataBase: new URL(SITE_URL),
  // No site-wide canonical: each public page declares its own (see
  // lib/seo.ts). A canonical here was inherited by every page that did not
  // override it, telling search engines they were all copies of "/".
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.ico?size=32", sizes: "32x32" },
      { url: "/icons/eduignite-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  // Proves to Google Search Console that this site is ours. Next renders it
  // as <meta name="google-site-verification"> in the head of every page,
  // which includes the home page Google looks at.
  verification: {
    google: "mi028-QqAMXFJq5NDBNT9yVzxmZBooq51lg5wDsW7O0",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    alternateLocale: ["fr_FR"],
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "EduIgnite logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/icon.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} ${instrumentSerif.variable}`}>
      <body className="font-body antialiased selection:bg-secondary selection:text-secondary-foreground">
        {/* Lets the site itself open with no connection; the apps already
            carry their own files. */}
        <ServiceWorkerRegistration />
        <AppProviders>
          <I18nProvider>
            <FirebaseClientProvider>
              <AuthProvider>
                <PlatformFavicon />
                <PlatformProvider>
                  <DataProvider>
                    <Suspense fallback={null}>
                      <TopProgressBar />
                    </Suspense>
                    {children}
                    <Toaster />
                  </DataProvider>
                </PlatformProvider>
              </AuthProvider>
            </FirebaseClientProvider>
          </I18nProvider>
        </AppProviders>
      </body>
    </html>
  );
}
