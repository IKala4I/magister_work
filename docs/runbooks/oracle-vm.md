# Runbook — RecSys service on the Oracle Cloud VM (ADR-0009)

> Owner-run steps are marked **[owner]**; everything else is scripted in
> `services/recsys/deploy/` and re-verifiable with `verify.sh`. Never paste secrets into this
> file, the repo, or chat. **Locked out of SSH? Go straight to §5.**

## 0. Access model — read this first

**What is address-bound and what is not.**

| Path                                                                                       | Bound to your address? | Why                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The app: `https://hourwell-recsys.duckdns.org` (443) and the ACME challenge on 80          | **No — open to all**   | Security List `0.0.0.0/0` for 80/443; Caddy publishes only these two ports. Edge functions, participants' phones, CI's rollout check and monitoring all use this. |
| `ssh oracle-recsys` (22) — **your administration only**                                    | **Yes**                | Two independent locks, each a list of addresses (below). Nothing the running app does depends on them.                                                            |
| The box pulling images from GHCR, talking to the Supabase pooler, Let's Encrypt, apt, IMDS | No (outbound)          | Egress is unrestricted; the Security List's egress rule is `0.0.0.0/0`.                                                                                           |

So: **if the app misbehaves, your IP is not the cause.** `curl -sS https://hourwell-recsys.duckdns.org/healthz`
works from any network; if it fails, look at DNS, Caddy, the container, or the Security List's
80/443 rules — never at the SSH locks. If only `ssh` fails, it is (almost always) the locks: §5.

**The two SSH locks.** Port 22 must pass both; each is a list of `IP/32` (or CIDR) entries, and
**both are edited from any browser** — so a new network is never a lockout, it is two edits:

| Lock                            | Where it is enforced                       | Where you edit it                                                                                                                                                                                                                               | Takes effect |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **1 — Security List** (network) | Oracle's network layer, outside the VM     | OCI Console → Networking → Virtual cloud networks → `recsys-vcn` → Security Lists → Default Security List → Ingress Rules (one rule per address, port 22)                                                                                       | immediately  |
| **2 — host allow-list** (VM)    | `iptables` chain `HOURWELL-SSH` on the box | OCI Console → Compute → Instances → `recsys-oracle` → **Tags** → freeform tag **`ssh-allow`** = `A/32,B/32,…` (or `any`). The box reads it from the instance metadata service every minute (`hourwell-ssh-allow.timer`) and rewrites the chain. | ≤ 60 s       |

Both accept several addresses. The tag is the source of truth for lock 2; `sudo hourwell-ssh-allow
apply …` on the box is only the bootstrap / emergency path and is overridden by the tag within a
minute. If IMDS is unreachable or the tag is missing or unparsable, **the box keeps its current
list** — the list is never emptied, never opened by accident.

**Your current public IP** (what both lists must contain): `curl -s https://api.ipify.org` on the
laptop (IPv4 — the box has no public IPv6). Hotspots, café Wi-Fi and some ISPs sit behind
carrier-grade NAT and can change your address mid-day: if `ssh` suddenly refuses, check the IP
first. Entries are `/32` (one address); a `/24` is acceptable for a home ISP that rotates within a
block, and `any` on the tag turns lock 2 off (lock 1 still holds) — say so in the DPIA if you do.

**New network — the routine (2 min, browser only):**

1. `curl -s https://api.ipify.org` → `X`.
2. Lock 1: Security List → **Add Ingress Rules** → Source CIDR `X/32`, IP Protocol TCP,
   Destination Port Range `22`, Description `ssh owner`. (Remove addresses you no longer use.)
3. Lock 2: instance → Tags → edit `ssh-allow` → append `,X/32`.
4. Wait a minute; `ssh oracle-recsys true`.

With the OCI CLI configured (§4.4, optional) steps 2–3 are one line:
`services/recsys/deploy/ssh-allow.sh add $(services/recsys/deploy/ssh-allow.sh me)`.

**The trade-off, stated plainly.** The box holds `DATABASE_URL` — a credential to the database
with every participant's rows — and the backend key. A port 22 open to the internet would be
guarded by key-only sshd alone; that is one bug (an OpenSSH pre-auth vulnerability, and there
have been some) away from the whole dataset. That is the wrong risk to accept for a research
dataset. The price is the address management above: two lists, edited from a browser, plus a
recovery ladder (§5) that is written out so that a lockout costs minutes, not a day.
Alternatives considered and not adopted (more moving parts, same outcome): OCI Bastion sessions
(free, IAM-authenticated, per-session; adopt if the list edits become a chore), a Tailscale mesh
(third-party control plane).

