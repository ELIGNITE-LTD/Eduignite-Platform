"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Loader2, LogOut } from "lucide-react";
import { clearPartnerSession, getPartnerSession, type PartnerSession } from "@/lib/partner/client";

export default function PartnerPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<PartnerSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getPartnerSession();
    if (!s) {
      router.replace("/partners/login");
      return;
    }
    setSession(s);
    setReady(true);
  }, [router]);

  const logout = () => {
    clearPartnerSession();
    router.replace("/partners/login");
  };

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F0F4F8]">
        <Loader2 className="h-6 w-6 animate-spin text-[#264D73]/50" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#F0F4F8]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#264D73] text-white">
              <Handshake className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-black text-[#12314d]">EduIgnite Partner</p>
              <p className="text-[11px] font-semibold text-slate-400">Partner Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-slate-500 sm:inline">{session?.user?.name}</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-bold text-slate-600 hover:border-slate-300 hover:text-[#264D73]"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
