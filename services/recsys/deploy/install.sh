#!/usr/bin/env bash
# Install / update the Hourwell RecSys stack on the VM (idempotent). Run as ubuntu from the copied
# deploy dir:   bash ~/hourwell/deploy/install.sh
# Expects ~/hourwell/.env to exist (copy .env.example and fill it, chmod 600) — see runbook §4.
set -euo pipefail
src="$(cd "$(dirname "$0")" && pwd)"
app=/home/ubuntu/hourwell
install -d -m 750 "$app"
install -m 644 "$src/compose.yml" "$app/compose.yml"
install -m 644 "$src/Caddyfile" "$app/Caddyfile"
if [ ! -f "$app/.env" ]; then
  install -m 600 "$src/.env.example" "$app/.env"
  echo ">>> $app/.env created from the example — fill DATABASE_URL, HOURWELL_SERVICE_KEY, RECSYS_HOST, then re-run" >&2
  exit 3
fi
chmod 600 "$app/.env"
sudo install -m 755 "$src/hourwell-rollout" /usr/local/bin/hourwell-rollout
sudo install -m 644 "$src/systemd/hourwell-rollout.service" "$src/systemd/hourwell-rollout.timer" \
  "$src/systemd/hourwell-keepbusy.service" "$src/systemd/hourwell-keepbusy.timer" \
  "$src/systemd/hourwell-train.service" "$src/systemd/hourwell-train.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hourwell-rollout.timer hourwell-keepbusy.timer hourwell-train.timer >/dev/null
( cd "$app" && docker compose config --quiet && echo "compose config OK" )
( cd "$app" && docker compose --profile training pull --quiet && docker compose up -d --remove-orphans )
echo "timers:"; systemctl list-timers 'hourwell-*' --no-pager | head -4
echo "containers:"; ( cd "$app" && docker compose ps )
