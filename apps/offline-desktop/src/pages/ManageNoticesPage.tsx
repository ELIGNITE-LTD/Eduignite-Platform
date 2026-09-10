import React, { useCallback, useEffect, useState } from 'react';
import { useSchool } from '../context/SchoolContext';
import { useAuth } from '../context/AuthContext';
import type { Notice } from '../shared/types';

/**
 * The notice-authoring UI noticeRepository.ts's header comment describes as
 * "Phase B/C" -- the data layer (`notices:listAll`, `notices:create`,
 * `notices:setPublished`) already fully existed with SCHOOL_ADMIN-only IPC
 * guards; this page is the first UI to actually call it. Route-gated to the
 * `noticesManage` AppSection (SCHOOL_ADMIN only -- see shared/roles.ts),
 * matching those IPC guards exactly rather than the broader SCHOOL_ADMIN +
 * SUB_ADMIN tier other admin sections use.
 */
export default function ManageNoticesPage() {
  const { school } = useSchool();
  const { session } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!school) return;
    setLoading(true);
    try {
      const result = await window.api.notices.listAll(school.id);
      setNotices(result);
    } finally {
      setLoading(false);
    }
  }, [school]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;
    setError(null);
    setSubmitting(true);
    try {
      await window.api.notices.create({
        school_id: school.id,
        title: title.trim(),
        body: body.trim(),
        published_by: session?.userId ?? null,
      });
      setTitle('');
      setBody('');
      await reload();
    } catch (err) {
      setError((err as Error).message || 'Could not create this notice.');
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublished(notice: Notice) {
    setTogglingId(notice.id);
    setError(null);
    try {
      await window.api.notices.setPublished(notice.id, notice.is_published === 0);
      await reload();
    } catch (err) {
      setError((err as Error).message || 'Could not update this notice.');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title mb-1">Manage Notices</h1>
        <p className="text-sm text-muted-foreground">
          Write a notice for staff and, once published, it also appears on the sign-in screen and the Notice Board
          for everyone at this school.
        </p>
      </div>

      <form className="card space-y-4" onSubmit={onCreate}>
        {error && <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
        <div>
          <label className="text-sm font-medium block mb-1">Title</label>
          <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Body</label>
          <textarea
            className="input-field min-h-[100px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save as draft'}
          </button>
          <span className="text-xs text-muted-foreground">
            New notices start unpublished — publish it below when it's ready.
          </span>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">All notices</h2>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && notices.length === 0 && (
          <p className="text-sm text-muted-foreground">No notices have been written yet.</p>
        )}
        {!loading && notices.length > 0 && (
          <ul className="space-y-3">
            {notices.map((notice) => (
              <li key={notice.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{notice.title}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          notice.is_published
                            ? 'bg-accent text-accent-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {notice.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{notice.body}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(notice.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    disabled={togglingId === notice.id}
                    onClick={() => togglePublished(notice)}
                  >
                    {togglingId === notice.id
                      ? 'Updating…'
                      : notice.is_published
                        ? 'Unpublish'
                        : 'Publish'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
