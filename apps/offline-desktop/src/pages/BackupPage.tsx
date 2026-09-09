import React, { useState } from 'react';

/**
 * Backup / Restore admin screen (new feature -- see src/backup/backupService.ts
 * and the `backup:create` / `backup:restore` IPC channels in
 * src/ipc/handlers.ts). Deliberately minimal, matching the same "doesn't
 * need to be polished, needs to exist and work end-to-end" bar as
 * StructureSettingsPage.tsx -- two clearly separated actions, a passphrase
 * the admin sets/re-enters themselves, and plain-language status/error text
 * (the backend already guarantees any failure message here is safe to show
 * as-is -- see backupService.ts's FriendlyBackupError).
 */
export default function BackupPage() {
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupPassphraseConfirm, setBackupPassphraseConfirm] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  async function handleBackUpNow() {
    setBackupError(null);
    setBackupMessage(null);

    if (backupPassphrase.length < 8) {
      setBackupError('Please choose a passphrase of at least 8 characters.');
      return;
    }
    if (backupPassphrase !== backupPassphraseConfirm) {
      setBackupError('Passphrases do not match.');
      return;
    }

    setBackupBusy(true);
    try {
      const result = await window.api.backup.create(backupPassphrase);
      if (result.canceled) {
        setBackupMessage(null);
      } else {
        setBackupMessage(`Backup saved to ${result.outputPath}.`);
        setBackupPassphrase('');
        setBackupPassphraseConfirm('');
      }
    } catch (err) {
      setBackupError((err as Error).message);
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleRestoreFromFile() {
    setRestoreError(null);
    setRestoreMessage(null);

    if (!restorePassphrase) {
      setRestoreError('Enter the passphrase this backup was created with.');
      return;
    }
    if (
      !window.confirm(
        'Restoring will replace ALL current data on this computer with the data from the backup file. ' +
          'This cannot be undone. Continue?'
      )
    ) {
      return;
    }

    setRestoreBusy(true);
    try {
      const result = await window.api.backup.restore(restorePassphrase);
      if (result.canceled) {
        setRestoreMessage(null);
      } else {
        setRestoreMessage(`Restore complete for ${result.schoolName}. Please log in again.`);
        setRestorePassphrase('');
      }
    } catch (err) {
      setRestoreError((err as Error).message);
    } finally {
      setRestoreBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Backup &amp; Restore</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Keep a copy of your school's data somewhere safe (a USB drive, an external disk) in case this
        computer is ever lost, stolen, or damaged. Anyone with the backup file AND its passphrase can read
        your school's data, so store both somewhere secure and never share the passphrase over an insecure
        channel.
      </p>

      <div className="card space-y-3 mb-6">
        <h2 className="font-medium">Back Up Now</h2>
        <p className="text-sm text-muted-foreground">
          Choose a passphrase to protect this backup, then pick where to save it.
        </p>
        <div className="space-y-2 max-w-sm">
          <input
            type="password"
            className="input"
            placeholder="Backup passphrase (min. 8 characters)"
            value={backupPassphrase}
            onChange={(e) => setBackupPassphrase(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="input"
            placeholder="Confirm passphrase"
            value={backupPassphraseConfirm}
            onChange={(e) => setBackupPassphraseConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {backupError && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{backupError}</div>}
        {backupMessage && <div className="rounded-md bg-primary/10 text-primary text-sm px-3 py-2">{backupMessage}</div>}
        <button type="button" className="btn-primary" onClick={handleBackUpNow} disabled={backupBusy}>
          {backupBusy ? 'Backing up…' : 'Back Up Now'}
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="font-medium">Restore From File</h2>
        <p className="text-sm text-muted-foreground">
          Replaces all data currently on this computer with the contents of a backup file. Use this after
          setting up a replacement computer, or to recover from data loss.
        </p>
        <div className="max-w-sm">
          <input
            type="password"
            className="input"
            placeholder="Backup passphrase"
            value={restorePassphrase}
            onChange={(e) => setRestorePassphrase(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {restoreError && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{restoreError}</div>}
        {restoreMessage && <div className="rounded-md bg-primary/10 text-primary text-sm px-3 py-2">{restoreMessage}</div>}
        <button type="button" className="btn-secondary" onClick={handleRestoreFromFile} disabled={restoreBusy}>
          {restoreBusy ? 'Restoring…' : 'Restore From File'}
        </button>
      </div>
    </div>
  );
}
