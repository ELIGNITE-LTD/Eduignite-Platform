import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSchool } from '../context/SchoolContext';
import type { Notice } from '../shared/types';

/**
 * Replaces the old unauthenticated direct-to-SchoolProfilePage flow (Phase A
 * #3). Shown by src/App.tsx whenever setup is complete but no session is
 * active. Renders the school's own identity (logo/name/principal/motto --
 * whatever's on the `schools` row, no logo column exists yet so this is
 * name/principal/motto for now) as a welcome header, plus any published
 * `notices` below the form.
 */
export default function LoginPage() {
  const { school } = useSchool();
  const { login } = useAuth();
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);

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

  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <div className="font-headline text-2xl font-bold text-primary">{school?.name || 'EduIgnite Offline'}</div>
          {school?.principal && (
            <div className="text-sm text-muted-foreground">Principal: {school.principal}</div>
          )}
          {school?.motto && <div className="text-sm italic text-muted-foreground">&ldquo;{school.motto}&rdquo;</div>}
        </div>

        <form className="card space-y-4" onSubmit={onSubmit}>
          <h1 className="page-title mb-0">Staff sign in</h1>
          {error && (
            <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
          )}
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
        </form>

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
