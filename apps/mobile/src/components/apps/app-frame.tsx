"use client";

/**
 * Hosts one app screen.
 *
 * The app runs in a sandboxed frame with an opaque origin and no network
 * access. It cannot read our cookies, our storage or our DOM, and it cannot
 * fetch anything. Everything it needs arrives by asking this component, which
 * makes the real request with the signed-in session and lets the server apply
 * the app's declared permissions.
 *
 * The frame is composed here from a cached payload rather than loaded from a
 * URL. That is what makes a screen work with no network: a remote frame is a
 * network load, and a service worker on our own origin cannot intercept
 * requests for a cross-origin iframe. Building it locally sidesteps both, and
 * srcdoc plus sandbox="allow-scripts" keeps exactly the same opaque origin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CloudOff, Loader2 } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import {
  ScreenPayload, cachePayload, cacheRead, enqueueWrite, flushQueue,
  getCachedPayload, getCachedRead,
} from "@/lib/apps/offline";

/** Every operation an app may ask for. Anything else is refused. */
const OPERATIONS = new Set([
  "data.query", "data.get", "data.count", "data.insert", "data.update", "data.delete",
  "core.students", "core.staff", "core.classes",
  "call", "ui.toast",
]);

const READ_OPERATIONS = new Set([
  "data.query", "data.get", "data.count",
  "core.students", "core.staff", "core.classes",
]);

const WRITE_OPERATIONS = new Set(["data.insert", "data.update", "data.delete"]);

/** A stable key for one read, so its result can be cached and found again. */
function readSignature(type: string, payload: any): string {
  try {
    return `${type}:${JSON.stringify(payload ?? {})}`;
  } catch {
    return `${type}:unstable`;
  }
}

/**
 * Build the frame document.
 *
 * The bundle is inlined, so any `</script>` inside it would close the tag
 * early. Escaping the sequence is the standard fix and leaves the JavaScript
 * itself unchanged.
 */
function composeDocument(payload: ScreenPayload): string {
  const safeBundle = payload.bundle.replace(/<\/script/gi, "<\\/script");
  const safeShim = payload.shim.replace(/<\/script/gi, "<\\/script");
  return [
    "<!doctype html><html><head><meta charset='utf-8'>",
    "<meta name='viewport' content='width=device-width, initial-scale=1'>",
    `<meta http-equiv="Content-Security-Policy" content="${payload.csp.replace(/"/g, "&quot;")}">`,
    "<style>html,body{margin:0;padding:0;background:transparent;",
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;}</style>",
    `<script>${safeShim}</script>`,
    "</head><body><div id='root'></div>",
    `<script type="module">${safeBundle}</script>`,
    "</body></html>",
  ].join("");
}

