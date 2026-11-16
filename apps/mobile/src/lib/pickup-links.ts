/** Tap-to-call and WhatsApp links for a stored phone number (digits, 237 country code). Pure. */

export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function telHref(raw: string | null | undefined): string {
  const digits = phoneDigits(raw);
  return digits ? `tel:+${digits}` : "";
}

export function whatsappHref(raw: string | null | undefined, text?: string): string {
  const digits = phoneDigits(raw);
  if (digits.length < 9) return "";
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
