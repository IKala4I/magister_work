import { assert, assertEquals } from '@std/assert';
import { callService, wakeService } from './service.ts';
import type { ServicePlanRequest } from '../_shared/types.ts';

const BODY: ServicePlanRequest = {
  user_id: '00000000-0000-4000-8000-000000000001',
  plan_date: '2026-08-26',
  horizon: 'day',
  timezone: 'Europe/Kyiv',
  working_hours: { wed: [540, 1080] },
  sleep_window: [1380, 420],
  busy: [],
  tasks: [],
  previous_assignments: [],
  settings: { epsilon: 1, top_m: 4, policy: 'ts' },
  arm: null,
  now: null,
};

const OK = {
  engine: 'learned',
  model_version: 'recsys-p5.0',
  solver_status: 'OPTIMAL',
  assignments: [],
  unplaced: [],
  infeasible: null,
  telemetry: {
    solve_ms: 1,
    literals: 0,
    degradation: null,
    rng_seed: 1,
    policy: 'ts',
    experiment_drawn: false,
    experiment_dropped: false,
    n_ticks: 96,
    tick_minutes: 15,
    objective: 0,
    hints: 0,
    run_length_penalty: 0,
    fragmentation_penalty: 0,
    solves: 1,
    build_ms: 0,
    total_ms: 1,
  },
};

async function withServer(
  handler: (req: Request) => Response | Promise<Response>,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const ac = new AbortController();
  const server = Deno.serve({
    port: 0,
    hostname: '127.0.0.1',
    signal: ac.signal,
    onListen: () => {},
  }, handler);
  try {
    await run(`http://127.0.0.1:${server.addr.port}`);
  } finally {
    ac.abort();
    await server.finished;
  }
}

Deno.test('ok: 200 + valid body ⇒ ok with the parsed response and the service key header', async () => {
  let seenKey: string | null = null;
  await withServer((req) => {
    seenKey = req.headers.get('x-service-key');
    return Response.json(OK);
  }, async (url) => {
    const r = await callService({ url: `${url}/`, serviceKey: 'k' }, BODY, 1900);
    assertEquals(r.kind, 'ok');
    if (r.kind === 'ok') assertEquals(r.response.model_version, 'recsys-p5.0');
    assertEquals(seenKey, 'k');
  });
});

Deno.test('timeout: a cold service that answers after the budget ⇒ timeout (NFR-R2)', async () => {
  await withServer(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return Response.json(OK);
  }, async (url) => {
    const r = await callService({ url, serviceKey: 'k' }, BODY, 60);
    assertEquals(r.kind, 'timeout');
    assert(r.ms < 400);
  });
});

Deno.test('http: 503/422 ⇒ http with status; invalid JSON / wrong shape ⇒ invalid_response', async () => {
  await withServer(() => new Response('down', { status: 503 }), async (url) => {
    const r = await callService({ url, serviceKey: 'k' }, BODY, 1900);
    assertEquals(r.kind, 'http');
    assertEquals(r.status, 503);
  });
  await withServer(
    () => new Response('{not json', { headers: { 'content-type': 'application/json' } }),
    async (url) => {
      assertEquals(
        (await callService({ url, serviceKey: 'k' }, BODY, 1900)).kind,
        'invalid_response',
      );
    },
  );
  await withServer(() => Response.json({ engine: 'heuristic', assignments: [] }), async (url) => {
    assertEquals(
      (await callService({ url, serviceKey: 'k' }, BODY, 1900)).kind,
      'invalid_response',
    );
  });
});

Deno.test('network: nothing listening ⇒ network; not configured ⇒ not_configured without a call', async () => {
  const r = await callService({ url: 'http://127.0.0.1:9', serviceKey: 'k' }, BODY, 1900);
  assertEquals(r.kind, 'network');
  let called = false;
  const r2 = await callService({ url: null, serviceKey: null }, BODY, 1900, () => {
    called = true;
    return Promise.resolve(new Response());
  });
  assertEquals(r2.kind, 'not_configured');
  assertEquals(called, false);
});

Deno.test('wakeService probes /healthz and never throws', async () => {
  let path: string | null = null;
  await withServer((req) => {
    path = new URL(req.url).pathname;
    return Response.json({ status: 'ok' });
  }, async (url) => {
    await wakeService({ url, serviceKey: null });
    assertEquals(path, '/healthz');
  });
  await wakeService({ url: 'http://127.0.0.1:9', serviceKey: null });
  await wakeService({ url: null, serviceKey: null });
});
