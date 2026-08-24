#!/usr/bin/env bash
# Normalize `supabase gen types typescript` output so --linked and --local generations
# compare byte-equal: strip the environment-dependent __InternalSupabase header block and
# collapse trailing blank lines. Used on both sides of the CI contract-sync diff.
set -euo pipefail
python3 - "$1" << 'EOF'
import re
import sys

path = sys.argv[1]
with open(path) as fh:
    s = fh.read()
s = re.sub(
    r"  // Allows to automatically instantiate.*?__InternalSupabase: \{.*?\n  \}\n",
    "",
    s,
    flags=re.S,
)
s = s.rstrip("\n") + "\n"
with open(path, "w") as fh:
    fh.write(s)
EOF