## 1. The box (as provisioned 2026-08-27)

| Item     | Value                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| Tenancy  | Oracle Cloud Free Tier, home region **France South / Marseille (`eu-marseille-1`)**                             |
| Instance | `recsys-oracle`, VM.Standard.A1.Flex, **2 OCPU / 12 GB**, Ubuntu 24.04 Minimal aarch64                          |
| Network  | VCN `recsys-vcn`, public subnet `10.0.0.0/24` (private IP `10.0.0.163`), reserved public IPv4 **84.235.238.25** |
| Ingress  | Security List: 80, 443 from `0.0.0.0/0`; 22 — lock 1 (§0)                                                       |
| Access   | `ssh oracle-recsys` (alias in `~/.ssh/config`, key `~/.ssh/oracle_recsys.key`, user `ubuntu`)                   |
| Runtime  | Docker 29.1 + Compose v2.40, `ubuntu` in the `docker` group (root-equivalent — the only user)                   |
| Budget   | 1 EUR budget alert; Always Free resources stay free on any plan; paid shapes only bill after a PAYG upgrade     |

## 2. What runs where

```
Supabase edge functions (eu-west-1) ──HTTPS──▶ Caddy :443 ──▶ recsys :7860 (compose network only)
                                                 │                 │
                                    Let's Encrypt cert (auto)   Postgres pooler (eu-west-1) via DATABASE_URL
GitHub Actions ──build linux/arm64──▶ GHCR ◀──pull every 5 min── hourwell-rollout.timer (no inbound SSH from CI)
OCI Console ── tag ssh-allow ──▶ IMDS ◀──read every 1 min── hourwell-ssh-allow.timer → iptables chain HOURWELL-SSH
```

Files on the box: `/home/ubuntu/hourwell/{compose.yml,Caddyfile,.env}` (from
`services/recsys/deploy/`), `/usr/local/bin/{hourwell-rollout,hourwell-ssh-allow}`,
`/etc/hourwell/ssh-allow` (last applied list), six systemd units. **No participant data at
rest**: the only volumes are Caddy's certificate store and its rotated access log
(`docs/privacy/README.md` §"Self-hosted RecSys VM").

## 3. Hostname + TLS — DuckDNS **[owner — done 2026-08-28]**

`hourwell-recsys.duckdns.org → 84.235.238.25` (verified with `dig`). Why DuckDNS: free, no card,
a stable name for a reserved IP, and on the Public Suffix List, so Let's Encrypt's
per-registered-domain rate limit applies to our subdomain alone. Caddy proves control on :80
(HTTP-01) or :443 (TLS-ALPN-01), both open. The name is recorded in three places: `RECSYS_HOST`
in the box `.env`, the GitHub variable `RECSYS_HOST` (§8), `RECSYS_URL` in the Supabase secrets
(§8) — change all three together if it ever changes. Optional: keep the DuckDNS token in a
password manager; an updater is only needed if the IP is ever un-reserved.

## 4. Hardening — before `.env` holds `DATABASE_URL`

### 4.1 Lock 1: Security List, port 22 from your addresses only **[owner, console]**

OCI Console → Networking → Virtual cloud networks → `recsys-vcn` → Security Lists → _Default
Security List_ → **Ingress Rules**:

- Edit the rule with destination port **22** whose source is `0.0.0.0/0`: set Source CIDR to
  `<YOUR_IP>/32` (from `curl -s https://api.ipify.org`). Save. For more addresses, **Add Ingress
  Rules** (Source CIDR `<IP>/32`, TCP, destination port 22) — one rule each.
- Confirm there is **no** remaining rule allowing 22 from `0.0.0.0/0`; keep **80** and **443**
  from `0.0.0.0/0`; ICMP rules can stay.
- Removing an address: tick its rule → **Remove**.

### 4.2 Lock 2: the host allow-list — scripted, then owned by the tag

From the laptop (repo root), with every address you use today:

```bash
scp -r services/recsys/deploy oracle-recsys:~/hourwell/deploy
ssh oracle-recsys 'sudo bash ~/hourwell/deploy/harden.sh apply <IP1> [<IP2> ...]'
ssh oracle-recsys true && echo "ssh still fine"       # from a NEW terminal, before you close the old one
```

`harden.sh apply` does, idempotently:

- **sshd** drop-in `/etc/ssh/sshd_config.d/60-hourwell.conf`: `PasswordAuthentication no`,
  `KbdInteractiveAuthentication no`, `PermitRootLogin no`, `AllowUsers ubuntu`, `MaxAuthTries 3`,
  no X11/agent/TCP forwarding; `sshd -t` then reload. (The OCI image already ships
  `60-cloudimg-settings.conf` with password auth off; the drop-in makes the whole set explicit —
  check with `sudo sshd -T | grep -Ei 'passwordauthentication|permitrootlogin|allowusers'`.)
