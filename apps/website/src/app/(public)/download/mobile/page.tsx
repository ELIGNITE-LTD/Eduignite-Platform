import type { Metadata } from "next";
import Link from "next/link";
import { QrCode } from "lucide-react";
import { AppDownloadPage } from "@/components/public/app-download-page";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Download EduIgnite for Android",
  description: "Download the EduIgnite Android app and the account setup guide.",
};

export default function MobileDownloadPage() {
  return (
    <>
      <AppDownloadPage appKey="mobile" />

      {/* Additive note: the same app also serves as the Companion device for schools running EduIgnite Offline. */}
      <section className="bg-[#F7F9FC] py-14">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-7 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#264D73]/8 text-[#264D73]">
              <QrCode className="h-6 w-6" />
            </span>
            <div>
              <p className="text-base font-black text-[#12314d]">Also the Companion app for EduIgnite Offline</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                If your school runs{" "}
                <Link href="/download/offline" className="font-bold text-[#264D73] underline">
                  EduIgnite Offline
                </Link>
                , this same Mobile app is what your school's technical admin uses to scan the Desktop app's QR code,
                activate the license, and sync when a connection is available — no separate app to install. Prefer not
                to install the full Mobile app just for that? There's also a small standalone{" "}
                <Link href="/download/companion" className="font-bold text-[#264D73] underline">
                  EduIgnite Companion
                </Link>{" "}
                app that does just this one job.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
