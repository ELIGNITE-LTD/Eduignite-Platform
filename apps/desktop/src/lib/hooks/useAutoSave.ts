import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "saving" | "saved" | "error";

/**
 * Saves each value by itself shortly after it stops changing (and at once when the field loses focus or Enter is
 * pressed). There is no draft: whatever is typed is saved, and typing again simply saves the correction.
 *
 * `save(key, value)` must throw to report a problem; the message is kept in `errors[key]` and the field offers a retry.
 */
export function useAutoSave(save: (key: string, value: string) => Promise<void>, delay = 700) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlight = useRef<Set<Promise<void>>>(new Set());
  const latest = useRef<Record<string, string>>({});
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback((key: string, value: string): Promise<void> => {
    const job = (async () => {
    setStates((s) => ({ ...s, [key]: "saving" }));
    try {
      await saveRef.current(key, value);
      setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
      setStates((s) => ({ ...s, [key]: "saved" }));
      // Once saved, the screen shows the stored value again instead of the typed text.
      setDrafts((d) => (latest.current[key] === value ? omit(d, key) : d));
      setTimeout(() => setStates((s) => (s[key] === "saved" ? omit(s, key) : s)), 2500);
    } catch (error) {
      setErrors((e) => ({ ...e, [key]: error instanceof Error ? error.message : "Not saved" }));
      setStates((s) => ({ ...s, [key]: "error" }));
    }
    })();
    inFlight.current.add(job);
    void job.finally(() => inFlight.current.delete(job));
    return job;
  }, []);

  const change = useCallback((key: string, value: string) => {
    latest.current[key] = value;
    setDrafts((d) => ({ ...d, [key]: value }));
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => { delete timers.current[key]; void run(key, value); }, delay);
  }, [run, delay]);

  const flush = useCallback((key: string) => {
    if (timers.current[key]) {
      clearTimeout(timers.current[key]);
      delete timers.current[key];
      if (key in latest.current) void run(key, latest.current[key]);
    }
  }, [run]);

  /**
   * The Save button: sends anything still waiting at once and resolves when every save has finished. Returns how
   * many marks could not be saved (0 means everything is saved).
   */
  const flushAll = useCallback(async (): Promise<number> => {
    Object.keys(timers.current).forEach((key) => flush(key));
    await Promise.all(Array.from(inFlight.current));
    let failed = 0;
    setStates((current) => { failed = Object.values(current).filter((v) => v === "error").length; return current; });
    return failed;
  }, [flush]);

  const retry = useCallback((key: string) => { if (key in latest.current) void run(key, latest.current[key]); }, [run]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  const busy = Object.values(states).includes("saving");
  return { drafts, states, errors, busy, change, flush, flushAll, retry };
}

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const next = { ...obj };
  delete next[key];
  return next;
}