- **unattended-upgrades** (Minimal ships without it) + `ca-certificates curl jq
iptables-persistent`; daily lists + upgrade; automatic reboot **04:15 UTC** when required
  (containers return via `restart: unless-stopped`).
- **Docker daemon** `/etc/docker/daemon.json`: `live-restore`, json-file logs 3 × 10 MB,
  `no-new-privileges`; unix socket only (`verify.sh` fails if anything listens on 2375/2376).
- **GRUB** `/etc/default/grub.d/60-hourwell.cfg`: a 3-second menu on the serial console so the
  last-resort recovery (§5 ladder C) is actually reachable (the cloud image hides it).
- **Host allow-list**: installs `/usr/local/bin/hourwell-ssh-allow` + `hourwell-ssh-allow.timer`
  (every minute), then `hourwell-ssh-allow apply <IPs>`: chain `HOURWELL-SSH` = one `ACCEPT` per
  address; `INPUT` sends new port-22 connections to the chain and rejects what falls through;
  every other port-22 accept (the OCI default) is removed; `/etc/iptables/rules.v4` is
  regenerated from a host-only template (Docker's chains are deliberately not persisted — Docker
  recreates them at start, and restoring stale copies before Docker is a known reboot hazard).
  There is no separate "persist" step any more: what you see is what survives a reboot.

Then **[owner]** put the same addresses in the instance tag so lock 2 is browser-editable from
now on: Console → Compute → Instances → `recsys-oracle` → **Tags** → **Add tags** → freeform,
key `ssh-allow`, value `<IP1>/32,<IP2>/32`. Within a minute:
`ssh oracle-recsys 'sudo hourwell-ssh-allow status'` shows `tag ssh-allow = …` and the live chain.

Note on Docker and iptables: containers' published ports go through the `DOCKER` chain, not
`INPUT` — the host firewall above governs ssh; **compose.yml is the firewall for the app**: only
`caddy` has `ports:`, `recsys` is `expose`-only. `verify.sh` checks that.

### 4.3 The serial-console password (recovery ladder B) **[owner, once]**

The serial console (§5) shows an ordinary login prompt, and OCI images ship every account
locked — so without this step the console is a screen you cannot get past. Set a
**console-only** password for `ubuntu` (sshd has password auth off, so it is unusable over the
network; root stays locked). The session generated one into `~/.hourwell/console-password` on the
laptop and applied it with:

```bash
cat ~/.hourwell/console-password | ssh oracle-recsys 'sudo bash ~/hourwell/deploy/harden.sh console-password'
```

**Copy it into your password manager now** — the laptop file is the only other copy. To rotate:
write a new one to the file and re-run the line.

### 4.4 Optional: the OCI CLI for one-line list edits **[owner, once]**

`brew install oci-cli` → `oci setup config` (asks for the user OCID, tenancy OCID, region
`eu-marseille-1`; generates an API key) → OCI Console → Profile → My profile → **API keys** →
**Add API key** → upload `~/.oci/oci_api_key_public.pem`. Then:

```bash
services/recsys/deploy/ssh-allow.sh init                 # caches the instance + security-list OCIDs in ~/.hourwell/oci-ids
services/recsys/deploy/ssh-allow.sh list                 # what both locks allow
services/recsys/deploy/ssh-allow.sh add    <IP>          # both locks (also removes any 0.0.0.0/0 port-22 rule)
services/recsys/deploy/ssh-allow.sh remove <IP>          # both locks; refuses to remove the last address
```

`ssh-allow.sh selftest` exercises its JSON transforms without the CLI; the CLI calls themselves are
exercised the first time you run `init`/`list` (⛔ owner step — until then, use the Console).

### 4.5 Verify (any time)

```bash
ssh oracle-recsys 'bash ~/hourwell/deploy/verify.sh <YOUR_IP>'     # OK/FAIL/INFO per check, "ALL OK"
ssh oracle-recsys 'sudo hourwell-ssh-allow status'                  # tag vs applied vs live chain vs timer
```

## 5. Locked out of SSH — the recovery ladder (for a stressed reader)

You cannot break the app from here: 80/443 are not involved. Work down the ladder; each rung is
independent of the one above. Keep the OCI Console open in a browser — it works from any network.

### Ladder A — it is the address (9 cases out of 10)

