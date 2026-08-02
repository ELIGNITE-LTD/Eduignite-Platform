import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.eduignite.app',
  appName: 'EduIgnite',
  // Next.js static export output.
  webDir: 'out',
  // Route all fetch/XHR through the native HTTP stack. This gives the WebView
  // requests to api.eduignite.online without CORS restrictions on both iOS and
  // Android — the same backend as web and desktop.
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#4B2FD1',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resize: 'native',
    },
  },
  android: {
    // Allow the WebView to load the app assets and talk to the backend.
    allowMixedContent: false,
  },
};

export default config;
