"use strict";
// Phase 17D-B2 — the DURABLE JOURNAL of official grading jobs inside the Coding Runner Gateway.
//
// The gateway is a host service on a dedicated Docker VM (docs/enterprise-coding-assessment-17b.md §18). Its official jobs used
// to live in RAM only, so a process restart lost accepted, running and executed-but-not-called-back jobs. The journal is the
// smallest durable store that matches that deployment: one directory on a PERSISTENT disk of the runner VM (the OS disk or a
// managed data disk survive process / service restart, reboot, stop-start and host redeploy), one small file per job, written
// atomically (temp file → fsync → rename → fsync of the directory). No database, no queue service, no new cloud dependency.
//
//   RUNNER_JOURNAL_DIR/            0700, owned by the gateway user; one gateway process at a time (journal.lock)
//     jobs/<jobId>.json            0600  the job's lifecycle record — identifiers, hashes, states, timestamps, callback retry
//                                        state, an outcome summary (counts only). Never source, stdin, output, keys, signatures.
//     inputs/<jobId>.json          0600  the validated job (source + hidden-test stdin) — needed only until a result is durable;
//                                        deleted as soon as the job is EXECUTED (or superseded / pruned)
//     results/<jobId>.json         0600  the raw-evidence callback body (bounded by the callback contract) — needed only until the
//                                        callback is CONFIRMED; deleted then (kept while a parked callback may be re-armed)
//     targets/<targetRef>.json     0600  { targetRef, revision, jobId } — the highest revision seen per OPAQUE target reference
//     quarantine/                  0700  corrupt records are MOVED here (never silently deleted, never executed or called back)
//
// Durability is only claimed for a non-ephemeral filesystem: readJournalConfig() refuses tmpfs / ramfs / overlay / squashfs and
// the Azure temporary resource disk (/dev/disk/azure/resource) — official grading then stays DISABLED (fail closed).
// RUNNER_JOURNAL_ALLOW_EPHEMERAL=1 exists for local development and tests only and is reported as "ephemeral-override".
// Every walk over the directories is bounded (startupScanMax entries); the queue (official.js) bounds records, admission and
// pruning with JOURNAL_LIMITS.
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const crypto = require("node:crypto");

const HOUR = 60 * 60 * 1000;
const JOURNAL_LIMITS = Object.freeze({
  maxRecords: 1024,                       // records kept on disk (live + retained terminal) — admission refuses beyond it
  startupScanMax: 2048,                   // directory entries examined per scan (startup / maintenance); beyond → "truncated"
  maxQuarantine: 256,                     // quarantined files kept; beyond it a corrupt record stays in place, skipped and reported
  recordBytes: 64 * 1024,
  inputBytes: 3 * 1024 * 1024,            // ≥ the 2 MB official request body bound
  resultBytes: 8 * 1024 * 1024,           // = the callback body bound (callback.js CALLBACK_MAX_BYTES)
  pruneBatch: 64,                         // records removed per maintenance pass
  confirmedRetentionMs: 24 * HOUR,        // a confirmed record answers late duplicates for a day, then it is pruned
  failedRetentionMs: 7 * 24 * HOUR        // a parked (callback_failed) or superseded record, and a target index entry
});
const SUBDIRS = Object.freeze(["jobs", "inputs", "results", "targets", "quarantine"]);
const JOB_ID = /^cg_[A-Za-z0-9_-]{16,64}$/;
const TARGET_REF = /^tr_[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const STATES = new Set(["received", "running", "executed", "confirmed", "callback_failed", "superseded"]);
const RESULT_STATES = new Set(["executed", "confirmed", "callback_failed"]);
const EPHEMERAL_FS = new Set(["tmpfs", "ramfs", "devtmpfs", "overlay", "overlayfs", "aufs", "squashfs"]);

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const isInt = (v, lo, hi = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= lo && v <= hi;
const isTime = v => v === null || (typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v)));
const sha256 = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");

