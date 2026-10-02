# 17F-A2 Live Activation Checklist: every external manual action

Phase 17F-A1 made **no** Azure change. Everything below is outside the repository and needs the owner's approval and hands.
Each item maps to a row of [`activation-checklist.md`](activation-checklist.md).

| # | USER/AZURE ACTION REQUIRED | Details | Checklist row |
|---|---|---|---|
| A2-1 | **USER/AZURE ACTION REQUIRED — VM creation** | Standard_D4s_v5, Ubuntu Server 24.04 LTS, dedicated resource group, SSH public key only (no password), no B-series, no extensions beyond the Azure Linux agent / monitor agent, auto-shutdown **off** | 1 |
| A2-2 | **USER/AZURE ACTION REQUIRED — disk creation/attachment** | data disk A 32 GB Premium SSD (journal), data disk B 64–128 GB Premium SSD (Docker), attached as LUN 0 / LUN 1; never use the temporary disk. **Two separate managed disks, not two directories or partitions of one disk and not bind mounts:** activation requires three distinct storage roles (OS, journal, Docker) on three distinct devices — the preflight `storage` check (exit 22) refuses anything else, and a mount point alone does not qualify | 2, 5, 13 |
| A2-3 | **USER/AZURE ACTION REQUIRED — static public IP** | Standard SKU, static allocation, attached to the VM NIC | 1 |
| A2-4 | **USER/AZURE ACTION REQUIRED — NSG** | Inbound allow 443/tcp from Any; 22/tcp only from the admin IP/range (or Bastion / JIT); optional 80/tcp for ACME HTTP-01 + redirect. Deny 8787, 2375, 2376 and all else. Outbound: 443 (SmartAssess host, apt mirrors, ACME CA, image registries during builds). | 1, 16 |
| A2-5 | **USER/AZURE ACTION REQUIRED — DNS** | `runner.<domain>` A record → the static IP (TTL 300 during the pilot) | 3 |
| A2-6 | **USER/AZURE ACTION REQUIRED — production secrets** | Generate in the secret store: the runner request key and the callback key (independent, ≥ 32 chars, e.g. `openssl rand -hex 32`). Never reuse the existing sweep key. Never copy them into staging or preview environments. Place them only in `/etc/smartassess-runner/runner.env` (VM) and the SWA production settings. | 11, 12 |
| A2-7 | **USER/AZURE ACTION REQUIRED — SWA environment variables** | Production environment, in this order: `CODING_RUNNER_ENABLED=false` → `CODING_GRADING_CALLBACK_HMAC_KEY` → `CODING_RUNNER_HMAC_KEY` + `CODING_RUNNER_URL=https://runner.<domain>` → (Gate P2) → `CODING_RUNNER_ENABLED=true`. | 18, 20 |
| A2-8 | **USER/AZURE ACTION REQUIRED — preview environments (Gate PV)** | Verify in the portal that PR preview / staging environments do **not** receive the production Runner settings. If they would, set `CODING_RUNNER_ENABLED=false` for them, or disable preview environments, **before** A2-7. | 18 |
| A2-9 | **USER ACTION REQUIRED — test identities** | One teacher, one test student in a dedicated test class, one test assignment (smoke-matrix.md). No real students during A2. | 21–22 |
| A2-10 | **USER ACTION REQUIRED — recovery workflow** | Already configured (sweeps return HTTP 200). Confirm the repository variable `SMARTASSESS_GRADING_SWEEP_URL` + secret `CODING_GRADING_SWEEP_HMAC_KEY` are unchanged; agree the freshness threshold (proposed 240 min); enable failure notifications for the workflow. | 22–23 |
| A2-11 | **USER/AZURE ACTION REQUIRED — monitoring** | Pilot minimum: an external HTTPS availability probe of `https://runner.<domain>/healthz` (Azure Monitor availability test or equivalent) + email on failure; the VM's disk / CPU metrics alerts. | 23 |
| A2-12 | **USER/AZURE ACTION REQUIRED — disk snapshot policy** | Optional daily snapshot of data disk A (journal). Not required for grading correctness: authority lives in SmartAssess storage. | — |
| A2-13 | **USER ACTION REQUIRED — Go / No-Go** | Gate P1 (practice ≤ 40 s end to end, else Java/C# practice stays off), Gate P2 (near-max callback), Gate PV (previews), smoke matrices green, crash rehearsal done on staging / pre-activation pilot. | 21–23 |

Nothing in this list may be done by an automated session without the owner's explicit approval.
