#!/usr/bin/env bash
# Hardening for the ADR-0009 VM (Ubuntu 24.04 Minimal, OCI). Idempotent; run as ubuntu with sudo.
#   sudo bash harden.sh apply <OWNER_IP>   # sshd drop-in, unattended-upgrades, docker daemon,
#                                          # iptables: port 22 only from OWNER_IP (live, NOT persisted)
#   sudo bash harden.sh persist            # after a NEW ssh session from OWNER_IP succeeded
# Every step is listed in docs/runbooks/oracle-vm.md §3 and re-checked by verify.sh.
set -euo pipefail
mode="${1:-}"; owner_ip="${2:-}"

sshd_dropin() {
  install -m 644 /dev/stdin /etc/ssh/sshd_config.d/60-hourwell.conf <<'CONF'
# Hourwell (docs/runbooks/oracle-vm.md §3.3): key-only, no root, one user, no forwarding
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers ubuntu
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
CONF
  sshd -t
  systemctl reload ssh
}

unattended() {
  DEBIAN_FRONTEND=noninteractive apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q unattended-upgrades ca-certificates curl jq iptables-persistent
  install -m 644 /dev/stdin /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF
  install -m 644 /dev/stdin /etc/apt/apt.conf.d/52hourwell-reboot <<'CONF'
// Hourwell: kernel/libc updates need a reboot; containers come back (restart: unless-stopped)
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:15";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
CONF
  systemctl enable --now unattended-upgrades apt-daily.timer apt-daily-upgrade.timer >/dev/null
}

docker_daemon() {
  install -d -m 755 /etc/docker
  install -m 644 /dev/stdin /etc/docker/daemon.json <<'CONF'
{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "no-new-privileges": true
}
CONF
  systemctl restart docker
}

firewall_live() {
  [ -n "$owner_ip" ] || { echo "usage: harden.sh apply <OWNER_IP>" >&2; exit 2; }
  # allow 22 from the owner only; keep 80/443 open (Caddy). Docker-published ports do not pass
  # INPUT, so this chain governs host services (ssh) only.
  iptables -C INPUT -p tcp -s "$owner_ip/32" --dport 22 -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp -s "$owner_ip/32" --dport 22 -m conntrack --ctstate NEW -j ACCEPT
  # drop every other "ssh from anywhere" accept rule (OCI images ship one)
  while read -r rule; do
    [ -n "$rule" ] && eval "iptables -D INPUT ${rule#-A INPUT }"
  done < <(iptables -S INPUT | grep -E -- '--dport 22 ' | grep -v -- "-s $owner_ip/32")
  echo "live rules now:"; iptables -S INPUT | grep -E -- '--dport (22|80|443) '
  echo ">>> Open a NEW terminal, confirm 'ssh oracle-recsys true' works from $owner_ip, THEN run: sudo bash harden.sh persist"
}

persist() {
  netfilter-persistent save
  echo "persisted to /etc/iptables/rules.v4:"; grep -E -- '--dport (22|80|443) ' /etc/iptables/rules.v4
}

case "$mode" in
  apply) sshd_dropin; unattended; docker_daemon; firewall_live ;;
  persist) persist ;;
  *) echo "usage: sudo bash harden.sh apply <OWNER_IP> | persist" >&2; exit 2 ;;
esac
