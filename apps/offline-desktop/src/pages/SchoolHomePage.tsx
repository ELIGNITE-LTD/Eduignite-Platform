import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSchool } from '../context/SchoolContext';
import { useAuth } from '../context/AuthContext';
import { canAccessSection, roleLabel } from '../shared/roles';
import type { Notice } from '../shared/types';

const PORTAL_URL = 'https://eduignite.online/login';

/**
 * The new landing screen at `/` (replaces the old bare SchoolProfilePage
 * default route -- that form now lives at `/profile`). Built per the
 * redesign spec: school identity + whoever is actually signed in (not
 * hardcoded "Principal"), the local Notice Board, a Help Center entry
 * point, an "Access Your Portal" action that opens the real web portal in
 * the system browser, and a few quick links into sections that genuinely
 * already exist in this app. Nothing here is a stand-in for Online
 * Classes/Exams/Materials/Chat/Feedback/Testimony/App Store/Announcements --
 * none of those exist in this offline app and none are added here.
 */
export default function SchoolHomePage() {
  const { school } = useSchool();
  const { session } = useAuth();
  const [latestNotice, setLatestNotice] = useState<Notice | null>(null);
  const [noticesLoading, setNoticesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!school) return;
    setNoticesLoading(true);
    window.api.notices
      .listPublished(school.id)
      .then((notices) => {
        if (!cancelled) setLatestNotice(notices[0] ?? null);
      })
      .finally(() => {
        if (!cancelled) setNoticesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [school]);

  const initial = (school?.short_name || school?.name || 'E').trim().charAt(0).toUpperCase();

  const quickActions = [
    { to: '/attendance', label: 'Attendance', section: 'attendance' as const, blurb: "Record today's class attendance." },
    { to: '/report-cards', label: 'Report Cards', section: 'reportCards' as const, blurb: 'Compile and export term report cards.' },
    { to: '/students', label: 'Students', section: 'students' as const, blurb: "Look up a student's record." },
  ].filter((action) => (session ? canAccessSection(session.role, action.section) : false));

  return (
    <div className="space-y-6 max-w-5xl">
      {/* -- School identity + welcome ------------------------------------ */}
      <div className="card flex flex-wrap items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-headline text-xl font-bold">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-xl font-bold text-foreground truncate">
            {school?.name || 'EduIgnite Offline'}
          </h1>
          {school?.motto && (
            <p className="text-sm italic text-muted-foreground truncate">&ldquo;{school.motto}&rdquo;</p>
          )}
          {session && (
            <p className="text-sm text-muted-foreground mt-1">
              Welcome back, <span className="font-medium text-foreground">{session.fullName}</span> ·{' '}
              {roleLabel(session.role)}
            </p>
          )}
        </div>
        {school && (
          <div className="text-xs text-muted-foreground text-right shrink-0">
            <div>{school.academic_year}</div>
            <div>{school.active_term.replace('_', ' ')}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* -- Notice Board -------------------------------------------- */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notice Board</h2>
              <Link to="/notices" className="text-sm font-medium text-primary hover:underline">
                See all
              </Link>
            </div>
            {noticesLoading && <p className="text-sm text-muted-foreground">Loading notices…</p>}
            {!noticesLoading && !latestNotice && (
              <p className="text-sm text-muted-foreground">
                No notices published yet.
                {session && canAccessSection(session.role, 'noticesManage') && (
                  <>
                    {' '}
                    <Link to="/notices/manage" className="text-primary hover:underline">
                      Write the first one
                    </Link>
                    .
                  </>
                )}
              </p>
            )}
            {!noticesLoading && latestNotice && (
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium text-foreground">{latestNotice.title}</div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(latestNotice.created_at).toLocaleDateString()}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                  {latestNotice.body.length > 220 ? `${latestNotice.body.slice(0, 220)}…` : latestNotice.body}
                </p>
              </div>
            )}
          </div>

          {/* -- Quick actions -------------------------------------------- */}
          {quickActions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Quick actions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {quickActions.map((action) => (
                  <Link key={action.to} to={action.to} className="card hover:border-primary transition-colors block">
                    <div className="font-medium text-foreground">{action.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{action.blurb}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* -- Access Your Portal ---------------------------------------- */}
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Access Your Portal
            </h2>
            <p className="text-sm text-muted-foreground">
              Open the full EduIgnite web portal in your browser for the connected online ecosystem. This needs an
              internet connection; everything in this desktop app keeps working normally without one.
            </p>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => window.api.shell.openExternal(PORTAL_URL)}
            >
              Open EduIgnite Portal
            </button>
          </div>

          {/* -- Help Center ------------------------------------------------ */}
          <Link to="/help" className="card block hover:border-primary transition-colors space-y-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Help Center</h2>
            <p className="text-sm text-foreground font-medium">Need help using EduIgnite Offline?</p>
            <p className="text-sm text-muted-foreground">
              See what each section does and how to reach support — works fully offline.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
