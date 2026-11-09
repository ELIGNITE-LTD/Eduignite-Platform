import Image from "next/image";

import { resolveMediaUrl } from "@/lib/media";
import type { SchoolLang } from "@/lib/public-schools";
import type { SiteItem } from "@/lib/school-site-content";

function formatDate(value: string | null, lang: SchoolLang) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" });
}

/** Responsive cards for published events, gallery photos and blog posts. */
export function ItemGrid({ items, lang, higher = false }: { items: SiteItem[]; lang: SchoolLang; higher?: boolean }) {
  if (higher) {
    return (
      <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const image = resolveMediaUrl(item.image);
          const date = formatDate(item.date, lang);
          return (
            <li key={item.id} className="flex flex-col">
              {image ? (
                <div className="relative aspect-[3/2] overflow-hidden bg-[var(--he-paper)]" style={{ borderRadius: 2 }}>
                  <Image src={image} alt={item.title || ""} fill unoptimized loading="lazy" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                </div>
              ) : null}
              {date ? <p className="mt-5 text-sm text-[var(--he-accent)]">{date}</p> : null}
              {item.title ? <h3 className="he-serif mt-1.5 text-2xl font-medium leading-snug text-[var(--he-text)]">{item.title}</h3> : null}
              {item.excerpt ? <p className="mt-2 line-clamp-3 leading-7 text-[var(--he-muted)]">{item.excerpt}</p> : null}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const image = resolveMediaUrl(item.image);
        const date = formatDate(item.date, lang);
        return (
          <li key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {image ? (
              <div className="relative aspect-[4/3] bg-slate-100">
                <Image src={image} alt={item.title} fill unoptimized loading="lazy" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
              </div>
            ) : null}
            {item.title || date || item.excerpt ? (
              <div className="p-5">
                {date ? <p className="text-xs font-semibold uppercase tracking-wide text-green-800">{date}</p> : null}
                {item.title ? <h3 className="mt-1 text-lg font-bold text-blue-950">{item.title}</h3> : null}
                {item.excerpt ? <p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.excerpt}</p> : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
