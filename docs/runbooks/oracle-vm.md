# Runbook — RecSys service on the Oracle Cloud VM (ADR-0009)

> Owner-run steps are marked **[owner]**; everything else is scripted in
> `services/recsys/deploy/` and re-verifiable with `verify.sh`. Never paste secrets into this
> file, the repo, or chat. Recovery when SSH is locked out: OCI Console → Compute → Instances →
> `recsys-oracle` → **Console connection** (serial console via Cloud Shell) — keep that path in
> mind before touching the firewall.

## 0. The box (as provisioned 2026-08-27)

| Item     | Value                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Tenancy  | Oracle Cloud Free Tier, home region **France South / Marseille (`eu-marseille-1`)**                         |
| Instance | `recsys-oracle`, VM.Standard.A1.Flex, **2 OCPU / 12 GB**, Ubuntu 24.04 Minimal aarch64                      |
| Network  | VCN `recsys-vcn`, public subnet, reserved public IPv4 **84.235.238.25**                                     |
| Ingress  | Security List: 80, 443 from `0.0.0.0/0`; 22 — see §3.1                                                      |
| Access   | `ssh oracle-recsys` (alias in `~/.ssh/config`, key `~/.ssh/oracle_recsys.key`, user `ubuntu`)               |
| Runtime  | Docker 29.1 + Compose v2.40, `ubuntu` in the `docker` group (root-equivalent — the only user)               |
| Budget   | 1 EUR budget alert; Always Free resources stay free on any plan; paid shapes only bill after a PAYG upgrade |

## 1. What runs where

```
Supabase edge functions (eu-west-1) ──HTTPS──▶ Caddy :443 ──▶ recsys :7860 (compose network only)
                                                 │                 │
                                    Let's Encrypt cert (auto)   Postgres pooler (eu-west-1) via DATABASE_URL
GitHub Actions ──build linux/arm64──▶ GHCR ◀──pull every 5 min── hourwell-rollout.timer (no inbound SSH from CI)
```

Files on the box: `/home/ubuntu/hourwell/{compose.yml,Caddyfile,.env}` (from
`services/recsys/deploy/`), `/usr/local/bin/hourwell-rollout`, four systemd units. **No participant
data at rest**: the only volumes are Caddy's certificate store and its rotated access log
(`docs/privacy/README.md` §"Self-hosted RecSys VM").

## 2. Hostname + TLS — DuckDNS **[owner, ~3 min]**

Why DuckDNS: free, no card, a stable `<name>.duckdns.org` that can point at a static IP; the
domain is on the Public Suffix List, so Let's Encrypt's per-registered-domain rate limit applies
to _our_ subdomain, not to everyone sharing duckdns.org (sslip.io / nip.io are not PSL-listed and
share one bucket — a certificate request can fail for reasons outside our control). Caddy needs
nothing else: it proves control over the name on :80 (HTTP-01) or :443 (TLS-ALPN-01), both open.

1. https://www.duckdns.org → sign in (GitHub is fine; DuckDNS stores the provider id, the
   subdomain and the IP — nothing else).
2. Add domain **`hourwell-recsys`** (if taken, pick another and use it everywhere below); set
   **current ip** to `84.235.238.25`; **update ip**. Done — the IP is reserved, no updater needed.
3. Check from the Mac: `dig +short hourwell-recsys.duckdns.org` → `84.235.238.25`.
4. Record the name in three places: `RECSYS_HOST` in the box's `.env` (§4), the GitHub repo
   variable `RECSYS_HOST` (§6), and `RECSYS_URL=https://hourwell-recsys.duckdns.org` in the
   Supabase secrets (§6). The ADR names this host; change all three together if it ever changes.

Optional: keep the DuckDNS token in a password manager; a monthly `curl "https://www.duckdns.org/update?domains=hourwell-recsys&token=<token>&ip="` from the box is only needed if the IP is ever un-reserved.

## 3. Hardening — before `.env` holds `DATABASE_URL`

### 3.1 Security List: port 22 from your IP only **[owner, console]**

OCI Console → Networking → Virtual cloud networks → `recsys-vcn` → Security Lists → _Default
Security List_ → **Ingress Rules**:

- Edit the rule with destination port **22**: Source CIDR = `<YOUR_IP>/32` (find it with
  `curl -s https://api.ipify.org` on the Mac). Save.
- Confirm there is **no other** rule allowing 22 from `0.0.0.0/0`; keep **80** and **443** from
  `0.0.0.0/0`. ICMP rules can stay.
- Residential IPs change: when SSH stops connecting, update this rule first (Console works from
  anywhere), then §3.2's iptables rule via the console connection if needed.

### 3.2–3.5 sshd, updates, docker daemon, iptables — scripted

From the Mac (network needed):

```bash
scp -r services/recsys/deploy oracle-recsys:~/hourwell/deploy
ssh oracle-recsys 'sudo bash ~/hourwell/deploy/harden.sh apply <YOUR_IP>'
```

