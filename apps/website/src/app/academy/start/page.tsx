"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { setTokens } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  Loader2,
  LogIn,
  Sparkles,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import { ssoContinue, registerLearner } from "./_lib/api";

type Step = "choice" | "register";

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

  const [step, setStep] = useState<Step>("choice");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F2F5] p-4 sm:p-8 relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-[100px]" />

      <div className="w-full max-w-lg flex flex-col items-center gap-10 relative z-10">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white p-4 shadow-2xl ring-1 ring-primary/10">
            <GraduationCap className="h-full w-full text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl md:text-5xl font-black text-primary font-headline tracking-tighter leading-none">
              EduIgnite Academy
            </h1>
            <p className="text-xs text-muted-foreground font-black uppercase tracking-[0.4em] opacity-40">
              Learning &amp; Certification
            </p>
          </div>
        </div>

        <Card className="w-full border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] overflow-hidden rounded-[3rem] bg-white/90 backdrop-blur-2xl border border-white/50">
          <CardHeader className="pb-4 pt-10 text-center space-y-2 px-10">
            <CardTitle className="text-3xl font-black text-primary uppercase tracking-tighter">
              {step === "choice" ? "Get Started" : "Create Your Account"}
            </CardTitle>
            <CardDescription className="text-sm font-medium">
              {step === "choice"
                ? courseId
                  ? "Sign in to continue to your course."
                  : "Sign in or create a free Academy account to start learning."
                : "A standalone Academy account — no school required."}
            </CardDescription>
          </CardHeader>

          <CardContent className="px-10 pb-4">
            {error && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left shadow-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm font-bold leading-relaxed text-red-900">{error}</p>
                </div>
              </div>
            )}

            {step === "choice" ? (
              <div className="space-y-4">
                <Button
                  type="button"
                  disabled={isSubmitting || authLoading}
                  onClick={handleContinueWithEduIgnite}
                  className="w-full h-16 text-sm font-black uppercase tracking-widest shadow-2xl rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white transition-all active:scale-95 gap-3"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <LogIn className="w-5 h-5" />
                  )}
                  {isAuthenticated && user
                    ? `Continue as ${user.name || "yourself"}`
                    : "Continue with EduIgnite"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => {
                    setError(null);
                    setStep("register");
                  }}
                  className="w-full h-16 text-sm font-black uppercase tracking-widest rounded-[1.5rem] border-primary/20 text-primary hover:bg-primary/5 transition-all active:scale-95 gap-3"
                >
                  <UserPlus className="w-5 h-5" />
                  Create Academy Account
                </Button>

                <p className="px-2 pt-2 text-center text-[11px] font-medium text-muted-foreground">
                  {isAuthenticated
                    ? "Using your existing EduIgnite session — no extra sign-in needed."
                    : "Already have an EduIgnite School OS account? Continue with EduIgnite uses the same login."}
                </p>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1">
                    Full Name
                  </Label>
                  <Input
                    required
                    autoComplete="name"
                    disabled={isSubmitting}
                    className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-bold text-center shadow-inner transition-all focus:bg-white"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1">
                    Email
                  </Label>
                  <Input
                    required
                    type="email"
                    autoComplete="email"
                    disabled={isSubmitting}
                    className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-bold text-center shadow-inner transition-all focus:bg-white"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1">
                    Password
                  </Label>
                  <Input
                    required
                    minLength={8}
                    type="password"
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-bold text-center shadow-inner transition-all focus:bg-white"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                  <p className="px-1 text-[10px] font-bold text-muted-foreground">At least 8 characters.</p>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-16 text-sm font-black uppercase tracking-widest shadow-2xl rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white transition-all active:scale-95 gap-3 mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Creating account...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" /> Create Account &amp; Continue
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="pb-10 pt-4 flex flex-col gap-3 px-10">
            {step === "register" && (
              <button
                type="button"
                disabled={isSubmitting}
                className="w-full text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition-all h-12 flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={() => {
                  setError(null);
                  setStep("choice");
                }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
          </CardFooter>
        </Card>

        <Button asChild variant="ghost" className="text-primary/60 hover:text-primary gap-2 text-xs font-bold uppercase tracking-widest">
          <a href="/academy">
            Back to EduIgnite Academy <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </Button>
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
    <Suspense fallback={null}>
      <AcademyStartPageInner />
    </Suspense>
  );
}
