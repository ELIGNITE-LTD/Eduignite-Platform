import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  // Static export: the Capacitor Android shell serves the built `out/`
  // folder from the device (no server on-device) — same approach as
  // apps/mobile. This is a small, client-rendered SPA.
  output: "export",

  // Map routes to folder/index.html so the WebView resolves them offline.
  trailingSlash: true,

  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    // Required for `output: export` — the WebView loads images directly.
    unoptimized: true,
  },

  env: {
    // Baked in at build time so the update-check (src/lib/versioning) can
    // compare "what's actually running" against the platform's app-versions
    // endpoint, without a second source of truth for the version number.
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
};

export default nextConfig;