`harden.sh apply` does, idempotently:

- **sshd** drop-in `/etc/ssh/sshd_config.d/60-hourwell.conf`: `PasswordAuthentication no`,
  `KbdInteractiveAuthentication no`, `PermitRootLogin no`, `AllowUsers ubuntu`, `MaxAuthTries 3`,
  no X11/agent/TCP forwarding; `sshd -t` then reload. (OCI images already disable passwords via
  `50-cloud-init.conf`; root's `authorized_keys` only echoes "login as ubuntu" — the drop-in makes
  both explicit and effective: `sudo sshd -T | grep -Ei 'passwordauthentication|permitrootlogin'`.)
- **unattended-upgrades** (Minimal ships without it): installs it + `ca-certificates curl jq
iptables-persistent`; `20auto-upgrades` (daily lists + upgrade), `52hourwell-reboot`
  (automatic reboot **04:15 UTC** when required; containers return via `restart: unless-stopped`).
- **Docker daemon** `/etc/docker/daemon.json`: `live-restore` (daemon restarts keep containers
  up), json-file logs capped 3 × 10 MB, `no-new-privileges`. The daemon listens on the unix
  socket only — `harden.sh`/`verify.sh` fail if anything listens on 2375/2376.
- **iptables (live only)**: inserts `-s <YOUR_IP>/32 --dport 22 ACCEPT` at the top of INPUT and
  deletes every other `--dport 22` accept (the OCI default), keeps 80/443. Then **STOP**:

```bash
# in a NEW terminal — must succeed before persisting:
ssh oracle-recsys true && echo "ssh still fine"
ssh oracle-recsys 'sudo bash ~/hourwell/deploy/harden.sh persist'   # netfilter-persistent save
```

If the new terminal cannot connect, the live rule is wrong: the existing session is still open —
run `sudo iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT` there, fix the IP, retry. Nothing was
persisted, so a reboot also restores the old rules.

Note on Docker and iptables: containers' published ports go through the `DOCKER` chain, not
`INPUT` — the host firewall above governs ssh; **compose.yml is the firewall for the app**: only
`caddy` has `ports:`, `recsys` is `expose`-only. `verify.sh` checks that.

### 3.6 Verify (any time)

```bash
ssh oracle-recsys 'bash ~/hourwell/deploy/verify.sh <YOUR_IP>'     # OK/FAIL per check, "ALL OK"
```

## 4. Install the app

1. **[owner]** Create the backend key once — it is already generated in
   `~/.hourwell/HOURWELL_SERVICE_KEY` on the Mac (64 hex); the same value goes to the
   box `.env`, to `supabase secrets`, and to Vault (§6). Rotation: §9.
2. On the box, `~/hourwell/deploy/install.sh` copies compose/Caddyfile, creates `.env` from
   `.env.example` on first run and exits so you can fill it:

```bash
ssh oracle-recsys 'bash ~/hourwell/deploy/install.sh'      # first run: creates ~/hourwell/.env, exit 3
ssh oracle-recsys 'nano ~/hourwell/.env'                   # RECSYS_HOST, DATABASE_URL, HOURWELL_SERVICE_KEY
```

`DATABASE_URL`: Supabase dashboard → project `uapiuehjcntilwdmpojk` → **Connect** → _Transaction
pooler_ (port 6543), role `postgres.uapiuehjcntilwdmpojk`, the database password (URL-encode
special characters). `SUPABASE_URL` is the project URL. `RECSYS_HOST` from §2.

3. Second run installs the rollout binary + systemd timers, validates the compose file, pulls
   the image and starts the stack:

```bash
ssh oracle-recsys 'bash ~/hourwell/deploy/install.sh'
ssh oracle-recsys 'cd ~/hourwell && docker compose logs --tail 40 caddy'   # certificate obtained
curl -sS https://hourwell-recsys.duckdns.org/healthz | jq .                # storage: postgres, arch: aarch64, build: <sha>
```

The image must be pullable: after the first CI push, GitHub → repo → **Packages** →
`hourwell-recsys` → Package settings → **Change visibility → Public** (it contains no secrets;
the repo is public). Until then `docker compose pull` on the box answers "denied".

## 5. Rollout and keep-busy timers (installed by `install.sh`)

- `hourwell-rollout.timer` → every 5 min `docker compose pull && up -d`; recreates only when
  `:latest` changed; prunes old images; `journalctl -u hourwell-rollout -n 20`.
- `hourwell-keepbusy.timer` → hourly `bench_solve.py --runs 100` inside the pinned container
  (~3 min of CPU): Oracle reclaims an idle Always Free instance only when CPU **and** network
  **and** memory are all below their 7-day thresholds, so keeping CPU p95 ≥ 20 % is enough.
  **Keep it on regardless of plan** — Oracle's docs do not say a PAYG upgrade exempts instances
  (ADR-0009 Q2, corrected). Check it ran: `journalctl -u hourwell-keepbusy -n 3`.
