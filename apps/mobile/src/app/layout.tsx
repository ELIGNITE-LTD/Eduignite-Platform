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
import { PlatformFavicon } from "@/components/shared/platform-favicon";
import { Suspense } from "react";

const SITE_NAME = "EduIgnite";
const SITE_TITLE = "EduIgnite | School Management System for Cameroon Schools";
const SITE_DESCRIPTION =
  "EduIgnite is a secure, bilingual (English & French) school management platform for Cameroon secondary schools. Manage administration, students, teachers, parents, fees, attendance, examinations, AI-generated questions, report cards, transcripts, ID cards, career orientation and executive support — all in one system.";

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
    "secondary school administration",
    "gestion scolaire",
    "logiciel scolaire Cameroun",
  ],
  authors: [{ name: "EduIgnite", url: "mailto:eduignitecmr@gmail.com" }],
  creator: "EduIgnite",
  publisher: "EduIgnite",
  category: "education",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  alternates: {
    canonical: "/",
    languages: {
      "en-US": "/",
      "fr-FR": "/",
    },
  },
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
    url: "/",
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          Inter carries the UI and body copy. Newsreader is the editorial serif
          behind every `font-serif` heading — it reads as documents and records,
          which is what this platform issues. Instrument Serif is reserved for
          display-size headlines (`font-display`), where its high contrast lands.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased selection:bg-secondary selection:text-secondary-foreground">
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
