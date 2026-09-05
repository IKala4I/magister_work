#!/usr/bin/env bash
# Hardware-pass build gate (lesson from build 2, day 2 note 26: a worktree APK whose bundle carried
# no project URL passed every behavioural check vacuously). Run BEFORE `adb install`:
#   docs/verification/hw-build-gate.sh [path/to/app-release.apk]
# Prints: bundle host hits (must be ≥ 1), the declared permissions of interest, size, sha256.
# Never prints the host itself (.env is read-only context).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
apk="${1:-$root/apps/mobile/android/app/build/outputs/apk/release/app-release.apk}"
[ -f "$apk" ] || { echo "no APK at $apk" >&2; exit 2; }
host="$(grep -o '^EXPO_PUBLIC_SUPABASE_URL=.*' "$root/.env" | cut -d= -f2- | sed -E 's#^https?://##; s#/.*$##')"
[ -n "$host" ] || { echo "EXPO_PUBLIC_SUPABASE_URL not in .env" >&2; exit 2; }
hits="$(unzip -p "$apk" assets/index.android.bundle | grep -c -F "$host" || true)"
echo "bundle host hits: $hits"
[ "$hits" -ge 1 ] || { echo "GATE FAILED: the bundle does not carry the project host" >&2; exit 1; }
aapt2="$(ls -1 "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$aapt2" ]; then
  "$aapt2" dump permissions "$apk" | grep -E 'SCHEDULE_EXACT_ALARM|POST_NOTIFICATIONS|RECEIVE_BOOT_COMPLETED' | sed 's/^/  /' || true
else
  echo "(no aapt2 under the Android SDK build-tools; permissions not listed)"
fi
echo "size: $(stat -f %z "$apk") B"
echo "sha256: $(shasum -a 256 "$apk" | cut -c1-16)…"
echo "GATE OK"
