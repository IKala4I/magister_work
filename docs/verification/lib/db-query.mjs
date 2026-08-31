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
 * Unwrap the CLI's NESTED error shapes to the server's own message (P11: a raised exception
 * arrives as `{"_tag":"Error","error":{"message":"unexpected status 400: {\"message\":
 * \"Failed to run sql query: ERROR: P0001: ...\"}"}}` — the text sits two JSON layers deep).
 * Same rule as extractJson: never parse one shape ad hoc; descend through error/message and
 * embedded JSON until only text remains.
 */
export function unwrapErrorText(value, depth = 6) {
  let v = value;
  for (let i = 0; i < depth; i += 1) {
    if (v !== null && typeof v === 'object') {
      if (v.error !== undefined) v = v.error;
      else if (typeof v.message === 'string') v = v.message;
      else return JSON.stringify(v);
      continue;
    }
    if (typeof v === 'string') {
      let inner;
      try {
        inner = extractJson(v);
      } catch {
        return v;
      }
      v = inner;
      continue;
    }
    return String(v);
  }
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/**
 * Service-side read through the CLI (postgres role), from `repoRoot`. Returns the rows.
 * A parse failure THROWS with the raw output attached — never a silent `[]` (the P9 smoke-gate
 * lesson: a helper that returns empty on error makes its checks fail with the wrong reason).
 * A SERVER error (raised exception → CLI exits nonzero with the error JSON on stdout) throws
 * with the UNWRAPPED server message, so callers can match on e.g. /already enrolled/ — before
 * P11's fix the exec failure hid it behind a bare "Command failed: supabase db query ..."
 * (stderr was discarded and stdout never parsed), which failed two live-smoke raise-checks
 * for the wrong reason.
 */
export function dbQuery(repoRoot, sql, { prefix = 'db-query' } = {}) {
  const file = join(tmpdir(), `${prefix}-${globalThis.crypto.randomUUID()}.sql`);
  writeFileSync(file, sql);
  let out;
  try {
    out = execFileSync(
      'supabase',
      ['db', 'query', '--linked', '--output-format', 'json', '-f', file],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (err) {
    const raw = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim();
    let text;
    try {
      text = unwrapErrorText(extractJson(raw));
    } catch {
      text = raw || String(err.message ?? err);
    }
    throw new Error(`db query error: ${text}`, { cause: err });
  }
  return rowsOf(extractJson(out));
}
