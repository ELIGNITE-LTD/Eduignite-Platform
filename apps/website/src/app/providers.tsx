"use client";

import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/api/query-client";

export function AppProviders({ children }: { children: ReactNode }) {
  // The shared client, so cache invalidation after API writes (see
  // lib/api/invalidation.ts) reaches the queries the pages are using.
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
