import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../context/SchoolContext';
import type { Notice } from '../shared/types';

/**
 * Branded landing/sign-in screen (Phase A #3, redesigned). Shown by
 * src/App.tsx whenever setup is complete but no session is active. A navy
 * header band carries the school's own identity (logo initial/name/
 * principal/motto — whatever's on the `schools` row) plus a couple of
 * always-true "offline-first" badges, matching this app's own brand tokens
 * (primary/secondary — see tailwind.config.ts) rather than hardcoding
 * colors. Below it: the sign-in form (now with a "Forgot password?" flow),
 * then any published `notices`.
 */
export default function LoginPage() {
  const { school } = useSchool();
  const { login } = useAuth();
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [mode, setMode] = useState<'login' | 'recover'>('login');

  useEffect(() => {
    let cancelled = false;
    if (school) {
      window.api.notices.listPublished(school.id).then((result) => {
        if (!cancelled) setNotices(result);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [school]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(emailOrUsername, password);
    } catch (err) {
      setError((err as Error).message || 'Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const initial = (school?.short_name || school?.name || 'E').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-full flex flex-col items-center bg-background">
      {/* -- Branded header band ------------------------------------------ */}
      <div className="w-full bg-primary text-primary-foreground">
        <div className="max-w-md mx-auto px-6 py-8 flex flex-col items-center text-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 font-headline text-2xl font-bold">
            {initial}
          </div>
          <div>
            <div className="font-headline text-2xl font-bold">{school?.name || 'EduIgnite Offline'}</div>
            {school?.principal && <div className="text-sm opacity-85 mt-0.5">Principal: {school.principal}</div>}
            {school?.motto && <div className="text-sm italic opacity-80 mt-1">&ldquo;{school.motto}&rdquo;</div>}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            {['Offline-first', 'Secure local storage', 'Runs without internet'].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* -- Sign-in / recovery card --------------------------------------- */}
      <div className="w-full max-w-md px-6 py-8 space-y-6">
        {mode === 'login' ? (
          <form className="card space-y-4" onSubmit={onSubmit}>
            <h1 className="page-title mb-0">Staff sign in</h1>
            {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
            <div>
              <label className="text-sm font-medium block mb-1">Matricule / email / username</label>
              <input
                className="input-field"
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Password</label>
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="text-sm text-primary hover:underline w-full text-center"
              onClick={() => {
                setError(null);
                setMode('recover');
              }}
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <RecoveryPanel
            initialUsername={emailOrUsername}
            onDone={(username) => {
              setEmailOrUsername(username);
              setMode('login');
            }}
            onCancel={() => setMode('login')}
          />
        )}

        {notices.length > 0 && (
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notices</h2>
            <ul className="space-y-3">
              {notices.map((notice) => (
                <li key={notice.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <div className="text-sm font-medium">{notice.title}</div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{notice.body}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Two-step security-question recovery flow. Step 1 asks only for the
 * account's username/matricule and fetches its question (auth:getRecoveryQuestion
 * always returns *a* question, real or decoy — see userRepository.ts — so
 * this step never reveals whether the account exists). Step 2 asks for the
 * answer + a new password and calls auth:resetPassword, which throws the
 * same generic error for a wrong account, missing question, or wrong answer.
 */
function RecoveryPanel({
  initialUsername,
  onDone,
  onCancel,
}: {
  initialUsername: string;
  onDone: (username: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<'identify' | 'answer'>('identify');
  const [username, setUsername] = useState(initialUsername);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onFetchQuestion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await window.api.auth.getRecoveryQuestion(username);
      setQuestion(result.question);
      setStep('answer');
    } catch (err) {
      setError((err as Error).message || 'Could not look up this account.');
    } finally {
      setBusy(false);
    }
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await window.api.auth.resetPassword(username, answer, newPassword);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message || 'Could not reset the password.');
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="card space-y-4 text-center">
        <div className="text-lg font-headline font-semibold">Password updated</div>
        <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
        <button type="button" className="btn-primary w-full" onClick={() => onDone(username)}>
          Back to sign in
        </button>
      </div>
    );
  }

  if (step === 'identify') {
    return (
      <form className="card space-y-4" onSubmit={onFetchQuestion}>
        <h1 className="page-title mb-0">Reset your password</h1>
        <p className="text-sm text-muted-foreground">Enter your matricule, email, or username to continue.</p>
        {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
        <div>
          <label className="text-sm font-medium block mb-1">Matricule / email / username</label>
          <input className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy || !username.trim()}>
          {busy ? 'Looking up…' : 'Continue'}
        </button>
        <button type="button" className="text-sm text-muted-foreground hover:underline w-full text-center" onClick={onCancel}>
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form className="card space-y-4" onSubmit={onReset}>
      <h1 className="page-title mb-0">Answer your security question</h1>
      {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
      <div>
        <label className="text-sm font-medium block mb-1">{question}</label>
        <input className="input-field" value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">New password</label>
          <input
            type="password"
            className="input-field"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Confirm</label>
          <input
            type="password"
            className="input-field"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
      </div>
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? 'Resetting…' : 'Reset password'}
      </button>
      <button type="button" className="text-sm text-muted-foreground hover:underline w-full text-center" onClick={onCancel}>
        Back to sign in
      </button>
    </form>
  );
}
