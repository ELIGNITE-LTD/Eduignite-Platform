"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Search, Loader2, PlayCircle, BookOpen } from "lucide-react";
import { searchAcademy, type SearchResult } from "@/app/academy/_lib/public-api";

/**
 * The landing page's public search: a natural-language-ish lesson/course
 * search that returns direct deep links (spec Section 4 — "instead of
 * forcing a visitor to enroll and take an entire curriculum, search indexes
 * return direct links to the exact targeted lessons").
 */
export function AcademySearchBar() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const data = await searchAcademy(q);
      setResults(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form onSubmit={onSubmit} className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="How do I add a teacher?"
          aria-label="Search the Academy"
          className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-28 text-sm font-medium text-[#12314d] shadow-sm outline-none focus:border-[#67D0E4] focus:ring-2 focus:ring-[#67D0E4]/30"
        />
        <button
          type="submit"
          disabled={loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-[#264D73] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </button>
      </form>

      {results !== null && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-sm">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No lessons or courses matched &ldquo;{q}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((r) => (
                <li key={r.type === "lesson" ? `lesson-${r.lesson_id}` : `course-${r.course_slug}`}>
                  <Link
                    href={r.type === "lesson" ? `/academy/courses/${r.course_slug}` : r.deep_link}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-[#F7F9FC]"
                  >
                    {r.type === "lesson" ? (
                      <PlayCircle className="h-4 w-4 shrink-0 text-[#67D0E4]" />
                    ) : (
                      <BookOpen className="h-4 w-4 shrink-0 text-[#67D0E4]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#12314d]">{r.title}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.type === "lesson"
                          ? `${r.course_title} · ${r.duration_minutes} min`
                          : "Course"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
