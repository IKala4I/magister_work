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
  echo "grant insert on __tap to public; grant usage on sequence __tap_n_seq to public;"
  # drop the file's own begin/rollback; route every assertion + plan/finish into __tap
  sed -E \
    -e '/^begin;[[:space:]]*$/d' \
    -e '/^rollback;[[:space:]]*$/d' \
    -e 's/^select (plan|is|isnt|ok|has_[a-z_]+|hasnt_[a-z_]+|matches|throws_ok|lives_ok|results_eq|col_[a-z_]+|is_empty|isa_ok|cmp_ok|bag_eq|set_eq|diag|[a-z_]+_are)\(/insert into __tap (line) select \1(/' \
    -e 's/^select \* from finish\(\);/insert into __tap (line) select * from finish();/' \
    "$test_file"
  echo "reset role;"
  echo "do \$tap\$ declare t text; begin select string_agg(line, E'\\n' order by n) into t from __tap; raise exception E'TAP\\n%', t; end \$tap\$;"
} > "$scratch"
out="$(supabase db query --linked --output-format json -f "$scratch" 2>/dev/null || true)"
printf '%s' "$out" > "${PGTAP_DEBUG_OUT:-/dev/null}"  # raw CLI output, for parser forensics
# the TAP text arrives inside the error message; print it and exit non-zero on any "not ok"
tap="$(printf '%s' "$out" | python3 -c '
import json, sys
raw = sys.stdin.read()
# The CLI wraps the raised TAP text in changing, sometimes NESTED shapes (P9: {rows};
# P10: {"message": "TAP..."}; P11: {"_tag": "Error", "error": {"message": "unexpected
# status 400: {\"message\": \"...TAP\\n...\"}"}}). Same rule as
# docs/verification/lib/db-query.mjs: extract the first complete JSON value quote-aware,
# unwrap recursively, then cut at the TAP marker — never parse one shape ad hoc.
def first_json(s):
    start = s.find("{")
    if start < 0:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(s)):
        c = s[i]
        if in_str:
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == chr(34): in_str = False
        elif c == chr(34): in_str = True
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(s[start:i+1])
                except Exception:
                    return None
    return None
def unwrap(d, depth=6):
    for _ in range(depth):
        if isinstance(d, dict):
            e = d.get("error")
            if isinstance(e, dict) and isinstance(e.get("message"), str):
                d = e["message"]; continue
            if isinstance(d.get("message"), str):
                d = d["message"]; continue
            if "rows" in d:
                return json.dumps(d["rows"])
            return json.dumps(d)
        if isinstance(d, str):
            j = first_json(d)
            if j is None:
                return d
            d = j; continue
        return str(d)
    return d if isinstance(d, str) else str(d)
try:
    d = json.loads(raw)
except Exception:
    d = first_json(raw)
if d is None:
    print(raw); sys.exit(2)
msg = unwrap(d)
i = msg.find("TAP\n")
if i >= 0:
    msg = msg[i:]
print(msg or raw)
')"
printf '%s\n' "$tap" | sed -n '/^TAP$/,$p' | sed '1d'
if printf '%s' "$tap" | grep -q '^TAP$'; then
  if printf '%s' "$tap" | grep -qE '^not ok|^# Looks like you failed|^# Looks like you planned'; then exit 1; fi
  plan_n="$(printf '%s\n' "$tap" | sed -n 's/^1\.\.\([0-9][0-9]*\)$/\1/p' | head -1)"
  got_n="$(printf '%s\n' "$tap" | grep -cE '^(not )?ok [0-9]' || true)"
  if [ -n "$plan_n" ] && [ "$got_n" -ne "$plan_n" ]; then
    echo "MISMATCH: plan says $plan_n but only $got_n assertion lines were captured — a pgTAP function used by the test is missing from the rewrite allowlist" >&2
    exit 2
  fi
  exit 0
fi
echo "--- no TAP block in the response (SQL error?) ---" >&2
printf '%s\n' "$tap" >&2
exit 2
