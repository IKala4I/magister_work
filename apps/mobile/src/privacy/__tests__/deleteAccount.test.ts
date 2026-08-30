const mockTrack = jest.fn();
jest.mock('../../observability/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('../../auth/client', () => ({ supabase: null }));
jest.mock('../../db/client', () => ({ db: {} }));
jest.mock('../../notifications/scheduler', () => ({
  clearAllNotifications: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../sync/gcal', () => ({ gcalStatus: jest.fn() }));
jest.mock('../../sync/engine', () => ({ scheduleSync: jest.fn() }));

import { deleteAccount, type DeleteDeps } from '../deleteAccount';

function deps(over: Partial<DeleteDeps> = {}) {
  const forgot: number[] = [];
  const d: DeleteDeps = {
    requestErasure: () =>
      Promise.resolve({
        kind: 'ok',
        data: { status: 'deleted', reference: 'audit-1', completed_at: '2026-09-05T10:00:00Z' },
      }),
    forgetLocal: () => {
      forgot.push(1);
      return Promise.resolve();
    },
    hadCalendar: true,
    ...over,
  };
  return { d, forgot };
}

beforeEach(() => mockTrack.mockClear());

describe('deleteAccount (FR-42 / UC-10, ADR-0014 §8)', () => {
  it('server confirmed → last analytics event, local state forgotten, reference returned', async () => {
    const h = deps();
    const r = await deleteAccount(h.d);
    expect(r).toEqual({ ok: true, reference: 'audit-1', completedAt: '2026-09-05T10:00:00Z' });
    expect(h.forgot).toEqual([1]);
    expect(mockTrack).toHaveBeenCalledWith('account_deleted', { had_calendar: true });
  });
  it('any failure leaves this install untouched (nothing forgotten, no event)', async () => {
    for (const [kind, code] of [
      ['no-session', 'no_session'],
      ['offline', 'offline'],
      ['failed', 'failed'],
      ['http', 'failed'],
    ] as const) {
      const h = deps({ requestErasure: () => Promise.resolve({ kind }) });
      expect(await deleteAccount(h.d)).toEqual({ ok: false, code });
      expect(h.forgot).toEqual([]);
    }
    expect(mockTrack).not.toHaveBeenCalled();
  });
});
