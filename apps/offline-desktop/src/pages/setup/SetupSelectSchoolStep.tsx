import React, { useState } from 'react';
import type { SchoolSearchResult } from '../../setup/setupClient';

/**
 * Step 2: search/select/confirm school. Confirming writes the REAL cloud
 * School.id into the local `schools.id` -- see src/setup/setupService.ts's
 * confirmSchoolShell -- fixing the bug called out in the build contract
 * (the offline app previously had no way to ever get a real School.id).
 *
 * Anti-impersonation gate (reported directly): the school search is public
 * and unauthenticated (see setupClient.ts's searchSchools -- no login exists
 * yet at this point in setup), so picking a school purely by name from the
 * results list proves nothing about who's actually installing this app for
 * it. A school's matricule is not meant to be public/guessable the same way
 * its name is, so requiring it as a second factor before confirming closes
 * that gap. Exception: if the technical admin already searched BY the
 * matricule itself (rather than by name), they've already demonstrated
 * knowing it as part of finding the school -- asking them to retype it would
 * be redundant, so that path still confirms immediately, unchanged from
 * before. A school with no matricule on file (`matricule: null`) has nothing
 * to verify against, so it also skips the gate rather than stranding a
 * legitimate install.
 */
export default function SetupSelectSchoolStep({
  onConfirmed,
}: {
  onConfirmed: (result: SchoolSearchResult) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SchoolSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SchoolSearchResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [matriculeInput, setMatriculeInput] = useState('');
  const [matriculeError, setMatriculeError] = useState<string | null>(null);

  // Did the technical admin already prove they know this school's matricule
  // by searching for it directly? If so, no second-factor prompt is needed.
  const foundByMatricule = Boolean(
    selected?.matricule && query.trim().toLowerCase() === selected.matricule.toLowerCase()
  );
  const needsMatriculeConfirmation = Boolean(selected?.matricule) && !foundByMatricule;
  const matriculeConfirmed =
    !needsMatriculeConfirmation ||
    (selected?.matricule != null && matriculeInput.trim().toLowerCase() === selected.matricule.toLowerCase());

  async function search(q: string) {
    setQuery(q);
    setSelected(null);
    setMatriculeInput('');
    setMatriculeError(null);
    setError(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await window.api.setup.searchSchools(q);
      if (!response.ok) {
        setError(response.message || 'Search failed.');
        setResults([]);
      } else {
        setResults(response.results);
      }
    } finally {
      setSearching(false);
    }
  }

  function selectSchool(result: SchoolSearchResult) {
    setSelected(result);
    setMatriculeInput('');
    setMatriculeError(null);
    setError(null);
  }

  async function confirm() {
    if (!selected) return;
    if (needsMatriculeConfirmation && !matriculeConfirmed) {
      setMatriculeError("That matricule doesn't match this school. Please check and try again.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      // Writes the real cloud School.id into the local `schools` row --
      // see src/setup/setupService.ts's confirmSchoolShell.
      await window.api.setup.confirmSchool(selected);
      await onConfirmed(selected);
    } catch (err) {
      setError((err as Error).message || 'Could not confirm this school.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="card space-y-4">
      <p className="text-sm text-muted-foreground">
        Search for your school by name, short name, or matricule.
      </p>

      <input
        className="input-field"
        placeholder="Start typing your school's name…"
        value={query}
        onChange={(e) => search(e.target.value)}
        autoFocus
      />

      {error && <div className="text-sm text-destructive">{error}</div>}
      {searching && <div className="text-sm text-muted-foreground">Searching…</div>}

      {results.length > 0 && (
        <ul className="divide-y divide-border border border-border rounded-md max-h-64 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => selectSchool(r)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                  selected?.id === r.id ? 'bg-accent' : ''
                }`}
              >
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.shortName} {r.matricule ? `· ${r.matricule}` : ''} {r.region_or_town ? `· ${r.region_or_town}` : ''}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && !error && (
        <div className="text-sm text-muted-foreground">No schools matched "{query}".</div>
      )}

      {selected && (
        <div className="rounded-md bg-accent text-accent-foreground text-sm px-3 py-2">
          Selected: <strong>{selected.name}</strong>
        </div>
      )}

      {selected && needsMatriculeConfirmation && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <label className="block text-sm font-medium" htmlFor="confirm-matricule">
            Confirm your school's matricule
          </label>
          <p className="text-xs text-muted-foreground">
            To make sure you're setting this up for the right school, enter <strong>{selected.name}</strong>'s
            matricule below.
          </p>
          <input
            id="confirm-matricule"
            className="input-field"
            placeholder="Enter the school's matricule…"
            value={matriculeInput}
            onChange={(e) => {
              setMatriculeInput(e.target.value);
              setMatriculeError(null);
            }}
          />
          {matriculeError && <div className="text-sm text-destructive">{matriculeError}</div>}
        </div>
      )}

      <button
        type="button"
        className="btn-primary"
        onClick={confirm}
        disabled={!selected || confirming || !matriculeConfirmed}
      >
        {confirming ? 'Confirming…' : 'Confirm this is my school'}
      </button>
    </div>
  );
}
