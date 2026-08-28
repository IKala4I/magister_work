/**
 * Supabase adapters for `attribute-rewards` — every read and write goes through the SERVICE-ROLE
 * client: reward tuples, recommendation status/slot patches and duration estimates are
 * service-authored (specs/07 §4.4), and the daily sweep spans users. `attribution_due` is a
 * service-only RPC (P7 migration).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BetaCell } from '../_shared/energy.ts';
import type { BusyInterval } from '../_shared/grid.ts';
import {
  type RecPatch,
  REWARD_FACT_TYPES,
  type StoredTuple,
  type Tuple,
} from '../_shared/rewards.ts';
import type { Category } from '../_shared/types.ts';
import type { WireTuple } from './feedback.ts';
import type { Deps, Profile, RecRow, StoredDuration, TaskAttrs } from './handler.ts';

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

const REC_SELECT =
  'id, user_id, task_id, slot_start, slot_end, context_bucket, features, status, conflict_flag, attributed_at, tasks!inner(category)';

// deno-lint-ignore no-explicit-any
function toRecRow(r: any): RecRow {
  return {
    id: r.id,
    user_id: r.user_id,
    task_id: r.task_id,
    category: (Array.isArray(r.tasks) ? r.tasks[0]?.category : r.tasks?.category) as Category,
    slot_start: r.slot_start,
    slot_end: r.slot_end,
    context_bucket: r.context_bucket,
    features: r.features as number[],
    status: r.status,
    conflict_flag: Boolean(r.conflict_flag),
    attributed_at: r.attributed_at ?? null,
  };
}

const TUPLE_SELECT =
  'recommendation_id, kind, reward, reason, category, features, excluded, excluded_reason, attributed_at, corrected_at, source';

export function makeDbDeps(
  admin: AnyClient,
): Omit<Deps, 'now' | 'verifyUser' | 'serviceKey' | 'postFeedback'> {
  return {
    async loadProfile(userId) {
      const { data, error } = await admin
        .from('profiles')
        .select('timezone, working_hours, sleep_window, onboarding_completed_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) fail('profiles', error);
      if (data === null || data.onboarding_completed_at === null) return null;
      return {
        timezone: data.timezone,
        working_hours: data.working_hours ?? {},
        sleep_window: data.sleep_window ?? null,
      } satisfies Profile;
    },
    async loadFacts(userId, sinceIso) {
      // reward-bearing facts only; newest first so a cap never drops the latest (adversarial #10)
      const { data, error } = await admin
        .from('events')
        .select('type, task_id, recommendation_id, payload, context, client_ts, local_day')
        .eq('user_id', userId)
        .in('type', [...REWARD_FACT_TYPES])
        .gte('client_ts', sinceIso)
        .order('client_ts', { ascending: false })
        .limit(2000);
      if (error) fail('events', error);
      return (data ?? []).reverse().map((e) => ({
        type: e.type,
        task_id: e.task_id ?? null,
        recommendation_id: e.recommendation_id ?? null,
        payload: (e.payload ?? {}) as Record<string, unknown>,
        context: (e.context ?? {}) as Record<string, unknown>,
        client_ts: e.client_ts,
        local_day: e.local_day,
      }));
    },
    async loadRecs(userId, ids) {
      if (ids.length === 0) return [];
      const { data, error } = await admin
        .from('recommendations')
        .select(REC_SELECT)
        .eq('user_id', userId)
        .in('id', [...ids]);
      if (error) fail('recommendations', error);
      return (data ?? []).map(toRecRow);
    },
    async loadRecsForTasks(userId, taskIds, fromIso, toIso) {
      if (taskIds.length === 0) return [];
      const { data, error } = await admin
        .from('recommendations')
        .select(REC_SELECT)
        .eq('user_id', userId)
        .in('task_id', [...taskIds])
        .gte('slot_end', fromIso)
        .lte('slot_start', toIso);
      if (error) fail('recommendations by task', error);
      return (data ?? []).map(toRecRow);
    },
    async loadRecsInRange(userId, fromIso, toIso) {
      const { data, error } = await admin
        .from('recommendations')
        .select(REC_SELECT)
        .eq('user_id', userId)
        .neq('status', 'expired')
        .gte('slot_end', fromIso)
        .lte('slot_start', toIso);
      if (error) fail('recommendations in range', error);
      return (data ?? []).map(toRecRow);
    },
    async loadDisplacedPending(userId) {
      const { data, error } = await admin
        .from('recommendations')
        .select(REC_SELECT)
        .eq('user_id', userId)
        .eq('status', 'displaced_pending')
        .is('attributed_at', null)
        .limit(200);
      if (error) fail('recommendations displaced_pending', error);
      return (data ?? []).map(toRecRow);
    },
    async loadDue(nowIso, limit) {
      const { data, error } = await admin.rpc('attribution_due', { p_now: nowIso, p_limit: limit });
      if (error) fail('attribution_due', error);
      // deno-lint-ignore no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        task_id: r.task_id,
        category: r.category as Category,
        slot_start: r.slot_start,
        slot_end: r.slot_end,
        context_bucket: r.context_bucket,
        features: r.features as number[],
        status: r.status,
        conflict_flag: Boolean(r.conflict_flag),
        attributed_at: null,
        timezone: r.timezone,
      }));
    },
    async loadStored(userId, recIds) {
      if (recIds.length === 0) return [];
      const { data, error } = await admin
        .from('feedback_rewards')
        .select(
          'recommendation_id, kind, reward, reason, excluded, attributed_at, corrected_at, source',
        )
        .eq('user_id', userId)
        .in('recommendation_id', [...recIds]);
      if (error) fail('feedback_rewards', error);
      return (data ?? []) as StoredTuple[];
    },
    async loadUndelivered(userId) {
      const { data, error } = await admin
        .from('feedback_rewards')
        .select(TUPLE_SELECT)
        .eq('user_id', userId)
        .is('delivered_at', null)
        .order('attributed_at', { ascending: true })
        .order('recommendation_id', { ascending: true })
        .order('kind', { ascending: true })
        .limit(500);
      if (error) fail('feedback_rewards undelivered', error);
      return (data ?? []).map((t) => ({
        recommendation_id: t.recommendation_id,
        kind: t.kind,
        reward: Number(t.reward),
        reason: t.reason,
        category: t.category,
        features: t.features as number[],
        excluded: Boolean(t.excluded),
        excluded_reason: t.excluded_reason ?? null,
        attributed_at: t.attributed_at,
        correction: t.corrected_at !== null,
        source: t.source,
      }));
    },
    async loadUndeliveredUsers(limit) {
      const { data, error } = await admin
        .from('feedback_rewards')
        .select('user_id')
        .is('delivered_at', null)
        .limit(limit * 20);
      if (error) fail('feedback_rewards users', error);
      return [...new Set((data ?? []).map((r) => r.user_id as string))].slice(0, limit);
    },
    async loadCells(userId) {
      const { data, error } = await admin
        .from('beta_cells')
        .select('category, daypart, day_type, alpha0, beta0, succ, fail, last_event_at')
        .eq('user_id', userId);
      if (error) fail('beta_cells', error);
      return (data ?? []).map((c) => ({
        category: c.category,
        daypart: c.daypart,
        dayType: c.day_type,
        alpha0: Number(c.alpha0),
        beta0: Number(c.beta0),
        succ: Number(c.succ),
        fail: Number(c.fail),
        lastEventAtMs: c.last_event_at === null ? null : Date.parse(c.last_event_at),
      })) as BetaCell[];
    },
    async loadTask(userId, taskId) {
      const { data, error } = await admin
        .from('tasks')
        .select('category, value, est_minutes, splittable, deadline, postpone_count')
        .eq('user_id', userId)
        .eq('id', taskId)
        .maybeSingle();
      if (error) fail('tasks', error);
      return (data as TaskAttrs | null) ?? null;
    },
    async loadBusy(userId, fromIso, toIso) {
      const { data, error } = await admin
        .from('calendar_events')
        .select('start_at, end_at')
        .eq('user_id', userId)
        .eq('busy', true)
        .is('deleted_at', null)
        .lt('start_at', toIso)
        .gt('end_at', fromIso);
      if (error) fail('calendar_events', error);
      return (data ?? []).map((b) => ({
        startMs: Date.parse(b.start_at),
        endMs: Date.parse(b.end_at),
      })) satisfies BusyInterval[];
    },
    async writeTuples(userId, tuples: readonly Tuple[]) {
      const fresh = tuples.filter((t) => !t.correction);
      if (fresh.length > 0) {
        const { error } = await admin.from('feedback_rewards').upsert(
          fresh.map((t) => ({
            user_id: userId,
            recommendation_id: t.recommendation_id,
            kind: t.kind,
            reward: t.reward,
            reason: t.reason,
            category: t.category,
            features: t.features,
            excluded: t.excluded,
            excluded_reason: t.excluded_reason,
            attributed_at: t.attributed_at,
            source: t.source,
          })),
          { onConflict: 'recommendation_id,kind', ignoreDuplicates: true },
        );
        if (error) fail('feedback_rewards insert', error);
      }
      for (const t of tuples.filter((t) => t.correction)) {
        const { error } = await admin
          .from('feedback_rewards')
          .update({
            reward: t.reward,
            reason: t.reason,
            corrected_at: new Date().toISOString(),
            delivered_at: null,
            source: 'correction',
          })
          .eq('user_id', userId)
          .eq('recommendation_id', t.recommendation_id)
          .eq('kind', t.kind)
          .is('corrected_at', null);
        if (error) fail('feedback_rewards correction', error);
      }
    },
    async patchRecs(userId, patches: readonly RecPatch[]) {
      const rows: RecRow[] = [];
      for (const p of patches) {
        const { id, ...fields } = p;
        const { data, error } = await admin
          .from('recommendations')
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('id', id)
          .select(REC_SELECT)
          .maybeSingle();
        if (error) fail('recommendations patch', error);
        if (data !== null) rows.push(toRecRow(data));
      }
      return rows;
    },
    async markDelivered(userId, keys, atIso) {
      for (const kind of ['outcome', 'override_out', 'override_in'] as const) {
        const ids = keys.filter(([, k]) => k === kind).map(([id]) => id);
        if (ids.length === 0) continue;
        const { error } = await admin
          .from('feedback_rewards')
          .update({ delivered_at: atIso })
          .eq('user_id', userId)
          .eq('kind', kind)
          .in('recommendation_id', ids)
          .is('delivered_at', null);
        if (error) fail('feedback_rewards delivered', error);
      }
    },
    async loadDurationEstimates(userId) {
      const { data, error } = await admin
        .from('duration_estimates')
        .select('category, ewma_ratio, n, last_session_at')
        .eq('user_id', userId);
      if (error) fail('duration_estimates', error);
      const out: Partial<Record<Category, StoredDuration>> = {};
      for (const r of data ?? []) {
        out[r.category as Category] = {
          ewma_ratio: Number(r.ewma_ratio),
          n: Number(r.n),
          last_session_at: r.last_session_at ?? null,
        };
      }
      return out;
    },
    async saveDurationEstimate(userId, category, estimate, lastSessionAtIso) {
      const { error } = await admin.from('duration_estimates').upsert({
        user_id: userId,
        category,
        ewma_ratio: estimate.ewma_ratio,
        n: estimate.n,
        last_session_at: lastSessionAtIso,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,category' });
      if (error) fail('duration_estimates upsert', error);
    },
  };
}

export type { WireTuple };
