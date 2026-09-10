import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSchool } from '../context/SchoolContext';
import { useAuth } from '../context/AuthContext';
import { canAccessSection } from '../shared/roles';
import type { Notice } from '../shared/types';

/**
 * Full Notice Board -- the "See All" destination from SchoolHomePage. Reads
 * the same `notices:listPublished` IPC call LoginPage already uses (that
 * screen's own notice display is untouched), just reachable again once
 * signed in, and without the single-notice truncation Home applies.
 */
export default function NoticeBoardPage() {
  const { school } = useSchool();
  const { session } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!school) return;
    setLoading(true);
    window.api.notices
      .listPublished(school.id)
      .then((result) => {
        if (!cancelled) setNotices(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [school]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">Notice Board</h1>
        {session && canAccessSection(session.role, 'noticesManage') && (
          <Link to="/notices/manage" className="btn-secondary">
            Manage Notices
          </Link>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading notices…</p>}
      {!loading && notices.length === 0 && (
        <p className="text-sm text-muted-foreground">No notices have been published yet.</p>
      )}

      {!loading && notices.length > 0 && (
        <ul className="space-y-3">
          {notices.map((notice) => (
            <li key={notice.id} className="card">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-medium text-foreground">{notice.title}</div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {new Date(notice.created_at).toLocaleDateString()}
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{notice.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
