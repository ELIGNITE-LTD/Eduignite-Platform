"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api/client";

/**
 * Device push bridge: asks the OS for notification permission right after
 * login, then watches the user's notification feed and mirrors every new
 * entry (marks, payments, school events, announcements, chat messages ...) as
 * a real device notification - Android notification shade on mobile,
 * Windows/macOS toasts on desktop.
 *
 * Mobile uses the native LocalNotifications plugin through the Capacitor
 * bridge global (no import, so this exact file also builds on desktop,
 * where the standard web Notification API is used instead).
 */

const POLL_MS = 25_000;
const MAX_TOASTS_PER_POLL = 3;
const ICON = "/icons/eduignite-icon-192.png";

const getCapacitorLocalNotifications = () => {
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap?.Plugins?.LocalNotifications ?? null;
};

async function registerNativePush(): Promise<void> {
  // Real FCM push (delivered even when the app is closed) on devices where
  // the native PushNotifications plugin is present.
  const cap = (window as any).Capacitor;
  const Push = cap?.isNativePlatform?.() ? cap?.Plugins?.PushNotifications : null;
  if (!Push) return;
  try {
    const perm = await Push.requestPermissions();
    if (perm?.receive !== "granted") return;
    await Push.addListener("registration", (t: any) => {
      apiClient
        .post("/notifications/devices/", { platform: "android", token: t?.value || "" })
        .catch(() => {});
    });
    await Push.register();
  } catch {
    /* fall back to the in-app watcher */
  }
}

async function requestPermission(): Promise<void> {
  const native = getCapacitorLocalNotifications();
  try {
    if (native) {
      // Android 13+ shows the system POST_NOTIFICATIONS prompt here.
      const status = await native.checkPermissions();
      if (status?.display !== "granted") {
        await native.requestPermissions();
      }
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch {
    /* the user can still use the app without device notifications */
  }
}

async function showDeviceNotification(title: string, body: string) {
  const native = getCapacitorLocalNotifications();
  try {
    if (native) {
      await native.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483000) + Math.floor(Math.random() * 400),
            title,
            body,
          },
        ],
      });
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: ICON, silent: false });
    }
  } catch {
    /* never break the app over a toast */
  }
}

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

export function NotificationWatcher() {
  const { user, isAuthenticated } = useAuth();
  const seenKey = user?.id ? `eduignite_notif_seen_${user.id}` : "";
  const busyRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !seenKey) return;

    requestPermission();
    registerNativePush();

    const check = async () => {
      if (busyRef.current || (typeof navigator !== "undefined" && !navigator.onLine)) return;
      busyRef.current = true;
      try {
        const { data } = await apiClient.get("/notifications/notifications/", {
          params: { page_size: 10 },
        });
        const items = normalizeList(data);
        if (!items.length) return;

        const seenRaw = window.localStorage.getItem(seenKey);
        const newestTs = items
          .map((n: any) => new Date(n.created_at || 0).getTime())
          .reduce((a: number, b: number) => Math.max(a, b), 0);

        if (!seenRaw) {
          // First run after login: seed the marker silently so the user is
          // not blasted with their whole history.
          window.localStorage.setItem(seenKey, String(newestTs));
          return;
        }

        const seenTs = Number(seenRaw) || 0;
        const fresh = items
          .filter((n: any) => new Date(n.created_at || 0).getTime() > seenTs)
          .sort(
            (a: any, b: any) =>
              new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
          );

        if (fresh.length) {
          const toShow = fresh.slice(-MAX_TOASTS_PER_POLL);
          for (const n of toShow) {
            await showDeviceNotification(n.title || "EduIgnite", n.message || "");
          }
          if (fresh.length > MAX_TOASTS_PER_POLL) {
            await showDeviceNotification(
              "EduIgnite",
              `${fresh.length - MAX_TOASTS_PER_POLL} more notification(s) are waiting for you.`
            );
          }
          window.localStorage.setItem(seenKey, String(newestTs));
        }
      } catch {
        /* offline or transient - try again on the next tick */
      } finally {
        busyRef.current = false;
      }
    };

    check();
    const interval = window.setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [isAuthenticated, seenKey]);

  return null;
}
