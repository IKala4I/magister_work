/**
 * `export-data` — FR-42 / UC-10 data portability (ADR-0014 §7). One user-JWT call returns a
 * JSON document with everything Hourwell holds about the user: profile, tasks, calendar mirror
 * (without event titles — specs/07 §4.1 "display only; never exported"), plans, placements,
 * the behavioural log, reward tuples, belief labels, the learned parameters (Beta cells with
 * their priors, bandit state, blend weights, duration estimates, cluster assignment) and study
 * assignments. Rows are read under the USER's client so RLS is the filter — no service role in
 * this path. Server-only ledgers (`sync_ops`, `sync_leases`, `gcal_sync_state`,
 * `recsys_applied_tuples`) are bookkeeping about the user's rows, not the user's data, and stay
 * out; their absence is pinned by the contract test together with pgTAP's table list.
 */

export interface ExportTable {
  table: string;
  /** Stable paging order (the primary key or a unique tuple). */
  order: readonly string[];
  /** Columns removed from every row before it leaves. */
  omit?: readonly string[];
  /** Where the rows land in the document. */
  group: 'root' | 'learned_parameters';
}

export const EXPORT_TABLES: readonly ExportTable[] = [
  { table: 'profiles', order: ['user_id'], group: 'root' },
  { table: 'tasks', order: ['id'], group: 'root' },
  { table: 'calendar_events', order: ['id'], omit: ['title'], group: 'root' },
  { table: 'plans', order: ['id'], group: 'root' },
  { table: 'recommendations', order: ['id'], group: 'root' },
  { table: 'events', order: ['id'], group: 'root' },
  { table: 'feedback_rewards', order: ['id'], group: 'root' },
  { table: 'belief_labels', order: ['id'], group: 'root' },
  { table: 'study_assignments', order: ['phase_no'], group: 'root' },
  { table: 'beta_cells', order: ['category', 'daypart', 'day_type'], group: 'learned_parameters' },
  { table: 'bandit_state', order: ['category'], group: 'learned_parameters' },
  { table: 'blend_state', order: ['user_id'], group: 'learned_parameters' },
  { table: 'duration_estimates', order: ['category'], group: 'learned_parameters' },
  { table: 'cluster_assignments', order: ['user_id'], group: 'learned_parameters' },
];

/** User-owned tables that are NOT the user's data (ledgers/tokens) — never exported. */
export const SERVER_ONLY_TABLES: readonly string[] = [
  'sync_ops',
  'sync_leases',
  'gcal_sync_state',
  'recsys_applied_tuples',
];

export const PAGE_SIZE = 1000;
/** A table past this many rows is cut and flagged — the document stays a document. */
export const MAX_ROWS_PER_TABLE = 200_000;
export const EXPORT_FORMAT = 'hourwell-export';
export const EXPORT_VERSION = 1;

export interface Deps {
  now(): number;
  verifyUser(token: string): Promise<string | null>;
  /** Rows [from, to] (inclusive, PostgREST range) of `table` for `userId`, in `order`. */
  readPage(
    table: string,
    userId: string,
    order: readonly string[],
    from: number,
    to: number,
  ): Promise<Record<string, unknown>[]>;
}

export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exported_at: string;
  user_id: string;
  profile: Record<string, unknown> | null;
  tasks: Record<string, unknown>[];
  calendar_events: Record<string, unknown>[];
  plans: Record<string, unknown>[];
  recommendations: Record<string, unknown>[];
  events: Record<string, unknown>[];
  feedback_rewards: Record<string, unknown>[];
  belief_labels: Record<string, unknown>[];
  study_assignments: Record<string, unknown>[];
  learned_parameters: {
    beta_cells: Record<string, unknown>[];
    bandit_state: Record<string, unknown>[];
    blend_state: Record<string, unknown> | null;
    duration_estimates: Record<string, unknown>[];
    cluster_assignment: Record<string, unknown> | null;
  };
  counts: Record<string, number>;
  /** Tables cut at MAX_ROWS_PER_TABLE. */
  truncated: string[];
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m === null ? null : m[1].trim();
}

function strip(row: Record<string, unknown>, omit: readonly string[] | undefined) {
  if (omit === undefined || omit.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!omit.includes(k)) out[k] = v;
  return out;
}

export async function readAll(
  deps: Deps,
  spec: ExportTable,
  userId: string,
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const page = await deps.readPage(spec.table, userId, spec.order, from, from + PAGE_SIZE - 1);
    for (const r of page) rows.push(strip(r, spec.omit));
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
    from += PAGE_SIZE;
    if (from >= MAX_ROWS_PER_TABLE) return { rows, truncated: true };
  }
}

export async function buildExport(deps: Deps, userId: string): Promise<ExportDocument> {
  const data: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  const truncated: string[] = [];
  for (const spec of EXPORT_TABLES) {
    const r = await readAll(deps, spec, userId);
    data[spec.table] = r.rows;
    counts[spec.table] = r.rows.length;
    if (r.truncated) truncated.push(spec.table);
  }
  const one = (t: string) => data[t]?.[0] ?? null;
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date(deps.now()).toISOString(),
    user_id: userId,
    profile: one('profiles'),
    tasks: data.tasks ?? [],
    calendar_events: data.calendar_events ?? [],
    plans: data.plans ?? [],
    recommendations: data.recommendations ?? [],
    events: data.events ?? [],
    feedback_rewards: data.feedback_rewards ?? [],
    belief_labels: data.belief_labels ?? [],
    study_assignments: data.study_assignments ?? [],
    learned_parameters: {
      beta_cells: data.beta_cells ?? [],
      bandit_state: data.bandit_state ?? [],
      blend_state: one('blend_state'),
      duration_estimates: data.duration_estimates ?? [],
      cluster_assignment: one('cluster_assignments'),
    },
    counts,
    truncated,
  };
}

export async function handleExportData(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'bad_request', detail: 'GET or POST' }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }
  const token = bearer(req);
  const userId = token === null ? null : await deps.verifyUser(token);
  if (userId === null) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }
  const doc = await buildExport(deps, userId);
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      'content-disposition': `attachment; filename="hourwell-export-${
        doc.exported_at.slice(0, 10)
      }.json"`,
    },
  });
}
