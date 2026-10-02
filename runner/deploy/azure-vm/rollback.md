# Rollback: Coding Runner Pilot

**Principle:** roll back **configuration first**, code only when the defect is in code. Disabling the Runner never makes
anything zero. Every behaviour below is verified in the current source.

## R1. Primary rollback: stop new Runner work (≈ 1 minute)
| Action | Where | Effect (code-verified) |
|---|---|---|
| Set **`CODING_RUNNER_ENABLED=false`** | SWA app settings (⚠ USER/AZURE) | `readCodingRunnerConfig` → `{ enabled: false, reason: "disabled" }` (`api/src/lib/coding/runner-config.js`) |

What happens immediately:
- **Practice:** `/api/coding/run` → `503 EXECUTION_UNAVAILABLE`. The IDE shows "unavailable". Nothing is stored.
- **New official dispatches:** `dispatchOfficialJob` → target `retryable` with `EXECUTION_UNAVAILABLE` (`official-grading.js`).
  The submission itself **succeeds**, and the question stays under review. **No zero.**
- **Callbacks already in flight:** still verified and applied. The callback key check (`resolveCallbackKey`) is
  independent of the kill switch by design, so results of jobs dispatched before the rollback land normally.
- **Preserved:** submissions, stored answers, attempts, manual review and overrides (overrides always win in
  `rebuildAttemptGrades`), the audit log (`coding.autoGrade.*`), and the Runner journal.

## R2. Pause automatic recovery (only for a long rollback)
Actions → **Coding Grading Recovery** → "Disable workflow" (⚠ USER). While the Runner is disabled, each sweep would spend one
of a target's 8 automatic recovery attempts (`RECOVERY_POLICY.maxAutomaticRecoveries`). Disable it for rollbacks longer than
about an hour. Teacher retry / bulk retry resets the attempts afterwards anyway.

## R3. Stop the Runner itself (only if the Runner misbehaves)
```sh
sudo systemctl stop smartassess-runner     # graceful: official queue stops, practice drains ≤ 90 s, leftovers swept
sudo systemctl disable smartassess-runner  # only if it must stay down across reboots
```
The journal stays on its disk. Do not delete it: it holds results owed to SmartAssess (`executed`) and the idempotency
records. On the next start, `received` jobs are re-queued, `running` ones re-run (bounded) and `executed` ones are called back
from the durable result without re-execution.

## R4. Teachers: manual review fallback
Coding questions in `retryable` / "delayed" state stay **under review**. Teachers grade them manually (manual marks override
automatic ones).

After the fix:
- **Retry:** re-dispatches the same revision.
- **Bulk retry:** per assignment; 12 per call; 2-minute cooldown.
- **Force regrade:** a new revision. This is the recovery path when a job hit the re-arm / generation limit (known limit
  L6), where the Runner answers `202` but does no work and a plain retry is ineffective.

## R5. Preserve evidence
```sh
sudo -u smartassess-runner node /opt/smartassess-runner/current/runner/deploy/azure-vm/journal-status.js --dir=/data/smartassess-runner --json
sudo journalctl -u smartassess-runner -o cat --since "-24h" > /root/runner-incident-$(date +%F).jsonl   # no secrets / code are logged
```
⚠ USER/AZURE: take a snapshot of the journal data disk before any repair.

## R6. Code rollback (only for a code defect)
- **Runner:** point the release symlink back, then `ln -sfn /opt/smartassess-runner/<previous-tag> /opt/smartassess-runner/current && systemctl restart smartassess-runner`.
  Rebuild and record images only if the worker Dockerfiles differ between the two tags.
- **API / UI:** revert the offending PR on `main` through a reviewed PR (SWA redeploys). Never force-push `main`.

## R7. Re-enable
1. `readiness.sh --deep` → all PASS.
2. `smoke.js runner` → OK.
3. Re-enable the recovery workflow.
4. `CODING_RUNNER_ENABLED=true`.
5. Teacher **bulk retry** on the affected assignments.
6. Confirm `journal-status.js` shows no `callback_failed`.
