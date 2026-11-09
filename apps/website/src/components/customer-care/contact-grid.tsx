import { Facebook, Globe, Instagram, Linkedin, Link2, Mail, MapPin, Phone, Youtube } from "lucide-react";
import type { ContactItem, ContactKind } from "@/lib/api/services/customer-care.service";

/**
 * Contact items as a clean icon grid. Server-component safe (no hooks), used by
 * the public Contact page, the footer and the founders' live preview. Honours
 * each item's display mode (icon_only / icon_text) and builds safe links.
 */

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.05 0C5.5 0 .17 5.33.17 11.88c0 2.09.55 4.13 1.59 5.93L0 24l6.35-1.66a11.87 11.87 0 0 0 5.7 1.45h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.17-1.23-6.15-3.42-8.43ZM12.06 21.8h-.01a9.86 9.86 0 0 1-5.03-1.38l-.36-.21-3.77.99 1-3.67-.24-.38a9.84 9.84 0 0 1-1.51-5.27c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 7c0 5.46-4.44 9.9-9.86 9.9Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z" />
    </svg>
  );
}

export function ContactIcon({ kind, className }: { kind: ContactKind | string; className?: string }) {
  switch (kind) {
    case "email": return <Mail className={className} aria-hidden />;
    case "phone": return <Phone className={className} aria-hidden />;
    case "whatsapp": return <WhatsAppIcon className={className} />;
    case "address": return <MapPin className={className} aria-hidden />;
    case "website": return <Globe className={className} aria-hidden />;
    case "facebook": return <Facebook className={className} aria-hidden />;
    case "instagram": return <Instagram className={className} aria-hidden />;
    case "linkedin": return <Linkedin className={className} aria-hidden />;
    case "youtube": return <Youtube className={className} aria-hidden />;
    default: return <Link2 className={className} aria-hidden />;
  }
}

const SOCIAL = new Set(["facebook", "instagram", "linkedin", "youtube"]);

/** The link for an item: the API's `href` when present, else derived from kind + value. Only mailto/tel/https. */
export function contactHref(item: Pick<ContactItem, "kind" | "value" | "href">): string | null {
  const given = (item.href || "").trim();
  if (/^(https:\/\/|mailto:|tel:)/i.test(given)) return given;
  const value = (item.value || "").trim();
  if (!value) return null;
  switch (item.kind) {
    case "email": return `mailto:${value}`;
    case "phone": return `tel:${value.replace(/[^\d+]/g, "")}`;
    case "whatsapp": return `https://wa.me/${value.replace(/[^\d]/g, "")}`;
    case "address": return null;
    default: return /^https:\/\//i.test(value) ? value : null;
  }
}

export function ContactGrid({
  items,
  tone = "light",
  className = "",
}: {
  items: ContactItem[];
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <ul className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      {items.map((item) => {
        const href = contactHref(item);
        const iconOnly = item.display_mode === "icon_only";
        const external = href ? /^https:\/\//i.test(href) : false;
        const shell = dark
          ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
          : "border-slate-200/80 bg-white text-[#12314d] hover:border-[#67D0E4]";
        const chip = dark ? "bg-white/10 text-[#67D0E4]" : "bg-[#264D73] text-white";
        const body = (
          <>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${chip}`}>
              <ContactIcon kind={item.kind} className="h-5 w-5" />
            </span>
            {iconOnly ? (
              <span className="sr-only">{item.label || item.value}</span>
            ) : (
              <span className="min-w-0">
                <span className={`block text-[11px] font-semibold uppercase tracking-wider ${dark ? "text-white/60" : "text-slate-500"}`}>{item.label}</span>
                <span className="block break-words text-sm font-bold">{item.value}</span>
              </span>
            )}
          </>
        );
        const cls = `flex min-h-[56px] items-center gap-3 rounded-2xl border p-3 transition-colors ${shell} ${iconOnly ? "justify-center sm:justify-start" : ""}`;
        return (
          <li key={item.id} className={iconOnly ? "sm:col-span-1" : ""}>
            {href ? (
              <a
                href={href}
                className={cls}
                aria-label={item.label || item.value}
                {...(external || SOCIAL.has(item.kind) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {body}
              </a>
            ) : (
              <div className={cls} aria-label={item.label || item.value}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Compact list for the website footer: text lines for email/phone/WhatsApp/address, icon row for links. */
export function ContactFooterList({ items }: { items: ContactItem[] }) {
  const lines = items.filter((i) => ["email", "phone", "whatsapp", "address"].includes(i.kind) && i.display_mode !== "icon_only");
  const icons = items.filter((i) => !lines.includes(i));
  return (
    <div className="mt-5 space-y-3 text-sm text-white/70">
      {lines.map((item) => {
        const href = contactHref(item);
        return (
          <p key={item.id} className="flex items-center gap-2">
            <ContactIcon kind={item.kind} className="h-4 w-4 shrink-0 text-[#67D0E4]" />
            {href ? <a href={href} className="break-all hover:text-white">{item.value}</a> : <span>{item.value}</span>}
          </p>
        );
      })}
      {icons.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {icons.map((item) => {
            const href = contactHref(item);
            const cls = "flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-[#67D0E4] hover:bg-white/20";
            return (
              <li key={item.id}>
                {href ? (
                  <a href={href} className={cls} aria-label={item.label || item.value} {...(/^https:/i.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    <ContactIcon kind={item.kind} className="h-4 w-4" />
                  </a>
                ) : (
                  <span className={cls} aria-label={item.label || item.value}><ContactIcon kind={item.kind} className="h-4 w-4" /></span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
