import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSchool } from '../context/SchoolContext';
import LicenseStatusBanner from './LicenseStatusBanner';
import UpdateAvailableBanner from './UpdateAvailableBanner';

const NAV_ITEMS = [
  { to: '/', label: 'School Profile', end: true },
  { to: '/students', label: 'Students' },
  { to: '/teachers', label: 'Teachers' },
  { to: '/classes', label: 'Classes' },
  { to: '/subjects', label: 'Subjects' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/academics', label: 'Academic Records' },
  { to: '/report-cards', label: 'Report Cards' },
  { to: '/finance', label: 'Financials' },
  { to: '/licensing', label: 'Licensing' },
];

export default function Layout() {
  const { school } = useSchool();

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 bg-primary text-primary-foreground flex flex-col">
        <div className="px-4 py-5 border-b border-white/10">
          <div className="font-headline text-lg font-bold">EduIgnite Offline</div>
          <div className="text-xs opacity-80 truncate">{school?.name || 'No school configured'}</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map((item) => (
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
        <div className="px-4 py-3 border-t border-white/10 text-xs opacity-70">
          {school ? `${school.academic_year} · ${school.active_term}` : 'Offline mode'}
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
