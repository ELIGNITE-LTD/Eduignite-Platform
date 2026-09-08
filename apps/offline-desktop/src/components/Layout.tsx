import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSchool } from '../context/SchoolContext';
import { useAuth } from '../context/AuthContext';
import { canAccessSection, type AppSection } from '../shared/roles';
import LicenseStatusBanner from './LicenseStatusBanner';
import UpdateAvailableBanner from './UpdateAvailableBanner';

const NAV_ITEMS: { to: string; label: string; end?: boolean; section: AppSection }[] = [
  { to: '/', label: 'School Profile', end: true, section: 'schoolProfile' },
  { to: '/students', label: 'Students', section: 'students' },
  { to: '/teachers', label: 'Teachers', section: 'teachers' },
  { to: '/classes', label: 'Classes', section: 'classes' },
  { to: '/subjects', label: 'Subjects', section: 'subjects' },
  { to: '/attendance', label: 'Attendance', section: 'attendance' },
  { to: '/academics', label: 'Academic Records', section: 'academics' },
  { to: '/report-cards', label: 'Report Cards', section: 'reportCards' },
  { to: '/finance', label: 'Financials', section: 'finance' },
  { to: '/structure', label: 'Academic Structure', section: 'structure' },
  { to: '/licensing', label: 'Licensing', section: 'licensing' },
];

export default function Layout() {
  const { school } = useSchool();
  const { session, logout } = useAuth();
  // Per spec: finance/staff/structure/settings pages must not even render
  // their nav entries for a Teacher-role session, not just block at the IPC
  // layer or the route guard (see App.tsx's RequireSection for that half).
  const visibleNavItems = session ? NAV_ITEMS.filter((item) => canAccessSection(session.role, item.section)) : [];

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 bg-primary text-primary-foreground flex flex-col">
        <div className="px-4 py-5 border-b border-white/10">
          <div className="font-headline text-lg font-bold">EduIgnite Offline</div>
          <div className="text-xs opacity-80 truncate">{school?.name || 'No school configured'}</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleNavItems.map((item) => (
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
        <UpdateAvailableBanner />
        <div className="p-6 flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
