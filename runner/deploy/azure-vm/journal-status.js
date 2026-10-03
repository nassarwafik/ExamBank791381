"use strict";
// Phase 17F-A1 (+ 17F-B1 fields) — LOCAL, read-only DIAGNOSTICS of the official-grading journal (no HTTP route, no new gateway surface).
// Prints AGGREGATES ONLY: record counts per state, the age of the oldest record still owed a callback, parked callbacks,
// quarantine size and whether a lock is held. It never prints a job id, a target reference, source, stdin, output or a key.
// Run it as the service user (the journal is 0700):
//     sudo -u smartassess-runner node deploy/azure-vm/journal-status.js --dir=/data/smartassess-runner [--max-executed-age-min=15] [--json]
// Exit: 0 healthy · 3 attention (parked callbacks, an executed result older than the threshold, quarantined records, a
// truncated listing) · 2 usage / unreadable journal.
const fs = require("node:fs");
const path = require("node:path");
const { JOURNAL_LIMITS, validateRecord } = require("../../gateway/journal.js");

const STATES = ["received", "running", "executed", "confirmed", "callback_failed", "superseded"];

/** Aggregate journal state of `dir` at `nowMs`. Bounded by the gateway's own scan limit. */
function journalStatus(dir, { nowMs = Date.now(), maxEntries = JOURNAL_LIMITS.startupScanMax, maxExecutedAgeMin = 15 } = {}) {
  const counts = Object.fromEntries(STATES.map(s => [s, 0]));
  let corrupt = 0, scanned = 0, truncated = false, oldestExecutedMs = null, oldestOwedMs = null;
  const jobsDir = path.join(dir, "jobs");
  for (const name of fs.readdirSync(jobsDir)) {
    if (scanned >= maxEntries) { truncated = true; break; }
    scanned++;
    const m = /^(cg_[A-Za-z0-9_-]{16,64})\.json$/.exec(name);
    if (!m) { if (!/\.json\.tmp-[0-9a-f]+$/.test(name)) corrupt++; continue; }
    let rec = null;
    try { const st = fs.statSync(path.join(jobsDir, name)); if (st.size <= JOURNAL_LIMITS.recordBytes) rec = JSON.parse(fs.readFileSync(path.join(jobsDir, name), "utf8")); } catch { rec = null; }
    if (!rec || !validateRecord(rec, m[1]).ok) { corrupt++; continue; }
    counts[rec.state]++;
    if (rec.state === "executed") { const t = Date.parse(rec.executedAt || rec.updatedAt); if (Number.isFinite(t)) oldestExecutedMs = Math.max(oldestExecutedMs || 0, nowMs - t); }
    // Review Fix 1 (RF2): a result is OWED while executed OR parked (callback_failed) — SmartAssess has neither. Age from the
    // original execution (executedAt) when the record has it, else the validated updatedAt. Journal schema unchanged.
    if (rec.state === "executed" || rec.state === "callback_failed") { const t = Date.parse(rec.executedAt || rec.updatedAt); if (Number.isFinite(t)) oldestOwedMs = Math.max(oldestOwedMs || 0, nowMs - t); }
  }
  let quarantined = 0;
  try { quarantined = fs.readdirSync(path.join(dir, "quarantine")).length; } catch { quarantined = 0; }
  const lockHeld = fs.existsSync(path.join(dir, "journal.lock"));
  const total = STATES.reduce((s, k) => s + counts[k], 0);
  const attention = [];
  if (counts.callback_failed) attention.push("parked-callbacks");
  if (oldestExecutedMs !== null && oldestExecutedMs > maxExecutedAgeMin * 60000) attention.push("executed-result-waiting");
  if (quarantined || corrupt) attention.push("corrupt-or-quarantined");
  if (truncated) attention.push("truncated");
  if (total >= JOURNAL_LIMITS.maxRecords * 0.8) attention.push("journal-near-capacity");
  const oldestExecutedMinutes = oldestExecutedMs === null ? null : Math.floor(oldestExecutedMs / 60000);
  const oldestOwedCallbackMinutes = oldestOwedMs === null ? null : Math.floor(oldestOwedMs / 60000);
  // 17F-B1 additions (nothing above renamed or removed): utilization of the fixed record capacity, the callback BACKLOG
  // (results executed but not yet confirmed + parked callbacks), the age of the oldest OWED result across executed + parked
// (RF2; `oldestExecutedMinutes` stays the legacy executed-only age), and a two-valued health flag mirroring `attention`.
  const utilizationPercent = JOURNAL_LIMITS.maxRecords > 0 ? Math.min(100, Math.floor((total / JOURNAL_LIMITS.maxRecords) * 100)) : 0;
  return { counts, total, capacity: JOURNAL_LIMITS.maxRecords, utilizationPercent, live: counts.received + counts.running, owedCallback: counts.executed, callbackBacklog: counts.executed + counts.callback_failed, oldestExecutedMinutes, oldestOwedCallbackMinutes, quarantined, corrupt, truncated, lockHeld, attention, health: attention.length ? "attention" : "ok" };
}

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : ["bad", a]; }));
  const dir = typeof args.dir === "string" ? args.dir : process.env.RUNNER_JOURNAL_DIR;
  if (args.bad || !dir || !path.isAbsolute(dir)) { console.error("usage: journal-status.js --dir=/data/smartassess-runner [--max-executed-age-min=N] [--json]"); process.exit(2); }
  let s;
  try { s = journalStatus(dir, { maxExecutedAgeMin: Number(args["max-executed-age-min"]) || 15 }); } catch { console.error("journal unreadable (run as the service user; is the disk mounted?)"); process.exit(2); }
  if (args.json) console.log(JSON.stringify({ event: "runner.journal.status", ...s }));
  else {
    console.log("records " + s.total + " / " + s.capacity + " (" + s.utilizationPercent + "%) · " + STATES.map(k => k + " " + s.counts[k]).join(" · "));
    console.log("owed callbacks " + s.owedCallback + " (oldest " + (s.oldestExecutedMinutes === null ? "-" : s.oldestExecutedMinutes + " min") + ") · callback backlog " + s.callbackBacklog + " (oldest owed " + (s.oldestOwedCallbackMinutes === null ? "-" : s.oldestOwedCallbackMinutes + " min") + ") · quarantined " + s.quarantined + " · corrupt " + s.corrupt + " · lock " + (s.lockHeld ? "held" : "free") + (s.truncated ? " · TRUNCATED" : ""));
    console.log(s.attention.length ? "ATTENTION: " + s.attention.join(", ") : "OK");
  }
  process.exit(s.attention.length ? 3 : 0);
}

module.exports = { journalStatus, STATES };
