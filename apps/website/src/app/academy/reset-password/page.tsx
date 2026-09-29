"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, LogIn } from "lucide-react";

import { authService } from "@/lib/api/services/auth.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { AcademyLoadingScreen, AcademyLogo } from "../_components/academy-brand";

const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#12314d] transition-colors focus:border-[#264D73]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264D73]/15";

/**
 * Where the Academy's password-reset email lands. The link's token is checked
 * by the platform's existing reset endpoint: it expires, works once, and stops
 * working the moment the password changes. The learner's account, courses and
 * certificates are untouched; only the password changes.
 */
function AcademyResetPasswordInner() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Your new password must have at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await authService.confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "This reset link is invalid or has expired. Please request a new one."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden p-4 sm:p-8"
      style={{ background: "linear-gradient(to bottom, #EAF3FA 0%, #F2F7FB 55%, #FBFCFE 100%)" }}
    >
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AcademyLogo size="xl" />
          <h1 className="font-serif text-3xl font-bold leading-[1.15] tracking-tight text-[#12314d] sm:text-4xl">
            EduIgnite Academy
          </h1>
        </div>

        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          {done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
              <h2 className="font-serif text-2xl font-bold text-[#12314d]">Password changed</h2>
              <p className="text-sm leading-relaxed text-slate-600">
                You can now log in with your email address and your new password.
              </p>
              <a
                href="/academy/start?mode=login"
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[#264D73] text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c]"
              >
                <LogIn className="h-4 w-4" /> Log in
              </a>
            </div>
          ) : !token ? (
            <div className="space-y-4 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
              <h2 className="font-serif text-2xl font-bold text-[#12314d]">This link is incomplete</h2>
              <p className="text-sm leading-relaxed text-slate-600">
                Open the link from your email again, or ask for a new one.
              </p>
              <a href="/academy/start?mode=login" className="text-sm font-bold text-[#264D73] hover:underline">
                Back to log in
              </a>
            </div>
          ) : (
            <>
              <div className="text-center">
                <h2 className="font-serif text-2xl font-bold text-[#12314d]">Choose a new password</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Your courses, progress and certificates stay exactly as they are.
                </p>
              </div>

              {error && (
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div className="text-sm font-semibold leading-relaxed text-red-900">
                    <p>{error}</p>
                    <a href="/academy/start?mode=login" className="mt-1 inline-block text-[#264D73] underline">
                      Request a new link
                    </a>
                  </div>
                </div>
              )}

              <form onSubmit={submit} className="mt-7 space-y-4">
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">New password</label>
                  <input
                    required
                    minLength={8}
                    type="password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className={INPUT_CLASS}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="ml-1 text-xs font-medium text-slate-500">At least 8 characters.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">Confirm new password</label>
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className={INPUT_CLASS}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[#264D73] text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:cursor-wait disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Save new password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** useSearchParams() needs a Suspense boundary for `next build`. */
export default function AcademyResetPasswordPage() {
  return (
    <Suspense fallback={<AcademyLoadingScreen label="Opening reset page" />}>
      <AcademyResetPasswordInner />
    </Suspense>
  );
}
