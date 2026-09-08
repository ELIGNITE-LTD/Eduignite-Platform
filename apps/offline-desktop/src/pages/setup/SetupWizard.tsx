import React, { useState } from 'react';
import { useSchool } from '../../context/SchoolContext';
import type { SchoolSearchResult } from '../../setup/setupClient';
import SetupConnectStep from './SetupConnectStep';
import SetupSelectSchoolStep from './SetupSelectSchoolStep';
import SetupConfigureSchoolStep from './SetupConfigureSchoolStep';
import SetupCreateAdminStep from './SetupCreateAdminStep';
import SetupCompleteStep from './SetupCompleteStep';

// Installer/setup wizard (Phase A #4). Shown by src/App.tsx instead of the
// normal app whenever `schools.setup_completed` isn't set yet. Steps 1-2
// need internet (they hit the public school-search backend); steps 3-5 are
// already-local operations, so the wizard never blocks past Step 2 for
// connectivity reasons once a school has been confirmed.

const STEPS = [
  { id: 1, label: 'Connect' },
  { id: 2, label: 'Find your school' },
  { id: 3, label: 'School details' },
  { id: 4, label: 'Create admin' },
  { id: 5, label: 'Done' },
] as const;

export default function SetupWizard() {
  const { refresh } = useSchool();
  const [step, setStep] = useState(1);
  const [confirmedSchool, setConfirmedSchool] = useState<SchoolSearchResult | null>(null);

  return (
    <div className="min-h-full flex flex-col items-center bg-background p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <div className="font-headline text-2xl font-bold text-primary">EduIgnite Offline Setup</div>
          <div className="text-sm text-muted-foreground">Step {step} of {STEPS.length}: {STEPS[step - 1].label}</div>
        </div>

        <ol className="flex items-center justify-between text-xs">
          {STEPS.map((s) => (
            <li
              key={s.id}
              className={`flex-1 text-center pb-2 border-b-2 ${
                s.id <= step ? 'border-primary text-primary font-medium' : 'border-border text-muted-foreground'
              }`}
            >
              {s.label}
            </li>
          ))}
        </ol>

        {step === 1 && <SetupConnectStep onNext={() => setStep(2)} />}

        {step === 2 && (
          <SetupSelectSchoolStep
            onConfirmed={async (result) => {
              setConfirmedSchool(result);
              await refresh();
              setStep(3);
            }}
          />
        )}

        {step === 3 && <SetupConfigureSchoolStep confirmedSchool={confirmedSchool} onNext={() => setStep(4)} />}

        {step === 4 && <SetupCreateAdminStep onNext={() => setStep(5)} />}

        {step === 5 && (
          <SetupCompleteStep
            onDone={async () => {
              await refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
