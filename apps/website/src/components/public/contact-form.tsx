"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { submitContactMessage } from "@/lib/public-site";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] text-[#12314d] outline-none transition-colors placeholder:text-slate-500 focus:border-[#0E7490] focus:ring-2 focus:ring-[#0E7490]/30";
const labelClass = "mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-600";

/**
 * The public contact form. It asks only for what a reply needs (name, email,
 * the message) and, as Cameroon's data protection law expects, for explicit
 * consent before anything is sent: an unticked box, linked to the policy.
 */
export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [detail, setDetail] = useState("");

  const update = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setStatus("error");
      setDetail("Please fill in your name, email and message.");
      return;
    }
    if (!consent) {
      setStatus("error");
      setDetail("Please tick the box to agree to us using your details to reply.");
      return;
    }
    setStatus("sending");
    const res = await submitContactMessage({
      name: form.name.trim(),
      email: form.email.trim(),
      subject: form.subject.trim(),
      message: form.message.trim(),
    });
    if (res.ok) {
      setStatus("sent");
      setDetail(res.detail);
      setForm({ name: "", email: "", subject: "", message: "" });
      setConsent(false);
    } else {
      setStatus("error");
      setDetail(res.detail);
    }
  };

  if (status === "sent") {
    return (
      <div
        role="status"
        className="flex flex-col items-center justify-center rounded-2xl border border-green-200 bg-green-50 px-8 py-16 text-center"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-700 text-white">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </span>
        <h3 className="mt-5 font-serif text-2xl font-bold text-[#12314d]">Message sent</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">{detail}</p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 text-sm font-bold text-[#264D73] hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_18px_40px_-24px_rgba(18,49,77,0.2)] sm:p-8"
    >
      <h2 className="font-serif text-2xl font-bold text-[#12314d]">Send us a message</h2>
      <p className="mt-1 text-sm text-slate-600">We read every message and reply by email.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className={labelClass}>Your name</label>
          <input
            id="contact-name"
            name="name"
            autoComplete="name"
            className={inputClass}
            value={form.name}
            onChange={update("name")}
            placeholder="Full name"
            required
          />
        </div>
        <div>
          <label htmlFor="contact-email" className={labelClass}>Email</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            className={inputClass}
            value={form.email}
            onChange={update("email")}
            placeholder="you@email.com"
            required
          />
        </div>
      </div>
      <div className="mt-4">
        <label htmlFor="contact-subject" className={labelClass}>
          Subject <span className="font-semibold normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="contact-subject"
          name="subject"
          className={inputClass}
          value={form.subject}
          onChange={update("subject")}
          placeholder="What is this about?"
        />
      </div>
      <div className="mt-4">
        <label htmlFor="contact-message" className={labelClass}>Message</label>
        <textarea
          id="contact-message"
          name="message"
          className={`${inputClass} min-h-[140px] resize-y`}
          value={form.message}
          onChange={update("message")}
          placeholder="Tell us how we can help…"
          required
        />
      </div>

      <label htmlFor="contact-consent" className="mt-5 flex items-start gap-3 text-sm leading-relaxed text-slate-600">
        <input
          id="contact-consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          className="mt-1 h-4 w-4 shrink-0 accent-[#264D73]"
        />
        <span>
          I agree that EduIgnite may use my name, email and message to reply to me, as described in the{" "}
          <Link href="/privacy" className="font-bold text-[#264D73] underline">
            Privacy Policy
          </Link>
          . We do not add you to any mailing list.
        </span>
      </label>

      {status === "error" && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {detail}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-[#264D73]/20 transition-all hover:-translate-y-0.5 hover:bg-[#1c3c5c] disabled:opacity-70"
      >
        {status === "sending" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}
        {status === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
