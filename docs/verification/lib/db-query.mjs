/**
 * The ONE parser for `supabase db query --linked --output-format json` (P10; owner directive
 * after it broke a second phase in a row). The CLI's output shape varies by version:
 *   • 2.107–2.114: an object — `{"rows": [...]}` (sometimes `{"result": ...}`), possibly with
 *     notices printed before it;
 *   • 2.115+: a pretty-printed top-level ARRAY `[ { ... } ]`, notices still possible before it;
 *   • errors: `{"message": "..."}` (also wraps text a DO block raises — pgtap-linked.sh).
 * Never slice from the first `{` (that chops a leading `[` and leaves the trailing `]` — the
 * P9/P10 bug). Instead: find the first `[` or `{`, walk to its matching close (quote-aware),
 * parse that complete value, then normalise to a rows array.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Extract the first complete JSON value (object or array) from noisy CLI output. */
export function extractJson(raw) {
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON in output: ${raw.slice(0, 200)}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth += 1;
    else if (c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
  }
  throw new Error(`unterminated JSON in output: ${raw.slice(start, start + 200)}`);
}

/** Normalise every known CLI shape to an array of row objects. */
export function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === 'object') {
    if (Array.isArray(value.rows)) return value.rows;
    if (Array.isArray(value.result)) return value.result;
    if (typeof value.message === 'string') throw new Error(`db query error: ${value.message}`);
    return [value];
  }
  throw new Error(`unexpected db query output: ${JSON.stringify(value).slice(0, 200)}`);
}

/**
 * Service-side read through the CLI (postgres role), from `repoRoot`. Returns the rows.
 * A parse failure THROWS with the raw output attached — never a silent `[]` (the P9 smoke-gate
 * lesson: a helper that returns empty on error makes its checks fail with the wrong reason).
 */
export function dbQuery(repoRoot, sql, { prefix = 'db-query' } = {}) {
  const file = join(tmpdir(), `${prefix}-${globalThis.crypto.randomUUID()}.sql`);
  writeFileSync(file, sql);
  const out = execFileSync(
    'supabase',
    ['db', 'query', '--linked', '--output-format', 'json', '-f', file],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return rowsOf(extractJson(out));
}
