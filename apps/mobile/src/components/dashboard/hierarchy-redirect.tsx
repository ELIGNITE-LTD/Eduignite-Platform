"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Old Sections / Classes / Subjects tabs now live inside "Hierarchy & Sections". */
export function HierarchyRedirect({ tab }: { tab: "sections" | "classes" | "subjects" }) {
  const router = useRouter();
  useEffect(() => {
    let extra = "";
    try {
      const add = new URLSearchParams(window.location.search).get("add");
      if (add) extra = `&add=${encodeURIComponent(add)}`;
    } catch {
      /* no window (SSR) */
    }
    router.replace(`/dashboard/hierarchy?tab=${tab}${extra}`);
  }, [router, tab]);
  return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
}
