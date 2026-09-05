/**
 * Notification responses (ADR-0014 §3–§4): every tap/action is ONE fact + a route; the ritual's
 * accept plans tomorrow; the same response never counts twice (cold-start dedup).
 */
const mockTrack = jest.fn();
jest.mock('../../observability/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('../../db/client', () => ({ db: {} }));
jest.mock('../../sync/engine', () => ({ scheduleSync: jest.fn() }));
jest.mock('../../sync/usePlanTrigger', () => ({ runPlanRequest: jest.fn() }));

import type { NotificationResponse } from 'expo-notifications';

import {
  actionOf,
  DEFAULT_ACTION_IDENTIFIER,
  handleNotificationResponse,
  type ResponseDeps,
  routeFor,
} from '../respond';

const NOW = new Date(2026, 8, 7, 20, 3);

function response(
  data: Record<string, unknown> | null,
  actionIdentifier = DEFAULT_ACTION_IDENTIFIER,
  identifier = 'ritual:2026-09-07',
): NotificationResponse {
  return {
    actionIdentifier,
    notification: {
      date: 1_700_000_000_000,
      request: {
        identifier,
        content: { data, title: null, body: null, sound: null, subtitle: null },
        trigger: null,
      },
    },
  } as unknown as NotificationResponse;
}

function deps(handled = new Set<string>()) {
  const facts: unknown[] = [];
  const routes: string[] = [];
  const planned: string[] = [];
  const dismissed: string[] = [];
  const d: ResponseDeps = {
    now: () => NOW,
    userId: () => 'u1',
    appendFact: (input) => {
      facts.push(input);
      return 'op-1';
    },
    sync: jest.fn(),
    planTomorrow: (_now, planDate) => void planned.push(planDate),
    navigate: (route) => void routes.push(route),
    alreadyHandled: (key) => handled.has(key),
    markHandled: (key) => void handled.add(key),
    dismiss: (identifier) => void dismissed.push(identifier),
  };
  return { d, facts, routes, planned, dismissed };
}

beforeEach(() => mockTrack.mockClear());

describe('handleNotificationResponse', () => {
  it('block reminder tap → notification_response fact with latency, Today', () => {
    const h = deps();
    const r = handleNotificationResponse(
      response(
        {
          kind: 'block_reminder',
          recommendation_id: 'r1',
          task_id: 't1',
          scheduled_for: NOW.getTime() - 120_000,
        },
        DEFAULT_ACTION_IDENTIFIER,
        'block:r1',
      ),
      h.d,
    );
    expect(r).toEqual({ handled: true, action: 'open', route: '/(tabs)' });
    expect(h.facts).toEqual([
      {
        userId: 'u1',
        recommendationId: 'r1',
        taskId: 't1',
        payload: {
          kind: 'block_reminder',
          action: 'open',
          variant: null,
          scheduled_for: new Date(NOW.getTime() - 120_000).toISOString(),
          latency_ms: 120_000,
        },
        now: NOW,
      },
    ]);
    expect(h.d.sync).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith('notification_opened', {
      kind: 'block_reminder',
      action: 'open',
      variant: null,
    });
    expect(h.planned).toEqual([]);
  });

  it('ritual accept → plans tomorrow (FR-26 one tap) and opens Today; adjust → Inbox; Sunday tap → Insights', () => {
    const accept = deps();
    handleNotificationResponse(
      response(
        { kind: 'evening_ritual', scheduled_for: NOW.getTime(), variant: 'daily' },
        'accept',
      ),
      accept.d,
    );
    expect(accept.planned).toEqual(['2026-09-08']);
    expect(accept.routes).toEqual(['/(tabs)']);
    // tapped after midnight: the ritual's own plan day decides → still the 8th, not the 9th
    const late = deps();
    late.d.now = () => new Date(2026, 8, 8, 0, 30);
    handleNotificationResponse(
      response(
        {
          kind: 'evening_ritual',
          scheduled_for: new Date(2026, 8, 7, 22, 0).getTime(),
          variant: 'daily',
        },
        'accept',
      ),
      late.d,
    );
    expect(late.planned).toEqual(['2026-09-08']);
    const adjust = deps();
    handleNotificationResponse(
      response(
        { kind: 'evening_ritual', scheduled_for: NOW.getTime(), variant: 'daily' },
        'adjust',
      ),
      adjust.d,
    );
    expect(adjust.planned).toEqual([]);
    expect(adjust.routes).toEqual(['/(tabs)/inbox']);
    const sunday = deps();
    handleNotificationResponse(
      response({ kind: 'evening_ritual', scheduled_for: NOW.getTime(), variant: 'sunday' }),
      sunday.d,
    );
    expect(sunday.routes).toEqual(['/(tabs)/insights']);
    expect((sunday.facts[0] as { payload: { variant: string } }).payload.variant).toBe('sunday');
  });

  it('the same response is handled once (last-response hook + listener both deliver it)', () => {
    const handled = new Set<string>();
    const a = deps(handled);
    const first = handleNotificationResponse(
      response({ kind: 'evening_ritual', scheduled_for: 1 }),
      a.d,
    );
    const b = deps(handled);
    const second = handleNotificationResponse(
      response({ kind: 'evening_ritual', scheduled_for: 1 }),
      b.d,
    );
    expect(first.handled).toBe(true);
    expect(second).toEqual({ handled: false });
    expect(b.facts).toEqual([]);
  });

  it('a handled response dismisses its notification exactly once — action buttons never auto-cancel (build 4, 2026-09-04)', () => {
    const handled = new Set<string>();
    const { d, dismissed, facts } = deps(handled);
    const r = response(
      { kind: 'evening_ritual', scheduled_for: NOW.getTime() - 60_000, variant: 'daily' },
      'accept',
      'ritual:2026-09-07',
    );
    handleNotificationResponse(r, d);
    handleNotificationResponse(r, d); // the second delivery of the same response
    expect(facts).toHaveLength(1);
    expect(dismissed).toEqual(['ritual:2026-09-07']);
  });

  it('a different action on the same notification is a new response, not a duplicate (build 4, 2026-09-04)', () => {
    const handled = new Set<string>();
    const { d, facts, routes } = deps(handled);
    const data = {
      kind: 'evening_ritual',
      scheduled_for: NOW.getTime() - 60_000,
      variant: 'daily',
    };
    expect(handleNotificationResponse(response(data, 'accept'), d).handled).toBe(true);
    expect(handleNotificationResponse(response(data, 'adjust'), d)).toMatchObject({
      handled: true,
      action: 'adjust',
      route: '/(tabs)/inbox',
    });
    expect(facts).toHaveLength(2);
    expect(routes).toEqual(['/(tabs)', '/(tabs)/inbox']);
  });

  it('garbage data is ignored without a fact', () => {
    const h = deps();
    expect(handleNotificationResponse(response(null), h.d)).toEqual({ handled: false });
    expect(handleNotificationResponse(response({ kind: 'weird' }), h.d)).toEqual({
      handled: false,
    });
    expect(h.facts).toEqual([]);
  });

  it('actionOf / routeFor are total', () => {
    expect(actionOf('accept')).toBe('accept');
    expect(actionOf('adjust')).toBe('adjust');
    expect(actionOf(DEFAULT_ACTION_IDENTIFIER)).toBe('open');
    expect(actionOf('something')).toBe('open');
    expect(routeFor({ kind: 'block_reminder', scheduled_for: 0 }, 'accept')).toBe('/(tabs)');
    expect(
      routeFor({ kind: 'evening_ritual', scheduled_for: 0, variant: 'sunday' }, 'accept'),
    ).toBe('/(tabs)');
  });
});
