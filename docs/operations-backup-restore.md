# Blob data protection — backup and restore runbook (D1)

All platform data is JSON documents in one Azure Storage account (containers `bank`, `assets`, `raw`, see `README.md`).
There is no database and no second copy: until the protections below are on, an overwrite or a delete is final.
This runbook is for the **repository owner**. Agents never apply it (`AGENTS.md` §2 and §11): every step changes
production Azure settings or data.

## 1. What to turn on (one time)

Azure Portal → the Storage account → **Data management → Data protection**:

| Setting | Value | What it gives |
|---|---|---|
| Enable soft delete for blobs | 30 days | A deleted blob (a student, a class, a submission, an image) can be undeleted for 30 days |
| Enable soft delete for containers | 30 days | A deleted container (`bank`, `assets`, `raw`) can be restored for 30 days |
| Enable versioning for blobs | on | Every overwrite keeps the previous content as a version (a wrong regrade, a bad import, a corrupted save) |
| Enable blob change feed | keep 30 days or more | Required by point-in-time restore; an audit log of every change |
| Enable point-in-time restore | 14 days | Roll a container, or a path prefix inside it, back to a moment in the last 14 days |

Then **Save**. Point-in-time restore must be shorter than blob soft delete, and it needs the other three settings.
It is not offered when the account has *Hierarchical namespace* (Data Lake Gen2) on; turn on the other settings anyway.

**Data management → Lifecycle management → Add a rule** (`expire-old-versions`): previous versions → delete
**30 days** after they became previous versions. Without it, storage grows forever: autosave rewrites a draft every
few seconds while a student answers, and each rewrite keeps a version. Keep this number **above** the
point-in-time window (14 days), or restore cannot reach back that far.

Command-line equivalent, for the owner only (check flags with `az storage account blob-service-properties update --help`):

```bash
az storage account blob-service-properties update -g <resource-group> -n <account> \
  --enable-delete-retention true --delete-retention-days 30 \
  --enable-container-delete-retention true --container-delete-retention-days 30 \
  --enable-versioning true --enable-change-feed true --change-feed-retention-days 30 \
  --enable-restore-policy true --restore-days 14
```

### Cost and privacy notes

- Versions and soft-deleted blobs are billed as stored data. The documents are small JSON files, so the cost is
  modest, but the lifecycle rule is what keeps it bounded.
- **Erasure is delayed by the retention.** The text of a deleted message (`docs/enterprise-messages-hardening.md` §3d)
  or the documents of a hard-deleted student (`docs/enterprise-classes-students-hardening.md`, known limitations) stay recoverable in
  versions / soft delete until retention ends (30 days). For an erasure request that cannot wait, the owner removes
  the versions of those blobs by hand (blob → *Versions* → delete) after the ordinary delete.

## 2. Restore procedures

Before any restore: **write down the time of the incident**, and take a **safety copy** of what will be overwritten
(Azure Storage Explorer → right-click the folder → *Download*, or `azcopy copy` to a local folder). A restore is itself
a write; the safety copy is the way back.

### 2.1 One blob was overwritten with wrong content

Container → the blob → **Versions** tab → pick the version from before the incident (the time column) → **Make current
version**. The wrong content becomes a previous version (still recoverable). Typical: one submission after a wrong
manual edit, one assignment document, one class roster.

### 2.2 One blob (or a few) was deleted

With versioning on, a delete turns the current content into a previous version. Container → toggle **Show deleted
blobs** → the blob → **Versions** → pick the latest version → **Make current version**. (Without versioning, the same
toggle → select → **Undelete**.)

### 2.3 A whole container was deleted

Storage account → **Containers** → toggle **Show deleted containers** → the container → **Undelete**. The container
must not have been re-created under the same name first.

### 2.4 Many documents are wrong (a bad bulk operation)

Use **point-in-time restore** on the **narrowest prefix** that covers the damage, never on the whole account:

- Storage account → **Containers** → **Restore containers** → *Restore selected ranges* → container `bank` and a range
  such as `platform/submissions/<assignmentId>/` (one assignment's submissions) or `platform/classes/` → the restore time
  (just before the incident) → **Restore**.
- CLI: `az storage blob restore -g <rg> --account-name <account> -t <UTC time> -r bank/platform/submissions/<id>/`
  (ranges are `container/start` with an optional `:container/end`).

Everything written inside that range **after** the restore time is rolled back, including legitimate work (a student's
submission made after the incident). Do it outside school hours, and tell the teacher which assignments were touched.
A restore fails as a whole when a blob in the range has an **active lease**; the API holds 30-second leases on
`platform/locks/assignment-*.lock` while it records an attempt, so retry after a minute, or keep `platform/locks/` out
of the range (lock blobs carry no data).

## 3. Verification (do this once after enabling, and every term)

Use a throw-away container so no real data is touched:

1. Create a container `restore-drill`. Upload a small file `drill.json` with the content `{"v":1}`.
2. Overwrite it with `{"v":2}`. Blob → **Versions**: two versions are listed. Make the first one current → content is `{"v":1}`.
3. Delete the blob. Toggle **Show deleted blobs** → it is listed → restore it as in 2.2 → content is back.
4. Note the time T. Upload `drill2.json`, wait two minutes, delete it. **Restore containers** → range `restore-drill/` →
   time T → after it completes `drill2.json` is absent and `drill.json` is as it was at T.
5. Delete the container `restore-drill`, toggle **Show deleted containers**, undelete it, then delete it for good.
6. **Data protection** shows all five settings on; **Lifecycle management** shows the rule enabled.

Record the date and result of each drill (the owner's operations notes). A failed step means a setting is off.

## 4. What this does not cover

- **Region loss or account deletion.** Soft delete does not survive deleting the Storage account. Protection against
  that is a resource lock on the account (**Settings → Locks → Delete lock**) and, if required, geo-redundant
  replication (GRS/RA-GRS) or a periodic copy to a second account. Both are owner decisions with a cost.
- **Answers that never reached the server.** Those are protected on the student's device instead (the exam page keeps
  unsent answers locally and sends them on the next open of the same attempt; see `docs/enterprise-data-protection-d1.md`).
