#!/usr/bin/env bash
# Owner-side one-liners for the two SSH locks of the ADR-0009 VM (docs/runbooks/oracle-vm.md §0/§4):
# the OCI Security List (network layer) and the instance freeform tag `ssh-allow` (host layer —
# synced onto the box every minute by hourwell-ssh-allow.timer). Both are also editable by hand in
# the OCI Console from any browser; this script only saves the clicks. Needs the OCI CLI configured
# once (runbook §4.4: `brew install oci-cli`, `oci setup config`, API key uploaded in the Console).
#
#   ssh-allow.sh me                    # your current public IPv4 (what the locks must contain)
#   ssh-allow.sh init                  # find + cache the instance / security-list OCIDs (~/.hourwell/oci-ids)
#   ssh-allow.sh list                  # what each lock allows for port 22 right now
#   ssh-allow.sh add    <ip>[/len]     # allow in BOTH locks (also drops any 0.0.0.0/0 port-22 rule)
#   ssh-allow.sh remove <ip>[/len]     # remove from BOTH (refuses to remove the last address)
#   ssh-allow.sh selftest              # exercise the JSON transforms on a fixture (no network, no oci)
set -euo pipefail
IDS="${HOURWELL_OCI_IDS:-$HOME/.hourwell/oci-ids}"
INSTANCE_NAME="${HOURWELL_INSTANCE_NAME:-recsys-oracle}"
TAG_KEY=ssh-allow
DESC="ssh owner (hourwell ssh-allow)"

