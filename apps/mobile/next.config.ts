import type {NextConfig} from 'next';
import path from 'path';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const lodashRoot = path.dirname(require.resolve('lodash/package.json'));
const pkg = require('./package.json');

const nextConfig: NextConfig = {
  // Static export: the Capacitor mobile shell serves the built `out/` folder
  // from the device (no server on-device). This is a client-rendered SPA that
  // talks to the same api.eduignite.online backend.
  output: 'export',

  // The app's own version, exposed to client code for the update-check in
  // @/lib/app-version.ts. CI sets NEXT_PUBLIC_APP_VERSION to the version it
  // is about to tag/publish (see .github/workflows/mobile.yml); local/dev
  // builds fall back to package.json's version.
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || pkg.version,
  },

  // Map routes to folder/index.html so the WebView resolves them offline.
  trailingSlash: true,

  // Allow the production build to succeed even if there are pre-existing
  // TypeScript type errors or ESLint warnings in the codebase.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    // Required for `output: export` — the WebView loads images directly.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'eduignite-official-website-2026-production.up.railway.app',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      lodash: lodashRoot,
    };
    return config;
  },
};

export default nextConfig;
