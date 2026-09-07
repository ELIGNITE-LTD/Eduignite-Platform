"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, LogIn, ShieldCheck, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getApiErrorMessage } from "@/lib/api/errors";

/**
 * Minimal login screen — the same backend auth every other EduIgnite app
 * uses (matricule + password -> access/refresh token + user), see
 * src/lib/api/services/auth.service.ts. This app has no signup, no password
 * reset flow, no "remember me" toggle — a school's technician already has an
 * EduIgnite account (their normal admin/sub-admin login).
 */
export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [matricule, setMatricule] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lg">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-primary">EduIgnite Companion</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in with your EduIgnite account to activate or renew a school's Offline license.
          </p>
        </div>

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
            <label htmlFor="password" className="text-xs font-bold text-gray-600">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-3">
              <Lock className="h-4 w-4 text-gray-400" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full bg-transparent text-sm outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-black text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Only a school administrator or sub-admin account can activate or renew licenses.
        </p>
      </div>
    </main>
  );
}
