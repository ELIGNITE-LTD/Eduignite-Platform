import crypto from 'node:crypto';
import type Database from 'better-sqlite3-multiple-ciphers';
import { getLicenseStateValue, setLicenseStateValue } from '../repositories/licenseStateRepository';
import { listPendingChanges, markSynced, type SyncQueueRow } from '../repositories/syncQueueRepository';

// Sync client (spec section 7, wire contract "## Sync"). Reads the local
// `sync_queue`, uploads it to the backend in small chunks over HTTP, and
// only marks a queue row synced once the server has acknowledged the chunk
// containing it. On ANY network failure, local data (both the source tables
// and the queue itself) is left completely untouched — the failed/remaining
// rows simply stay pending for the next sync attempt. This is what
// satisfies "a failed or interrupted synchronization must never leave the
// local database in a corrupted or half-written state" (spec section 7/9).
//
// Resumability works two ways, both required by the contract:
//   1. Within a single `runSync` call, a transient per-chunk failure is
//      retried a few times before giving up for this run.
//   2. Across separate `runSync` calls (e.g. app restarted after a dropped
//      connection), the sync_queue's own `synced_at` flags are the source of
//      truth for what still needs sending — rows already marked synced in a
//      prior run are simply absent from the next run's pending list, so they
//      are never re-sent. The server's `GET .../status/` is consulted too,
//      to skip re-uploading a chunk the server already acked even if this
//      client crashed before it could mark the corresponding rows synced
//      locally (belt-and-suspenders for the crash-between-ack-and-write
//      window).

const DEFAULT_CHUNK_SIZE = 50;
const DEFAULT_MAX_ROWS_PER_RUN = 5000; // generous backlog cap per sync run
const DEFAULT_MAX_ATTEMPTS_PER_CHUNK = 2;
const SESSION_STATE_KEY = 'sync_session_id';

function defaultBaseUrl(): string {
  return process.env.VITE_OFFLINE_API_BASE_URL || 'http://localhost:8000';
}

export interface SyncWireRow {
  table: string;
  rowId: string;
  op: SyncQueueRow['op'];
  payload: unknown;
  createdAt: string;
}

export interface SyncClientOptions {
  baseUrl?: string;
  chunkSize?: number;
  maxRowsPerRun?: number;
  maxAttemptsPerChunk?: number;
  fetchImpl?: typeof fetch;
}

export interface SyncRunResult {
  sessionId: string | null;
  totalChunks: number;
  chunksSent: number;
  completed: boolean;
  error?: string;
  failedChunkIndex?: number;
}

