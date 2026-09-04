/**
 * readSession separates "no session" from "the refresh failed on the network" (hardware pass
 * 2026-09-04 F1): the second is offline — the refresh token is still stored and the next
 * successful refresh brings the session back.
 */
const mockGetSession = jest.fn();
jest.mock('../client', () => ({ supabase: { auth: { getSession: () => mockGetSession() } } }));
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

import { readSession } from '../readSession';

beforeEach(() => mockGetSession.mockReset());

it('a live session → its user id', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
  expect(await readSession()).toEqual({ kind: 'session', userId: 'u1' });
});

it('an expired token whose refresh failed on the network → offline, not none', async () => {
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: new AuthRetryableFetchError('fetch failed: Unable to resolve host', 0),
  });
  expect(await readSession()).toEqual({ kind: 'offline' });
});

it('no session, or a refresh the server rejected → none', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await readSession()).toEqual({ kind: 'none' });
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
  });
  expect(await readSession()).toEqual({ kind: 'none' });
});
