#!/usr/bin/env bash
# Hardening for the ADR-0009 VM (Ubuntu 24.04 Minimal, OCI). Idempotent; run as ubuntu with sudo.
#   sudo bash harden.sh apply <IP> [<IP> ...]   # sshd drop-in, unattended-upgrades, docker daemon,
#                                               # GRUB menu on the serial console, host SSH
#                                               # allow-list (chain + tag-sync timer) = the given
#                                               # addresses, persisted
#   echo '<password>' | sudo bash harden.sh console-password   # ubuntu's SERIAL-CONSOLE-ONLY password
# Every step is listed in docs/runbooks/oracle-vm.md §3 and re-checked by verify.sh.
set -euo pipefail
mode="${1:-}"; shift || true
src="$(cd "$(dirname "$0")" && pwd)"

sshd_dropin() {
  install -m 644 /dev/stdin /etc/ssh/sshd_config.d/60-hourwell.conf <<'CONF'
# Hourwell (docs/runbooks/oracle-vm.md §3.3): key-only, no root, one user, no forwarding.
# PasswordAuthentication stays off even though `ubuntu` has a password — that password exists
# for the serial console (lockout recovery, runbook §5) and is unusable over the network.
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

grub_serial_menu() {
  # The cloud image hides GRUB (timeout 0). A 3-second menu on the serial console is the last-resort
  # recovery path (runbook §5 ladder C: edit the kernel line → init=/bin/bash → reset the password).
  install -m 644 /dev/stdin /etc/default/grub.d/60-hourwell.cfg <<'CONF'
# Hourwell: make the GRUB menu catchable on the serial console (docs/runbooks/oracle-vm.md §5)
GRUB_TIMEOUT=3
GRUB_TIMEOUT_STYLE=menu
GRUB_RECORDFAIL_TIMEOUT=3
CONF
  update-grub >/dev/null 2>&1
  grep -qE '^ *set timeout=3' /boot/grub/grub.cfg
}

ssh_allow_list() {  # $@ = addresses
  [ $# -gt 0 ] || { echo "usage: harden.sh apply <IP> [<IP> ...]" >&2; exit 2; }
  install -m 755 "$src/hourwell-ssh-allow" /usr/local/bin/hourwell-ssh-allow
  install -m 644 "$src/systemd/hourwell-ssh-allow.service" "$src/systemd/hourwell-ssh-allow.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now hourwell-ssh-allow.timer >/dev/null
  /usr/local/bin/hourwell-ssh-allow apply "$@"
  echo ">>> Host list applied and persisted. From a NEW terminal confirm 'ssh oracle-recsys true' still works."
  echo ">>> Then put the same addresses in the instance tag ssh-allow (Console → instance → Tags): the tag overrides this list within a minute."
}

console_password() {
  # read one line from stdin, never from argv (argv is visible in `ps` and shell history)
  IFS= read -r pw || true
  [ ${#pw} -ge 16 ] || { echo "console-password: give ≥ 16 characters on stdin" >&2; exit 2; }
  echo "ubuntu:$pw" | chpasswd
  passwd -l root >/dev/null
  passwd -S ubuntu | awk '{print "ubuntu password status: " $2 " (P = set; usable on the serial console only — sshd PasswordAuthentication no)"}'
}

case "$mode" in
  apply) sshd_dropin; unattended; docker_daemon; grub_serial_menu; ssh_allow_list "$@" ;;
  console-password) console_password ;;
  *) echo "usage: sudo bash harden.sh apply <IP> [<IP> ...] | console-password (password on stdin)" >&2; exit 2 ;;
esac
