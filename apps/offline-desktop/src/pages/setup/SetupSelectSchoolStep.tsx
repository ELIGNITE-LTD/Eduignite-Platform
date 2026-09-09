import React, { useState } from 'react';
import type { SchoolSearchResult } from '../../setup/setupClient';

/**
 * Step 2: search/select/confirm school. Confirming writes the REAL cloud
 * School.id into the local `schools.id` -- see src/setup/setupService.ts's
 * confirmSchoolShell -- fixing the bug called out in the build contract
 * (the offline app previously had no way to ever get a real School.id).
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

  async function search(q: string) {
    setQuery(q);
    setSelected(null);
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

  async function confirm() {
    if (!selected) return;
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
                onClick={() => setSelected(r)}
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

      <button type="button" className="btn-primary" onClick={confirm} disabled={!selected || confirming}>
        {confirming ? 'Confirming…' : 'Confirm this is my school'}
      </button>
    </div>
  );
}
