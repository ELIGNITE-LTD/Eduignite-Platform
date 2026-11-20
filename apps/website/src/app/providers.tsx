"use client";

import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/api/query-client";
import { installWatchReporter } from "@/lib/watch-reporter";

export function AppProviders({ children }: { children: ReactNode }) {
  // This device reports its own failures to the founders' System Watch (throttled, scrubbed, never throws).
  useEffect(() => { installWatchReporter("web"); }, []);
  // The shared client, so cache invalidation after API writes (see
  // lib/api/invalidation.ts) reaches the queries the pages are using.
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
