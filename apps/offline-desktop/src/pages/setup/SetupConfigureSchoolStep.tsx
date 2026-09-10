import React from 'react';
import { useSchool } from '../../context/SchoolContext';
import SchoolProfilePage from '../SchoolProfilePage';
import type { SchoolSearchResult } from '../../setup/setupClient';

/**
 * Step 3: configure school details. Per the build contract, this reuses
 * SchoolProfilePage's own form/logic rather than rebuilding it -- the
 * `schools` row already exists (Step 2 created the shell with the real
 * cloud id), so SchoolProfilePage's own save path (an UPDATE, since a row
 * already exists) fills in the rest without ever touching the id.
 */
export default function SetupConfigureSchoolStep({
  confirmedSchool,
  onNext,
  onSaved,
}: {
  confirmedSchool: SchoolSearchResult | null;
  onNext: () => void;
  /** Fired only on a real, successful school-details save below, for the wizard's progress log. */
  onSaved?: () => void;
}) {
  const { school } = useSchool();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground px-1">
        {confirmedSchool ? `Confirmed: ${confirmedSchool.name}. ` : ''}
        Fill in the rest of your school's details below (you can always change these later from School
        Profile).
      </p>
      <SchoolProfilePage onSaved={onSaved} />
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={onNext} disabled={!school}>
          Continue
        </button>
      </div>
    </div>
  );
}