- Manual rollout: `ssh oracle-recsys 'sudo -u ubuntu /usr/local/bin/hourwell-rollout'`.
- Pin a version: set `RECSYS_TAG=<sha12>` in `.env` (CI publishes `:sha` and `:latest`), re-run
  the rollout; unpin by setting `latest` back.

## 6. Wire the secrets (three places, one key) **[owner]**

| Where                         | What                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Box `~/hourwell/.env`         | `HOURWELL_SERVICE_KEY`, `DATABASE_URL`, `SUPABASE_URL`, `RECSYS_HOST` (§4)                                                                              |
| Supabase function secrets     | from the repo root: `supabase secrets set HOURWELL_SERVICE_KEY=<key> RECSYS_URL=https://hourwell-recsys.duckdns.org` (needs `supabase login` once)      |
| Supabase Vault (cron tick)    | run `~/.hourwell/vault-secrets.sql` in the SQL editor (`hourwell_functions_url`, `hourwell_service_key`, `hourwell_anon_key`) — HANDOFF ⛔ 2            |
| GitHub → Settings → Variables | **`RECSYS_HOST`** = `hourwell-recsys.duckdns.org` (enables the workflow's rollout check). **No GitHub secrets are needed** — CI never SSHes to the box. |

Set `RECSYS_URL` only after `https://<host>/healthz` answers, so fallback telemetry stays clean.

## 7. Verification after the first deploy (the three blocked measurements)

1. **Live learned path** — from `apps/mobile`: `node ../../docs/verification/p6-live-smoke.mjs 10`
   → expect `reason = learned` on every run; record p50/p95 in `p6-manual-verification.md` §3.
2. **Warm NFR-P1 p95** — same script, second run of 10 after the first (the first warms nothing:
   the VM is always on; the difference is the DB pool).
3. **File 04 §1.5 on the named box** —
   `ssh oracle-recsys 'cd ~/hourwell && docker compose exec -T recsys /opt/venv/bin/python scripts/bench_solve.py --runs 20 --json /tmp/bench.json && cat /tmp/bench.json'`
   → record next to the Mac numbers in `p5-manual-verification.md` §2 and flip the device-checklist
   "Service environment" items. A different presolve threshold is an empirical result
   (ADR-0007 §11 / spec-conflicts M8 treatment), not a bug.
4. **Live /feedback delivery** — after a fact reaches the server: the function log shows
   `delivery = ok`; `select count(*) from feedback_rewards where delivered_at is null;` → 0.
5. `bash ~/hourwell/deploy/verify.sh <YOUR_IP>` → `ALL OK`.

## 8. Operations

| Task             | Command / where                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Logs             | `cd ~/hourwell && docker compose logs --tail 100 -f recsys` · Caddy access log: `docker compose exec caddy tail -f /data/access.log` |
| Restart          | `docker compose restart recsys` (Caddy keeps serving 502 for a few seconds)                                                          |
| Reboot           | `sudo reboot` — everything returns (compose restart policy + timers)                                                                 |
| Disk             | `df -h /`; images are pruned by the rollout; `docker system df`                                                                      |
| OS updates       | automatic (§3); manual: `sudo unattended-upgrade -d`; reboot required? `[ -f /var/run/reboot-required ]`                             |
| Certificate      | Caddy renews itself; check `docker compose logs caddy                                                                                | grep -i certificate` |
| Cron tick health | Supabase SQL: `select status_code, left(content,120), created from net._http_response order by created desc limit 5;`                |
| Decommission     | `docker compose down -v` (removes the cert volume) → terminate the instance in the console; rotate the DB password + keys (§9)       |

## 9. Rotation and incident response

- **HOURWELL_SERVICE_KEY leaked** → generate a new one (`openssl rand -hex 32`); update the box
  `.env` + `docker compose restart recsys`; `supabase secrets set HOURWELL_SERVICE_KEY=<new>`;
  Vault: `select vault.update_secret((select id from vault.secrets where name='hourwell_service_key'), '<new>');`.
- **DATABASE_URL / DB password leaked** → Supabase dashboard → Database → reset password; update
  `.env`; restart. Consider the least-privilege `recsys_service` role (revisit.md, P12).
- **SSH key leaked** → new keypair; append the new public key to `/home/ubuntu/.ssh/authorized_keys`
  via the console connection; remove the old line; update `~/.ssh/config`.
- **Box compromised** → terminate the instance, rotate everything above, redeploy from CI (the
  image is reproducible; nothing else lives on the box).

## 10. Re-verification checklist (copy into the phase report)

```
[ ] verify.sh → ALL OK                       [ ] Security List: 22 only from <YOUR_IP>/32
[ ] https://<host>/healthz build == main sha [ ] GitHub Packages: hourwell-recsys public
[ ] Vault: attribution_sweep_tick() → posted [ ] supabase secrets: RECSYS_URL + HOURWELL_SERVICE_KEY
[ ] unattended-upgrades dry-run clean         [ ] keep-busy timer active (journalctl -u hourwell-keepbusy)
```
