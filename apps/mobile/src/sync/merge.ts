/**
 * Field-level merge on a class-2 conflict (File 05 §2 "409 + server row → field-level merge,
 * user-owned fields LWW, replay op"; ADR-0012 §4). Pure functions over server-shaped rows
 * (snake_case, ISO timestamps) so the engine test pins the rule table:
 *
 *   tasks    user-owned fields (title, category, est_minutes, deadline, value, splittable,
 *            earliest_start, recurrence, deleted_at) → last-write-wins by updated_at (edit
 *            time on both sides — the P8 migration keeps the client's updated_at on the server);
 *            fact-derived fields monotone: done beats not-done (earliest done_at), archived beats
 *            the plan-mirror statuses, postpone_count = max; inbox/scheduled follow the LWW winner.
 *   profiles user-owned settings → row-level LWW by updated_at.
 *
 * Neither side is "the truth": the newest user intent wins per field, facts never regress.
 */

export interface ServerTask {
  id: string;
  user_id: string;
  title: string;
  category: string;
  est_minutes: number;
  deadline: string | null;
  value: number;
  splittable: boolean;
  earliest_start: string | null;
  recurrence: unknown;
  status: string;
  done_at: string | null;
  postpone_count: number;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  server_seq?: number | null;
}

/** Task payload as the client enqueues it (epoch-ms timestamps, `taskOpPayload`). */
export interface LocalTaskPayload {
  id: string;
  user_id: string;
  title: string;
  category: string;
  est_minutes: number;
  deadline: number | null;
  value: number;
  splittable: boolean;
  earliest_start: number | null;
  recurrence: unknown;
  status: string;
  done_at: number | null;
  postpone_count: number;
  deleted_at: number | null;
  version: number;
  created_at: number;
  updated_at: number;
}

const ms = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

const STATUS_RANK: Record<string, number> = { inbox: 0, scheduled: 0, archived: 1, done: 2 };

/**
 * Merge the device's current row (`local`, epoch-ms payload shape) with the server's row.
 * Returns the merged payload with `version = server.version + 1` (what the server will produce
 * once the rewritten op applies) — the op's `base_version` must be `server.version`.
 */
export function mergeTask(local: LocalTaskPayload, server: ServerTask): LocalTaskPayload {
  const localWins = local.updated_at >= (ms(server.updated_at) ?? 0);
  const user = localWins
    ? {
        title: local.title,
        category: local.category,
        est_minutes: local.est_minutes,
        deadline: local.deadline,
        value: local.value,
        splittable: local.splittable,
        earliest_start: local.earliest_start,
        recurrence: local.recurrence ?? null,
        deleted_at: local.deleted_at,
      }
    : {
        title: server.title,
        category: server.category,
        est_minutes: server.est_minutes,
        deadline: ms(server.deadline),
        value: server.value,
        splittable: server.splittable,
        earliest_start: ms(server.earliest_start),
        recurrence: server.recurrence ?? null,
        deleted_at: ms(server.deleted_at),
      };
  // facts are monotone: done > archived > (inbox | scheduled of the LWW winner)
  const localRank = STATUS_RANK[local.status] ?? 0;
  const serverRank = STATUS_RANK[server.status] ?? 0;
  let status: string;
  if (localRank === 2 || serverRank === 2) status = 'done';
  else if (localRank === 1 || serverRank === 1) status = 'archived';
  else status = localWins ? local.status : server.status;
  const doneCandidates = [local.done_at, ms(server.done_at)].filter((v): v is number => v !== null);
  const done_at =
    status === 'done' && doneCandidates.length > 0 ? Math.min(...doneCandidates) : null;
  return {
    id: local.id,
    user_id: local.user_id,
    ...user,
    status,
    done_at,
    postpone_count: Math.max(local.postpone_count, server.postpone_count),
    version: server.version + 1,
    created_at: Math.min(local.created_at, ms(server.created_at) ?? local.created_at),
    updated_at: Math.max(local.updated_at, ms(server.updated_at) ?? 0),
  };
}

export interface ProfilePayload {
  user_id: string;
  timezone: string;
  locale: string;
  working_hours: unknown;
  sleep_window: unknown;
  rmeq_score: number | null;
  chronotype_class: string | null;
  survey_skipped: boolean;
  top_categories: string[];
  onboarding_completed_at: string | null;
  /** P10 (ADR-0014 §5): notification prefs; absent on payloads from older builds. */
  settings?: unknown;
  version?: number;
  updated_at?: number;
}

export interface ServerProfile extends Omit<ProfilePayload, 'updated_at' | 'version'> {
  version: number;
  updated_at: string;
  server_seq?: number | null;
}

/** Row-level LWW by edit time; the merged payload carries `version = server.version + 1`. */
export function mergeProfile(local: ProfilePayload, server: ServerProfile): ProfilePayload {
  const localAt = local.updated_at ?? 0;
  const serverAt = ms(server.updated_at) ?? 0;
  const winner = localAt >= serverAt ? local : server;
  return {
    user_id: local.user_id,
    timezone: winner.timezone,
    locale: winner.locale,
    working_hours: winner.working_hours,
    sleep_window: winner.sleep_window,
    rmeq_score: winner.rmeq_score,
    chronotype_class: winner.chronotype_class,
    survey_skipped: winner.survey_skipped,
    top_categories: winner.top_categories ?? [],
    // onboarding completion is a fact: never un-complete
    onboarding_completed_at:
      local.onboarding_completed_at ?? server.onboarding_completed_at ?? null,
    // settings ride with the winner; a payload without them (older build) keeps the other side's
    // (P10 adversarial M1 — the merged op used to drop them and the RPC kept the stale blob)
    settings: winner.settings ?? (winner === local ? server.settings : local.settings) ?? null,
    version: server.version + 1,
    updated_at: Math.max(localAt, serverAt),
  };
}
