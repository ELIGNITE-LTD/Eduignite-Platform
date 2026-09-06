import type Database from 'better-sqlite3-multiple-ciphers';
import { newId, nowIso } from '../shared/ids';

// SEAM POINT for the Sync & Migration agent (spec section 7). This module
// only writes rows to `sync_queue` — it deliberately does NOT read from the
// queue, chunk payloads, or talk to any network endpoint. That belongs to
// the sync agent's REST client. Every repository in this wave calls
// `enqueueChange` after every create/update/delete so a future sync engine
// has a complete, ordered change log to replay, without needing to touch the
// individual module repositories again.

export type SyncOp = 'insert' | 'update' | 'delete';

export function enqueueChange(
  db: Database.Database,
  tableName: string,
  rowId: string,
  op: SyncOp,
  payload: unknown
): void {
  db.prepare(
    `INSERT INTO sync_queue (id, table_name, row_id, op, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId(), tableName, rowId, op, JSON.stringify(payload), nowIso());
}

export interface SyncQueueRow {
  id: string;
  table_name: string;
  row_id: string;
  op: SyncOp;
  payload_json: string;
  created_at: string;
  synced_at: string | null;
}

/** Read-only helper (used by tests/future sync agent) — never deletes or mutates rows. */
export function listPendingChanges(db: Database.Database, limit = 100): SyncQueueRow[] {
  return db
    .prepare(`SELECT * FROM sync_queue WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT ?`)
    .all(limit) as SyncQueueRow[];
}

/**
 * Marks the given queue rows as synced. This is the ONLY function that
 * should ever be called after a sync chunk is acknowledged by the server —
 * see src/sync/syncClient.ts. Rows are never deleted (the queue doubles as
 * an audit trail) and never marked synced before their chunk is acked.
 */
export function markSynced(db: Database.Database, ids: string[]): void {
  if (ids.length === 0) return;
  const now = nowIso();
  const stmt = db.prepare('UPDATE sync_queue SET synced_at = ? WHERE id = ?');
  const runAll = db.transaction((idList: string[]) => {
    for (const id of idList) stmt.run(now, id);
  });
  runAll(ids);
}
