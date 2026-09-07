import type { Config } from "tailwindcss";

// Minimal palette — just what this small app needs, matching the EduIgnite
// brand primary (#264D73) used across apps/mobile and apps/website for
// visual consistency. Deliberately not pulling in the full shadcn/radix
// design-system used by apps/mobile — this app's UI surface is small enough
// that plain Tailwind utility classes keep the dependency tree light.
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        body: ["Inter", "sans-serif"],
      },
      colors: {
        primary: {
          DEFAULT: "#264D73",
          dark: "#1B3A57",
          light: "#3A6591",
        },
        accent: "#67D0E4",
        destructive: "#DC2626",
        background: "#F0F2F5",
      },
    },
  },
  plugins: [],
} satisfies Config;