// ── Configuration (fail closed) ─────────────────────────────────────────────────────────────────────────────────────────
const unescapeMount = s => s.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
/** The mount (device, mount point, fs type) that holds `dir`, from /proc/mounts text (longest matching mount point). */
function mountFor(dir, mountsText) {
  let best = null;
  for (const line of String(mountsText).split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f.length < 3) continue;
    const mp = unescapeMount(f[1]);
    if (!(mp === "/" || dir === mp || dir.startsWith(mp.endsWith("/") ? mp : mp + "/"))) continue;
    if (!best || mp.length >= best.mountPoint.length) best = { device: unescapeMount(f[0]), mountPoint: mp, type: f[2] };
  }
  return best;
}
const defaultProbe = Object.freeze({
  mounts: () => { try { return fs.readFileSync("/proc/mounts", "utf8"); } catch { return null; } },
  resourceDevice: () => { try { return fs.realpathSync("/dev/disk/azure/resource-part1"); } catch { return null; } }
});
/**
 * → { enabled: true, dir, ephemeral } | { enabled: false, reason: "not-configured" | "not-absolute" | "ephemeral" | "unverifiable" }
 * The directory must be absolute and on a filesystem that survives a process / host restart. The development override
 * (RUNNER_JOURNAL_ALLOW_EPHEMERAL exactly "1") is reported back as ephemeral: true.
 */
function readJournalConfig(env, probe = defaultProbe) {
  const raw = env && typeof env.RUNNER_JOURNAL_DIR === "string" ? env.RUNNER_JOURNAL_DIR.trim() : "";
  if (!raw) return { enabled: false, reason: "not-configured" };
  if (!path.isAbsolute(raw)) return { enabled: false, reason: "not-absolute" };
  const dir = path.resolve(raw);
  const override = env.RUNNER_JOURNAL_ALLOW_EPHEMERAL === "1";
  let mounts = null, resource = null;
  try { mounts = probe.mounts(); } catch { mounts = null; }
  try { resource = probe.resourceDevice(); } catch { resource = null; }
  const m = mounts ? mountFor(dir, mounts) : null;
  const ephemeral = !!m && (EPHEMERAL_FS.has(m.type) || (!!resource && m.device === resource));
  if (!m && !override) return { enabled: false, reason: "unverifiable" };
  if (ephemeral && !override) return { enabled: false, reason: "ephemeral" };
  return { enabled: true, dir, ephemeral: ephemeral || !m };
}

// ── Record validation ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Structural validation of one journal record (its identity must match the file name). → { ok } | { ok: false, reason } */
function validateRecord(r, nameJobId) {
  if (!isObj(r)) return { ok: false, reason: "shape" };
  if (r.schemaVersion !== 1) return { ok: false, reason: "schema" };
  if (typeof r.jobId !== "string" || !JOB_ID.test(r.jobId) || r.jobId !== nameJobId) return { ok: false, reason: "identity" };
  if (!STATES.has(r.state)) return { ok: false, reason: "state" };
  if (typeof r.payloadHash !== "string" || !HEX64.test(r.payloadHash)) return { ok: false, reason: "hash" };
  const versioned = r.revision !== null || r.targetRef !== null;
  if (versioned && !(isInt(r.revision, 1, 1000000) && typeof r.targetRef === "string" && TARGET_REF.test(r.targetRef))) return { ok: false, reason: "revision" };
  if (!isInt(r.generation, 1, 100) || !isInt(r.interruptions, 0, 100)) return { ok: false, reason: "counters" };
  for (const k of ["receivedAt", "startedAt", "executedAt", "updatedAt"]) if (!isTime(r[k] === undefined ? null : r[k])) return { ok: false, reason: "time" };
  const cb = r.callback;
  if (!isObj(cb) || !isInt(cb.attempts, 0, 10000) || !isInt(cb.windowEnd, 1, 10000) || !isInt(cb.rearms, 0, 1000) || !isTime(cb.nextAt === undefined ? null : cb.nextAt)) return { ok: false, reason: "callback" };
  if (RESULT_STATES.has(r.state) && (typeof r.resultHash !== "string" || !HEX64.test(r.resultHash))) return { ok: false, reason: "result" };
  return { ok: true };
}

// ── Low-level, durable file operations ──────────────────────────────────────────────────────────────────────────────────
async function syncDir(dir) {
  let fh = null;
  try { fh = await fsp.open(dir, "r"); await fh.sync(); } catch { /* not every platform can fsync a directory */ } finally { if (fh) await fh.close().catch(() => {}); }
}
async function atomicWrite(file, text) {
  const tmp = file + ".tmp-" + crypto.randomBytes(6).toString("hex");
  const fh = await fsp.open(tmp, "wx", 0o600);
  try { await fh.writeFile(text, "utf8"); await fh.sync(); } finally { await fh.close(); }
  try { await fsp.rename(tmp, file); } catch (e) { await fsp.unlink(tmp).catch(() => {}); throw e; }
  await syncDir(path.dirname(file));
}
async function readBounded(file, maxBytes) {
  let st;
  try { st = await fsp.stat(file); } catch (e) { if (e && e.code === "ENOENT") return { missing: true }; throw e; }
  if (!st.isFile() || st.size > maxBytes) return { corrupt: "size" };
  return { text: await fsp.readFile(file, "utf8") };
}
const unlinkIfExists = async file => { try { await fsp.unlink(file); return true; } catch (e) { if (e && e.code === "ENOENT") return false; throw e; } };
const pidAlive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return !!(e && e.code === "EPERM"); } };

