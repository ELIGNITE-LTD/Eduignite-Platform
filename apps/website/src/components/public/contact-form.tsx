"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { submitContactMessage } from "@/lib/public-site";

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] text-[#12314d] outline-none transition-colors placeholder:text-slate-400 focus:border-[#67D0E4] focus:ring-2 focus:ring-[#67D0E4]/30";

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
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
    } else {
      setStatus("error");
      setDetail(res.detail);
    }
  };

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-green-200 bg-green-50 px-8 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white">
          <CheckCircle2 className="h-7 w-7" />
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
    <form onSubmit={submit} className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_18px_40px_-24px_rgba(18,49,77,0.2)] sm:p-8">
      <h2 className="font-serif text-2xl font-bold text-[#12314d]">Send us a message</h2>
      <p className="mt-1 text-sm text-slate-500">We usually reply within one business day.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">Your name</label>
          <input className={inputClass} value={form.name} onChange={update("name")} placeholder="Full name" required />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">Email</label>
          <input type="email" className={inputClass} value={form.email} onChange={update("email")} placeholder="you@email.com" required />
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">Subject</label>
        <input className={inputClass} value={form.subject} onChange={update("subject")} placeholder="What is this about?" />
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">Message</label>
        <textarea className={`${inputClass} min-h-[140px] resize-y`} value={form.message} onChange={update("message")} placeholder="Tell us how we can help…" required />
      </div>

      {status === "error" && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{detail}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-[#264D73]/20 transition-all hover:-translate-y-0.5 hover:bg-[#1c3c5c] disabled:opacity-70"
      >
        {status === "sending" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {status === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
