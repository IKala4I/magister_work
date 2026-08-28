/**
 * The one place the app calls an edge function (ADR-0011 Consequences → ADR-0012 §1): every
 * invocation is pinned to the project's region so participant data never transits another
 * function region (`FunctionRegion.EuWest1` = the Supabase project, Ireland). Classifies the
 * supabase-js error shapes once: `FunctionsFetchError` = no response (offline),
 * `FunctionsHttpError` = a non-2xx with a readable body.
 */
import { FunctionRegion, type FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '../auth/client';

export const FUNCTIONS_REGION = FunctionRegion.EuWest1;

export type InvokeResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'no-session' }
  | { kind: 'offline' }
  | { kind: 'http'; status: number; body: Record<string, unknown> | null; message: string }
  | { kind: 'failed'; message: string };

async function readJson(ctx: Response | undefined): Promise<Record<string, unknown> | null> {
  if (!ctx) return null;
  try {
    return (await ctx.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function invokeFunction<T>(name: string, body: object): Promise<InvokeResult<T>> {
  if (!supabase) return { kind: 'no-session' };
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body as Record<string, unknown>,
    region: FUNCTIONS_REGION,
  });
  if (error) {
    if (error.name === 'FunctionsFetchError') return { kind: 'offline' };
    if (error.name === 'FunctionsHttpError') {
      const ctx = (error as FunctionsHttpError).context as Response | undefined;
      const status = ctx?.status ?? 0;
      return { kind: 'http', status, body: await readJson(ctx), message: error.message };
    }
    return { kind: 'failed', message: error.message };
  }
  if (data === null || data === undefined) return { kind: 'failed', message: 'empty response' };
  return { kind: 'ok', data };
}