// ── The journal lock (one gateway process per directory) ───────────────────────────────────────────────────────────
// journal.lock = { pid, bootId, token, at }. A PID alone cannot identify the owner across a reboot: the lock lives on the
// persistent disk, and after an unclean host stop Linux may give the old gateway's PID to an unrelated live process. The lock
// is therefore bound to the kernel boot identity (/proc/sys/kernel/random/boot_id) as well:
//   stored and current boot id both readable and DIFFERENT     → stale (written before this boot), replaced — whatever the PID;
//   same boot, or either boot id unavailable (the 17D-B2 rule) → the PID decides: live foreign PID → JOURNAL_LOCKED; dead → stale;
//   this process's own PID                                     → this process's lock (17D-B2 semantics), replaced;
//   malformed (unparseable, no integer PID)                    → JOURNAL_LOCKED while younger than LOCK_MALFORMED_GRACE_MS (it may
//                                                                still be being written by a starting gateway), stale after it.
// An unreadable boot id is never taken to mean "stale": it only removes the boot check, never the live-PID check.
const BOOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCK_MALFORMED_GRACE_MS = 60 * 1000;
const validBootId = v => (typeof v === "string" && BOOT_ID.test(v) ? v : null);
/** The kernel boot identity of this host (Linux), or null when it cannot be read. */
function readBootId() {
  try { return validBootId(fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim().toLowerCase()); } catch { return null; }
}
/** → "active" (another live gateway owns the journal) or the reason the existing lock is stale. */
function lockVerdict(held, { bootId, ageMs, alive }) {
  if (!isObj(held) || !Number.isInteger(held.pid) || held.pid < 1) return ageMs < LOCK_MALFORMED_GRACE_MS ? "active" : "malformed";
  if (held.pid === process.pid) return "own-pid";
  const stored = validBootId(held.bootId);
  if (stored && bootId && stored !== bootId) return "previous-boot";
  return alive(held.pid) ? "active" : "dead-pid";
}

/**
 * createJournal({ dir, limits?, now? }) → the journal of ONE gateway process. open() before use; close() releases the lock.
 * A closed journal refuses every write (a stopped / "crashed" instance can never write again).
 */
