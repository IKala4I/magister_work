/** `insights` with injected deps: auth, profile gate, the merged document, service outage. */
import { assertEquals } from '@std/assert';
import { type Deps, handleInsights, type ServiceCall } from './handler.ts';

const USER = '00000000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-09-05T10:00:00Z');

function deps(over: Partial<Deps> = {}, service?: ServiceCall): Deps {
  return {
    now: () => NOW,
    verifyUser: (t) => Promise.resolve(t === 'good' ? USER : null),
    loadProfile: () =>
      Promise.resolve({ timezone: 'Europe/Kyiv', chronotype_class: 'MM', survey_skipped: false }),
    fetchInsights: () =>
      Promise.resolve(
        service ?? {
          kind: 'ok',
          ms: 12,
          body: {
            heatmap: [{ category: 'deep', daypart: 'MO', day_type: 'weekday', mean: 0.7 }],
            affinities: [],
            adherence: [],
            beliefs: [{ state_ref: 'beta:deep.MO.weekday', label: 'correct' }],
            learning_mode: true,
            labels: [],
          },
        },
      ),
    loadBlocks: () =>
      Promise.resolve([
        {
          id: 'r1',
          slot_start: '2026-09-02T11:00:00Z',
          slot_end: '2026-09-02T12:30:00Z',
          status: 'completed',
        },
        {
          id: 'r2',
          slot_start: '2026-09-03T11:00:00Z',
          slot_end: '2026-09-03T12:00:00Z',
          status: 'lapsed',
        },
        {
          id: 'r3',
          slot_start: '2026-09-03T13:00:00Z',
          slot_end: '2026-09-03T14:00:00Z',
          status: 'displaced',
        },
      ]),
    loadFocusFacts: () =>
      Promise.resolve([
        {
          type: 'focus_end',
          recommendation_id: 'r1',
          payload: { outcome: 'finished', started_at: '2026-09-02T11:03:00Z' },
        },
      ]),
    ...over,
  };
}

const post = (headers: Record<string, string> = {}) =>
  new Request('http://local/insights', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ action: 'get' }),
  });

Deno.test('auth: no token / bad token → 401; GET → 405; no completed profile → 404', async () => {
  assertEquals((await handleInsights(post(), deps())).status, 401);
  assertEquals((await handleInsights(post({ authorization: 'Bearer nope' }), deps())).status, 401);
  assertEquals(
    (await handleInsights(new Request('http://local/insights', { method: 'GET' }), deps())).status,
    405,
  );
  assertEquals(
    (await handleInsights(
      post({ authorization: 'Bearer good' }),
      deps({ loadProfile: () => Promise.resolve(null) }),
    )).status,
    404,
  );
});

Deno.test('the document merges the service insights with weekly PAR and the prior provenance', async () => {
  const res = await handleInsights(post({ authorization: 'Bearer good' }), deps());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.heatmap.length, 1);
  assertEquals(body.beliefs[0].label, 'correct');
  assertEquals(body.learning_mode, true);
  assertEquals(body.adherence, [{ week: '2026-W36', par: 0.5, n: 2 }]); // displaced r3 excluded
  assertEquals(body.chronotype_class, 'MM');
  assertEquals(body.survey_skipped, false);
  assertEquals(body.generated_at, new Date(NOW).toISOString());
  assertEquals(body.service_ms, 12);
});

Deno.test('service down or not configured → 503 (the client keeps its cached document)', async () => {
  const down = await handleInsights(
    post({ authorization: 'Bearer good' }),
    deps({}, { kind: 'failed', status: 502, detail: 'bad gateway', ms: 40 }),
  );
  assertEquals(down.status, 503);
  assertEquals((await down.json()).error, 'service_unavailable');
  const unset = await handleInsights(
    post({ authorization: 'Bearer good' }),
    deps({}, { kind: 'not_configured' }),
  );
  assertEquals((await unset.json()).error, 'service_not_configured');
});
