"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CareMessage } from "@/lib/api/services/customer-care.service";

/**
 * Loads a conversation's messages and keeps them fresh by polling with the
 * API's `since_id` (no websocket for this module). Polling pauses while the
 * tab is hidden and resumes (with an immediate refresh) when it is visible.
 */
export function useMessageThread(
  conversationId: string | null,
  fetcher: (id: string, sinceId?: number) => Promise<CareMessage[]>,
  options: { intervalMs?: number; onNew?: (fresh: CareMessage[]) => void } = {},
) {
  const { intervalMs = 12000, onNew } = options;
  const [messages, setMessages] = useState<CareMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const known = useRef<Map<number, CareMessage>>(new Map());
  const fetcherRef = useRef(fetcher);
  const onNewRef = useRef(onNew);
  const activeId = useRef<string | null>(null);
  fetcherRef.current = fetcher;
  onNewRef.current = onNew;

  /** Adds/updates messages (deduplicated by id) and returns the ones not seen before. */
  const merge = useCallback((incoming: CareMessage[]): CareMessage[] => {
    if (!incoming.length) return [];
    const fresh = incoming.filter((m) => !known.current.has(m.id));
    incoming.forEach((m) => known.current.set(m.id, m));
    setMessages(Array.from(known.current.values()).sort((a, b) => a.id - b.id));
    return fresh;
  }, []);

  const lastId = () => {
    let max = 0;
    known.current.forEach((_, id) => {
      if (id > max) max = id;
    });
    return max;
  };

  const load = useCallback(async () => {
    const id = activeId.current;
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const all = await fetcherRef.current(id);
      if (activeId.current !== id) return;
      known.current = new Map();
      setMessages([]);
      merge(all);
    } catch {
      if (activeId.current === id) setError(true);
    } finally {
      if (activeId.current === id) setLoading(false);
    }
  }, [merge]);

  const poll = useCallback(async () => {
    const id = activeId.current;
    if (!id || typeof document === "undefined" || document.visibilityState !== "visible") return;
    try {
      const incoming = await fetcherRef.current(id, lastId() || undefined);
      if (activeId.current !== id) return;
      const fresh = merge(incoming);
      if (fresh.length) onNewRef.current?.(fresh);
    } catch {
      /* a failed poll is silent: the next tick retries */
    }
  }, [merge]);

  useEffect(() => {
    activeId.current = conversationId;
    known.current = new Map();
    setMessages([]);
    setError(false);
    if (!conversationId) return;
    void load();
    const timer = window.setInterval(() => void poll(), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId, intervalMs, load, poll]);

  const upsert = useCallback((message: CareMessage) => merge([message]), [merge]);

  return { messages, loading, error, reload: load, refresh: poll, upsert };
}
