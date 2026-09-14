import React, { useState } from 'react';

const SECURITY_QUESTION_PRESETS = [
  "What is your mother's maiden name?",
  'What was the name of your first school?',
  'What is the name of your favorite childhood pet?',
  'What town were you born in?',
  'Other (write your own)',
] as const;

/** Step 4: creates the installation's first SCHOOL_ADMIN login account. */
export default function SetupCreateAdminStep({
  onNext,
  onSuccess,
  onError,
}: {
  onNext: () => void;
  /** Fired only right after the real createFirstAdmin call below succeeds, for the wizard's progress log. */
  onSuccess?: () => void;
  /** Fired only on a real createFirstAdmin failure below, for the wizard's progress log. */
  onError?: (message: string) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [questionPreset, setQuestionPreset] = useState<string>(SECURITY_QUESTION_PRESETS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isCustomQuestion = questionPreset === 'Other (write your own)';
  const securityQuestion = isCustomQuestion ? customQuestion : questionPreset;

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
    if (!securityQuestion.trim() || !securityAnswer.trim()) {
      setError('A security question and answer are required — this is the only way to recover this account later.');
      return;
    }
    setSubmitting(true);
    try {
      await window.api.setup.createFirstAdmin({
        fullName,
        emailOrUsername,
        password,
        securityQuestion: securityQuestion.trim(),
        securityAnswer: securityAnswer.trim(),
      });
      onSuccess?.();
      onNext();
    } catch (err) {
      const message = (err as Error).message || 'Could not create the administrator account.';
      setError(message);
      onError?.(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card space-y-4" onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">
        Create the first administrator account for this school. You'll use it to sign in once setup is
        complete, and you can add more staff accounts later from Staff Settings.
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

      <div className="border-t border-border pt-4 space-y-3">
        <div>
          <div className="text-sm font-medium">Password recovery</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            If this administrator ever forgets their password, this question is the only way back in — there is
            no other recovery path.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Security question</label>
          <select className="input-field" value={questionPreset} onChange={(e) => setQuestionPreset(e.target.value)}>
            {SECURITY_QUESTION_PRESETS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        {isCustomQuestion && (
          <div>
            <label className="text-sm font-medium block mb-1">Your question</label>
            <input
              className="input-field"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              required={isCustomQuestion}
            />
          </div>
        )}
        <div>
          <label className="text-sm font-medium block mb-1">Answer</label>
          <input
            className="input-field"
            value={securityAnswer}
            onChange={(e) => setSecurityAnswer(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground mt-1">Not case-sensitive. Choose something memorable.</p>
        </div>
      </div>

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create administrator account'}
      </button>
    </form>
  );
}