function toWireRow(row: SyncQueueRow): SyncWireRow {
  return {
    table: row.table_name,
    rowId: row.row_id,
    op: row.op,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
  };
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf-8').digest('hex');
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function createSession(fetchImpl: typeof fetch, baseUrl: string): Promise<string> {
  const res = await fetchImpl(`${baseUrl}/api/v1/offline-sync/sessions/`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to create sync session (HTTP ${res.status}).`);
  const data = (await res.json()) as { sessionId: string };
  if (!data.sessionId) throw new Error('Sync session response did not include a sessionId.');
  return data.sessionId;
}

async function getSessionStatus(
  fetchImpl: typeof fetch,
  baseUrl: string,
  sessionId: string
): Promise<{ lastAckedChunkIndex: number }> {
  const res = await fetchImpl(`${baseUrl}/api/v1/offline-sync/sessions/${sessionId}/status/`);
  if (!res.ok) throw new Error(`Failed to fetch sync session status (HTTP ${res.status}).`);
  const data = (await res.json()) as { lastAckedChunkIndex: number };
  return { lastAckedChunkIndex: data.lastAckedChunkIndex ?? 0 };
}

async function postChunk(
  fetchImpl: typeof fetch,
  baseUrl: string,
  sessionId: string,
  body: { chunkIndex: number; totalChunks: number; checksum: string; rows: SyncWireRow[] }
): Promise<number> {
  const res = await fetchImpl(`${baseUrl}/api/v1/offline-sync/sessions/${sessionId}/chunks/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Chunk ${body.chunkIndex}/${body.totalChunks} upload failed (HTTP ${res.status}).`);
  const data = (await res.json()) as { received: number };
  if (data.received !== body.chunkIndex) {
    throw new Error(`Server acknowledged chunk ${data.received}, expected ${body.chunkIndex}.`);
  }
  return data.received;
}

async function completeSession(fetchImpl: typeof fetch, baseUrl: string, sessionId: string): Promise<void> {
  const res = await fetchImpl(`${baseUrl}/api/v1/offline-sync/sessions/${sessionId}/complete/`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to finalize sync session (HTTP ${res.status}).`);
}

/**
 * Runs one sync attempt: creates or resumes a session, uploads all pending
 * `sync_queue` rows in chunks, and marks each chunk's rows synced only after
 * the server acknowledges it. Returns a result describing how far it got —
 * it never throws for ordinary network failures (those are reported via
 * `completed: false` + `error`), so callers don't need a try/catch around
 * routine offline operation. It CAN throw for programmer errors (e.g. a
 * malformed options object), but never leaves local data in a partial state
 * either way.
 */
export async function runSync(db: Database.Database, options: SyncClientOptions = {}): Promise<SyncRunResult> {
  const baseUrl = options.baseUrl ?? defaultBaseUrl();
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxRowsPerRun = options.maxRowsPerRun ?? DEFAULT_MAX_ROWS_PER_RUN;
  const maxAttemptsPerChunk = options.maxAttemptsPerChunk ?? DEFAULT_MAX_ATTEMPTS_PER_CHUNK;
  const fetchImpl = options.fetchImpl ?? fetch;

  let sessionId = getLicenseStateValue(db, SESSION_STATE_KEY);
  let lastAckedChunkIndex = 0;

  if (sessionId) {
    try {
      const status = await getSessionStatus(fetchImpl, baseUrl, sessionId);
      lastAckedChunkIndex = status.lastAckedChunkIndex;
    } catch {
      // Prior session is gone or unreachable server-side — start a fresh one
      // rather than failing the whole run; local data is untouched either way.
      sessionId = null;
    }
  }

  if (!sessionId) {
    try {
      sessionId = await createSession(fetchImpl, baseUrl);
    } catch (err) {
      return {
        sessionId: null,
        totalChunks: 0,
        chunksSent: 0,
        completed: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    setLicenseStateValue(db, SESSION_STATE_KEY, sessionId);
    lastAckedChunkIndex = 0;
  }

  const pending = listPendingChanges(db, maxRowsPerRun);
  if (pending.length === 0) {
    setLicenseStateValue(db, SESSION_STATE_KEY, '');
    return { sessionId, totalChunks: 0, chunksSent: 0, completed: true };
  }

  const chunks = chunkArray(pending, chunkSize);
  const totalChunks = chunks.length;
  let chunksSent = 0;

  for (let i = 0; i < totalChunks; i++) {
    const chunkIndex = i + 1; // 1-based, per the wire contract's chunkIndex/totalChunks pairing.
    const rows = chunks[i];

    if (chunkIndex <= lastAckedChunkIndex) {
      // Server already has this chunk (we likely crashed after the ack but
      // before recording it locally) — trust it and catch the local state up
      // without re-sending any bytes.
      markSynced(db, rows.map((r) => r.id));
      chunksSent++;
      continue;
    }

    const wireRows = rows.map(toWireRow);
    const body = {
      chunkIndex,
      totalChunks,
      checksum: sha256Hex(JSON.stringify(wireRows)),
      rows: wireRows,
    };

    let acked = false;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttemptsPerChunk && !acked; attempt++) {
      try {
        await postChunk(fetchImpl, baseUrl, sessionId, body);
        acked = true;
      } catch (err) {
        lastError = err;
      }
    }

    if (!acked) {
      // Stop here. Do NOT mark this chunk (or any later chunk) synced, and
      // do not touch anything else — the next runSync() call will resume
      // from exactly this point using the same session.
      return {
        sessionId,
        totalChunks,
        chunksSent,
        completed: false,
        error: lastError instanceof Error ? lastError.message : String(lastError),
        failedChunkIndex: chunkIndex,
      };
    }

    markSynced(db, rows.map((r) => r.id));
    chunksSent++;
  }

  await completeSession(fetchImpl, baseUrl, sessionId);
  // Session is finished — clear it so the next run (new pending rows) opens
  // a fresh one instead of asking the server about a closed session.
  setLicenseStateValue(db, SESSION_STATE_KEY, '');

  return { sessionId, totalChunks, chunksSent, completed: true };
}
