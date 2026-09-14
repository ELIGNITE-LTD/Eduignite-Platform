import React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSchool } from '../context/SchoolContext';
import { useAuth } from '../context/AuthContext';
import { canAccessSection, type AppSection } from '../shared/roles';
import LicenseStatusBanner from './LicenseStatusBanner';

// This app's sidebar always lists every section, so a back button isn't
// load-bearing for getting around -- but every other EduIgnite app has one,
// and jumping back to exactly where you came from (rather than re-finding
// it in the sidebar) is still the expected affordance. One shared
// implementation here covers every page rendered through this Layout,
// rather than needing it repeated per-page. Hidden on the Home root, same
// "no back button on a tab root" convention apps/mobile's MobileTopBar
// already uses.
function BackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  if (location.pathname === '/') return null;

  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );
}

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  section: AppSection;
}

interface NavGroup {
  /** Omit for an ungrouped item pinned above/below the grouped sections (Home, Help Center). */
  label?: string;
  items: NavItem[];
}

// Grouped for logical relationships (academic vs. finance vs. school
// management) rather than one flat list -- routes/paths below are unchanged
// from before, only their grouping/order in the sidebar moved, so nothing
// elsewhere that links to these paths breaks.
const NAV_GROUPS: NavGroup[] = [
  { items: [{ to: '/', label: 'Home', end: true, section: 'schoolHome' }] },
  {
    label: 'Academics',
    items: [
      { to: '/students', label: 'Students', section: 'students' },
      { to: '/teachers', label: 'Teachers', section: 'teachers' },
      { to: '/classes', label: 'Classes', section: 'classes' },
      { to: '/subjects', label: 'Subjects', section: 'subjects' },
      { to: '/attendance', label: 'Attendance', section: 'attendance' },
      { to: '/academics', label: 'Academic Records', section: 'academics' },
      { to: '/report-cards', label: 'Report Cards', section: 'reportCards' },
    ],
  },
  {
    label: 'Finance',
    items: [{ to: '/finance', label: 'Financials', section: 'finance' }],
  },
  {
    label: 'School Management',
    items: [
      { to: '/notices', label: 'Notice Board', section: 'notices' },
      { to: '/notices/manage', label: 'Manage Notices', section: 'noticesManage' },
      { to: '/structure', label: 'Academic Structure', section: 'structure' },
      { to: '/profile', label: 'School Profile', section: 'schoolProfile' },
      { to: '/staff', label: 'Staff Settings', section: 'staffSettings' },
      { to: '/backup', label: 'Backup & Restore', section: 'backup' },
      { to: '/licensing', label: 'Licensing', section: 'licensing' },
    ],
  },
  { items: [{ to: '/help', label: 'Help Center', section: 'help' }] },
];

export default function Layout() {
  const { school } = useSchool();
  const { session, logout } = useAuth();
  // Per spec: finance/staff/structure/settings pages must not even render
  // their nav entries for a Teacher-role session, not just block at the IPC
  // layer or the route guard (see App.tsx's RequireSection for that half).
  const visibleGroups = session
    ? NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => canAccessSection(session.role, item.section)),
      })).filter((group) => group.items.length > 0)
    : [];

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 bg-primary text-primary-foreground flex flex-col">
        <div className="px-4 py-5 border-b border-white/10 space-y-1.5">
          <div className="font-headline text-lg font-bold">EduIgnite Offline</div>
          <div className="text-xs opacity-80 truncate">{school?.name || 'No school configured'}</div>
          {/* Calm, always-on reassurance that offline is the normal, working
              state here -- not a warning banner. Per spec: this app must
              never nag about connectivity for ordinary operation. */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium opacity-90">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden="true" />
            Local School System
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleGroups.map((group, idx) => (
            <div key={group.label ?? `ungrouped-${idx}`} className="mb-1">
              {group.label && (
                <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `block px-4 py-2 text-sm rounded-md mx-2 my-0.5 ${
                      isActive ? 'bg-white/15 font-medium' : 'hover:bg-white/10'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-white/10 text-xs">
          {session && (
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="truncate">
                <div className="font-medium truncate">{session.fullName}</div>
                <div className="opacity-70">{session.role}</div>
              </div>
              <button type="button" className="opacity-80 hover:opacity-100 underline shrink-0" onClick={() => logout()}>
                Log out
              </button>
            </div>
          )}
          <div className="opacity-70">
            {school ? `${school.academic_year} · ${school.active_term}` : 'Offline mode'}
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto flex flex-col">
        <LicenseStatusBanner />
        {/* The old dismissible "update available" banner (with a Download
            link out to the browser) is gone -- see AppUpdateDialog, mounted
            once at the App root, for the real in-app update flow that
            replaces it. */}
        <div className="p-6 flex-1">
          <BackButton />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