1. `curl -s https://api.ipify.org` → this is `X`. Is `X` on **both** lists?
   - Lock 1: Console → Networking → Virtual cloud networks → `recsys-vcn` → Security Lists →
     Default Security List → Ingress Rules → is there a rule `X/32`, TCP, port 22? If not:
     **Add Ingress Rules** → Source CIDR `X/32`, IP Protocol TCP, Destination Port Range 22 →
     Add.
   - Lock 2: Console → Compute → Instances → `recsys-oracle` → **Tags** → freeform `ssh-allow`
     contains `X/32`? If not: edit the tag (pencil icon) → append `,X/32` → Save.
2. Wait 60 seconds (lock 2 syncs once a minute). `ssh -v oracle-recsys true`.
   - `Connection timed out` → lock 1 is still blocking (the network layer drops silently).
   - `Connection refused` / `No route to host` → lock 2 (the host rejects with an ICMP error).
   - `Permission denied (publickey)` → the locks are fine; it is the key (`~/.ssh/config` alias,
     `~/.ssh/oracle_recsys.key` permissions 600, user `ubuntu`).
3. Still nothing after two minutes with `X` on both lists? Ladder B.

### Ladder B — serial console via Cloud Shell (no network path to the VM needed)

The instance console connection is out-of-band: it does **not** pass the Security List, the host
firewall, or sshd. It shows the VM's serial terminal — a plain Linux login prompt.

1. Console → **Compute → Instances → `recsys-oracle`**.
2. Under **Resources** (left column; on newer layouts the **OS Management** tab, scroll to
   **Console connection**) → **Console connection** → **Launch Cloud Shell connection**.
   (If a connection already exists it asks whether to replace it: `y`, Enter.) Cloud Shell opens
   in the lower half of the page and connects; this needs your user to be allowed
   `manage instance-console-connection` — the tenancy administrator (you) is.
3. A blank screen is normal: press **Enter** two or three times until `recsys-oracle login:`
   appears. (If it says the console is limited to one connection at a time: someone — probably
   an earlier tab of yours — is connected; wait five minutes or close that tab.)
4. Log in as `ubuntu` with the **console password** (`~/.hourwell/console-password` on the
   laptop, or your password manager). This password does not work over SSH — by design.
5. Now fix lock 2 from inside (lock 1 you fix in the browser, ladder A):

   ```bash
   sudo hourwell-ssh-allow status                 # what the tag says vs what is live
   sudo hourwell-ssh-allow apply <X>/32 [<others>] # immediate; also persisted
   sudo systemctl status hourwell-ssh-allow.timer # if the tag was right but nothing synced
   sudo journalctl -u hourwell-ssh-allow -n 20
   ```

   If `apply` prints that the tag is set, put `X/32` in the tag too (else the timer removes it
   again within a minute). If sshd itself is the problem: `sudo sshd -t`, `sudo systemctl
status ssh`, `sudo journalctl -u ssh -n 50`.

6. Leave with `exit`, then close the Cloud Shell connection (`~.` on a new line ends the SSH
   session inside Cloud Shell). Connections expire after 24 h anyway.

### Ladder C — no console password (lost, or never set): reset it through GRUB

Only the serial console is needed (ladder B steps 1–3), plus a reboot of the instance.

1. In the serial console, from the Console page: **More actions → Reboot** (or `Reboot` on the
   instance page) — keep the serial window focused.
2. A GRUB menu appears for **3 seconds** (`harden.sh` set this; the cloud default hides it).
   Press **any arrow key** immediately to stop the countdown, then **`e`** on the first entry.
3. Find the line starting with `linux` (arrow down). At its end add a space and
   `init=/bin/bash`. Press **Ctrl+X** to boot.
4. At the `bash` prompt (`root@(none)`): `mount -o remount,rw /` → `passwd ubuntu` (type the new
   password twice) → `sync` → `reboot -f`.
5. Continue with ladder B from step 3. Then store the new password in `~/.hourwell/console-password`
   and the password manager; the sshd drop-in still refuses passwords over the network.

If GRUB does not appear (you were late), just **Reboot** again from the Console and retry.

### Ladder D — the laptop is gone (SSH key and console password lost)

Ladder C (it needs only OCI Console credentials), then from the recovered console session add
a new public key to `/home/ubuntu/.ssh/authorized_keys` and update `~/.ssh/config` on the new
laptop; rotate the credentials in `.env` (§11) because the old laptop held them.

## 6. Install the app

1. **[owner]** The backend key is generated in `~/.hourwell/HOURWELL_SERVICE_KEY` on the laptop
   (64 hex); the same value goes to the box `.env`, to `supabase secrets`, and to Vault (§8).
   Rotation: §11.