export function AppFrame({
  appKey,
  screenId,
  title,
}: {
  appKey: string;
  screenId: string;
  title?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const { toast } = useToast();

  const [document_, setDocument] = useState<string | null>(null);
  const [height, setHeight] = useState(520);
  const [failed, setFailed] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  // --- payload: network first, cache always ------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setDocument(null);
      setFailed(null);
      setStale(false);

      const cached = await getCachedPayload(appKey, screenId);
      if (cached && !cancelled) {
        setDocument(composeDocument(cached));
      }

      try {
        const { data } = await apiClient.get<ScreenPayload>(
          `/registry/apps/${encodeURIComponent(appKey)}/screen/${encodeURIComponent(screenId)}/payload/`
        );
        if (cancelled) return;
        // Only rebuild when the version actually moved: replacing the document
        // restarts the app and would throw away whatever the user was doing.
        if (!cached || cached.version !== data.version) {
          setDocument(composeDocument(data));
        }
        await cachePayload(data);
      } catch (error: any) {
        if (cancelled) return;
        if (cached) {
          setStale(true);          // running from cache; that is fine
        } else {
          setFailed(
            error?.response?.data?.detail ||
              "This app is not available offline yet. Open it once while connected."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appKey, screenId]);

  // --- send anything queued while offline --------------------------------
  useEffect(() => {
    async function drain() {
      const { sent } = await flushQueue(async (item) => {
        await apiClient.post(item.url, item.body);
      });
      if (sent > 0) {
        toast({ description: `${sent} change${sent === 1 ? "" : "s"} synced.` });
      }
    }
    drain();
    window.addEventListener("online", drain);
    return () => window.removeEventListener("online", drain);
  }, [toast]);

  const reply = useCallback((id: string | undefined, ok: boolean, body: any) => {
    const frame = frameRef.current;
    if (!frame?.contentWindow || !id) return;
    frame.contentWindow.postMessage(
      { __eduignite: 1, id, ok, ...(ok ? { value: body } : { error: String(body) }) },
      // The frame has an opaque origin, so "*" is the only usable target. It is
      // safe because the frame is ours and the payload carries no secret —
      // never a token, only data the server already agreed to return.
      "*"
    );
  }, []);

  const perform = useCallback(
    async (type: string, payload: any) => {
      const app = encodeURIComponent(appKey);

      const url = (() => {
        if (type.startsWith("data.")) {
          const action = type.slice(5);
          const collection = encodeURIComponent(String(payload?.collection || ""));
          if (!collection) throw new Error("No collection named.");
          return `/registry/apps/${app}/data/${collection}/${action}/`;
        }
        if (type.startsWith("core.")) {
          return `/registry/apps/${app}/core/${type.slice(5)}/`;
        }
        if (type === "call") {
          const handler = encodeURIComponent(String(payload?.handler || ""));
          if (!handler) throw new Error("No handler named.");
          return `/registry/apps/${app}/call/${handler}/`;
        }
        return "";
      })();

      if (type === "ui.toast") {
        toast({ description: String(payload?.text || "").slice(0, 300) });
        return true;
      }

      // Reads: try the network, fall back to what we last saw.
      if (READ_OPERATIONS.has(type)) {
        const signature = readSignature(type, payload);
        try {
          const { data } = type.startsWith("core.")
            ? await apiClient.get(url, { params: payload || {} })
            : await apiClient.post(url, payload);
          await cacheRead(appKey, signature, data.value);
          return data.value;
        } catch (error: any) {
          if (error?.response) throw error;    // a real refusal, not the network
          const cached = await getCachedRead(appKey, signature);
          if (cached !== null) return cached;
          throw new Error("No connection, and this has not been loaded before.");
        }
      }

      // Writes: queue them if the network is gone rather than losing them.
      if (WRITE_OPERATIONS.has(type)) {
        try {
          const { data } = await apiClient.post(url, payload);
          return data.value;
        } catch (error: any) {
          if (error?.response) throw error;    // the server said no; do not retry
          enqueueWrite({ appKey, url, body: payload });
          return { queued: true };
        }
      }

      if (type === "call") {
        const { data } = await apiClient.post(url, payload?.args || {});
        return data.value;
      }

      throw new Error("Unsupported operation.");
    },
    [appKey, toast]
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Identify the sender by the frame itself. The sandbox gives it an
      // opaque origin, so event.origin is "null" and cannot be checked —
      // matching contentWindow is the check that actually means something.
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;

      const message = event.data;
      if (!message || message.__eduignite !== 1) return;
      const type = String(message.type || "");

      if (type === "hello") {
        frame.contentWindow?.postMessage(
          {
            __eduignite: 1,
            type: "init",
            payload: { appKey, screenId, title: title || "", offline: stale },
          },
          "*"
        );
        return;
      }

      if (type === "ui.resize") {
        const next = Number(message.payload?.height) || 0;
        // Clamped: an app should not be able to make the page a mile long,
        // by accident or otherwise.
        if (next > 0) setHeight(Math.min(Math.max(next, 200), 4000));
        return;
      }

      if (!OPERATIONS.has(type)) {
        reply(message.id, false, "Unsupported operation.");
        return;
      }

      perform(type, message.payload)
        .then((value) => reply(message.id, true, value))
        .catch((error: any) =>
          reply(
            message.id,
            false,
            error?.response?.data?.detail || error?.message || "Request failed."
          )
        );
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appKey, screenId, title, stale, perform, reply]);

  const frameKey = useMemo(() => `${appKey}:${screenId}`, [appKey, screenId]);

  if (failed) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="mt-3 max-w-sm text-sm font-semibold text-muted-foreground">{failed}</p>
      </div>
    );
  }

  if (!document_) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {stale && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          <CloudOff className="h-3.5 w-3.5" />
          Offline — showing the last version you loaded. Changes will sync later.
        </p>
      )}
      <iframe
        key={frameKey}
        ref={frameRef}
        srcDoc={document_}
        title={title || `${appKey} — ${screenId}`}
        // allow-scripts without allow-same-origin: the document runs in an
        // opaque origin, so it has no access to our cookies, storage or DOM.
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="w-full rounded-2xl border border-slate-200 bg-white"
        style={{ height }}
      />
    </div>
  );
}
