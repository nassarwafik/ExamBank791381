"use strict";
// Phase 17D-B2 — shared helpers for the durable runner delivery / crash-recovery tests (no Docker). Every test uses a REAL
// on-disk journal in its own temporary directory; a "restart" is a NEW journal + queue over the same directory after the old
// instance has been stopped (in-process), or a NEW gateway process (tests/helpers/gateway-process.js).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const KEY = "test-only-runner-hmac-key-0123456789abcdef";             // TEST keys — never real secrets
const CB_KEY = "test-only-callback-hmac-key-fedcba9876543210";
const LIMITS = { timeMs: 2000, memoryMb: 128, outputBytes: 17408 };
const SOURCE_CANARY = "CANARY_STUDENT_SOURCE_17DB2";
const STDIN_CANARY = "CANARY_HIDDEN_INPUT_17DB2";
const job = (n = 1, over = {}) => ({ jobId: "cg_b2job" + String(n).padStart(17, "0"), language: "python", languageVersion: 1, source: "print(input()) # " + SOURCE_CANARY, cases: [{ token: "c01", stdin: "1 " + STDIN_CANARY + "\n" }, { token: "c02", stdin: "2\n" }], limits: LIMITS, ...over });
const TARGET = "tr_" + "ab".repeat(20);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const quiet = () => ({ info() {}, warn() {}, error() {} });
/** A logger that keeps every emitted line (to prove what is — and is not — logged). */
const capture = () => { const lines = []; const push = l => lines.push(String(l)); return { lines, info: push, warn: push, error: push, events: () => lines.map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } }) }; };
const tmpJournalDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "sa-b2-journal-"));
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const recordOf = (dir, jobId) => readJson(path.join(dir, "jobs", jobId + ".json"));
const exists = file => fs.existsSync(file);

/** A fake official sandbox that counts PHYSICAL executions per job; `behaviour(job, opts, n)` may delay / hang / throw. */
function fakeSandbox(behaviour) {
  const runs = [];
  return {
    runs,
    count: jobId => runs.filter(r => r === jobId).length,
    availableLanguages: async () => [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }],
    run: async () => ({ status: "success", stdout: "", stderr: "" }),
    async runOfficialSuite(entry, j, opts = {}) {
      runs.push(j.jobId);
      if (behaviour) { const r = await behaviour(j, opts, runs.length); if (r) return r; }
      return { cases: j.cases.map(c => ({ token: c.token, status: "success", stdout: "out-" + c.token + "\n", stderr: "", exitCode: 0, durationMs: 3 })) };
    },
    sweep: async () => 0
  };
}
/** A promise the test resolves later (to hold an execution "in the middle"). */
function latch() { let open; const p = new Promise(r => { open = r; }); return { promise: p, open: () => open() }; }

/** A fake SmartAssess callback endpoint (single attempt per call). `script(n, result)` → a deliver() answer. Applies once per job. */
function fakeApi(script) {
  const calls = [], applied = new Map();
  const deliver = async result => {
    calls.push(result);
    const n = calls.filter(c => c.jobId === result.jobId).length;
    const answer = script ? await script(n, result) : null;
    if (answer) return answer;
    const already = applied.has(result.jobId);
    if (!already) applied.set(result.jobId, JSON.stringify(result));
    return { delivered: true, status: 200, confirmedAs: "complete" };
  };
  return { deliver, calls, applied, attempts: jobId => calls.filter(c => c.jobId === jobId).length };
}

const FAST = Object.freeze({ baseMs: 15, capMs: 120, maxAttemptsPerWindow: 4, maxRearms: 2, concurrency: 2 });
/** Opens a journal + queue over `dir` (a "process" of the runner) and runs its startup recovery. */
async function boot(dir, { sandbox = fakeSandbox(), api = fakeApi(), maxPending = 8, maxActive = 1, now, logger = quiet(), callbackPolicy = FAST, executionPolicy, limits, jobWallMsFor } = {}) {
  const { createJournal } = require("../../gateway/journal.js");
  const { createOfficialGradingQueue } = require("../../gateway/official.js");
  const journal = createJournal({ dir, logger, ...(limits ? { limits } : {}), ...(now ? { now } : {}) });
  await journal.open();
  const q = createOfficialGradingQueue({ sandbox, deliver: api.deliver, journal, maxPending, maxActive, logger, callbackPolicy, ...(executionPolicy ? { executionPolicy } : {}), ...(now ? { now } : {}), ...(jobWallMsFor ? { jobWallMsFor } : {}) });
  const summary = await q.start();
  return { journal, q, sandbox, api, summary, logger };
}
/** Simulated crash: the instance stops dead (no graceful drain, no further journal writes), its journal lock is dropped. */
async function crash(h) { h.q.stop(); await h.journal.close(); }
async function waitFor(fn, { timeoutMs = 5000, stepMs = 5 } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > until) throw new Error("waitFor timed out"); await sleep(stepMs); }
}

module.exports = { KEY, CB_KEY, LIMITS, SOURCE_CANARY, STDIN_CANARY, TARGET, job, sleep, quiet, capture, tmpJournalDir, readJson, recordOf, exists, fakeSandbox, latch, fakeApi, FAST, boot, crash, waitFor };
