"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

/**
 * Post-login branding splash: the EduIgnite logo, name and "Insanely great."
 * tagline with entrance animations, then straight into the app. Fixed-height
 * and non-scrollable by design.
 */
export default function WelcomeSplashPage() {
  const { isAuthenticated, isLoading, platformSettings } = useAuth();
  const router = useRouter();
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);
  const brandName = platformSettings.name || "EduIgnite";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const timer = setTimeout(() => router.replace("/dashboard"), 3200);
    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#1B3A57] via-primary to-[#3E7CB1] px-8 text-white">
      {/* Ambient light accents */}
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-secondary/25 blur-3xl" />

      <div className="relative flex flex-col items-center">
        {/* Logo */}
        <div className="ei-splash-logo flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white p-4 shadow-2xl shadow-black/25">
          <img
            src={platformLogo}
            alt={`${brandName} logo`}
            className="h-full w-full object-contain"
          />
        </div>

        {/* Brand name */}
        <h1 className="ei-splash-name mt-7 text-5xl font-black tracking-tighter">
          {brandName}
        </h1>

        {/* Tagline */}
        <p className="ei-splash-tagline mt-3 text-sm font-semibold uppercase tracking-[0.45em] text-white/85">
          Insanely great
        </p>

        {/* Progress shimmer */}
        <div className="mt-12 h-1 w-44 overflow-hidden rounded-full bg-white/15">
          <div className="ei-splash-progress h-full rounded-full bg-secondary" />
        </div>
      </div>

      <p className="absolute bottom-8 text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
        {brandName} · {new Date().getFullYear()}
      </p>
    </div>
  );
}
