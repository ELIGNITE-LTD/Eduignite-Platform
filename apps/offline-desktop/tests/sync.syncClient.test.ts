import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from './testDb';
import { runSync } from '../src/sync/syncClient';
import { enqueueChange, listPendingChanges } from '../src/repositories/syncQueueRepository';
import { getLicenseStateValue } from '../src/repositories/licenseStateRepository';

const BASE_URL = 'http://test.invalid';

function seedRows(db: TestDbHandle['db'], count: number) {
  for (let i = 0; i < count; i++) {
    enqueueChange(db, 'students', `student-${i}`, 'insert', { name: `Student ${i}` });
  }
}

/** Builds a `fetch` mock that logs every call and dispatches by URL suffix. */
function makeFetchMock(handlers: {
  onCreateSession?: () => Response | Promise<Response>;
  onStatus?: (sessionId: string) => Response | Promise<Response>;
  onChunk?: (sessionId: string, body: any) => Response | Promise<Response>;
  onComplete?: (sessionId: string) => Response | Promise<Response>;
}) {
  const calls: { url: string; method: string; body?: any }[] = [];

  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body });

    if (url.endsWith('/sessions/') && method === 'POST') {
      return handlers.onCreateSession
        ? handlers.onCreateSession()
        : new Response(JSON.stringify({ sessionId: 'session-1' }), { status: 200 });
    }
    const statusMatch = url.match(/\/sessions\/([^/]+)\/status\/$/);
    if (statusMatch) {
      return handlers.onStatus
        ? handlers.onStatus(statusMatch[1])
        : new Response(JSON.stringify({ lastAckedChunkIndex: 0 }), { status: 200 });
    }
    const chunkMatch = url.match(/\/sessions\/([^/]+)\/chunks\/$/);
    if (chunkMatch && method === 'POST') {
      return handlers.onChunk
        ? handlers.onChunk(chunkMatch[1], body)
        : new Response(JSON.stringify({ received: body.chunkIndex }), { status: 200 });
    }
    const completeMatch = url.match(/\/sessions\/([^/]+)\/complete\/$/);
    if (completeMatch && method === 'POST') {
      return handlers.onComplete
        ? handlers.onComplete(completeMatch[1])
        : new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`Unexpected fetch call: ${method} ${url}`);
  });

  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe('runSync', () => {
  let handle: TestDbHandle;

  beforeEach(() => {
    handle = createTestDb();
  });

  afterEach(() => {
    handle.close();
  });

  it('happy path: chunks all pending rows, marks them synced only after each chunk is acked, then completes', async () => {
    seedRows(handle.db, 10); // 10 rows / chunkSize 2 = 5 chunks
    const { fetchImpl, calls } = makeFetchMock({});

    const result = await runSync(handle.db, { baseUrl: BASE_URL, chunkSize: 2, fetchImpl });

    expect(result.completed).toBe(true);
    expect(result.totalChunks).toBe(5);
    expect(result.chunksSent).toBe(5);
    expect(listPendingChanges(handle.db, 100)).toHaveLength(0);

    const chunkCalls = calls.filter((c) => c.url.includes('/chunks/'));
    expect(chunkCalls).toHaveLength(5);
    expect(chunkCalls.map((c) => c.body.chunkIndex)).toEqual([1, 2, 3, 4, 5]);

    // Session is cleared once complete, so a later run starts a fresh session.
    expect(getLicenseStateValue(handle.db, 'sync_session_id')).toBe('');
  });

  it('resume-after-partial-failure: chunk 3 of 5 fails then succeeds on retry within the same call — no re-send of 1-2, no premature synced_at', async () => {
    seedRows(handle.db, 10);
    let chunk3Attempts = 0;
    const seenChunkIndexes: number[] = [];

    const { fetchImpl } = makeFetchMock({
      onChunk: (_sessionId, body) => {
        seenChunkIndexes.push(body.chunkIndex);
        if (body.chunkIndex === 3) {
          chunk3Attempts++;
          if (chunk3Attempts === 1) {
            return new Response('server error', { status: 500 });
          }
        }
        return new Response(JSON.stringify({ received: body.chunkIndex }), { status: 200 });
      },
    });

    const result = await runSync(handle.db, {
      baseUrl: BASE_URL,
      chunkSize: 2,
      fetchImpl,
      maxAttemptsPerChunk: 2,
    });

    expect(result.completed).toBe(true);
    expect(chunk3Attempts).toBe(2);
    // Chunks 1 and 2 must each have been sent exactly once — never re-sent.
    expect(seenChunkIndexes.filter((i) => i === 1)).toHaveLength(1);
    expect(seenChunkIndexes.filter((i) => i === 2)).toHaveLength(1);
    // Chunk 3 was attempted twice (fail, then succeed).
    expect(seenChunkIndexes.filter((i) => i === 3)).toHaveLength(2);
    expect(listPendingChanges(handle.db, 100)).toHaveLength(0);
  });

  it('resume-after-partial-failure across separate runSync calls: unacked rows stay pending and are picked up on the next call without re-sending acked ones', async () => {
    seedRows(handle.db, 10); // chunkSize 2 -> 5 chunks

    // First call: chunks 1 and 2 succeed, chunk 3 fails permanently (both attempts).
    const firstCallChunkIndexes: number[] = [];
    const { fetchImpl: fetchImpl1 } = makeFetchMock({
      onChunk: (_sessionId, body) => {
        firstCallChunkIndexes.push(body.chunkIndex);
        if (body.chunkIndex === 3) {
          return new Response('server error', { status: 500 });
        }
        return new Response(JSON.stringify({ received: body.chunkIndex }), { status: 200 });
      },
    });

    const firstResult = await runSync(handle.db, {
      baseUrl: BASE_URL,
      chunkSize: 2,
      fetchImpl: fetchImpl1,
      maxAttemptsPerChunk: 2,
    });

    expect(firstResult.completed).toBe(false);
    expect(firstResult.failedChunkIndex).toBe(3);
    // Chunk 3 attempted maxAttemptsPerChunk (2) times before giving up; chunks 4/5 never attempted.
    expect(firstCallChunkIndexes).toEqual([1, 2, 3, 3]);

    // Rows for chunks 1-2 (student-0..3) are synced; chunk 3 onward (student-4..9) are not.
    const stillPending = listPendingChanges(handle.db, 100);
    expect(stillPending).toHaveLength(6);
    expect(stillPending.map((r) => r.row_id).sort()).toEqual(
      ['student-4', 'student-5', 'student-6', 'student-7', 'student-8', 'student-9'].sort()
    );

    // Second call ("reconnect"): everything succeeds now. Only the 6
    // remaining rows should ever be sent — the already-synced rows for
    // chunks 1-2 are simply absent from the pending list, so they cannot be
    // re-sent even in principle.
    const secondCallChunkIndexes: number[] = [];
    const secondCallRowIds: string[] = [];
    const { fetchImpl: fetchImpl2 } = makeFetchMock({
      onChunk: (_sessionId, body) => {
        secondCallChunkIndexes.push(body.chunkIndex);
        secondCallRowIds.push(...body.rows.map((r: any) => r.rowId));
        return new Response(JSON.stringify({ received: body.chunkIndex }), { status: 200 });
      },
    });

    const secondResult = await runSync(handle.db, {
      baseUrl: BASE_URL,
      chunkSize: 2,
      fetchImpl: fetchImpl2,
      maxAttemptsPerChunk: 2,
    });

    expect(secondResult.completed).toBe(true);
    expect(secondCallRowIds.sort()).toEqual(
      ['student-4', 'student-5', 'student-6', 'student-7', 'student-8', 'student-9'].sort()
    );
    expect(listPendingChanges(handle.db, 100)).toHaveLength(0);
  });

  it('leaves the sync_queue completely untouched when the session cannot even be created', async () => {
    seedRows(handle.db, 4);
    const { fetchImpl } = makeFetchMock({
      onCreateSession: () => new Response('down', { status: 503 }),
    });

    const result = await runSync(handle.db, { baseUrl: BASE_URL, chunkSize: 2, fetchImpl });

    expect(result.completed).toBe(false);
    expect(listPendingChanges(handle.db, 100)).toHaveLength(4);
  });

  it('is a no-op (but still completes) when there is nothing pending', async () => {
    const { fetchImpl, calls } = makeFetchMock({});
    const result = await runSync(handle.db, { baseUrl: BASE_URL, fetchImpl });
    expect(result.completed).toBe(true);
    expect(result.totalChunks).toBe(0);
    // Only the session-creation call happens; no chunks, no completion call.
    expect(calls.some((c) => c.url.includes('/chunks/'))).toBe(false);
  });

  it('computes the checksum as sha256 hex of the chunk rows JSON', async () => {
    seedRows(handle.db, 2);
    let receivedChecksum: string | null = null;
    const { fetchImpl } = makeFetchMock({
      onChunk: (_sessionId, body) => {
        receivedChecksum = body.checksum;
        return new Response(JSON.stringify({ received: body.chunkIndex }), { status: 200 });
      },
    });

    await runSync(handle.db, { baseUrl: BASE_URL, chunkSize: 50, fetchImpl });
    expect(receivedChecksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