2. On the box, `~/hourwell/deploy/install.sh` copies compose/Caddyfile, creates `.env` from
   `.env.example` on first run and exits so you can fill it:

```bash
ssh oracle-recsys 'bash ~/hourwell/deploy/install.sh'      # first run: creates ~/hourwell/.env, exit 3
ssh oracle-recsys 'nano ~/hourwell/.env'                   # RECSYS_HOST, DATABASE_URL, HOURWELL_SERVICE_KEY
```

`DATABASE_URL`: Supabase dashboard → project `uapiuehjcntilwdmpojk` → **Connect** → the
**Transaction pooler** tab (port 6543, role `postgres.uapiuehjcntilwdmpojk`, host
`aws-1-eu-west-1.pooler.supabase.com` for this project — the cluster number is project-specific;
`aws-0` answers "tenant not found"), the database password URL-encoded. **Not the "Direct
connection" tab**: `db.<ref>.supabase.co:5432` resolves to IPv6 only and the VM has no IPv6 —
the symptom is `Network is unreachable` in `docker compose logs recsys` and an unhealthy
container (happened 2026-08-28; fixed by rewriting host/user/port in place). Append
`?sslmode=require` so the driver can never fall back to plaintext. The service disables psycopg's
server-side prepared statements (`prepare_threshold=None`) because the transaction pooler does not
support them. `SUPABASE_URL` is the project URL. `RECSYS_HOST` from §3.

3. Second run installs the rollout binary + systemd timers, validates the compose file, pulls
   the image and starts the stack:

```bash
ssh oracle-recsys 'bash ~/hourwell/deploy/install.sh'
ssh oracle-recsys 'cd ~/hourwell && docker compose logs --tail 40 caddy'   # certificate obtained
curl -sS https://hourwell-recsys.duckdns.org/healthz | jq .                # storage: postgres, arch: aarch64, build: <sha>
```

The image `ghcr.io/ikala4i/hourwell-recsys` is public (a public repo's workflow package inherits
its visibility — anonymous pull verified 2026-08-27). If `docker compose pull` ever answers
"denied": GitHub → repo → **Packages** → `hourwell-recsys` → Package settings → visibility.

## 7. Rollout and keep-busy timers (installed by `install.sh`)

- `hourwell-rollout.timer` → every 5 min `docker compose pull && up -d`; recreates only when
  `:latest` changed; prunes old images; `journalctl -u hourwell-rollout -n 20`.
- `hourwell-keepbusy.timer` → hourly `bench_solve.py --runs 100` inside the pinned container
  (~3 min of CPU): Oracle reclaims an idle Always Free instance only when CPU **and** network
  **and** memory are all below their 7-day thresholds, so keeping CPU p95 ≥ 20 % is enough.
  **Keep it on regardless of plan** — Oracle's docs do not say a PAYG upgrade exempts instances
  (ADR-0009 Q2, corrected; PAYG deferred by the owner until before enrollment). Check it ran:
  `journalctl -u hourwell-keepbusy -n 3`. (ADR-0011 forecast that P11's training container
  would replace this load "on the same timer slot" — **corrected by ADR-0015 §1**: a single
  nightly run cannot keep the 7-day CPU p95 above the reclaim threshold, so the hourly
  keep-busy STAYS and the training run is an additional nightly timer, below.)
- `hourwell-train.timer` → daily 00:30 UTC `docker compose run --rm training --nightly`
  (P11, ADR-0015): the in-region training + OPE pipeline (§10). Check:
  `journalctl -u hourwell-train -n 20`.
- Manual rollout: `ssh oracle-recsys 'sudo -u ubuntu /usr/local/bin/hourwell-rollout'`.
- Pin a version: set `RECSYS_TAG=<sha12>` in `.env` (CI publishes `:sha` and `:latest`), re-run
  the rollout; unpin by setting `latest` back.

## 8. Wire the secrets (three places, one key) **[owner]**

