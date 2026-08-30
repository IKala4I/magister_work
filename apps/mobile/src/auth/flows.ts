/**
 * Interactive auth flows (FR-01): magic link, Google OAuth, anonymous→email conversion.
 * All deep links land on hourwell://auth-callback (config.toml allow-list); the callback
 * route feeds the URL to createSessionFromUrl, which accepts ONLY the PKCE ?code= form —
 * see its doc comment for why the token-fragment form is a session-fixation vector.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { clearAllNotifications } from '../notifications/setup';
import { track } from '../observability/analytics';

import { supabase } from './client';

export const AUTH_CALLBACK_PATH = 'auth-callback';

export function authRedirectUrl(): string {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

export type AuthFlowResult = { ok: true } | { ok: false; code: AuthFlowErrorCode };
export type AuthFlowErrorCode =
  | 'unavailable' // env-gated off
  | 'offline_or_failed'
  | 'email_exists' // conversion target already has an account
  | 'provider_disabled' // Google not configured yet (consent-screen gate)
  | 'cancelled'
  | 'invalid_link';

/** Send a sign-in (or sign-up) magic link. */
export async function sendMagicLink(email: string): Promise<AuthFlowResult> {
  if (!supabase) return { ok: false, code: 'unavailable' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) return { ok: false, code: 'offline_or_failed' };
  return { ok: true };
}

/**
 * Convert the anonymous trial to a permanent account: same uid, so no data moves
 * (specs/07 §4.4). Supabase sends a confirmation link to the new address.
 */
export async function convertAnonymousToEmail(email: string): Promise<AuthFlowResult> {
  if (!supabase) return { ok: false, code: 'unavailable' };
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: authRedirectUrl() },
  );
  if (error) {
    return {
      ok: false,
      code: error.code === 'email_exists' ? 'email_exists' : 'offline_or_failed',
    };
  }
  track('auth_event', { method: 'magic_link', event: 'conversion_started' });
  return { ok: true };
}

/** Browser-based Google OAuth (needs the consent-screen gate before it can succeed). */
export async function signInWithGoogle(): Promise<AuthFlowResult> {
  if (!supabase) return { ok: false, code: 'unavailable' };
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { ok: false, code: 'provider_disabled' };
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { ok: false, code: 'cancelled' };
  return createSessionFromUrl(result.url);
}

/**
 * Turn an auth deep link into a session. Exported for the auth-callback route.
 *
 * PKCE ONLY — deliberately no `#access_token` fragment fallback. This app mints its links
 * with flowType 'pkce', so a legitimate link always carries a one-shot `?code=` that is
 * useless without the locally stored verifier. A fragment branch would accept
 * attacker-supplied tokens (anonymous sign-ins make minting valid project tokens free):
 * one hostile `hourwell://auth-callback#access_token=…` tap would silently sign the victim
 * into the attacker's account and hand their local data to the adopt/wipe machinery
 * (P4 adversarial finding M1 — session fixation).
 */
export async function createSessionFromUrl(url: string): Promise<AuthFlowResult> {
  if (!supabase) return { ok: false, code: 'unavailable' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: 'invalid_link' };
  }
  if (parsed.searchParams.get('error_description')) return { ok: false, code: 'invalid_link' };

  const code = parsed.searchParams.get('code');
  if (!code) return { ok: false, code: 'invalid_link' };
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? { ok: false, code: 'invalid_link' } : { ok: true };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const method = data.session?.user.is_anonymous ? 'anonymous' : 'magic_link';
  // the previous account's reminders (with its task titles) must not keep firing (P10 #1)
  await clearAllNotifications();
  await supabase.auth.signOut();
  track('auth_event', { method, event: 'signed_out' });
}
