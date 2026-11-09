import Link from "next/link";

import type { ContentText } from "@/lib/school-site-content";

const LINK =
  "inline-flex min-w-10 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700";

/** Server-rendered pagination: plain links, so it works without JavaScript and is crawlable. */
export function Pager({
  page, numPages, href, text,
}: { page: number; numPages: number; href: (page: number) => string; text: ContentText }) {
  if (numPages <= 1) return null;
  const pages = Array.from({ length: numPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === numPages || Math.abs(n - page) <= 1,
  );
  return (
    <nav aria-label={text.pagination} className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className={LINK}>{text.prevPage}</Link> : null}
      {pages.map((n, i) => (
        <span key={n} className="flex items-center gap-2">
          {i > 0 && n - pages[i - 1] > 1 ? <span aria-hidden>…</span> : null}
          {n === page ? (
            <span aria-current="page" aria-label={`${text.page} ${n}`} className={`${LINK} border-blue-800 bg-blue-800 !text-white`}>{n}</span>
          ) : (
            <Link href={href(n)} aria-label={`${text.page} ${n}`} className={LINK}>{n}</Link>
          )}
        </span>
      ))}
      {page < numPages ? <Link href={href(page + 1)} rel="next" className={LINK}>{text.nextPage}</Link> : null}
    </nav>
  );
}
