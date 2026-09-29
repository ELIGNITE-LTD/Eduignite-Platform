"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { setTokens } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  LogIn,
  Sparkles,
  UserPlus,
  AlertTriangle,
  KeyRound,
  MailCheck,
} from "lucide-react";
import { ssoContinue, registerLearner, loginLearner, requestLearnerPasswordReset } from "./_lib/api";
import { AcademyLoadingScreen, AcademyLogo } from "../_components/academy-brand";

type Step = "choice" | "register" | "login" | "forgot" | "forgot-sent";

const INPUT_CLASS =
  "h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#12314d] transition-colors focus:border-[#264D73]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264D73]/15";

const TITLES: Record<Step, string> = {
  choice: "Get started",
  register: "Create your account",
  login: "Log in as an Academy learner",
  forgot: "Forgot your password?",
  "forgot-sent": "Check your email",
};

// Mirrors sanitizeNextPath in apps/website/src/app/login/page.tsx exactly.
// Without this, a raw `?returnPath=` query param would be a direct,
// unauthenticated open redirect: `/academy/start?returnPath=https://evil.example`
// would send an authenticated visitor straight off-site via
// `window.location.href` below, with no backend call needed at all.
function sanitizeReturnPath(raw: string | null): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

/**
 * The Academy auth gateway (spec Section 3): a single choice screen between
 * "Continue with EduIgnite" (Path A — same platform-wide JWT session, one
 * click) and "Create Academy Account" (Path B — a standalone learner with no
 * school). This is NOT a new SSO/OAuth protocol; it just reuses the JWT this
 * app already stores after the existing /login flow.
 */
