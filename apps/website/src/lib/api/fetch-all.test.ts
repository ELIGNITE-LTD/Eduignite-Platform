// Run with: npm run test:unit   (node's built-in runner through tsx)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages } from './fetch-all';
import { patternsForWrite } from './invalidation';

type Row = { id: string };
const rows = (n: number, offset = 0): Row[] => Array.from({ length: n }, (_, i) => ({ id: String(i + offset) }));

/** A fake paginated endpoint that clamps page_size to `ceiling`, like the server. */
function fakeServer(total: number, ceiling: number) {
  const all = rows(total);
  const calls: Array<{ page: number; pageSize: number }> = [];
  const fetchPage = async (page: number, pageSize: number) => {
    calls.push({ page, pageSize });
    const size = Math.min(pageSize, ceiling);
    const start = (page - 1) * size;
    const results = all.slice(start, start + size);
    return { count: total, next: start + size < total ? `?page=${page + 1}` : null, results };
  };
  return { fetchPage, calls };
}

test('follows next across pages and returns every row once', async () => {
  const { fetchPage, calls } = fakeServer(437, 100);
  const out = await fetchAllPages<Row>(fetchPage, { pageSize: 100 });
  assert.equal(out.length, 437);
  assert.equal(new Set(out.map((r) => r.id)).size, 437);
  assert.equal(calls.length, 5);
});

test('still returns everything when the server clamps the requested page size', async () => {
  const { fetchPage } = fakeServer(250, 100);
  const out = await fetchAllPages<Row>(fetchPage, { pageSize: 1000 });
  assert.equal(out.length, 250);
});

test('an unpaginated endpoint (plain array) is returned as-is after one call', async () => {
  let calls = 0;
  const out = await fetchAllPages<Row>(async () => {
    calls += 1;
    return rows(7);
  });
  assert.equal(out.length, 7);
  assert.equal(calls, 1);
});

test('empty and missing responses give an empty list', async () => {
  assert.deepEqual(await fetchAllPages<Row>(async () => ({ results: [], next: null })), []);
  assert.deepEqual(await fetchAllPages<Row>(async () => null), []);
});

test('a failing page rejects instead of returning a partial list', async () => {
  let n = 0;
  await assert.rejects(
    fetchAllPages<Row>(async () => {
      n += 1;
      if (n === 3) throw new Error('network');
      return { results: rows(10, n * 10), next: '?next' };
    }),
    /network/,
  );
});

test('rows that shift between pages are de-duplicated by id', async () => {
  const pages = [
    { results: [{ id: 'a' }, { id: 'b' }], next: '?2' },
    { results: [{ id: 'b' }, { id: 'c' }], next: null },
  ];
  let i = 0;
  const out = await fetchAllPages<Row>(async () => pages[i++]);
  assert.deepEqual(out.map((r) => r.id), ['a', 'b', 'c']);
});

test('a server that never stops saying next is cut off by maxPages', async () => {
  let calls = 0;
  const out = await fetchAllPages<Row>(
    async (page) => {
      calls += 1;
      return { results: rows(1, page), next: '?forever' };
    },
    { maxPages: 5 },
  );
  assert.equal(calls, 5);
  assert.equal(out.length, 5);
});

test('writes to hierarchy / users / fees map to cache families', () => {
  const people = patternsForWrite('/schools/hierarchy/staff/');
  assert.ok(people.some((p) => p.test('users')));
  assert.ok(people.some((p) => p.test('sub-schools')));
  assert.ok(patternsForWrite('/schools/hierarchy/sub-schools/').some((p) => p.test('student-sub-schools')));
  assert.ok(patternsForWrite('/schools/ABC123/classes/').some((p) => p.test('cm-classes')));
  assert.ok(patternsForWrite('/students/students/').some((p) => p.test('record-payment-students')));
  assert.ok(patternsForWrite('/fees/fee-structures/').some((p) => p.test('fee-types-list')));
});

test('auth, ai, chat and notification writes never trigger invalidation', () => {
  for (const url of ['/auth/login/', '/ai/generate/', '/chat/messages/', '/notifications/read/']) {
    assert.deepEqual(patternsForWrite(url), []);
  }
  assert.deepEqual(patternsForWrite(undefined), []);
});
