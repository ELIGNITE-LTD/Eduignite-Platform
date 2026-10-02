import Link from "next/link";
import type { ReactNode } from "react";
import { SITE } from "@/lib/public-site";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** The legal pages, so every one can link to the others. */
export const LEGAL_PAGES = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/refunds", label: "Refund Policy" },
] as const;

/**
 * The shared layout of the legal pages: a plain header with the date of the
 * current version, a list of sections to jump to, and the text set for
 * reading (short line length, generous spacing), so a parent or a head
 * teacher can actually read it on a phone. It also prints cleanly.
 */
export function LegalPage({
  title,
  summary,
  updated,
  sections,
  current,
}: {
  title: string;
  summary: ReactNode;
  /** Shown as "Last updated", e.g. "2 October 2026". */
  updated: string;
  sections: LegalSection[];
  current: (typeof LEGAL_PAGES)[number]["href"];
}) {
  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-[#EAF3FA] to-white print:bg-none">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0E7490]">Legal</p>
          <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-[#12314d] sm:text-5xl">{title}</h1>
          <p className="mt-3 text-sm font-semibold text-slate-600">Last updated: {updated}</p>
          <div className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-700">{summary}</div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[15rem_1fr] lg:px-8 lg:py-16">
        <aside className="print:hidden">
          <nav aria-label="On this page" className="lg:sticky lg:top-24">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">On this page</p>
            <ol className="mt-4 space-y-2 border-l border-slate-200 text-sm">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l-2 border-transparent py-0.5 pl-4 text-slate-600 hover:border-[#264D73] hover:text-[#12314d]"
                  >
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>

            <p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-slate-600">Other policies</p>
            <ul className="mt-3 space-y-2 text-sm">
              {LEGAL_PAGES.filter((page) => page.href !== current).map((page) => (
                <li key={page.href}>
                  <Link href={page.href} className="font-semibold text-[#264D73] underline-offset-4 hover:underline">
                    {page.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="legal-text min-w-0 max-w-3xl">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 border-b border-slate-100 pb-8 pt-2 last:border-0">
              <h2 className="font-serif text-2xl font-bold text-[#12314d]">
                {index + 1}. {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-[16px] leading-[1.75] text-slate-700">{section.body}</div>
            </section>
          ))}

          <div className="mt-10 rounded-2xl border border-slate-200 bg-[#F7F9FC] p-6">
            <h2 className="font-serif text-xl font-bold text-[#12314d]">Questions about this policy?</h2>
            <p className="mt-2 text-[16px] leading-relaxed text-slate-700">
              Write to us at{" "}
              <a href={`mailto:${SITE.email}`} className="font-bold text-[#264D73] underline">
                {SITE.email}
              </a>
              . We are based in {SITE.location}. A French version of this page is available on request.
            </p>
          </div>
        </article>
      </div>
    </>
  );
}

/** A small, readable table for the legal pages (it scrolls sideways on a phone). */
export function LegalTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead className="bg-[#F7F9FC] text-[#12314d]">
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="border-b border-slate-200 px-4 py-3 font-black">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top odd:bg-white even:bg-slate-50/60">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`border-b border-slate-100 px-4 py-3 leading-relaxed text-slate-700 ${cellIndex === 0 ? "min-w-[13rem]" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
