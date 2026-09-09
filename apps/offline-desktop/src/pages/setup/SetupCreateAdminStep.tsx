import React, { useState } from 'react';

/** Step 4: creates the installation's first SCHOOL_ADMIN login account. */
export default function SetupCreateAdminStep({ onNext }: { onNext: () => void }) {
  const [fullName, setFullName] = useState('');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await window.api.setup.createFirstAdmin({ fullName, emailOrUsername, password });
      onNext();
    } catch (err) {
      setError((err as Error).message || 'Could not create the administrator account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card space-y-4" onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">
        Create the first administrator account for this school. You'll use it to sign in once setup is
        complete, and you can add more staff accounts later from Settings.
      </p>

      {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}

      <div>
        <label className="text-sm font-medium block mb-1">Full name</label>
        <input className="input-field" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">Email or username</label>
        <input
          className="input-field"
          value={emailOrUsername}
          onChange={(e) => setEmailOrUsername(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium block mb-1">Password</label>
          <input
            type="password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Confirm password</label>
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

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create administrator account'}
      </button>
    </form>
  );
}
