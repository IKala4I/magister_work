/**
 * UC-03 context assembly through the USER-SCOPED client (RLS applies — the function proves it
 * needs nothing a client could not read): profile hours, open tasks, busy calendar events (may
 * be empty, decision 5), the previous plan for the date (AddHint warm start; pinned blocks
 * become `pinned_start`), the current study arm, and the user's beta_cells for features 15–16.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BetaCell } from '../_shared/energy.ts';
import { localMidnightUtcMs, parseIsoDate } from '../_shared/grid.ts';
import { HORIZON_DAYS } from '../_shared/params.ts';
import type { Arm, Horizon, ServicePreviousAssignment, ServiceTaskIn } from '../_shared/types.ts';
import type { PlanContext } from './handler.ts';

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

export async function loadContext(
  client: AnyClient,
  userId: string,
  planDate: string,
  horizon: Horizon,
  nowMs: number,
): Promise<PlanContext | null> {
  const { data: profile, error: pErr } = await client
    .from('profiles')
    .select('timezone, working_hours, sleep_window, onboarding_completed_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (pErr) fail('profiles', pErr);
  if (profile === null || profile.onboarding_completed_at === null) return null;

  const { year, month, day } = parseIsoDate(planDate);
  let startMs: number;
  try {
    startMs = localMidnightUtcMs(profile.timezone, year, month, day);
  } catch {
    return null; // unknown zone on the profile: treat as no usable profile
  }
  const endMs = startMs + HORIZON_DAYS[horizon] * 86_400_000 + 3 * 3_600_000; // + DST slack; the grid clips

  const [tasksRes, busyRes, plansRes, armRes, cellsRes] = await Promise.all([
    client
      .from('tasks')
      .select(
        'id, category, est_minutes, deadline, value, splittable, earliest_start, postpone_count',
      )
      .eq('user_id', userId)
      .in('status', ['inbox', 'scheduled'])
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(200),
    client
      .from('calendar_events')
      .select('start_at, end_at')
      .eq('user_id', userId)
      .eq('busy', true)
      .lt('start_at', new Date(endMs).toISOString())
      .gt('end_at', new Date(startMs).toISOString()),
    client
      .from('plans')
      .select('id')
      .eq('user_id', userId)
      .eq('plan_date', planDate)
      .eq('horizon', horizon)
      .order('generated_at', { ascending: false }),
    client
      .from('study_assignments')
      .select('arm')
      .eq('user_id', userId)
      .lte('starts_on', planDate)
      .gte('ends_on', planDate)
      .order('phase_no', { ascending: false })
      .limit(1),
    client
      .from('beta_cells')
      .select('category, daypart, day_type, alpha0, beta0, succ, fail, last_event_at')
      .eq('user_id', userId),
  ]);
  if (tasksRes.error) fail('tasks', tasksRes.error);
  if (busyRes.error) fail('calendar_events', busyRes.error);
  if (plansRes.error) fail('plans', plansRes.error);
  if (armRes.error) fail('study_assignments', armRes.error);
  if (cellsRes.error) fail('beta_cells', cellsRes.error);

  const previous: ServicePreviousAssignment[] = [];
  const pinned = new Map<string, string>();
  const existingPlanIds = (plansRes.data ?? []).map((p) => p.id as string);
  const lastPlanId = existingPlanIds[0];
  if (lastPlanId !== undefined) {
    const { data: recs, error } = await client
      .from('recommendations')
      .select('task_id, slot_start, chunk_index, status')
      .eq('user_id', userId)
      .eq('plan_id', lastPlanId)
      .in('status', ['shown', 'accepted', 'pinned', 'moved']);
    if (error) fail('recommendations', error);
    for (const r of recs ?? []) {
      previous.push({ task_id: r.task_id, slot_start: r.slot_start, chunk_index: r.chunk_index });
      if (r.status === 'pinned' && r.chunk_index === 0) pinned.set(r.task_id, r.slot_start);
    }
  }

  const tasks: ServiceTaskIn[] = (tasksRes.data ?? []).map((t) => ({
    id: t.id,
    category: t.category,
    est_minutes: t.est_minutes,
    deadline: t.deadline,
    value: t.value,
    splittable: t.splittable,
    earliest_start: t.earliest_start,
    pinned_start: pinned.get(t.id) ?? null,
    postpone_count: t.postpone_count,
  }));
  const cells: BetaCell[] = (cellsRes.data ?? []).map((c) => ({
    category: c.category,
    daypart: c.daypart,
    dayType: c.day_type,
    alpha0: c.alpha0,
    beta0: c.beta0,
    succ: c.succ,
    fail: c.fail,
    lastEventAtMs: c.last_event_at === null ? null : Date.parse(c.last_event_at),
  }));

  void nowMs;
  return {
    profile: {
      timezone: profile.timezone,
      working_hours: profile.working_hours ?? {},
      sleep_window: profile.sleep_window ?? null,
    },
    tasks,
    busy: (busyRes.data ?? []).map((b) => ({ start: b.start_at, end: b.end_at })),
    previous_assignments: previous,
    arm: (armRes.data?.[0]?.arm as Arm | undefined) ?? null,
    cells,
    existing_plan_ids: existingPlanIds,
  };
}

export async function countPlansLast24h(
  client: AnyClient,
  userId: string,
  nowMs: number,
): Promise<number> {
  const { count, error } = await client
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('generated_at', new Date(nowMs - 86_400_000).toISOString());
  if (error) fail('plans count', error);
  return count ?? 0;
}
