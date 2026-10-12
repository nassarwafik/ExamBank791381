#!/usr/bin/env node
// Phase 21E.3 focused mutation certification (AGENTS.md §9): the in-place chunk recovery (URL trust, remap set, single
// evaluation, refusals), the recovery card (no leak, re-arm, reload gating), the calm announcer (timer once, save silence),
// focus after transitions, the focus reveal, and the LTR islands. Each mutant is planted, the named suites run, the file is
// restored byte-for-byte (sha256-verified, also on interruption) and `git diff` must be clean afterwards.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";

const RL = "src/recoverableLazy.ts", QEB = "src/student/exam/QuestionErrorBoundary.tsx", ANN = "src/student/exam/examAnnouncements.ts";
const PAGE = "src/StudentExamPage.tsx", SAVE = "src/student/exam/SaveStatus.tsx", FIELD = "src/QuestionField.tsx", LAB = "src/physicsLab/LabScene.tsx";
const CARD = "src/StudentQuestionCard.tsx", LTR = "src/ui/ltrIsland.ts";
const RT = ["src/recoverableLazy.21e3.test.tsx"];
const UNITS = ["src/student/exam/exam21e3.units.test.tsx"];
const PAGE_T = ["src/StudentExamPage.ux21e3.test.tsx"];
const M = (id, file, before, after, tests) => ({ id, file, before, after, tests });
const mutants = [
  // URL trust — the only way a URL reaches the importer, the import map, a source read or a stylesheet.
  M("R01-origin", RL, "if (u.origin !== env.origin || u.username", "if (false || u.username", RT),
  M("R02-query", RL, " || u.search || u.hash) return null;", " || u.hash) return null;", RT),
  M("R03-chunk-name", RL, " || (name !== undefined && m[1] !== name)) return null;", ") return null;", RT),
  M("R04-hash-shape", RL, "const HASHED = /^([A-Za-z0-9_-]+)-[0-9a-z]{8}\\.(js|css)$/;", "const HASHED = /^([A-Za-z0-9_-]+)-[0-9A-Za-z]{6,}\\.(js|css)$/;", RT),
  M("R05-assets-prefix", RL, "if (!u.pathname.startsWith(prefix)) return null;", "", RT),
  M("R06-typeerror-only", RL, 'if (!e || e.name !== "TypeError" || typeof e.message !== "string") return null;', 'if (!e || typeof e.message !== "string") return null;', RT),
  // The remap set — single evaluation.
  M("R07-no-ancestors", RL, "for (const [u, out] of graph) if (!bad.has(u) && out.some(v => bad.has(v))) { bad.add(u); changed = true; }", "", RT),
  M("R08-healthy-remapped", RL, "const bad = new Set([...graph.keys()].filter(u => u === entry || poisoned(u)));", "const bad = new Set([...graph.keys()]);", RT),
  M("R09-recovered-remapped", RL, "return [...bad].filter(u => !recovered(u));", "return [...bad];", RT),
  M("R10-no-settled-reuse", RL, "    if (hit) return env.importUrl(hit);\n", "", RT),
  M("R11-never-remap-ignored", RL, 'if (set.some(u => NEVER_REMAP.has(assetName(u)))) throw new Error("recovery-refused");', "", RT),
  M("R12-no-original-first", RL, "const mod = await original().catch((err: unknown) => {", "const mod = await (attempts > 1 && entry ? remapped(entry) : original()).catch((err: unknown) => {", RT),
  M("R13-map-unscoped", RL, "for (const u of set) scopes[url(u)] = imports;", "for (const u of set) scopes[u] = imports;", RT),
  M("R14-no-css-relink", RL, "if (attempts > 1) await relinkFailedCss();", "", RT),
  M("R15-shape-unchecked", RL, 'if (!isComponent(mod?.default)) throw new Error("recovery-shape");', "", RT),
  M("R16-retryable-remaps", RL, "const allowRemap = options.remap !== false;", "const allowRemap = true;", RT),
  // The recovery card.
  M("B01-no-rearm", QEB, "    rearmFailedLoads();\n", "", UNITS),
  M("B02-log-leaks", QEB, 'console.error("[QuestionErrorBoundary]", { code: isChunkLoadError(error) ? "chunk-load" : "runtime" });', 'console.error("[QuestionErrorBoundary]", { code: isChunkLoadError(error) ? "chunk-load" : "runtime", message: String((error as Error)?.message) });', [...UNITS, ...PAGE_T]),
  M("B03-reload-before-retry", QEB, "{afterRetry && reloadAllowed && (", "{reloadAllowed && (", PAGE_T),
  M("B04-no-reset-on-new-question", QEB, "return props.resetKey !== state.resetKey ? { failed: false, retries: 0, resetKey: props.resetKey } : null;", "return null;", UNITS),
  M("B05-no-focus-anchor", QEB, "    this.context.focusAnchor?.();\n", "", PAGE_T),
  M("B06-whole-card-boundary", CARD, "<QuestionErrorBoundary resetKey={id} fallback={plain}>", "<QuestionErrorBoundary resetKey={id+\"-stem\"} fallback={null}>", ["src/StudentQuestionCard.stem21e3.test.tsx", ...PAGE_T]),
  // Reload gating and focus on the page.
  M("P01-reload-in-strict", PAGE, 'reloadAllowed:policy!=="strict"&&saveKind==="saved"', 'reloadAllowed:saveKind==="saved"', PAGE_T),
  M("P02-reload-unsaved", PAGE, 'reloadAllowed:policy!=="strict"&&saveKind==="saved"&&!submitBusy', 'reloadAllowed:policy!=="strict"&&!submitBusy', PAGE_T),
  M("P03-focus-on-open", PAGE, 'if(prev===screen||prev==="loading")return;', "if(prev===screen)return;", PAGE_T),
  M("P04-no-result-focus", PAGE, '  }else if(screen==="result"||screen==="strict"){', '  }else if(false){', PAGE_T),
  M("P05-no-start-focus", PAGE, '  if(screen==="exam"){\n   const el=view==="review"', '  if(false){\n   const el=view==="review"', PAGE_T),
  M("P06-reveal-always", PAGE, "if((nav&&r.bottom>nav.top+1)||(bar&&r.top<bar.bottom-1))el.scrollIntoView(", "el.scrollIntoView(", PAGE_T),
  M("P07-timer-no-memory", PAGE, "next.record.forEach(t=>done.add(t));writeTimerNotices(timerAttempt,done);", "", PAGE_T),
  // Announcement rules.
  M("A01-timer-repeat", ANN, "const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t && !announced.has(t));", "const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t);", [...UNITS, ...PAGE_T]),
  M("A02-timer-early", ANN, "const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t && !announced.has(t));", "const due = TIMER_THRESHOLDS_MS.filter(t => remainingMs <= t + 60_000 && !announced.has(t));", [...UNITS, ...PAGE_T]),
  M("A03-save-noisy", ANN, 'if (next === "saved" && problemOpen) return', 'if (next === "saved") return', [...UNITS, ...PAGE_T]),
  M("A04-label-live-again", SAVE, '<span className={"iex-save-state iex-save-" + kind}>', '<span className={"iex-save-state iex-save-" + kind} role="status" aria-live="polite">', ["src/StudentExamPage.ux7b1.test.tsx", "src/StudentExamPage.reliability.test.tsx", ...PAGE_T]),
  // LTR islands.
  M("L01-cli-not-isolated", FIELD, '<pre className="iex-cli" dir="ltr">', '<pre className="iex-cli">', PAGE_T),
  M("L02-physics-title-ltr", LAB, ' direction="rtl" textAnchor="end">{conserved', '>{conserved', UNITS),
  M("L03-island-drops-bdi", LTR, 'out.push(createElement("bdi", { dir: "ltr", key: key++ }, m[0]));', "out.push(m[0]);", [...UNITS, "src/pwa/InstallAppCard.6a.test.tsx"]),
];

