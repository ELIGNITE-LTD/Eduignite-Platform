"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useHigherChildren } from "@/lib/hooks/useHigherEd";
import { selectClass, useHigherText } from "./higher-shared";

const KEY = "higher-selected-child";

/**
 * For a parent: which of their children the page shows. A student (or anyone else) gets no picker and an empty id,
 * so the server uses their own record. The choice is remembered for the session.
 */
export function useChildPicker(): { child: string | undefined; picker: ReactNode; ready: boolean; hasChildren: boolean; isParent: boolean } {
  const tr = useHigherText();
  const { user } = useAuth();
  const isParent = String(user?.role || "").toUpperCase() === "PARENT";
  const children = useHigherChildren(isParent);
  const list = children.data ?? [];
  const [chosen, setChosen] = useState("");
  useEffect(() => {
    try { setChosen(window.sessionStorage.getItem(KEY) || ""); } catch { /* storage unavailable */ }
  }, []);
  const child = isParent ? (list.find((c) => c.student === chosen)?.student ?? list[0]?.student) : undefined;
  const picker = isParent && list.length > 1 ? (
    <select className={`${selectClass} max-w-xs`} value={child ?? ""} aria-label={tr("Child", "Enfant")}
      onChange={(e) => { setChosen(e.target.value); try { window.sessionStorage.setItem(KEY, e.target.value); } catch { /* ignore */ } }}>
      {list.map((c) => <option key={c.student} value={c.student}>{c.name} · {c.programme}</option>)}
    </select>
  ) : null;
  return { child, picker, ready: !isParent || !children.isLoading, hasChildren: !isParent || list.length > 0, isParent };
}
