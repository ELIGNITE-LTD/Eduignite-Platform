/**
 * Registers the service worker that lets the website open with no connection.
 *
 * Only in the browser build, and only in production: in development it would
 * serve yesterday's bundle over today's edit. The mobile and desktop apps
 * carry their own files and skip this entirely.
 */

"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    // Capacitor and Electron load their own files from disk already.
    if (window.location.protocol === "file:") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* the app works without it, just not with the network off */
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
