"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * A proprietor has his own focused area. Anything else under /dashboard is
 * a school-staff screen that needs a school he does not have, so the layout
 * sends him back to his overview. (The server refuses those calls anyway.)
 */
export function isProprietorRoute(pathname: string | null | undefined) {
  const path = (pathname || "").replace(/\/+$/, "") || "/";
  return path === "/dashboard" || path === "/dashboard/profile" || path.startsWith("/dashboard/proprietor");
}

export function ProprietorRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary opacity-30" />
    </div>
  );
}
