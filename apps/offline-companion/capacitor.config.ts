import type { CapacitorConfig } from "@capacitor/cli";

// Distinct from apps/mobile's `online.eduignite.app` — this is a separate,
// sibling standalone app (a school tech admin can install this one alone
// without needing the full EduIgnite Mobile app just to activate/renew an
// EduIgnite Offline desktop license).
const config: CapacitorConfig = {
  appId: "com.eduignite.companion",
  appName: "EduIgnite Companion",
  // Next.js static export output.
  webDir: "out",
  // Route all fetch/XHR through the native HTTP stack, same as apps/mobile —
  // gives the WebView requests to api.eduignite.online without CORS
  // restrictions, same backend as every other EduIgnite app.
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: "#264D73",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
