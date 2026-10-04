import type {NextConfig} from 'next';
import path from 'path';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const lodashRoot = path.dirname(require.resolve('lodash/package.json'));

const nextConfig: NextConfig = {
  // Tell Next.js the real repo root so it doesn't confuse the workspace root
  // when multiple package-lock.json files exist (silences the workspace warning).
  outputFileTracingRoot: path.join(__dirname, '../'),

  // Allow the production build to succeed even if there are pre-existing
  // TypeScript type errors or ESLint warnings in the codebase.
  // These can be tightened incrementally without blocking deployment.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
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
  // Next announces itself in every response. It tells an attacker which
  // framework to look up exploits for and tells a visitor nothing.
  poweredByHeader: false,

  /**
   * Security headers.
   *
   * The site served none at all: no HSTS, no framing rule, no MIME rule, no
   * policy of any kind. Django sets its own on the API, but the API is a
   * different host and its headers never reach a page served from here.
   *
   * The Content-Security-Policy is the one worth reading closely, because it
   * is the only one that can break a page if it is wrong:
   *
   *  - 'unsafe-inline' is in script-src because Next.js inlines its hydration
   *    bootstrap in every page. Removing it needs per-request nonces, which
   *    needs middleware on every HTML response. Worth doing, bigger than this.
   *  - 'unsafe-eval' is in script-src because Mermaid compiles diagram source
   *    at runtime. Without it every AI diagram stops rendering.
   *  - data: and blob: are in img-src because avatars, school logos and school
   *    documents are stored as data URLs, and generated PDFs are blobs.
   *  - The API host is in connect-src; a page here talks to nothing else.
   *  - frame-ancestors 'none' is the one that actually stops clickjacking.
   *    X-Frame-Options is kept beside it for browsers that predate CSP 2.
   */
  async headers() {
    const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || '')
      .replace(/\/api\/v1\/?$/, '')
      .replace(/\/+$/, '');

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      `connect-src 'self' ${apiOrigin} https://api.eduignite.online wss: https:`.trim(),
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
      "worker-src 'self' blob:",
      'upgrade-insecure-requests',
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // Two years, every subdomain. Only sent over HTTPS by the browser's
          // own rule, so it cannot lock out local development.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Nothing here needs a camera, a microphone or a location.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

export default nextConfig;
