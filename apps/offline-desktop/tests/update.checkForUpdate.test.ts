import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate } from '../src/update/checkForUpdate';

const BASE_URL = 'http://test.invalid';

/** Builds a `fetch` mock that resolves with the given JSON body/status. */
function makeFetchMock(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('checkForUpdate', () => {
  it('returns "blocked" when the current version is below minSupportedVersion', async () => {
    const fetchImpl = makeFetchMock({
      offline_desktop: {
        latestVersion: '2.0.0',
        minSupportedVersion: '1.5.0',
        downloadUrl: 'https://example.com/eduignite-offline-setup.exe',
        releaseNotes: 'Critical fix.',
      },
    });

    const result = await checkForUpdate({ currentVersion: '1.0.0', baseUrl: BASE_URL, fetchImpl });

    expect(result.status).toBe('blocked');
    expect(result.currentVersion).toBe('1.0.0');
    expect(result.info?.downloadUrl).toBe('https://example.com/eduignite-offline-setup.exe');
  });

  it('returns "available" when between minSupportedVersion and latestVersion', async () => {
    const fetchImpl = makeFetchMock({
      offline_desktop: {
        latestVersion: '2.0.0',
        minSupportedVersion: '1.0.0',
        downloadUrl: 'https://example.com/eduignite-offline-setup.exe',
        releaseNotes: null,
      },
    });

    const result = await checkForUpdate({ currentVersion: '1.5.0', baseUrl: BASE_URL, fetchImpl });

    expect(result.status).toBe('available');
    expect(result.info?.latestVersion).toBe('2.0.0');
  });

  it('returns "none" when already on the latest version', async () => {
    const fetchImpl = makeFetchMock({
      offline_desktop: {
        latestVersion: '1.5.0',
        minSupportedVersion: '1.0.0',
        downloadUrl: 'https://example.com/eduignite-offline-setup.exe',
        releaseNotes: null,
      },
    });

    const result = await checkForUpdate({ currentVersion: '1.5.0', baseUrl: BASE_URL, fetchImpl });

    expect(result.status).toBe('none');
  });

  it('returns "none" when running newer than latestVersion (e.g. a pre-release build)', async () => {
    const fetchImpl = makeFetchMock({
      offline_desktop: {
        latestVersion: '1.5.0',
        minSupportedVersion: '1.0.0',
        downloadUrl: 'https://example.com/eduignite-offline-setup.exe',
      },
    });

    const result = await checkForUpdate({ currentVersion: '1.6.0', baseUrl: BASE_URL, fetchImpl });

    expect(result.status).toBe('none');
  });

  it('returns "none" when this app_key is absent from the response (not an error)', async () => {
    const fetchImpl = makeFetchMock({
      mobile: { latestVersion: '1.0.0', minSupportedVersion: '1.0.0', downloadUrl: 'https://example.com/app.apk' },
    });

    const result = await checkForUpdate({ currentVersion: '1.0.0', baseUrl: BASE_URL, fetchImpl });

    expect(result.status).toBe('none');
    expect(result.info).toBeUndefined();
  });

  it('never throws and resolves to "none" when fetch itself rejects (offline/backend down)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    await expect(
      checkForUpdate({ currentVersion: '1.0.0', baseUrl: BASE_URL, fetchImpl })
    ).resolves.toEqual({ status: 'none', currentVersion: '1.0.0' });
  });

  it('never throws and resolves to "none" on a non-OK HTTP response', async () => {
    const fetchImpl = makeFetchMock({ detail: 'server error' }, 503);

    const result = await checkForUpdate({ currentVersion: '1.0.0', baseUrl: BASE_URL, fetchImpl });

    expect(result.status).toBe('none');
  });

  it('never throws and resolves to "none" when the response body is not valid JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;

    const result = await checkForUpdate({ currentVersion: '1.0.0', baseUrl: BASE_URL, fetchImpl });

    expect(result.status).toBe('none');
  });
});
