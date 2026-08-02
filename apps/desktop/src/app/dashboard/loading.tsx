import { CardSkeleton } from "@/components/shared/loading-state";
import { Loader2, Sparkles, ShieldCheck } from "lucide-react";

/**
 * YouTube-style Dashboard Skeleton Registry.
 * Displayed automatically by Next.js during dashboard navigation.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-accent/50 rounded-[1.5rem] animate-pulse" />
          <div className="space-y-2">
            <div className="h-8 w-64 bg-accent/50 rounded-lg animate-pulse" />
            <div className="h-4 w-40 bg-accent/30 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="h-12 w-48 bg-accent/50 rounded-2xl animate-pulse" />
      </div>

      {/* Tactical Metrics Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-white rounded-3xl border border-accent/20 p-6 space-y-4 shadow-sm animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-3 w-20 bg-accent/50 rounded" />
              <div className="h-8 w-8 bg-accent/30 rounded-lg" />
            </div>
            <div className="h-8 w-32 bg-accent/50 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Main Analytics Domain Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 h-[450px] bg-white rounded-[2.5rem] border border-accent/20 p-8 space-y-6 shadow-sm animate-pulse">
          <div className="flex justify-between border-b pb-6">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-accent/50 rounded" />
              <div className="h-3 w-64 bg-accent/30 rounded" />
            </div>
            <div className="h-8 w-24 bg-accent/50 rounded-xl" />
          </div>
          <div className="h-[280px] w-full bg-accent/10 rounded-2xl" />
        </div>

        <div className="lg:col-span-4 h-[450px] bg-white rounded-[2.5rem] border border-accent/20 p-8 space-y-8 shadow-sm animate-pulse">
          <div className="h-12 w-full bg-primary/10 rounded-2xl" />
          <div className="space-y-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-3 w-24 bg-accent/50 rounded" />
                  <div className="h-3 w-10 bg-accent/50 rounded" />
                </div>
                <div className="h-1.5 w-full bg-accent/20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Table Skeleton */}
      <div className="h-96 bg-white rounded-[2rem] border border-accent/20 p-0 shadow-sm animate-pulse overflow-hidden">
        <div className="p-8 border-b">
          <div className="h-6 w-48 bg-accent/50 rounded" />
        </div>
        <div className="p-0">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 border-b flex items-center px-8 gap-4">
              <div className="h-10 w-10 bg-accent/30 rounded-full" />
              <div className="h-4 w-1/4 bg-accent/30 rounded" />
              <div className="h-4 w-1/4 bg-accent/30 rounded ml-auto" />
              <div className="h-4 w-20 bg-accent/30 rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Footer Branding Skeleton */}
      <div className="flex flex-col items-center justify-center pt-10 gap-4 opacity-20">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Pre-Fetching Secure Registry</span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-secondary" />
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Node Integrity Verified</span>
        </div>
      </div>
    </div>
  );
}
