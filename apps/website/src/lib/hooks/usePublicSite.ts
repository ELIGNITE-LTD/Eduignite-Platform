import { useQuery } from "@tanstack/react-query";
import { publicSiteService } from "@/lib/api/services/public-site.service";

export const PUBLIC_SITE_KEYS = {
  profile: ["public-site", "profile"] as const,
  mine: ["public-site", "mine"] as const,
  audit: (page: number) => ["public-site", "audit", page] as const,
  founder: (status: string, page: number) => ["public-site", "founder", status, page] as const,
};

export function usePublicSiteProfile(enabled = true) {
  return useQuery({ queryKey: PUBLIC_SITE_KEYS.profile, queryFn: publicSiteService.getProfile, enabled });
}

/** Whether the caller's own school website is live (any school role). */
export function useMySiteStatus(enabled = true) {
  return useQuery({
    queryKey: PUBLIC_SITE_KEYS.mine,
    queryFn: publicSiteService.mine,
    enabled,
    staleTime: 60_000,
  });
}