| Where                         | What                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Box `~/hourwell/.env`         | `HOURWELL_SERVICE_KEY`, `DATABASE_URL`, `SUPABASE_URL`, `RECSYS_HOST` (§6); **P11:** `SUPABASE_SERVICE_ROLE_KEY` = an **sb_secret\_...** key (Dashboard → API keys → Secret keys; the legacy service_role JWT also works) + `ARCHIVE_SALT` (§10) |
| Supabase function secrets     | from the repo root: `supabase secrets set HOURWELL_SERVICE_KEY=<key> RECSYS_URL=https://hourwell-recsys.duckdns.org` (needs `supabase login` once)                                                                                               |
| Supabase Vault (cron tick)    | run `~/.hourwell/vault-secrets.sql` in the SQL editor (`hourwell_functions_url`, `hourwell_service_key`, `hourwell_anon_key`)                                                                                                                    |
| GitHub → Settings → Variables | **`RECSYS_HOST`** = `hourwell-recsys.duckdns.org` (enables the workflow's rollout check). **No GitHub secrets are needed** — CI never SSHes to the box.                                                                                          |

Set `RECSYS_URL` and the GitHub variable only after `https://<host>/healthz` answers, so fallback
telemetry and CI stay clean.

## 9. Verification after the first deploy (the three blocked measurements)

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

## 10. Operations

| Task             | Command / where                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Logs             | `cd ~/hourwell && docker compose logs --tail 100 -f recsys` · Caddy access log: `docker compose exec caddy tail -f /data/access.log` |
| Restart          | `docker compose restart recsys` (Caddy keeps serving 502 for a few seconds)                                                          |
| Reboot           | `sudo reboot` — everything returns (compose restart policy + timers; the host-only `rules.v4` is restored before Docker starts)      |
| SSH locks        | §0 routine; `sudo hourwell-ssh-allow status`; `ssh-allow.sh list` (CLI)                                                              |
| Disk             | `df -h /`; images are pruned by the rollout; `docker system df`                                                                      |
| OS updates       | automatic (§4); manual: `sudo unattended-upgrade -d`; reboot required? `[ -f /var/run/reboot-required ]`                             |
| Certificate      | Caddy renews itself; check `docker compose logs caddy \| grep -i certificate`                                                        |
| Cron tick health | Supabase SQL: `select status_code, left(content,120), created from net._http_response order by created desc limit 5;`                |
| Decommission     | `docker compose down -v` (removes the cert volume) → terminate the instance in the console; rotate the DB password + keys (§11)      |

## 11. Rotation and incident response

- **HOURWELL_SERVICE_KEY leaked** → generate a new one (`openssl rand -hex 32`); update the box
  `.env` + `docker compose restart recsys`; `supabase secrets set HOURWELL_SERVICE_KEY=<new>`;
  Vault: `select vault.update_secret((select id from vault.secrets where name='hourwell_service_key'), '<new>');`.
- **DATABASE_URL / DB password leaked** → Supabase dashboard → Database → reset password; update
  `.env`; restart. Consider the least-privilege `recsys_service` role (revisit.md, P12).
- **SSH key leaked** → new keypair; append the new public key to `/home/ubuntu/.ssh/authorized_keys`
  (over ssh, or via the serial console §5 B); remove the old line; update `~/.ssh/config`.
- **Console password leaked** → `harden.sh console-password` with a new one (§4.3); it is only
  usable by someone who can also open the OCI Console as you.
- **Box compromised** → terminate the instance, rotate everything above, redeploy from CI (the
  image is reproducible; nothing else lives on the box).

## 12. Re-verification checklist (copy into the phase report)

```
[ ] verify.sh → ALL OK                       [ ] Security List: 22 only from your /32s; 80/443 open
[ ] tag ssh-allow set = the same addresses   [ ] console password in the password manager; serial login tested once
[ ] https://<host>/healthz build == main sha [ ] GitHub variable RECSYS_HOST set (after healthz answers)
[ ] Vault: attribution_sweep_tick() → posted [ ] supabase secrets: RECSYS_URL + HOURWELL_SERVICE_KEY
[ ] unattended-upgrades dry-run clean         [ ] keep-busy timer active (journalctl -u hourwell-keepbusy)
```

## 10. The training/analysis container (P11 — ADR-0011 option A, ADR-0015)

- **What runs:** `ghcr.io/ikala4i/hourwell-training` (built by `deploy-training.yml`, arm64,
  in-image ALS smoke) as the one-shot compose service `training` (profile `training`, 2-cpu
  cap). Nightly via `hourwell-train.timer` (03:00 UTC): NFR-S3 whitelisted export → EB prior
  refresh behind the eval gate → ALS + k-means → fold-in (≥ 30 outcomes, unvisited-cell-only
  refresh) → K = 32 MC propensity backfill → the aggregate report. Artifacts + reports go to
  the private `models` Storage bucket (EU); `model_registry` records every version.
- **Rollout:** the 5-min rollout timer pulls this image too (`--profile training pull`);
  `docker compose up -d` never starts it (profile-gated) — only the timer or a manual run does.
- **Manual run:** `ssh oracle-recsys 'cd ~/hourwell && docker compose run --rm training --nightly --out-dir /tmp/out'`
  → the JSON summary prints; the report lands in the bucket under `reports/<date>/`.
- **Archive (study end only):** `docker compose run --rm training --archive --out-dir /tmp/archive`
  — Parquet with SHA-256(uid + `ARCHIVE_SALT`) ids (ADR-0015 §17). `ARCHIVE_SALT` lives only
  in `.env`; never rotate it mid-study, never copy row-level output to a laptop (privacy §7).
- **No credentials, no promotion:** without `SUPABASE_SERVICE_ROLE_KEY` the run completes,
  records `artifact_uri = NULL`, refuses to promote, and says so on stderr — CI (`train.yml`)
  runs exactly that way on a synthetic cohort (G3: no participant data near CI).

## 11. Supabase key formats — who takes what (audited 2026-08-31)

The dashboard now issues **new-generation keys** (`sb_publishable_...`, `sb_secret_...`) and
tucks the legacy anon/service_role JWTs into a "Legacy" tab. The two generations ride
DIFFERENT headers (migration guide, verified 2026-08-31): **new keys are not JWTs and are
rejected on `Authorization: Bearer` — `apikey` header only**; legacy JWTs work on both.
Legacy keys are scheduled for deprecation **end of 2026**. Every consumer, audited from code

- live configuration (formats classified without reading values):

| Consumer                                                                   | Key + where it rides                                                                                                                         | sb\_\* OK?                                                                                                                                                                  | Legacy JWT OK? | Verified how                                                                                                                                                                                                                                      | Configured now                                                                                                                                                                              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile client (`apps/mobile`, supabase-js 2.112.4)                         | `EXPO_PUBLIC_SUPABASE_ANON_KEY` (repo `.env`); the SDK sends it on `apikey`, user session JWT on `Authorization`                             | ✅                                                                                                                                                                          | ✅             | Docs (publishable = anon drop-in in `createClient`) + EMPIRICAL: the P11 live smoke ran sign-in/RLS/PostgREST 21/21 with the configured key                                                                                                       | **new publishable** (prefix-classified)                                                                                                                                                     |
| Live-smoke scripts (`docs/verification/p*-live-smoke.mjs`, `p10-perf.mjs`) | same `.env` key via supabase-js                                                                                                              | ✅                                                                                                                                                                          | ✅             | same as above                                                                                                                                                                                                                                     | **new publishable**                                                                                                                                                                         |
| Edge functions ×9, user path (`userClient`)                                | platform-INJECTED `SUPABASE_ANON_KEY` (legacy) as `createClient` key; the caller's user JWT overrides `Authorization`                        | ➖ (would need `SUPABASE_PUBLISHABLE_KEYS` JSON — see below)                                                                                                                | ✅ (in use)    | Code (`Deno.env.get('SUPABASE_ANON_KEY')` in all user-path functions); `supabase secrets list` shows the platform injects BOTH generations (`SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS` JSON vars + the legacy pair, refreshed 2026-08-30) | legacy JWT (injected)                                                                                                                                                                       |
| Edge functions, admin path (`auth.admin`, service writes)                  | platform-INJECTED `SUPABASE_SERVICE_ROLE_KEY` (legacy)                                                                                       | ➖ (same: would read `SUPABASE_SECRET_KEYS` JSON)                                                                                                                           | ✅ (in use)    | Code; every function has `verify_jwt = false` (9/9 in config.toml) so no gateway JWT parse anywhere                                                                                                                                               | legacy JWT (injected)                                                                                                                                                                       |
| Cron tick — retention (P10, `retention_sweep_tick`)                        | Vault `hourwell_anon_key` on **`apikey` only** + `x-service-key` backend key                                                                 | ✅ (docs-correct)                                                                                                                                                           | ✅             | SQL read (migration 20260830120000); live: retention run succeeded                                                                                                                                                                                | **new publishable** in Vault (set 2026-08-28)                                                                                                                                               |
| Cron tick — attribution sweep (P7, `attribution_sweep_tick`)               | Vault `hourwell_anon_key` on `Bearer` **and** `apikey` (P7 shape)                                                                            | ⚠️ tolerated only because `verify_jwt = false` and the daily path gates on `x-service-key` (handler.ts:473, constant-time) — a Bearer publishable key is documented-invalid | ✅             | SQL read; LIVE: 6 h of uniform 200s in `net._http_response`, 395 succeeded runs/7 d                                                                                                                                                               | **fixed by migration `20260831140000_p11_sweep_header`** (apikey-only, the P10 shape) — pending push                                                                                        |
| RecSys service (VM)                                                        | none — `DATABASE_URL` (Postgres password), `HOURWELL_SERVICE_KEY` (own 64-hex), JWKS URL for user JWTs                                       | n/a                                                                                                                                                                         | n/a            | `auth.py` (JWKS + service key only); Vault `hourwell_service_key` live-classified as 64-char non-key                                                                                                                                              | no Supabase API key                                                                                                                                                                         |
| Training container (VM)                                                    | `SUPABASE_SERVICE_ROLE_KEY` env → Storage REST; `StorageConfig.auth_headers()` picks per key kind (`sb_secret_` → `apikey` only; JWT → both) | ✅ **recommended**                                                                                                                                                          | ✅             | Code + unit tests pin both header shapes (`test_registry.py`); first upload fails loudly on a bad key (no silent retry-never)                                                                                                                     | owner-set on the VM — check formats only: `ssh oracle-recsys 'grep -oc "^SUPABASE_SERVICE_ROLE_KEY=sb_secret_" ~/hourwell/.env; grep -oc "^SUPABASE_SERVICE_ROLE_KEY=eyJ" ~/hourwell/.env'` |
| CI                                                                         | none hosted (G3); the local stack mints its own demo legacy keys                                                                             | n/a                                                                                                                                                                         | n/a            | workflow grep: no `SUPABASE_*` secret anywhere                                                                                                                                                                                                    | none                                                                                                                                                                                        |
| supabase CLI paths (`db push`, `gen types`, `dbQuery`, `pgtap-linked.sh`)  | CLI login token (management API)                                                                                                             | n/a                                                                                                                                                                         | n/a            | not an API-key consumer                                                                                                                                                                                                                           | —                                                                                                                                                                                           |

**Standing rule:** a new-generation key never goes in `Authorization: Bearer` — anywhere. When
the legacy keys are disabled (deprecation, end 2026): the nine edge functions must switch from
the injected legacy vars to the `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS` JSON vars
(one shared helper, one PR) — tracked in `docs/decisions/revisit.md`.

## 12. Tailscale admin path (ADR-0017, accepted 2026-08-31) — **INSTALLED + VERIFIED 2026-08-31**

> Status: tailscaled 1.102.3 on the box, node `recsys-oracle` (100.101.44.91), owner's Mac +
> phone in the tailnet, `tailscale up --ssh` applied, **key expiry disabled** (admin console,
> owner-verified), tailnet `ssh ubuntu@recsys-oracle` proven from the Mac while the public
> allow-listed path stayed live. The steps below remain as the reinstall/recovery reference.

Daily administration moves to the tailnet; **nothing below touches the two SSH locks (§4) or
the recovery ladder (§5) — they stay the security boundary and break-glass, unchanged.**

1. **Create the tailnet** (once, any browser): tailscale.com → sign up (free Personal plan:
   6 users, unlimited devices, Tailscale SSH included). Install the client on your laptop
   (and phone — it is the recovery device when the laptop's network is hostile).
2. **Install on the VM** (over today's SSH path, or the serial console if needed):
   `curl -fsSL https://tailscale.com/install.sh | sh` (the official installer; Ubuntu 24.04
   arm64 is supported).
3. **Bring it up with Tailscale SSH:**
   `sudo tailscale up --ssh --hostname recsys-oracle`
   — authenticate via the printed URL, logged in as YOUR account (do not tag the node:
   an owner-owned device works with the tailnet's default policy; tags need extra ACL
   work for zero benefit here).
4. **Key expiry — the one server gotcha:** node keys expire after ~180 days and an expired
   server key means the tailnet path silently dies mid-study. Admin console → Machines →
   `recsys-oracle` → **Disable key expiry**. Do it immediately.
5. **Connect:** `ssh ubuntu@recsys-oracle` from a tailnet device. Note: **Tailscale SSH
   terminates inside tailscaled**, so the `HOURWELL-SSH` iptables chain never sees it —
   the chain keeps guarding public port 22 exactly as before. (Plain sshd over the tailnet
   IP WOULD hit the chain and be dropped — that is fine and intentional; use Tailscale
   SSH.)
6. **Verify both paths** (implementing session): tailnet `ssh` works from a network NOT on
   the allow-list; the old `ssh oracle-recsys` (allow-listed network) still works;
   `verify.sh` unchanged.
7. **Explicitly deferred** (ADR-0017): narrowing the public 22 Security-List rule. Revisit
   only after weeks of tailnet comfort, and never before the study ends.
8. Data-protection note recorded in `docs/privacy/README.md` §3: the coordination server
   (US) sees admin device names/keys/endpoints only; traffic is WireGuard end-to-end;
   no participant data ever transits Tailscale — not an Art. 28 processor for study data.
