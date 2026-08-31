# ADR-0017 — VM administration path: Tailscale vs the IP allow-lists (analysis only)

- **Date:** 2026-08-31
- **Status:** **accepted — owner decision 2026-08-31: option T** (Tailscale for daily
  admin; allow-lists + serial console stay the security boundary and break-glass).
  Implementation rides the owner's home-session VM work (P11 keys + install.sh) —
  runbook §15 is written and ready; nothing runs until then.
- **Anchors:** ADR-0009 §Decision 4–5 (hardening: port 22 behind two address locks);
  runbook §0 (access model), §4 (locks), §5 (recovery ladder); privacy README §3
  (self-hosted VM responsibilities).

## Context

SSH to `recsys-oracle` sits behind two address-bound locks (Oracle Security List + the
tag-driven `HOURWELL-SSH` iptables chain). Both are browser-editable, so a new network is
"two edits, ≤ 60 s" — in theory. In practice (2026-08-31): the owner, on a foreign network,
fell back to the **serial console, which mangles pasted input**, and deferred a queued
owner step (the P11 VM keys) until back home. That is the recurring cost being weighed:
address-bound admin access vs a network-independent identity-bound path.

## Facts (verified 2026-08-31; pricing as published Aug 2026)

- **Tailscale free Personal plan:** 6 users, unlimited user devices, 50 tagged resources,
  ACLs, and **Tailscale SSH included** — $0, no card. (The VM would be one tagged
  resource; the owner's laptop + phone are user devices.)
- **Transport:** WireGuard, end-to-end encrypted; the coordination server (US) exchanges
  public keys and endpoints; DERP relays cannot read traffic. With the VM's public IPv4,
  connections are typically direct (outbound UDP — no new INBOUND Security List rule).
- **Data-protection footprint:** admin-plane only. No participant data flows through
  Tailscale — it would carry the same SSH sessions that today ride the open internet to
  port 22. Metadata at the coordination server: device names/keys/IPs of the ADMIN
  devices. Not an Art. 28 processor for study data; worth one recorded line in privacy
  README §3, nothing more.

## Options

**A — Status quo (two locks + serial-console ladder).** Zero new parties; fully scripted;
already survived one adversarial pass. Cost: every new network = two console edits; the
break-glass path (serial console) is genuinely painful (today's evidence); a mistyped tag
still means the ladder.

**T — Tailscale as the admin path, locks kept as break-glass.** `tailscaled` on the VM
(tagged), owner devices in the tailnet; SSH over the tailnet address (or Tailscale SSH,
which also moves auth to tailnet identity + ACLs). Port 22's public locks stay exactly as
they are — unused day-to-day, available if the tailnet ever fails, alongside the serial
ladder. Cost: one more daemon on the box (a well-audited one); a US-company control plane
for ADMIN connectivity metadata; dependency on Tailscale's availability for the
comfortable path (never the only path).

**W — Self-hosted WireGuard on the VM.** No third party at all, but the VM itself becomes
the VPN endpoint: when the box or its wg config is the thing that broke, you are back on
the serial console — it shrinks the very failure mode it should cover. More ops, no
control-plane independence gained where it matters.

## Recommendation

**T** — install Tailscale for daily administration, keep BOTH existing locks and the
recovery ladder untouched as break-glass, and (only later, optionally, after weeks of
comfort) consider narrowing the public 22 rule. Rationale: the two-lock design stays the
security boundary of record (nothing is loosened); Tailscale removes exactly the recurring
pain (address churn, foreign networks, serial-console paste) at $0; the failure story is
strictly better (tailnet down → today's path still works). W is recorded as rejected: it
couples the recovery path to the machine being recovered.

**If accepted, implementation is one short runbook section** (install, `tailscale up
--ssh` or sshd-on-tailnet, tag + ACL, one privacy §3 line) — deliberately NOT done here.

## Consequences (once decided)

- A: nothing changes; this ADR records why.
- T: runbook §4 gains the tailnet path + §5 ladder gains "step 0: try the tailnet";
  privacy README §3 gains the admin-metadata line; device-checklist unaffected.