function createJournal({ dir, limits = {}, now = () => Date.now(), bootId = readBootId } = {}) {
  if (typeof dir !== "string" || !path.isAbsolute(dir)) throw new Error("journal directory must be an absolute path");
  const L = { ...JOURNAL_LIMITS };
  for (const k of Object.keys(JOURNAL_LIMITS)) if (Number.isInteger(limits[k]) && limits[k] >= 1) L[k] = limits[k];
  const root = path.resolve(dir);
  const sub = name => path.join(root, name);
  const fileOf = (kind, id) => path.join(root, kind, id + ".json");
  let opened = false, closed = false, lockToken = null, lockRecovered = null;
  const writable = () => { if (!opened || closed) throw Object.assign(new Error("journal is not open"), { code: "JOURNAL_CLOSED" }); };

  async function acquireLock() {
    const lockFile = path.join(root, "journal.lock");
    const token = crypto.randomBytes(12).toString("hex");
    let current = null;
    try { current = validBootId(bootId()); } catch { current = null; }
    const text = JSON.stringify({ pid: process.pid, bootId: current, token, at: new Date(now()).toISOString() });
    for (let i = 0; i < 3; i++) {
      try {
        const fh = await fsp.open(lockFile, "wx", 0o600);
        try { await fh.writeFile(text); await fh.sync(); } finally { await fh.close(); }
        lockToken = token;
        return;
      } catch (e) {
        if (!e || e.code !== "EEXIST") throw e;
        let heldText = null, ageMs = 0;
        try { heldText = await fsp.readFile(lockFile, "utf8"); ageMs = now() - (await fsp.stat(lockFile)).mtimeMs; } catch (err) { if (err && err.code === "ENOENT") continue; throw err; }
        let held = null;
        try { held = JSON.parse(heldText); } catch { held = null; }
        const verdict = lockVerdict(held, { bootId: current, ageMs, alive: pidAlive });
        if (verdict === "active") throw Object.assign(new Error("journal directory is in use by another gateway process"), { code: "JOURNAL_LOCKED" });
        // stale: remove it only if it is still the very lock judged above (another starting gateway may have replaced it)
        let again = null;
        try { again = await fsp.readFile(lockFile, "utf8"); } catch (err) { if (err && err.code === "ENOENT") continue; throw err; }
        if (again !== heldText) continue;
        await unlinkIfExists(lockFile);
        lockRecovered = verdict;
      }
    }
    throw Object.assign(new Error("journal lock could not be acquired"), { code: "JOURNAL_LOCKED" });
  }

  return {
    dir: root,
    limits: L,
    async open() {
      await fsp.mkdir(root, { recursive: true, mode: 0o700 });
      const st = await fsp.stat(root);
      if (!st.isDirectory()) throw new Error("journal path is not a directory");
      if (typeof process.getuid === "function" && st.uid !== process.getuid()) throw Object.assign(new Error("journal directory must be owned by the gateway user"), { code: "JOURNAL_OWNER" });
      await fsp.chmod(root, 0o700);
      for (const s of SUBDIRS) { await fsp.mkdir(sub(s), { recursive: true, mode: 0o700 }); await fsp.chmod(sub(s), 0o700); }
      await acquireLock();
      opened = true; closed = false;
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        const lockFile = path.join(root, "journal.lock");
        const held = JSON.parse(await fsp.readFile(lockFile, "utf8"));
        if (held && held.token === lockToken) await unlinkIfExists(lockFile);
      } catch { /* already gone */ }
    },
    isOpen: () => opened && !closed,
    /** Why a stale lock was replaced at open() ("previous-boot" | "dead-pid" | "own-pid" | "malformed"), or null. */
    lockRecovered: () => lockRecovered,

    // records
    async readRecord(jobId) {
      const r = await readBounded(fileOf("jobs", jobId), L.recordBytes);
      if (r.missing) return { missing: true };
      if (r.corrupt) return { corrupt: r.corrupt };
      let rec;
      try { rec = JSON.parse(r.text); } catch { return { corrupt: "json" }; }
      const v = validateRecord(rec, jobId);
      return v.ok ? { record: rec } : { corrupt: v.reason };
    },
    async writeRecord(rec) {
      writable();
      const v = validateRecord(rec, rec && rec.jobId);
      if (!v.ok) throw new Error("refusing to journal an invalid record (" + v.reason + ")");
      const text = JSON.stringify(rec);
      if (Buffer.byteLength(text, "utf8") > L.recordBytes) throw new Error("journal record too large");
      await atomicWrite(fileOf("jobs", rec.jobId), text);
    },
    // inputs (source + stdin of ONE job, needed until its result is durable)
    async writeInput(jobId, job) {
      writable();
      const text = JSON.stringify(job);
      if (Buffer.byteLength(text, "utf8") > L.inputBytes) throw new Error("journal input too large");
      await atomicWrite(fileOf("inputs", jobId), text);
    },
    async readInput(jobId) {
      const r = await readBounded(fileOf("inputs", jobId), L.inputBytes);
      if (!r.text) return null;
      try { return JSON.parse(r.text); } catch { return null; }
    },
    async deleteInput(jobId) { writable(); return unlinkIfExists(fileOf("inputs", jobId)); },
    // results (the raw-evidence callback body, needed until the callback is confirmed) — bound to the record by its hash
    async writeResult(jobId, result) {
      writable();
      const text = JSON.stringify(result);
      if (Buffer.byteLength(text, "utf8") > L.resultBytes) throw new Error("journal result too large");
      await atomicWrite(fileOf("results", jobId), text);
      return sha256(text);
    },
    /** The stored result only if it still matches `hash` (a tampered / truncated result is never called back). */
    async readResult(jobId, hash) {
      const r = await readBounded(fileOf("results", jobId), L.resultBytes);
      if (!r.text || sha256(r.text) !== hash) return null;
      try { return JSON.parse(r.text); } catch { return null; }
    },
    async deleteResult(jobId) { writable(); return unlinkIfExists(fileOf("results", jobId)); },
    // target ordering index (opaque target reference → highest revision seen)
    async readTarget(ref) {
      if (!TARGET_REF.test(ref)) return null;
      const r = await readBounded(fileOf("targets", ref), 4096);
      if (!r.text) return null;
      try { const t = JSON.parse(r.text); return isObj(t) && t.targetRef === ref && isInt(t.revision, 1, 1000000) && JOB_ID.test(String(t.jobId)) ? t : null; } catch { return null; }
    },
    async writeTarget(doc) { writable(); if (!TARGET_REF.test(doc.targetRef)) throw new Error("invalid target reference"); await atomicWrite(fileOf("targets", doc.targetRef), JSON.stringify(doc)); },
    async deleteTarget(ref) { writable(); return unlinkIfExists(fileOf("targets", ref)); },
    /** Removes everything of one job (record last-but-one: input and result first, so a crash never leaves a result without a record). */
    async removeJob(jobId) {
      writable();
      await unlinkIfExists(fileOf("inputs", jobId));
      await unlinkIfExists(fileOf("results", jobId));
      await unlinkIfExists(fileOf("jobs", jobId));
      await syncDir(sub("jobs"));
    },
    /** Moves a corrupt record file into quarantine/ (bounded). → true when moved; false when the quarantine is full. */
    async quarantine(fileName, reason) {
      writable();
      const safeName = path.basename(String(fileName));
      let count = 0;
      const d = await fsp.opendir(sub("quarantine"));
      try { for await (const _ of d) { if (++count >= L.maxQuarantine) break; } } finally { await d.close().catch(() => {}); }
      if (count >= L.maxQuarantine) return false;
      const target = path.join(sub("quarantine"), safeName.replace(/\.json$/, "") + "." + Date.now() + "." + String(reason).replace(/[^a-z0-9-]/gi, "").slice(0, 24) + ".json");
      await fsp.rename(path.join(sub("jobs"), safeName), target);
      await syncDir(sub("jobs")); await syncDir(sub("quarantine"));
      return true;
    },
    /**
     * BOUNDED scan of jobs/: at most `maxEntries` directory entries. → { records, corrupt: [{ file, reason }], scanned, truncated }
     * Leftover temp files from an interrupted atomic write are removed (they never were a committed record).
     */
    async scan({ maxEntries = L.startupScanMax } = {}) {
      const out = { records: [], corrupt: [], scanned: 0, truncated: false };
      const d = await fsp.opendir(sub("jobs"));
      try {
        for await (const ent of d) {
          if (out.scanned >= maxEntries) { out.truncated = true; break; }
          out.scanned++;
          const name = ent.name;
          if (/\.json\.tmp-[0-9a-f]+$/.test(name)) { await unlinkIfExists(path.join(sub("jobs"), name)).catch(() => {}); continue; }
          const m = /^(.*)\.json$/.exec(name);
          if (!ent.isFile() || !m || !JOB_ID.test(m[1])) { out.corrupt.push({ file: name, reason: "name" }); continue; }
          const r = await this.readRecord(m[1]);
          if (r.record) out.records.push(r.record); else out.corrupt.push({ file: name, reason: r.corrupt });
        }
      } finally { await d.close().catch(() => {}); }
      return out;
    },
    /** BOUNDED cleanup of inputs / results that no record references (left by a crash between two writes). → removed count */
    async removeOrphans(liveJobIds, { maxEntries = L.startupScanMax } = {}) {
      writable();
      let removed = 0, seen = 0;
      for (const kind of ["inputs", "results"]) {
        const d = await fsp.opendir(sub(kind));
        try {
          for await (const ent of d) {
            if (++seen > maxEntries) break;
            const m = /^(cg_[A-Za-z0-9_-]{16,64})\.json(\.tmp-[0-9a-f]+)?$/.exec(ent.name);
            if (m && !m[2] && liveJobIds.has(m[1])) continue;
            if (await unlinkIfExists(path.join(sub(kind), ent.name)).catch(() => false)) removed++;
          }
        } finally { await d.close().catch(() => {}); }
      }
      return removed;
    },
    /** BOUNDED listing of the target index. → [{ targetRef, revision, jobId, updatedAt }] */
    async listTargets({ maxEntries = L.startupScanMax } = {}) {
      const out = [];
      const d = await fsp.opendir(sub("targets"));
      try {
        for await (const ent of d) {
          if (out.length >= maxEntries) break;
          const m = /^(tr_[0-9a-f]{40})\.json$/.exec(ent.name);
          if (!m) continue;
          const t = await this.readTarget(m[1]);
          if (t) out.push(t);
        }
      } finally { await d.close().catch(() => {}); }
      return out;
    }
  };
}

module.exports = { JOURNAL_LIMITS, SUBDIRS, LOCK_MALFORMED_GRACE_MS, readJournalConfig, readBootId, mountFor, validateRecord, createJournal };
