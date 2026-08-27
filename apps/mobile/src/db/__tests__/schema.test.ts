/**
 * Local schema mirrors specs/07 §4 (+ M-01/M-02) column-for-column for the mirrored
 * tables, and the invariants are visible in the shape: no reward/model-state columns
 * anywhere (invariant 1), events carry a unique op_id (invariant 8), and the
 * client-writable status subset matches spec-conflicts L11.
 */
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

import {
  tasks,
  plans,
  recommendations,
  events,
  opOutbox,
  TASK_CATEGORIES,
  TASK_STATUSES,
  RECOMMENDATION_STATUSES,
  CLIENT_WRITABLE_RECOMMENDATION_STATUSES,
} from '../schema';

function columnNames(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.values(getTableColumns(table))
    .map((c) => c.name)
    .sort();
}

describe('plans mirror (specs/07 §4.1, P6)', () => {
  it('carries the server row column-for-column', () => {
    expect(columnNames(plans)).toEqual(
      [
        'id',
        'user_id',
        'plan_date',
        'horizon',
        'engine',
        'model_version',
        'arm',
        'solver_status',
        'telemetry',
        'generated_at',
        'server_seq',
      ].sort(),
    );
    expect(plans.engine.enumValues).toEqual(['learned', 'heuristic']);
  });
});

describe('tasks mirror (specs/07 §4.1)', () => {
  it('carries every FR-10 field the server has', () => {
    expect(columnNames(tasks)).toEqual(
      [
        'id',
        'user_id',
        'title',
        'category',
        'est_minutes',
        'deadline',
        'value',
        'splittable',
        'earliest_start',
        'recurrence',
        'status',
        'done_at',
        'postpone_count',
        'skip_streak', // LOCAL-ONLY (P7 UC-04 A2 streak) — excluded from the op payload by tasks.ts
        'deleted_at',
        'version',
        'created_at',
        'updated_at',
        'server_seq',
      ].sort(),
    );
  });

  it('pins the spec value sets', () => {
    expect(tasks.category.enumValues).toEqual([...TASK_CATEGORIES]);
    expect(tasks.status.enumValues).toEqual([...TASK_STATUSES]);
    expect(TASK_CATEGORIES).toEqual(['deep', 'admin', 'physical', 'learning']);
    expect(TASK_STATUSES).toEqual(['inbox', 'scheduled', 'done', 'archived']);
  });
});

describe('recommendations mirror (specs/07 §4.1 + M-01 + M-02)', () => {
  it('includes propensity (M-01) and conflict_flag (M-02)', () => {
    const names = columnNames(recommendations);
    expect(names).toContain('propensity');
    expect(names).toContain('conflict_flag');
  });

  it('mirrors the server columns', () => {
    expect(columnNames(recommendations)).toEqual(
      [
        'id',
        'user_id',
        'plan_id',
        'task_id',
        'chunk_index',
        'slot_start',
        'slot_end',
        'context_bucket',
        'features',
        'q_hat',
        'confidence',
        'rationale_key',
        'rationale_params',
        'is_experiment',
        'engine',
        'model_version',
        'status',
        'attributed_at',
        'propensity',
        'conflict_flag',
        'version',
        'created_at',
        'updated_at',
        'server_seq',
      ].sort(),
    );
  });

  it('status set = base statuses + M-02 displacement values', () => {
    expect(recommendations.status.enumValues).toEqual([...RECOMMENDATION_STATUSES]);
    expect(RECOMMENDATION_STATUSES).toEqual([
      'shown',
      'accepted',
      'pinned',
      'moved',
      'rejected',
      'completed',
      'lapsed',
      'expired',
      'displaced_pending',
      'displaced',
    ]);
  });

  it('client-writable statuses are exactly the plan-review set (spec-conflicts L11)', () => {
    expect(CLIENT_WRITABLE_RECOMMENDATION_STATUSES).toEqual([
      'accepted',
      'pinned',
      'moved',
      'rejected',
    ]);
    for (const s of CLIENT_WRITABLE_RECOMMENDATION_STATUSES) {
      expect(RECOMMENDATION_STATUSES).toContain(s);
    }
  });
});

describe('events log (invariant 8: append-only, idempotent replay)', () => {
  it('mirrors the server payload columns and adds local bookkeeping', () => {
    expect(columnNames(events)).toEqual(
      [
        'local_id',
        'op_id',
        'user_id',
        'type',
        'task_id',
        'recommendation_id',
        'payload',
        'context',
        'client_ts',
        'server_ts',
        'local_day',
        'server_seq',
      ].sort(),
    );
  });

  it('op_id is unique — duplicate replay cannot double-insert locally either', () => {
    const { indexes } = getTableConfig(events);
    const unique = indexes.find((i) => i.config.name === 'events_op_id_unique');
    expect(unique?.config.unique).toBe(true);
  });
});

describe('op outbox (invariant 8)', () => {
  it('has send-ordering, idempotency, base_version, and lifecycle columns', () => {
    expect(columnNames(opOutbox)).toEqual(
      [
        'seq',
        'op_id',
        'op_type',
        'entity_id',
        'payload',
        'base_version',
        'created_at',
        'sent_at',
        'acked_at',
        'attempts',
        'last_error',
      ].sort(),
    );
  });

  it('op_id is unique', () => {
    const { indexes } = getTableConfig(opOutbox);
    const unique = indexes.find((i) => i.config.name === 'op_outbox_op_id_unique');
    expect(unique?.config.unique).toBe(true);
  });
});

describe('mirror nullability (names are exact; nullability is deliberately relaxed)', () => {
  // The server always supplies values on pull; locally-born rows may not have them yet.
  // This test pins the EXACT relaxation set so accidental drift is visible (finding 9).
  const SERVER_NOT_NULL_RELAXED_LOCALLY: Record<string, string[]> = {
    recommendations: ['features', 'rationale_key', 'rationale_params', 'engine', 'model_version'],
    events: ['payload', 'context', 'server_ts'],
    tasks: [],
  };

  it.each([
    ['tasks', tasks],
    ['recommendations', recommendations],
    ['events', events],
  ] as const)('%s: core identity/fact columns stay NOT NULL', (name, table) => {
    const columns = getTableColumns(table);
    const relaxed = new Set(SERVER_NOT_NULL_RELAXED_LOCALLY[name]);
    for (const column of Object.values(columns)) {
      if (relaxed.has(column.name)) {
        expect(column.notNull).toBe(false);
      }
    }
    // Anchor columns that must never relax:
    expect(columns['userId']?.notNull).toBe(true);
  });

  it('tasks keeps every FR-10 required field NOT NULL', () => {
    const c = getTableColumns(tasks);
    for (const key of ['id', 'title', 'category', 'estMinutes', 'value', 'status'] as const) {
      expect(c[key]?.notNull).toBe(true);
    }
  });

  it('events keeps the fact identity NOT NULL (op_id, type, client_ts, local_day)', () => {
    const c = getTableColumns(events);
    for (const key of ['opId', 'type', 'clientTs', 'localDay'] as const) {
      expect(c[key]?.notNull).toBe(true);
    }
  });
});

describe('invariant 1: the client never holds rewards or model state', () => {
  it('no table carries reward/model columns', () => {
    for (const table of [tasks, recommendations, events, opOutbox]) {
      for (const name of columnNames(table)) {
        expect(name).not.toMatch(/reward|a_matrix|b_vector|alpha|beta|theta/);
      }
    }
  });
});
