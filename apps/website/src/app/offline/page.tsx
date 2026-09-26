import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline — EduIgnite",
  description: "You are offline. Work already open on this device still works, and anything you record is sent when the connection returns.",
};

/**
 * Shown when a page is asked for that this device has never opened, and there
 * is no connection to fetch it with. Pages that have been visited come back
 * from the device's own copy instead of this one.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-6 py-16">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF3FA] text-[#264D73]">
          <WifiOff className="h-7 w-7" />
        </span>

        <h1 className="mt-6 text-2xl font-black text-[#12314d]">You are offline</h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          This page has not been opened on this device before, so there is no copy of it to show.
          Pages you have already visited still work, and anything you record while offline is saved
          here and sent as soon as the connection returns.
        </p>

        <Link
          href="/dashboard"
          className="mt-7 inline-flex items-center justify-center rounded-2xl bg-[#264D73] px-6 py-3.5 text-sm font-black text-white transition-colors hover:bg-[#1c3c5c]"
        >
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
