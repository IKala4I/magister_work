/**
 * Drift guard for the three hand-written copies of the sync vocabulary: the client outbox
 * (`apps/mobile/src/db/schema.ts` OP_TYPES), the wire types here, and the SQL `sync_replay()`
 * dispatch + `sync_pull()` table list in the P8 migration. No OpenAPI document exists for the
 * edge functions, so this test is the contract check (File 03 §6 spirit).
 */
import { assert, assertEquals } from '@std/assert';
import { OP_OUTCOMES, PULL_TABLES, SYNC_OP_TYPES } from './sync_types.ts';

const root = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, root));

function quoted(block: string): string[] {
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

Deno.test('client OP_TYPES == wire SYNC_OP_TYPES', async () => {
  const schema = await read('apps/mobile/src/db/schema.ts');
  const m = /export const OP_TYPES = \[([\s\S]*?)\] as const/.exec(schema);
  assert(m !== null, 'OP_TYPES not found in the client schema');
  assertEquals(quoted(m[1]), [...SYNC_OP_TYPES]);
});

Deno.test('sync_replay() dispatches exactly the wire op types; its outcomes are the wire outcomes', async () => {
  const sql = await read('supabase/migrations/20260828120000_p8_sync.sql');
  const dispatch = /r := case v_type([\s\S]*?)else jsonb_build_object/.exec(sql);
  assert(dispatch !== null, 'dispatch block not found');
  const whens = [...dispatch[1].matchAll(/when '([a-z_]+)' then/g)].map((m) => m[1]);
  assertEquals(whens.sort(), [...SYNC_OP_TYPES].sort());
  for (const outcome of ['applied', 'duplicate', 'conflict', 'superseded', 'rejected', 'error']) {
    assert(sql.includes(`'outcome', '${outcome}'`), `outcome ${outcome} produced by the RPC`);
    assert((OP_OUTCOMES as readonly string[]).includes(outcome));
  }
});

Deno.test('sync_pull() streams exactly the wire PULL_TABLES', async () => {
  const sql = await read('supabase/migrations/20260828120000_p8_sync.sql');
  const fn = /create or replace function public\.sync_pull([\s\S]*?)\$\$;/.exec(sql);
  assert(fn !== null, 'sync_pull not found');
  const tables = [
    ...fn[1].matchAll(/'([a-z_]+)'(?:::text)? as tbl|union all\s+select \S+, '([a-z_]+)'/g),
  ]
    .map((m) => m[1] ?? m[2]);
  assertEquals(tables.sort(), [...PULL_TABLES].sort());
});