const sha = s => crypto.createHash("sha256").update(s).digest("hex"), files = [...new Set(mutants.map(m => m.file))];
const BACKUP = path.join(os.tmpdir(), "exambank-21e3-mutation-backup.json");
if (fs.existsSync(BACKUP)) { const stale = JSON.parse(fs.readFileSync(BACKUP, "utf8")); for (const [file, contents] of Object.entries(stale)) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); console.log("21E3_MUTATION_RESTORED_STALE_BACKUP"); }
if (process.argv.includes("--restore")) process.exit(0);
const only = (process.env.ONLY || "").split(",").filter(Boolean);
const selected = only.length ? mutants.filter(m => only.includes(m.id)) : mutants;
const original = new Map(files.map(file => [file, fs.readFileSync(file, "utf8")]));
const restore = () => { for (const [file, contents] of original) fs.writeFileSync(file, contents, "utf8"); fs.rmSync(BACKUP, { force: true }); };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restore(); process.exit(130); });
const hashes = Object.fromEntries([...original].map(([file, value]) => [file, sha(value)]));
const dirty = spawnSync("git", ["status", "--porcelain", "--", ...files], { encoding: "utf8" });
if (dirty.status !== 0 || dirty.stdout.trim()) { console.error("Mutated sources must start clean.", dirty.stdout); process.exit(3); }
const vitest = tests => spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=dot", ...tests], { encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: "true", NO_COLOR: "1" } });
const all = [...new Set(selected.flatMap(m => m.tests))], baseline = vitest(all);
if (baseline.status !== 0) { console.error("BASELINE RED", baseline.stdout.slice(-5000), baseline.stderr.slice(-3000)); process.exit(4); }
console.log("21E3_MUTATION_BASELINE_GREEN", JSON.stringify({ tests: all, mutants: selected.length, files: hashes }));
const ledger = [];
fs.writeFileSync(BACKUP, JSON.stringify(Object.fromEntries(original)), "utf8");
try {
  for (const m of selected) {
    let outcome = "invalid", diagnostic = "", killedBy = [];
    const source = original.get(m.file), occ = source.split(m.before).length - 1;
    if (occ !== 1) diagnostic = "needle count " + occ;
    else if (m.before === m.after) diagnostic = "mutation identical";
    else {
      try {
        fs.writeFileSync(m.file, source.replace(m.before, m.after), "utf8");
        const r = vitest(m.tests), output = (r.stdout || "") + "\n" + (r.stderr || "");
        if (r.error?.code === "ETIMEDOUT" || r.signal) { outcome = "timeout"; diagnostic = String(r.error || r.signal); }
        else if (r.status === 0) { outcome = "survived"; diagnostic = "Selected tests passed"; }
        else if (/Transform failed|Failed to parse source|SyntaxError:|Unexpected token|Error during transform/.test(output)) { outcome = "invalid"; diagnostic = output.slice(-800); }
        else {
          outcome = "killed";
          const lines = output.split("\n");
          diagnostic = lines.filter(x => /Test Files|Tests +/.test(x)).slice(0, 2).join(" ").slice(0, 300);
          // The failing tests that killed the mutant (AGENTS.md §13: "killed by which test").
          killedBy = [...new Set(lines.map(x => /FAIL\s+(\S+\.test\.\w+\s+>.+?)\s*$/.exec(x)?.[1]).filter(Boolean))].slice(0, 6);
        }
      } finally { fs.writeFileSync(m.file, source, "utf8"); }
    }
    const record = { id: m.id, file: m.file, outcome, diagnostic, killedBy };
    ledger.push(record);
    console.log("21E3_MUTATION_RESULT", JSON.stringify(record));
  }
} finally { restore(); }
const verified = files.every(f => sha(fs.readFileSync(f, "utf8")) === hashes[f]), git = spawnSync("git", ["diff", "--exit-code", "--", ...files], { encoding: "utf8" });
const counts = Object.fromEntries(["killed", "survived", "invalid", "timeout"].map(s => [s, ledger.filter(r => r.outcome === s).length]));
const report = { baseline: "green", source_sha256: hashes, restored: verified && git.status === 0, counts, mutants: ledger };
fs.mkdirSync("artifacts/phase-21e3", { recursive: true });
fs.writeFileSync("artifacts/phase-21e3/mutation-ledger.json", JSON.stringify(report, null, 2) + "\n");
console.log("21E3_MUTATION_SUMMARY", JSON.stringify({ restored: report.restored, counts, report: "artifacts/phase-21e3/mutation-ledger.json" }));
if (!report.restored || counts.invalid || counts.timeout || counts.survived) process.exitCode = 1;
