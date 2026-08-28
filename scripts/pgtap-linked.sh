#!/usr/bin/env bash
# Run one pgTAP test file — optionally after not-yet-pushed migrations — against the LINKED
# hosted project, inside a transaction that is ALWAYS rolled back. For dev machines without
# Docker (no `supabase test db`): the CI db job stays the gate; this is the fast loop.
#
#   scripts/pgtap-linked.sh supabase/tests/p8_sync_test.sql [supabase/migrations/2026…_p8_sync.sql …]
#
# How: `supabase db query` sends the script as ONE simple query → an implicit transaction; the
# assertions are rewritten to insert their TAP lines into a temp table; the last statement
# raises an exception carrying the TAP text, which aborts (rolls back) everything and returns
# the text as the error message. Nothing is committed, ever — even on success.
set -euo pipefail
test_file="$1"; shift
scratch="$(mktemp -t pgtap-linked.XXXXXX.sql)"
trap 'rm -f "$scratch"' EXIT
{
  echo "create extension if not exists pgtap with schema extensions;"
  for m in "$@"; do cat "$m"; echo; done
  echo "create temp table __tap (n serial, line text);"
  echo "grant insert on __tap to anon, authenticated; grant usage on sequence __tap_n_seq to anon, authenticated;"
  # drop the file's own begin/rollback; route every assertion + plan/finish into __tap
  sed -E \
    -e '/^begin;[[:space:]]*$/d' \
    -e '/^rollback;[[:space:]]*$/d' \
    -e 's/^select (plan|is|isnt|ok|has_[a-z_]+|hasnt_[a-z_]+|matches|throws_ok|lives_ok|results_eq|col_[a-z_]+|is_empty|isa_ok|cmp_ok|bag_eq|set_eq|diag)\(/insert into __tap (line) select \1(/' \
    -e 's/^select \* from finish\(\);/insert into __tap (line) select * from finish();/' \
    "$test_file"
  echo "reset role;"
  echo "do \$tap\$ declare t text; begin select string_agg(line, E'\\n' order by n) into t from __tap; raise exception E'TAP\\n%', t; end \$tap\$;"
} > "$scratch"
out="$(supabase db query --linked --output-format json -f "$scratch" 2>/dev/null || true)"
# the TAP text arrives inside the error message; print it and exit non-zero on any "not ok"
tap="$(printf '%s' "$out" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print(raw); sys.exit(2)
msg = ""
if isinstance(d, dict):
    e = d.get("error") or {}
    msg = e.get("message") if isinstance(e, dict) else str(e)
    if not msg and "rows" in d:
        msg = json.dumps(d["rows"])
print(msg or raw)
')"
printf '%s\n' "$tap" | sed -n '/^TAP$/,$p' | sed '1d'
if printf '%s' "$tap" | grep -q '^TAP$'; then
  if printf '%s' "$tap" | grep -qE '^not ok|^# Looks like you failed|^# Looks like you planned'; then exit 1; fi
  exit 0
fi
echo "--- no TAP block in the response (SQL error?) ---" >&2
printf '%s\n' "$tap" >&2
exit 2
