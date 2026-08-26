/**
 * Supabase client (FR-01), env-gated like Sentry/PostHog: without EXPO_PUBLIC_SUPABASE_URL
 * + _ANON_KEY the app runs local-only and every auth surface hides itself. Session storage
 * is the encrypted largeSecureStore; PKCE flow because deep links carry a one-shot `code`
 * (magic link + OAuth); detectSessionInUrl off — React Native has no window.location, the
 * auth-callback route feeds URLs in explicitly (src/auth/flows.ts).
 */
import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from '@hourwell/shared';

import { largeSecureStore } from './largeSecureStore';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: {
          storage: largeSecureStore,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
          lock: processLock,
        },
      })
    : null;

export function isAuthAvailable(): boolean {
  return supabase !== null;
}

/** Official RN lifecycle: refresh tokens only while foregrounded. */
export function wireAutoRefresh(): void {
  if (!supabase) return;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
