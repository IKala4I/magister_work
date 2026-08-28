#!/usr/bin/env bash
# Re-verification of the ADR-0009 box (runbook §12). Prints OK/FAIL/INFO per check; exit 1 on any FAIL.
# Run as ubuntu:   bash ~/hourwell/deploy/verify.sh [YOUR_IP]
set -uo pipefail
owner_ip="${1:-}"; fail=0
ok()   { echo "OK    $1"; }
bad()  { echo "FAIL  $1"; fail=1; }
info() { echo "INFO  $1"; }
chk()  { if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }
CHAIN=HOURWELL-SSH

echo "== box =="; echo "$(hostname) $(uname -m) $(nproc) cores  $(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)"
chk "arch is aarch64"                          '[ "$(uname -m)" = aarch64 ]'
chk "2 cores"                                  '[ "$(nproc)" = 2 ]'
chk "clock synchronized (NTP)"                 'timedatectl show -p NTPSynchronized --value | grep -q yes'
echo "== ssh =="
eff="$(sudo sshd -T 2>/dev/null)"
chk "PasswordAuthentication no"                'grep -qi "^passwordauthentication no" <<<"$eff"'
chk "KbdInteractiveAuthentication no"          'grep -qi "^kbdinteractiveauthentication no" <<<"$eff"'
chk "PermitRootLogin no"                       'grep -qi "^permitrootlogin no" <<<"$eff"'
chk "AllowUsers ubuntu"                        'grep -qi "^allowusers ubuntu" <<<"$eff"'
chk "root account locked"                      'sudo passwd -S root | grep -qE " L "'
chk "ubuntu has a console password (serial-console recovery, runbook §5)" 'sudo passwd -S ubuntu | grep -qE " P "'
echo "== firewall: host SSH allow-list (chain $CHAIN, runbook §0/§4) =="
inrules="$(sudo iptables -S INPUT)"
chk "INPUT jumps port-22 NEW to $CHAIN"        'grep -qE -- "^-A INPUT -p tcp -m tcp --dport 22 -m conntrack --ctstate NEW -j $CHAIN$" <<<"$inrules"'
chk "no other port-22 accept in INPUT"         '! grep -E -- "--dport 22 " <<<"$inrules" | grep -vq -- "-j $CHAIN"'
live="$(sudo iptables -S $CHAIN 2>/dev/null | awk "/^-A/ {for(i=1;i<=NF;i++) if (\$i==\"-s\") print \$(i+1)}" | sed "s#^\([0-9.]*\)\$#\1/32#")"
state="$(grep -v "^#" /etc/hourwell/ssh-allow 2>/dev/null | awk "NF")"
chk "$CHAIN is non-empty"                      '[ -n "$live" ]'
chk "live chain == /etc/hourwell/ssh-allow"    '[ "$live" = "$state" ]'
if [ -n "$owner_ip" ]; then
  chk "$owner_ip allowed"                      'grep -qxF -e "$owner_ip/32" -e "0.0.0.0/0" <<<"$live"'
fi
chk "not open to the world (no 0.0.0.0/0)"     '! grep -qxF "0.0.0.0/0" <<<"$live"'
chk "rules.v4 persisted with the same chain"   '[ "$(sudo grep -E -- "^-A $CHAIN " /etc/iptables/rules.v4 | awk "{for(i=1;i<=NF;i++) if (\$i==\"-s\") print \$(i+1)}")" = "$live" ]'
chk "rules.v4 holds host rules only (no Docker chains)" '! sudo grep -q "^:DOCKER" /etc/iptables/rules.v4'
chk "80/443 accepted in INPUT"                 'grep -qE -- "--dport 80 " <<<"$inrules" && grep -qE -- "--dport 443 " <<<"$inrules"'
chk "no global IPv6 address (v6 rules irrelevant)" '[ -z "$(ip -6 addr show scope global 2>/dev/null)" ]'
chk "ssh-allow sync timer active"              'systemctl is-active hourwell-ssh-allow.timer'
chk "IMDS v2 reachable"                        'curl -fsS --max-time 5 -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/ | jq -e .id'
tag="$(curl -fsS --max-time 5 -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/ 2>/dev/null | jq -r '.freeformTags["ssh-allow"] // empty' 2>/dev/null)"
if [ -n "$tag" ]; then ok "instance tag ssh-allow set: $tag"; else info "instance tag ssh-allow NOT set — host list comes from the last 'apply'; set the tag so it can be edited from a browser (runbook §4)"; fi
info "host allow-list now: $(tr '\n' ' ' <<<"$live")"
echo "== updates =="
chk "unattended-upgrades installed+enabled"    'dpkg -s unattended-upgrades >/dev/null && systemctl is-enabled unattended-upgrades'
chk "periodic upgrades on (20auto-upgrades)"   'grep -q "Unattended-Upgrade \"1\"" /etc/apt/apt.conf.d/20auto-upgrades'
chk "automatic reboot configured"              'grep -q "Automatic-Reboot \"true\"" /etc/apt/apt.conf.d/52hourwell-reboot'
chk "no pending security updates"              '[ "$(apt list --upgradable 2>/dev/null | grep -c security)" = 0 ]'
echo "== recovery path (runbook §5) =="
chk "GRUB menu on the serial console (timeout 3)" 'sudo grep -qE "^ *set timeout=3" /boot/grub/grub.cfg'
chk "serial getty on ttyAMA0"                  'systemctl is-active serial-getty@ttyAMA0.service'
chk "kernel console on ttyAMA0"                'grep -q "console=ttyAMA0" /proc/cmdline'
echo "== docker =="
chk "daemon listens on the unix socket only"   '! sudo ss -lntp | grep -qE ":(2375|2376) " && [ -S /var/run/docker.sock ]'
chk "socket root:docker 660"                   '[ "$(stat -c "%U:%G %a" /var/run/docker.sock)" = "root:docker 660" ]'
chk "live-restore + log rotation"              'docker info --format "{{.LiveRestoreEnabled}}" | grep -q true && grep -q max-size /etc/docker/daemon.json'
chk "only caddy publishes ports (80/443)"      '[ "$(docker ps --format "{{.Names}} {{.Ports}}" | grep -E "0\.0\.0\.0:[0-9]+" | grep -vc caddy)" = 0 ]'
chk "recsys not published"                     '! docker ps --format "{{.Names}} {{.Ports}}" | grep recsys | grep -q "0.0.0.0"'
echo "== app =="
chk ".env is 600 and owned by ubuntu"          '[ "$(stat -c "%U %a" /home/ubuntu/hourwell/.env)" = "ubuntu 600" ]'
chk "recsys healthy"                           'cd /home/ubuntu/hourwell && docker compose ps --format "{{.Health}}" recsys | grep -q healthy'
chk "rollout timer active"                     'systemctl is-active hourwell-rollout.timer'
chk "keep-busy timer active"                   'systemctl is-active hourwell-keepbusy.timer'
host="$(grep -E "^RECSYS_HOST=" /home/ubuntu/hourwell/.env 2>/dev/null | cut -d= -f2-)"
if [ -n "$host" ]; then
  chk "https://$host/healthz answers (TLS ok)"  'curl -fsS --max-time 10 "https://$host/healthz" | jq -e ".status==\"ok\" and .storage==\"postgres\" and .arch==\"aarch64\""'
fi
chk "no participant data at rest (only caddy volumes)" '[ "$(docker volume ls -q | grep -vc "^hourwell_caddy_")" = 0 ]'
[ $fail = 0 ] && echo "ALL OK" || { echo "SOME CHECKS FAILED"; exit 1; }
