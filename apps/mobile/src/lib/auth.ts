/**
 * @/lib/auth
 *
 * Token helpers used by React Query hooks throughout the app.
 * The underlying storage logic lives in @/lib/api/client to keep a single
 * source of truth for the localStorage key names.
 */

import {
  getAccessToken as _getAccessToken,
  setTokens as _setTokens,
  clearTokens as _clearTokens,
} from '@/lib/api/client';

/** Returns the current JWT access token, or null if not signed in. */
export const getAccessToken = (): string | null => _getAccessToken();

/** Clears all stored tokens (called on logout). */
export const clearTokens = (): void => _clearTokens();

/**
 * Stores the access and refresh tokens returned after a successful login.
 *
 * Accepts an object so call-sites can use named parameters:
 *   setTokens({ accessToken: '...', refreshToken: '...' })
 */
export const setTokens = ({
  accessToken,
  refreshToken,
}: {
  accessToken: string;
  refreshToken: string;
}): void => {
  _setTokens(accessToken, refreshToken);
};
