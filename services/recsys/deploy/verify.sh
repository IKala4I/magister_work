#!/usr/bin/env bash
# Re-verification of the ADR-0009 box (runbook §8). Prints OK/FAIL per check; exit 1 on any FAIL.
# Run as ubuntu:   bash ~/hourwell/deploy/verify.sh [OWNER_IP]
set -uo pipefail
owner_ip="${1:-}"; fail=0
ok()   { echo "OK    $1"; }
bad()  { echo "FAIL  $1"; fail=1; }
chk()  { if eval "$2" >/dev/null 2>&1; then ok "$1"; else bad "$1"; fi; }

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
chk "no password set for ubuntu/root"          'sudo passwd -S ubuntu | grep -qE " (L|NP) " && sudo passwd -S root | grep -qE " (L|NP) "'
echo "== firewall =="
rules="$(sudo iptables -S INPUT)"
if [ -n "$owner_ip" ]; then
  chk "port 22 only from $owner_ip"            'grep -qE -- "-s $owner_ip/32 .*--dport 22 " <<<"$rules" && ! grep -E -- "--dport 22 " <<<"$rules" | grep -vq -- "-s $owner_ip/32"'
else
  chk "port 22 restricted to one /32"          'grep -E -- "--dport 22 " <<<"$rules" | grep -q -- "-s " && ! grep -E -- "--dport 22 " <<<"$rules" | grep -vq -- "-s "'
fi
chk "80/443 accepted"                          'grep -qE -- "--dport 80 " <<<"$rules" && grep -qE -- "--dport 443 " <<<"$rules"'
# rules.v4 is root-only (640) — read it with sudo, or this check fails for the wrong reason
chk "rules persisted (rules.v4 matches live 22 rule)" 'diff <(sudo iptables -S INPUT | grep -E -- "--dport 22 ") <(sudo grep -E -- "^-A INPUT .*--dport 22 " /etc/iptables/rules.v4) >/dev/null'
echo "== updates =="
chk "unattended-upgrades installed+enabled"    'dpkg -s unattended-upgrades >/dev/null && systemctl is-enabled unattended-upgrades'
chk "periodic upgrades on (20auto-upgrades)"   'grep -q "Unattended-Upgrade \"1\"" /etc/apt/apt.conf.d/20auto-upgrades'
chk "automatic reboot configured"              'grep -q "Automatic-Reboot \"true\"" /etc/apt/apt.conf.d/52hourwell-reboot'
chk "no pending security updates"              '[ "$(apt list --upgradable 2>/dev/null | grep -c security)" = 0 ]'
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
host="$(grep -E "^RECSYS_HOST=" /home/ubuntu/hourwell/.env | cut -d= -f2-)"
if [ -n "$host" ]; then
  chk "https://$host/healthz answers (TLS ok)"  'curl -fsS --max-time 10 "https://$host/healthz" | jq -e ".status==\"ok\" and .storage==\"postgres\" and .arch==\"aarch64\""'
fi
chk "no participant data at rest (only caddy volumes)" '[ "$(docker volume ls -q | grep -vc "^hourwell_caddy_")" = 0 ]'
[ $fail = 0 ] && echo "ALL OK" || { echo "SOME CHECKS FAILED"; exit 1; }
