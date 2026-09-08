#!/usr/bin/env bash
# iPhone-pass build gate — the iOS twin of hw-build-gate.sh (lesson from Android build 2: a bundle
# without the project host passes every behavioural check vacuously). Run on the .app that
# `npx expo run:ios --device … --configuration Release` produced, BEFORE trusting any result:
#   docs/verification/hw-build-gate-ios.sh [path/to/Hourwell.app]
# Prints: bundle host hits (must be ≥ 1), the signed entitlements (must NOT carry aps-environment:
# no push, and a personal team cannot sign it), the signing authority/team, size, sha256.
# Never prints the host itself (.env is read-only context).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
app="${1:-$root/apps/mobile/ios/build/Build/Products/Release-iphoneos/Hourwell.app}"
[ -d "$app" ] || { echo "no .app at $app" >&2; exit 2; }
host="$(grep -o '^EXPO_PUBLIC_SUPABASE_URL=.*' "$root/.env" | cut -d= -f2- | sed -E 's#^https?://##; s#/.*$##')"
[ -n "$host" ] || { echo "EXPO_PUBLIC_SUPABASE_URL not in .env" >&2; exit 2; }
bundle="$app/main.jsbundle"
[ -f "$bundle" ] || { echo "GATE FAILED: no main.jsbundle in the .app (Debug build or Metro-served?)" >&2; exit 1; }
hits="$(grep -a -o -F "$host" "$bundle" | wc -l | tr -d ' ')"
echo "bundle host hits: $hits"
[ "$hits" -ge 1 ] || { echo "GATE FAILED: the bundle does not carry the project host" >&2; exit 1; }
ent="$(codesign -d --entitlements :- "$app" 2>/dev/null || true)"
echo "entitlements keys: $(echo "$ent" | grep -o '<key>[^<]*</key>' | sed -E 's#</?key>##g' | tr '\n' ' ')"
if echo "$ent" | grep -q 'aps-environment'; then echo "GATE FAILED: aps-environment is still signed in" >&2; exit 1; fi
codesign -dvv "$app" 2>&1 | grep -E '^(Authority|TeamIdentifier|Identifier)=' | sed 's/^/  /' | sed -E 's/(Apple Development: )[^ ]+/\1<email>/'
echo "size: $(du -sk "$app" | cut -f1) KB"
echo "sha256(main.jsbundle): $(shasum -a 256 "$bundle" | cut -c1-16)…"
echo "GATE OK"
