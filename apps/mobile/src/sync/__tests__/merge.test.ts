/**
 * File 05 §2 field-level merge (ADR-0012 §4) as a rule table: user-owned fields follow the
 * newest edit; facts never regress; the merged payload targets the server's version.
 */
import { mergeProfile, mergeTask, type LocalTaskPayload, type ServerTask } from '../merge';

const T0 = Date.parse('2026-09-01T08:00:00Z');
const T1 = Date.parse('2026-09-01T09:00:00Z');
const T2 = Date.parse('2026-09-01T10:00:00Z');

function local(over: Partial<LocalTaskPayload> = {}): LocalTaskPayload {
  return {
    id: 't1',
    user_id: 'u1',
    title: 'local title',
    category: 'deep',
    est_minutes: 60,
    deadline: null,
    value: 2,
    splittable: false,
    earliest_start: null,
    recurrence: null,
    status: 'inbox',
    done_at: null,
    postpone_count: 0,
    deleted_at: null,
    version: 3,
    created_at: T0,
    updated_at: T2,
    ...over,
  };
}

function server(over: Partial<ServerTask> = {}): ServerTask {
  return {
    id: 't1',
    user_id: 'u1',
    title: 'server title',
    category: 'admin',
    est_minutes: 30,
    deadline: '2026-09-05T00:00:00.000Z',
    value: 3,
    splittable: true,
    earliest_start: null,
    recurrence: null,
    status: 'scheduled',
    done_at: null,
    postpone_count: 1,
    deleted_at: null,
    version: 5,
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T1).toISOString(),
    ...over,
  };
}

describe('mergeTask — user-owned fields LWW by edit time', () => {
  it('the newer local edit wins its fields; the merged row targets server.version + 1', () => {
    const m = mergeTask(
      local({ updated_at: T2 }),
      server({ updated_at: new Date(T1).toISOString() }),
    );
    expect(m.title).toBe('local title');
    expect(m.category).toBe('deep');
    expect(m.est_minutes).toBe(60);
    expect(m.deadline).toBeNull();
    expect(m.value).toBe(2);
    expect(m.splittable).toBe(false);
    expect(m.version).toBe(6);
    expect(m.updated_at).toBe(T2);
    expect(m.status).toBe('inbox');
  });

  it('the newer server edit wins its fields (another device edited later)', () => {
    const m = mergeTask(
      local({ updated_at: T1 }),
      server({ updated_at: new Date(T2).toISOString() }),
    );
    expect(m.title).toBe('server title');
    expect(m.category).toBe('admin');
    expect(m.est_minutes).toBe(30);
    expect(m.deadline).toBe(Date.parse('2026-09-05T00:00:00.000Z'));
    expect(m.splittable).toBe(true);
    expect(m.status).toBe('scheduled');
    expect(m.version).toBe(6);
  });

  it('a tie goes to the local edit (the user is looking at this device)', () => {
    const m = mergeTask(
      local({ updated_at: T1 }),
      server({ updated_at: new Date(T1).toISOString() }),
    );
    expect(m.title).toBe('local title');
  });
});

describe('mergeTask — facts never regress', () => {
  it('done beats any non-done status regardless of who is newer; done_at is the earliest', () => {
    const a = mergeTask(
      local({ status: 'done', done_at: T2, updated_at: T1 }),
      server({ status: 'scheduled', updated_at: new Date(T2).toISOString() }),
    );
    expect(a.status).toBe('done');
    expect(a.done_at).toBe(T2);
    const b = mergeTask(
      local({ status: 'inbox', updated_at: T2 }),
      server({ status: 'done', done_at: new Date(T1).toISOString() }),
    );
    expect(b.status).toBe('done');
    expect(b.done_at).toBe(T1);
    const both = mergeTask(
      local({ status: 'done', done_at: T2 }),
      server({ status: 'done', done_at: new Date(T1).toISOString() }),
    );
    expect(both.done_at).toBe(T1);
  });

  it('archived beats the plan-mirror statuses; postpone_count is the max', () => {
    const m = mergeTask(
      local({ status: 'archived', postpone_count: 1, updated_at: T1 }),
      server({ status: 'scheduled', postpone_count: 4, updated_at: new Date(T2).toISOString() }),
    );
    expect(m.status).toBe('archived');
    expect(m.postpone_count).toBe(4);
  });

  it('deleted_at is a user-owned field: a newer restore wins over an older delete and vice versa', () => {
    const restored = mergeTask(
      local({ deleted_at: null, updated_at: T2 }),
      server({ deleted_at: new Date(T1).toISOString(), updated_at: new Date(T1).toISOString() }),
    );
    expect(restored.deleted_at).toBeNull();
    const deleted = mergeTask(
      local({ deleted_at: T1, updated_at: T1 }),
      server({ deleted_at: null, updated_at: new Date(T2).toISOString() }),
    );
    expect(deleted.deleted_at).toBeNull();
    const keptDelete = mergeTask(
      local({ deleted_at: T2, updated_at: T2 }),
      server({ deleted_at: null, updated_at: new Date(T1).toISOString() }),
    );
    expect(keptDelete.deleted_at).toBe(T2);
  });

  it('created_at is the earliest of both sides', () => {
    const m = mergeTask(
      local({ created_at: T1 }),
      server({ created_at: new Date(T0).toISOString() }),
    );
    expect(m.created_at).toBe(T0);
  });
});

describe('mergeProfile — row-level LWW, onboarding completion never regresses', () => {
  const localProfile = {
    user_id: 'u1',
    timezone: 'Europe/Kyiv',
    locale: 'uk',
    working_hours: { mon: [540, 1080] },
    sleep_window: [1380, 420],
    rmeq_score: 18,
    chronotype_class: 'MM',
    survey_skipped: false,
    top_categories: ['deep'],
    onboarding_completed_at: null,
    version: 2,
    updated_at: T2,
  };
  const serverProfile = {
    user_id: 'u1',
    timezone: 'Europe/Berlin',
    locale: 'en',
    working_hours: { tue: [540, 1080] },
    sleep_window: [1380, 420],
    rmeq_score: 12,
    chronotype_class: 'INT',
    survey_skipped: true,
    top_categories: ['admin'],
    onboarding_completed_at: '2026-08-30T10:00:00.000Z',
    version: 4,
    updated_at: new Date(T1).toISOString(),
  };

  it('local newer → local settings, server completion kept, version = server + 1', () => {
    const m = mergeProfile(localProfile, serverProfile);
    expect(m.timezone).toBe('Europe/Kyiv');
    expect(m.locale).toBe('uk');
    expect(m.top_categories).toEqual(['deep']);
    expect(m.onboarding_completed_at).toBe('2026-08-30T10:00:00.000Z');
    expect(m.version).toBe(5);
    expect(m.updated_at).toBe(T2);
  });

  it('server newer → server settings', () => {
    const m = mergeProfile({ ...localProfile, updated_at: T0 }, serverProfile);
    expect(m.timezone).toBe('Europe/Berlin');
    expect(m.rmeq_score).toBe(12);
    expect(m.version).toBe(5);
  });
});