function AcademyStartPageInner() {
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const state = searchParams.get("state") || undefined;
  const courseId = searchParams.get("courseId") || undefined;
  const returnPathParam = sanitizeReturnPath(searchParams.get("returnPath"));

  // "?mode=login" opens the login form directly, e.g. after a password reset.
  const [step, setStep] = useState<Step>(searchParams.get("mode") === "login" ? "login" : "choice");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [resetNotice, setResetNotice] = useState("");

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const currentUrl =
    typeof window !== "undefined"
      ? `/academy/start${window.location.search}`
      : "/academy/start";

  // A full navigation (not router.push) so AuthProvider re-initializes from
  // the tokens just stored (matters for Path B, which just created a brand
  // new session) and lands on whatever path the backend/deep-link resolved.
  const finishWithReturnPath = (backendReturnPath: string) => {
    window.location.href = returnPathParam || backendReturnPath || "/academy";
  };

  const handleContinueWithEduIgnite = async () => {
    setError(null);
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(currentUrl)}`);
      return;
    }
    setIsSubmitting(true);
    try {
      const data = await ssoContinue(state);
      finishWithReturnPath(data.return_path);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not continue into EduIgnite Academy. Please try again."));
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const data = await registerLearner(
        { name: form.name.trim(), email: form.email.trim(), password: form.password },
        state
      );
      setTokens(data.access_token, data.refresh_token);
      finishWithReturnPath(data.return_path);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not create your Academy account. Please try again."));
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const data = await loginLearner({ email: form.email.trim(), password: form.password }, state);
      setTokens(data.access_token, data.refresh_token);
      finishWithReturnPath(data.return_path);
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not log you in. Please try again."));
      setIsSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const data = await requestLearnerPasswordReset(form.email.trim());
      setResetNotice(data.detail);
      setStep("forgot-sent");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not send the reset email. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden p-4 sm:p-8"
      style={{ background: "linear-gradient(to bottom, #EAF3FA 0%, #F2F7FB 55%, #FBFCFE 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#67D0E4]/20 blur-3xl" />
        <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-[#264D73]/8 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <AcademyLogo size="xl" />
          <div>
            <p className="flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.28em] text-[#67D0E4]">
              <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
              Learning &amp; certification
              <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
            </p>
            <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.15] tracking-tight text-[#12314d] sm:text-4xl">
              EduIgnite Academy
            </h1>
          </div>
        </div>

        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-center">
            <h2 className="font-serif text-2xl font-bold text-[#12314d]">
              {TITLES[step]}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {step === "choice"
                ? courseId
                  ? "Sign in to continue to your course."
                  : "Sign in or create a free Academy account to start learning."
                : step === "register"
                  ? "A standalone Academy account — no school required."
                  : step === "login"
                    ? "Use the email address and password you registered with."
                    : step === "forgot"
                      ? "Enter your registered email address and we will send you a link to choose a new password."
                      : resetNotice}
            </p>
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm font-semibold leading-relaxed text-red-900">{error}</p>
            </div>
          )}

          {step === "choice" ? (
            <div className="mt-7 space-y-3">
              <button
                type="button"
                disabled={isSubmitting || authLoading}
                onClick={handleContinueWithEduIgnite}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[#264D73] text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {isAuthenticated && user
                  ? `Continue as ${user.name || "yourself"}`
                  : "Continue with EduIgnite"}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => goTo("login")}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-[#264D73]/20 bg-white text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5 disabled:cursor-wait disabled:opacity-70"
              >
                <KeyRound className="h-4 w-4" />
                Login as Academy Learner
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => goTo("register")}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-[#264D73]/20 bg-white text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5 disabled:cursor-wait disabled:opacity-70"
              >
                <UserPlus className="h-4 w-4" />
                Create Academy account
              </button>

              <p className="px-2 pt-2 text-center text-xs leading-relaxed text-slate-500">
                {isAuthenticated
                  ? "Using your existing EduIgnite session — no extra sign-in needed."
                  : "Already have an EduIgnite School OS account? Continue with EduIgnite uses the same login."}
              </p>
            </div>
          ) : step === "login" ? (
            <form onSubmit={handleLogin} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">Email</label>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className={INPUT_CLASS}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">Password</label>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => goTo("forgot")}
                    className="text-xs font-bold text-[#264D73] hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className={INPUT_CLASS}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[#264D73] text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Log in
              </button>
            </form>
          ) : step === "forgot" ? (
            <form onSubmit={handleForgot} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">Registered email</label>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className={INPUT_CLASS}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[#264D73] text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
                Send reset link
              </button>
            </form>
          ) : step === "forgot-sent" ? (
            <div className="mt-7 space-y-4 text-center">
              <MailCheck className="mx-auto h-10 w-10 text-[#67D0E4]" />
              <p className="text-sm leading-relaxed text-slate-600">
                The link expires soon and works once. If it does not arrive, check your spam folder or try again.
              </p>
              <button
                type="button"
                onClick={() => goTo("login")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] text-sm font-bold text-white hover:bg-[#1c3c5c]"
              >
                <LogIn className="h-4 w-4" /> Back to log in
              </button>
            </div>
          ) : (
            <form onSubmit={handleRegister} className="mt-7 space-y-4">
              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Full name
                </label>
                <input
                  required
                  autoComplete="name"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#12314d] transition-colors focus:border-[#264D73]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264D73]/15"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Email
                </label>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#12314d] transition-colors focus:border-[#264D73]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264D73]/15"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Password
                </label>
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#12314d] transition-colors focus:border-[#264D73]/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#264D73]/15"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <p className="ml-1 text-xs font-medium text-slate-500">At least 8 characters.</p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-[#264D73] text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating account…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Create account &amp; continue
                  </>
                )}
              </button>
            </form>
          )}

          {step !== "choice" && (
            <button
              type="button"
              disabled={isSubmitting}
              className="mt-5 flex w-full items-center justify-center gap-1.5 text-sm font-bold text-slate-500 transition-colors hover:text-[#264D73] disabled:opacity-50"
              onClick={() => goTo(step === "forgot" || step === "forgot-sent" ? "login" : "choice")}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
        </div>

        <a
          href="/academy"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline"
        >
          Back to EduIgnite Academy <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

/**
 * useSearchParams() requires a Suspense boundary during static export/
 * prerender (Next.js 15) -- without this wrapper, `next build` fails on
 * this route specifically.
 */
export default function AcademyStartPage() {
  return (
    <Suspense fallback={<AcademyLoadingScreen label="Preparing sign-in" />}>
      <AcademyStartPageInner />
    </Suspense>
  );
}
