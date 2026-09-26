/**
 * What the app tells you about work that has not reached the server.
 *
 * Until now the queue was silent: a bursar recording payments in a room with
 * no signal had no way of knowing whether anything was waiting, and work the
 * server refused was deleted without anyone being told. This is the other half
 * of that fix - the queue is now visible, and nothing leaves it without a
 * person deciding.
 *
 * It says nothing at all when there is nothing to say, so it never becomes a
 * bar people learn to ignore.
 */

"use client";

import { AlertTriangle, CloudUpload, Loader2, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api/client";
import {
  discardItem,
  flushOutbox,
  onOutboxChange,
  onSyncChange,
  retryItem,
  type OutboxItem,
} from "@/lib/offline";
import { cn } from "@/lib/utils";

function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setOnline(typeof navigator === "undefined" || navigator.onLine !== false);

    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const stopWatchingOutbox = onOutboxChange(setItems);
    const stopWatchingSync = onSyncChange((state) => setRunning(state.running));

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      stopWatchingOutbox();
      stopWatchingSync();
    };
  }, []);

  return {
    online,
    running,
    waiting: items.filter((item) => item.status !== "failed"),
    refused: items.filter((item) => item.status === "failed"),
  };
}

/** The bar across the top of the dashboard. */
export function OfflineStatusBar() {
  const { online, running, waiting, refused } = useOutbox();
  const [showRefused, setShowRefused] = useState(false);

  if (online && waiting.length === 0 && refused.length === 0) return null;

  const tone = !online
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : refused.length > 0
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : "border-sky-200 bg-sky-50 text-sky-900";

  return (
    <div className={cn("border-b px-4 py-2.5 text-xs font-bold", tone)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {!online ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              Working offline.{" "}
              {waiting.length > 0
                ? `${waiting.length} ${waiting.length === 1 ? "entry is" : "entries are"} saved on this device and will be sent when the connection returns.`
                : "Anything you record is saved on this device and sent when the connection returns."}
            </span>
          </>
        ) : waiting.length > 0 ? (
          <>
            {running ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <CloudUpload className="h-4 w-4 shrink-0" />
            )}
            <span>
              {running ? "Sending" : "Waiting to send"} {waiting.length}{" "}
              {waiting.length === 1 ? "entry" : "entries"} recorded on this device.
            </span>
            {!running && (
              <button
                type="button"
                onClick={() => void flushOutbox(apiClient)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1 font-black uppercase tracking-wide"
              >
                <RefreshCw className="h-3 w-3" /> Send now
              </button>
            )}
          </>
        ) : null}

        {refused.length > 0 && (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {refused.length} {refused.length === 1 ? "entry was" : "entries were"} refused by the
              server.
            </span>
            <button
              type="button"
              onClick={() => setShowRefused((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1 font-black uppercase tracking-wide"
            >
              {showRefused ? "Hide" : "Review"}
            </button>
          </>
        )}
      </div>

      {showRefused && refused.length > 0 && (
        <ul className="mt-3 space-y-2">
          {refused.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-white/70 px-3 py-2"
            >
              <span className="font-black">{item.label}</span>
              <span className="font-medium opacity-80">
                recorded {new Date(item.createdAt).toLocaleString()}
              </span>
              {item.lastError && <span className="font-medium opacity-80">{item.lastError}</span>}
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void retryItem(item.id).then(() => flushOutbox(apiClient))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 font-black uppercase tracking-wide"
                >
                  <RefreshCw className="h-3 w-3" /> Try again
                </button>
                <button
                  type="button"
                  onClick={() => void discardItem(item.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-black uppercase tracking-wide opacity-70"
                  title="Remove this entry. It will not be sent."
                >
                  <X className="h-3 w-3" /> Discard
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A small mark for a record that has not reached the server yet. */
export function PendingSyncBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-800",
        className,
      )}
      title="Recorded on this device. It will be sent to the server when the connection returns."
    >
      <CloudUpload className="h-3 w-3" /> Not yet sent
    </span>
  );
}
