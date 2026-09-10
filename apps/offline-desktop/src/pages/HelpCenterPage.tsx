import React from 'react';
import { useAuth } from '../context/AuthContext';
import { canAccessSection, type AppSection } from '../shared/roles';

/**
 * Simple, self-contained in-app reference -- there was no help/documentation
 * content anywhere in this app before (confirmed by grep across src/). Kept
 * modest per spec: what each nav section does, and how to reach support.
 * Fully static, no network calls, so it works with zero internet exactly
 * like the rest of this app.
 */
const SECTIONS: { section: AppSection; label: string; blurb: string }[] = [
  { section: 'schoolHome', label: 'Home', blurb: 'Your school identity, the latest notice, and quick links.' },
  { section: 'students', label: 'Students', blurb: "Enrol students, edit records, and review each student's profile." },
  { section: 'teachers', label: 'Teachers', blurb: 'Manage the staff directory of teaching staff.' },
  { section: 'classes', label: 'Classes', blurb: 'Set up classes and their streams/sections for the academic year.' },
  { section: 'subjects', label: 'Subjects', blurb: 'Manage the subject list and assign teachers to class subjects.' },
  { section: 'attendance', label: 'Attendance', blurb: "Record and review students' daily attendance." },
  { section: 'academics', label: 'Academic Records', blurb: 'Enter CAT and exam marks for each student and subject.' },
  { section: 'reportCards', label: 'Report Cards', blurb: 'Compile, review, and export term report cards as PDF.' },
  { section: 'finance', label: 'Financials', blurb: 'Fee templates, payments, balances, and financial transactions.' },
  { section: 'notices', label: 'Notice Board', blurb: 'Read notices published by the school administration.' },
  { section: 'noticesManage', label: 'Manage Notices', blurb: 'Write, publish, and unpublish notices (administrators only).' },
  { section: 'structure', label: 'Academic Structure', blurb: "Configure the school's structure tree (e.g. departments, levels)." },
  { section: 'schoolProfile', label: 'School Profile', blurb: "Edit the school's own details (name, principal, motto, term, etc.)." },
  { section: 'backup', label: 'Backup & Restore', blurb: 'Create an encrypted backup file, or restore from one.' },
  { section: 'licensing', label: 'Licensing', blurb: "View and manage this installation's license status." },
];

export default function HelpCenterPage() {
  const { session } = useAuth();
  const visibleSections = session ? SECTIONS.filter((s) => canAccessSection(session.role, s.section)) : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title mb-1">Help Center</h1>
        <p className="text-sm text-muted-foreground">
          A quick reference for what you can do in EduIgnite Offline. This page works fully offline, like the rest
          of the app.
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          What each section does
        </h2>
        <ul className="divide-y divide-border">
          {visibleSections.map((s) => (
            <li key={s.section} className="py-2">
              <div className="font-medium text-foreground">{s.label}</div>
              <div className="text-sm text-muted-foreground">{s.blurb}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Reaching support
        </h2>
        <p className="text-sm text-muted-foreground">
          If something in EduIgnite Offline isn't working as expected, contact the EduIgnite support team:
        </p>
        <ul className="text-sm text-foreground space-y-1">
          <li>
            Email: <span className="font-medium">eduignitecmr@gmail.com</span>
          </li>
          <li>
            Location: <span className="font-medium">Bamenda, Cameroon</span>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Reaching support by email needs an internet connection -- everything else on this page, and everywhere
          else in this app, does not.
        </p>
      </div>
    </div>
  );
}
