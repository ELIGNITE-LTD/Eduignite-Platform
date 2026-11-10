import Image from "next/image";

import { resolveMediaUrl } from "@/lib/media";
import type { PublicLeader } from "@/lib/public-schools";

export function LeaderCard({
  person, fallbackTitle, large = false, higher = false,
}: { person: PublicLeader; fallbackTitle?: string; large?: boolean; higher?: boolean }) {
  const photo = resolveMediaUrl(person.photo);
  if (higher) {
    const heading = person.title || fallbackTitle || "";
    return (
      <li className="group flex flex-col">
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-[#0f1c2e] to-[#244066]" style={{ borderRadius: 2 }}>
          {photo ? (
            <Image src={photo} alt={person.name} fill unoptimized loading="lazy" sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover object-top" />
          ) : (
            <span className="he-display absolute inset-0 flex items-center justify-center text-7xl text-[#d9b866]" aria-hidden>
              {person.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <p className="he-serif mt-4 text-xl font-semibold leading-snug text-[var(--he-text)]">{person.name}</p>
        {heading ? <p className="mt-1 text-sm font-medium text-[var(--he-accent)]">{heading}</p> : null}
        {person.bio ? <p className="mt-2 text-sm leading-6 text-[var(--he-muted)]">{person.bio}</p> : null}
      </li>
    );
  }
  const size = large ? 96 : 72;
  const title = person.title || fallbackTitle || "";
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
      <div
        className="mx-auto flex items-center justify-center overflow-hidden rounded-full bg-blue-50 ring-2 ring-blue-100"
        style={{ width: size, height: size }}
      >
        {photo ? (
          <Image src={photo} alt={person.name} width={size} height={size} unoptimized className="h-full w-full object-cover" />
        ) : (
          <span className="text-xl font-black text-blue-800" aria-hidden>{person.name.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <p className="mt-3 font-bold text-blue-950">{person.name}</p>
      {title ? <p className="mt-0.5 text-sm font-medium text-green-800">{title}</p> : null}
      {person.bio ? <p className="mt-2 text-sm leading-6 text-slate-600">{person.bio}</p> : null}
    </li>
  );
}
