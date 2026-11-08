import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { absolute: "School website not available" },
  robots: { index: false, follow: false },
};

/** Neutral by design: it must not reveal whether a school exists but is unpublished. Bilingual, no EduIgnite branding. */
export default function SchoolNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 text-center">
      <main id="main" className="max-w-md">
        <h1 className="text-2xl font-bold text-blue-900">School website not available</h1>
        <p className="mt-3 text-slate-600">This school website does not exist or has not been published yet.</p>
        <h2 className="mt-8 text-xl font-bold text-blue-900" lang="fr">Site de l&apos;école indisponible</h2>
        <p className="mt-2 text-slate-600" lang="fr">Le site de cette école n&apos;existe pas ou n&apos;a pas encore été publié.</p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
        >
          eduignite.online
        </Link>
      </main>
    </div>
  );
}