die() { echo "ssh-allow: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 not installed ($2)"; }
norm() { [[ "$1" == */* ]] && echo "$1" || echo "$1/32"; }
valid_cidr() { [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(/([0-9]|[12][0-9]|3[0-2]))?$ ]]; }

# --- jq programs -------------------------------------------------------------------------------
# `oci ... get` prints kebab-case keys; `oci ... update --ingress-security-rules` expects camelCase.
JQ_CAMEL='def camel: gsub("-(?<c>[a-z])"; .c | ascii_upcase);
  def walkkeys: if type=="object" then with_entries(.key |= camel | .value |= walkkeys)
                elif type=="array" then map(walkkeys) else . end;'
JQ_IS22='def is22: (.protocol=="6" and ((.tcpOptions.destinationPortRange // {}) | .min==22 and .max==22));'
# add: drop the world-open 22 rule and any existing rule for this source on 22, then append ours
JQ_ADD="$JQ_CAMEL $JQ_IS22"'
  walkkeys
  | map(select((is22 and (.source=="0.0.0.0/0" or .source==$cidr)) | not))
  + [{source:$cidr, protocol:"6", isStateless:false, description:$desc,
      tcpOptions:{destinationPortRange:{min:22,max:22}}}]'
JQ_REMOVE="$JQ_CAMEL $JQ_IS22"' walkkeys | map(select((is22 and .source==$cidr) | not))'
JQ_LIST22="$JQ_CAMEL $JQ_IS22"' walkkeys | map(select(is22) | .source)'

tag_union()  { jq -c --arg k "$TAG_KEY" --arg cidr "$1" '(.[$k] // "" | split(",") | map(select(length>0)) + [$cidr] | unique | join(",")) as $v | .[$k]=$v'; }
tag_remove() { jq -c --arg k "$TAG_KEY" --arg cidr "$1" '(.[$k] // "" | split(",") | map(select(length>0 and . != $cidr)) | join(",")) as $v | .[$k]=$v'; }

# --- oci helpers -------------------------------------------------------------------------------
load_ids() { [ -f "$IDS" ] || die "no $IDS — run: ssh-allow.sh init"; . "$IDS"; }
sl_rules()  { oci network security-list get --security-list-id "$SECLIST_ID" --query 'data."ingress-security-rules"' --output json; }
sl_put()    { oci network security-list update --security-list-id "$SECLIST_ID" --ingress-security-rules "file://$1" --force >/dev/null; }
tags_get()  { oci compute instance get --instance-id "$INSTANCE_ID" --query 'data."freeform-tags"' --output json | jq 'if .==null then {} else . end'; }
tags_put()  { oci compute instance update --instance-id "$INSTANCE_ID" --freeform-tags "file://$1" --force >/dev/null; }

case "${1:-}" in
  me) curl -4 -fsS https://api.ipify.org; echo ;;
  init)
    need oci "brew install oci-cli && oci setup config — runbook §4.4"; need jq "brew install jq"
    item="$(oci search resource structured-search --query-text "query instance resources where displayName = '$INSTANCE_NAME' && lifecycleState = 'RUNNING'" --query 'data.items[0]' --output json)"
    inst="$(jq -r '.identifier // empty' <<<"$item")"; comp="$(jq -r '."compartment-id" // empty' <<<"$item")"
    [ -n "$inst" ] || die "no running instance named $INSTANCE_NAME found (set HOURWELL_INSTANCE_NAME?)"
    vnic="$(oci compute vnic-attachment list --compartment-id "$comp" --instance-id "$inst" --query 'data[0]."vnic-id"' --raw-output)"
    subnet="$(oci network vnic get --vnic-id "$vnic" --query 'data."subnet-id"' --raw-output)"
    sl="$(oci network subnet get --subnet-id "$subnet" --query 'data."security-list-ids"[0]' --raw-output)"
    install -d -m 700 "$(dirname "$IDS")"
    printf 'INSTANCE_ID=%s\nCOMPARTMENT_ID=%s\nSECLIST_ID=%s\n' "$inst" "$comp" "$sl" > "$IDS"; chmod 600 "$IDS"
    echo "cached in $IDS"; cat "$IDS" ;;
  list)
    need oci "runbook §4.4"; load_ids
    echo "Security List, port 22 from:"; sl_rules | jq -r "$JQ_LIST22 | .[]" | sed 's/^/  /'
    echo "Instance tag $TAG_KEY (host layer):"; tags_get | jq -r --arg k "$TAG_KEY" '.[$k] // "<not set>"' | tr ',' '\n' | sed 's/^/  /' ;;
  add|remove)
    need oci "runbook §4.4"; need jq "brew install jq"; load_ids
    [ -n "${2:-}" ] && valid_cidr "$2" || die "usage: ssh-allow.sh $1 <ip>[/len]"
    cidr="$(norm "$2")"; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    if [ "$1" = add ]; then
      sl_rules | jq --arg cidr "$cidr" --arg desc "$DESC" "$JQ_ADD" > "$tmp/rules.json"
      tags_get | tag_union "$cidr" > "$tmp/tags.json"
    else
      sl_rules | jq --arg cidr "$cidr" "$JQ_REMOVE" > "$tmp/rules.json"
      [ "$(jq -r "$JQ_LIST22 | length" "$tmp/rules.json")" -ge 1 ] || die "refusing: $cidr is the last address allowed on port 22 (add another first)"
      tags_get | tag_remove "$cidr" > "$tmp/tags.json"
      [ -n "$(jq -r --arg k "$TAG_KEY" '.[$k]' "$tmp/tags.json")" ] || die "refusing: $cidr is the last address in tag $TAG_KEY"
    fi
    sl_put "$tmp/rules.json"; tags_put "$tmp/tags.json"
    echo "$1 $cidr: Security List updated; tag $TAG_KEY = $(jq -r --arg k "$TAG_KEY" '.[$k]' "$tmp/tags.json") — the box applies it within a minute" ;;
  selftest)
    need jq "brew install jq"
    fixture='[{"source":"0.0.0.0/0","protocol":"6","is-stateless":false,"tcp-options":{"destination-port-range":{"min":22,"max":22},"source-port-range":null},"udp-options":null,"icmp-options":null,"description":null},
              {"source":"0.0.0.0/0","protocol":"6","is-stateless":false,"tcp-options":{"destination-port-range":{"min":80,"max":80}}},
              {"source":"0.0.0.0/0","protocol":"6","is-stateless":false,"tcp-options":{"destination-port-range":{"min":443,"max":443}}},
              {"source":"0.0.0.0/0","protocol":"1","is-stateless":false,"icmp-options":{"type":3,"code":4}},
              {"source":"1.2.3.4/32","protocol":"6","is-stateless":false,"tcp-options":{"destination-port-range":{"min":22,"max":22}}}]'
    out="$(jq --arg cidr "5.6.7.8/32" --arg desc "$DESC" "$JQ_ADD" <<<"$fixture")"
    [ "$(jq -r "$JQ_LIST22 | join(\",\")" <<<"$out")" = "1.2.3.4/32,5.6.7.8/32" ] || die "selftest add: port-22 sources wrong: $(jq -c "$JQ_LIST22" <<<"$out")"
    [ "$(jq 'length' <<<"$out")" = 5 ] || die "selftest add: expected 5 rules (80, 443, icmp, 1.2.3.4, 5.6.7.8)"
    jq -e '.[0] | has("isStateless") and has("tcpOptions") and (.tcpOptions | has("destinationPortRange"))' <<<"$out" >/dev/null || die "selftest: keys not camelCase"
    jq -e '.[-1].tcpOptions.destinationPortRange == {min:22,max:22}' <<<"$out" >/dev/null || die "selftest: new rule shape"
    out2="$(jq --arg cidr "1.2.3.4/32" "$JQ_REMOVE" <<<"$out")"
    [ "$(jq -r "$JQ_LIST22 | join(\",\")" <<<"$out2")" = "5.6.7.8/32" ] || die "selftest remove"
    t="$(echo '{"other":"x","ssh-allow":"1.2.3.4/32"}' | tag_union 5.6.7.8/32)"
    [ "$(jq -r '.["ssh-allow"]' <<<"$t")" = "1.2.3.4/32,5.6.7.8/32" ] && [ "$(jq -r .other <<<"$t")" = x ] || die "selftest tag_union: $t"
    t2="$(tag_remove 1.2.3.4/32 <<<"$t")"; [ "$(jq -r '.["ssh-allow"]' <<<"$t2")" = "5.6.7.8/32" ] || die "selftest tag_remove: $t2"
    t3="$(echo '{}' | tag_union 9.9.9.9/32)"; [ "$(jq -r '.["ssh-allow"]' <<<"$t3")" = "9.9.9.9/32" ] || die "selftest tag_union from empty"
    echo "selftest OK (Security List add/remove transforms, kebab→camelCase, tag union/remove)" ;;
  *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
