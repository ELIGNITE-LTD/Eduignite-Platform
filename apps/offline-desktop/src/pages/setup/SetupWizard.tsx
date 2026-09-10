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

/**
 * Progress/activity-log model (redesign). Per the build contract's honesty
 * requirement: there is no granular backend pipeline to visualize here --
 * the local database is already fully initialized before this wizard ever
 * renders (see electron/main.ts), and there is no discrete awaitable
 * "creating tables"-style step. The five REAL stages below map 1:1 onto the
 * five wizard steps above, each a genuine user-driven action with a real
 * IPC call and a real success/failure outcome (see each step component's
 * new onCheckResult/onConfirmError/onSaved/onSuccess/onError props, all
 * fired only at that component's own pre-existing await points -- nothing
 * here is fabricated or invented just to look more granular).
 */
type StageStatus = 'pending' | 'in-progress' | 'done' | 'warning' | 'failed';
type StageOutcome = { status: 'done' | 'warning' | 'failed'; detail?: string };

const STAGE_LABELS: Record<number, string> = {
  1: 'Connecting to EduIgnite',
  2: 'Finding your school',
  3: 'School details saved',
  4: 'Administrator account created',
  5: 'Finalizing setup',
};
const STAGE_IDS = [1, 2, 3, 4, 5] as const;

const STAGE_SYMBOL: Record<StageStatus, string> = {
  pending: '○',
  'in-progress': '●',
  done: '✓',
  warning: '⚠',
  failed: '✕',
};

const STAGE_SYMBOL_CLASS: Record<StageStatus, string> = {
  pending: 'text-muted-foreground',
  'in-progress': 'text-secondary',
  done: 'text-green-600',
  warning: 'text-amber-600',
  failed: 'text-destructive',
};

export default function SetupWizard() {
  const { refresh } = useSchool();
  const [step, setStep] = useState(1);
  const [confirmedSchool, setConfirmedSchool] = useState<SchoolSearchResult | null>(null);
  const [stageOutcomes, setStageOutcomes] = useState<Record<number, StageOutcome>>({});

  function recordOutcome(stageId: number, outcome: StageOutcome) {
    setStageOutcomes((prev) => ({ ...prev, [stageId]: outcome }));
  }

  function statusFor(stageId: number): StageStatus {
    const outcome = stageOutcomes[stageId];
    if (outcome) return outcome.status;
    return stageId === step ? 'in-progress' : 'pending';
  }

  const doneCount = STAGE_IDS.filter((id) => stageOutcomes[id]?.status === 'done').length;
  const percent = Math.round((doneCount / STAGE_IDS.length) * 100);

  return (
    <div className="min-h-full flex justify-center bg-background p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* -- Main step content ------------------------------------------- */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-headline text-sm font-bold">
              EI
            </div>
            <div>
              <div className="font-headline text-xl font-bold text-primary">EduIgnite Offline Setup</div>
              <div className="text-xs text-muted-foreground">
                Step {step} of {STEPS.length}: {STEPS[step - 1].label}
              </div>
            </div>
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

          {step === 1 && (
            <SetupConnectStep
              onNext={() => setStep(2)}
              onCheckResult={(outcome) =>
                recordOutcome(1, outcome.ok ? { status: 'done', detail: outcome.message } : { status: 'warning', detail: outcome.message })
              }
            />
          )}

          {step === 2 && (
            <SetupSelectSchoolStep
              onConfirmed={async (result) => {
                setConfirmedSchool(result);
                recordOutcome(2, { status: 'done', detail: `School confirmed: ${result.name}` });
                await refresh();
                setStep(3);
              }}
              onConfirmError={(message) => recordOutcome(2, { status: 'failed', detail: message })}
            />
          )}

          {step === 3 && (
            <SetupConfigureSchoolStep
              confirmedSchool={confirmedSchool}
              onNext={() => setStep(4)}
              onSaved={() => recordOutcome(3, { status: 'done', detail: 'School details saved' })}
            />
          )}

          {step === 4 && (
            <SetupCreateAdminStep
              onNext={() => setStep(5)}
              onSuccess={() => recordOutcome(4, { status: 'done' })}
              onError={(message) => recordOutcome(4, { status: 'failed', detail: message })}
            />
          )}

          {step === 5 && (
            <SetupCompleteStep
              onDone={async () => {
                await refresh();
              }}
              onSuccess={() => recordOutcome(5, { status: 'done' })}
              onError={(message) => recordOutcome(5, { status: 'failed', detail: message })}
            />
          )}
        </div>

        {/* -- Progress + live activity log --------------------------------- */}
        <div className="card space-y-4 lg:sticky lg:top-6">
          <div>
            <div className="flex items-center justify-between text-sm font-medium text-foreground mb-1.5">
              <span>Setup progress</span>
              <span className="text-muted-foreground">{percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-secondary transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <ul className="space-y-2.5">
            {STAGE_IDS.map((id) => {
              const status = statusFor(id);
              const outcome = stageOutcomes[id];
              return (
                <li key={id} className="flex items-start gap-2 text-sm">
                  <span className={`font-bold leading-5 ${STAGE_SYMBOL_CLASS[status]}`} aria-hidden="true">
                    {STAGE_SYMBOL[status]}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={
                        status === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium'
                      }
                    >
                      {STAGE_LABELS[id]}
                    </div>
                    {outcome?.detail && (
                      <div className="text-xs text-muted-foreground break-words">{outcome.detail}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
