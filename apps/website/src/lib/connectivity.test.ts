// Run with: npm run test:unit   (node's built-in runner through tsx)
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, connectivityMessage } from './connectivity';

function setOnline(value: boolean) {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: value, language: 'en' }, configurable: true });
}

const networkError = { isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' };

test('online browser + network error is "server unreachable", not offline', () => {
  setOnline(true);
  const info = classifyError(networkError);
  assert.equal(info.kind, 'server-unreachable');
  assert.equal(info.detail, 'ERR_NETWORK');
  assert.match(connectivityMessage(info, 'en')!, /can't reach EduIgnite/);
  assert.doesNotMatch(connectivityMessage(info, 'en')!, /saved/i);
});

test('device offline is reported as offline', () => {
  setOnline(false);
  const info = classifyError(networkError);
  assert.equal(info.kind, 'device-offline');
  assert.equal(connectivityMessage(info, 'en'), 'You are offline. Check your internet connection.');
  setOnline(true);
});

test('502 / 503 / 504 are server unreachable with the status as detail', () => {
  setOnline(true);
  for (const status of [502, 503, 504]) {
    const info = classifyError({ isAxiosError: true, response: { status } });
    assert.equal(info.kind, 'server-unreachable');
    assert.equal(info.detail, `HTTP ${status}`);
  }
});

test('timeout is server unreachable', () => {
  setOnline(true);
  const info = classifyError({ isAxiosError: true, code: 'ECONNABORTED' });
  assert.equal(info.kind, 'server-unreachable');
  assert.match(info.detail!, /timeout/);
});

test('real answers (wrong password, expired token, validation) are untouched', () => {
  setOnline(true);
  for (const status of [400, 401, 403, 404, 500]) {
    assert.equal(classifyError({ isAxiosError: true, response: { status } }).kind, 'other');
  }
});

test('aborted requests and plain errors are not blamed on the server', () => {
  setOnline(true);
  assert.equal(classifyError({ isAxiosError: true, code: 'ERR_CANCELED' }).kind, 'other');
  assert.equal(classifyError(new Error('No refresh token')).kind, 'other');
});

test('"saved and will sync" is only said for something really queued', () => {
  setOnline(true);
  const queued = classifyError({ _offlineQueued: true });
  assert.equal(queued.kind, 'queued');
  assert.match(connectivityMessage(queued, 'en')!, /saved/);
  for (const error of [networkError, { response: { status: 502 } }]) {
    assert.doesNotMatch(connectivityMessage(classifyError(error), 'en') ?? '', /saved/i);
  }
});

test('French wording exists for every connectivity state', () => {
  setOnline(true);
  assert.match(connectivityMessage({ kind: 'server-unreachable' }, 'fr')!, /Impossible de joindre EduIgnite/);
  assert.match(connectivityMessage({ kind: 'device-offline' }, 'fr')!, /hors ligne/);
  assert.equal(connectivityMessage({ kind: 'other' }, 'fr'), null);
});
