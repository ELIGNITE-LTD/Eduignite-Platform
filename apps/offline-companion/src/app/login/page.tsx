"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Lock, LogIn, ShieldCheck, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authService } from "@/lib/api/services/auth.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";

/**
 * Spec section 2 — Login: EduIgnite logo + "EduIgnite Companion" name,
 * matricule + password (with visibility toggle), "Forgot Password?", the
 * primary Login button, and an "Activate" link for a first-time principal.
 *
 * Same backend auth every other EduIgnite app uses (matricule + password ->
 * access/refresh token + user), see src/lib/api/services/auth.service.ts.
 * There is no separate signup: "Activate" below the form covers this app's
 * two real activation surfaces — /activate/ (license activation, the
 * feature this app exists for) for principals who already have their
 * platform-issued matricule/password, since that account is created by
 * EduIgnite's office ahead of time, the same way it is for every other
 * EduIgnite app.
 */
export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [matricule, setMatricule] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showActivateInfo, setShowActivateInfo] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetMatricule, setResetMatricule] = useState("");
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matricule.trim() || !password) {
      setError("Enter both your matricule and password.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await login(matricule.trim(), password);
      router.replace("/home/");
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not sign in. Check your matricule and password and try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetMatricule.trim()) {
      setResetError("Enter your matricule.");
      return;
    }
    setResetError(null);
    setIsRequestingReset(true);
    try {
      await authService.requestPasswordReset(resetMatricule.trim());
      setResetSent(true);
    } catch (err) {
      setResetError(getApiErrorMessage(err, "Could not send a reset link. Please try again."));
    } finally {
      setIsRequestingReset(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="EduIgnite" className="h-10 w-10 object-contain" />
          </div>
          <h1 className="text-2xl font-black text-primary-dark">EduIgnite Companion</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in with your EduIgnite account to stay connected with EduIgnite and manage your school&rsquo;s
            Offline license.
          </p>
        </div>

        {showForgotPassword ? (
          <div className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div>
              <h2 className="text-lg font-black text-primary-dark">Reset your password</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter your matricule and EduIgnite will send instructions to the contact on file for your account.
              </p>
            </div>

            {resetSent ? (
              <div className="rounded-xl bg-emerald-50 p-4 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-2 text-sm font-bold text-emerald-700">Request sent</p>
                <p className="mt-1 text-xs text-emerald-700/80">
                  If that matricule has an account, reset instructions are on their way.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="reset-matricule" className="text-xs font-bold text-gray-600">
                    Matricule
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-3">
                    <UserIcon className="h-4 w-4 text-gray-400" />
                    <input
                      id="reset-matricule"
                      value={resetMatricule}
                      onChange={(e) => setResetMatricule(e.target.value)}
                      className="h-12 w-full bg-transparent text-sm outline-none"
                      placeholder="e.g. ADM-0042"
                    />
                  </div>
                </div>
                {resetError ? <p className="text-sm text-destructive">{resetError}</p> : null}
                <Button type="submit" isLoading={isRequestingReset} className="w-full">
                  Send Reset Instructions
                </Button>
              </form>
            )}

            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false);
                setResetSent(false);
                setResetError(null);
              }}
              className="w-full text-center text-xs font-bold text-gray-500 hover:text-primary"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
              <div className="space-y-1.5">
                <label htmlFor="matricule" className="text-xs font-bold text-gray-600">
                  Matricule
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-3">
                  <UserIcon className="h-4 w-4 text-gray-400" />
                  <input
                    id="matricule"
                    autoComplete="username"
                    value={matricule}
                    onChange={(e) => setMatricule(e.target.value)}
                    className="h-12 w-full bg-transparent text-sm outline-none"
                    placeholder="e.g. ADM-0042"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-xs font-bold text-gray-600">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs font-bold text-primary hover:text-primary-dark"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-3">
                  <Lock className="h-4 w-4 shrink-0 text-gray-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 w-full bg-transparent text-sm outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="shrink-0 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <Button type="submit" isLoading={isSubmitting} className="w-full">
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              Don&rsquo;t have an account?{" "}
              <button
                type="button"
                onClick={() => setShowActivateInfo((v) => !v)}
                className="inline-flex items-center gap-1 font-bold text-primary hover:text-primary-dark"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Activate
              </button>
            </p>

            {showActivateInfo ? (
              <div className="mt-3 rounded-2xl bg-primary/5 p-4 text-xs leading-relaxed text-gray-600">
                Your school&rsquo;s administrator account is issued by EduIgnite&rsquo;s office and works across every
                EduIgnite app — there&rsquo;s no separate signup here. Sign in above with that matricule and password,
                then use <span className="font-bold text-primary-dark">Workspace &rarr; Activate License</span> to
                activate or renew your Offline desktop&rsquo;s software license.
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
