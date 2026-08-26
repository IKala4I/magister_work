/**
 * Deep-link → session rules (FR-01; adversarial M1): the app is PKCE-only, so ONLY a
 * one-shot ?code= may create a session. Attacker-suppliable #access_token fragments must
 * never reach setSession — anonymous sign-ins make minting valid project tokens free, so a
 * fragment path would let one hostile link sign the victim into an attacker's account and
 * feed their local data to the adopt/wipe machinery.
 */
jest.mock('../client', () => {
  const exchangeCodeForSession = jest.fn(() => Promise.resolve({ error: null }));
  const setSession = jest.fn(() => Promise.resolve({ error: null }));
  return {
    supabase: { auth: { exchangeCodeForSession, setSession } },
    isAuthAvailable: () => true,
    wireAutoRefresh: jest.fn(),
  };
});
jest.mock('expo-linking', () => ({ createURL: (p: string) => `hourwell://${p}` }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('../../observability/analytics', () => ({ track: jest.fn() }));

import { supabase } from '../client';
import { createSessionFromUrl } from '../flows';

const auth = (
  supabase as unknown as { auth: { exchangeCodeForSession: jest.Mock; setSession: jest.Mock } }
).auth;

beforeEach(() => jest.clearAllMocks());

describe('createSessionFromUrl (PKCE only — M1)', () => {
  it('exchanges a ?code= link', async () => {
    const result = await createSessionFromUrl('hourwell://auth-callback?code=one-shot');
    expect(result).toEqual({ ok: true });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('one-shot');
  });

  it('REJECTS token fragments and never calls setSession (session fixation)', async () => {
    const hostile =
      'hourwell://auth-callback#access_token=attacker&refresh_token=attacker&token_type=bearer';
    const result = await createSessionFromUrl(hostile);
    expect(result).toEqual({ ok: false, code: 'invalid_link' });
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('surfaces provider errors without exchanging', async () => {
    const result = await createSessionFromUrl('hourwell://auth-callback?error_description=expired');
    expect(result).toEqual({ ok: false, code: 'invalid_link' });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('rejects unparseable URLs', async () => {
    await expect(createSessionFromUrl('not a url')).resolves.toEqual({
      ok: false,
      code: 'invalid_link',
    });
  });

  it('maps a failed exchange to invalid_link', async () => {
    auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: 'used' } });
    await expect(createSessionFromUrl('hourwell://auth-callback?code=used')).resolves.toEqual({
      ok: false,
      code: 'invalid_link',
    });
  });
});
