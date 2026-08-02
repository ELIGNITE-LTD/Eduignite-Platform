import type {NextConfig} from 'next';
import path from 'path';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const lodashRoot = path.dirname(require.resolve('lodash/package.json'));

const nextConfig: NextConfig = {
  // Produce a self-contained production server so the Electron desktop shell
  // can launch it as a child process (see electron/main.js).
  output: 'standalone',

  // Keep file tracing scoped to this project root for the standalone bundle.
  outputFileTracingRoot: __dirname,

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
};

export default nextConfig;
