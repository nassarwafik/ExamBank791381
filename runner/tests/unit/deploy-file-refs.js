"use strict";
// Phase 17F-A1.1 (M4) — TEST HELPER (not a deployment tool): extracts REPOSITORY artifact references from the deployment
// package and checks them against git, the only authority on what a fresh clone contains:
//   tracked  = `git ls-files`                 ignored = `git check-ignore -v --no-index` (names the violated rule)
// No .gitignore emulation. Host runtime paths (/etc/…, /data/…, /var/lib/docker, /usr/bin/node, /proc/…), URLs, wildcards and
// prose words are never references. Deploy-relative patterns are preferred; bare file names count only in explicit contexts
// (a runbook table cell, a backticked tool name / command, $here/…, a relative require).
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEPLOY = "runner/deploy/azure-vm";
const PHASE_DOCS = ["docs/enterprise-coding-assessment-17f-a1.md", "docs/enterprise-coding-assessment-17f-a1-1.md"];
const P = "[A-Za-z0-9._/-]";                                      // a path character
const NOT_PATH_BEFORE = "(?<![A-Za-z0-9._/$-])";                   // the token starts here, not inside a longer path
const BARE_TOOL = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(js|sh|md)$/;      // a bare tool / document name in a command or backticks
const BARE_TABLE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(js|sh|md|service|example|conf|json|yml)$/;   // a runbook table cell
const COMMAND_WORDS = new Set(["node", "sh", "bash", "sudo", "exec"]);

const trimProse = t => t.replace(/#.*$/, "").replace(/[.,:;'")\]`]+$/, "");
const repoPath = t => {
  const n = path.posix.normalize(trimProse(t));
  if (!n || n === "." || n.startsWith("/") || n.startsWith("../") || n.endsWith("/")) return null;
  if (/[*?{}$<>|"'`\\\s]/.test(n) || /(^|\/)\.\.?$/.test(n) || /(^|\/)node_modules(\/|$)/.test(n)) return null;   // dependencies are never artifacts
  return n;
};
// a bare tool / document name is ambiguous: the deploy dir first, then the gateway / scripts; checkDeployRefs also accepts any
// tracked file of that exact name under runner/, api/ or docs/ (e.g. `durable-delivery.rtest.js`, `official-grading.js` in prose)
const bareCandidates = name => [DEPLOY + "/" + name, "runner/gateway/" + name, "runner/scripts/" + name];
const BARE_ROOTS = /^(runner|api|docs)\//;

/**
 * text of one file → [{ file, line, token, ref, candidates, bare }] in document order (one entry per distinct ref per line).
 * `ref` is the preferred repository path; `candidates` the alternatives an ambiguous (bare / runner-relative) token may mean;
 * `bare` is the bare file name when the token was one (resolved against every tracked file of that name under runner/ api/ docs/).
 */
function extractDeployRefs(text, { file = "" } = {}) {
  const out = [];
  const dir = file ? path.posix.dirname(file) : ".";
  const lines = String(text || "").split("\n");
  lines.forEach((lineText, i) => {
    const found = [];
    const add = (index, token, cands, bare = null) => { const c = [...new Set(cands.map(repoPath).filter(Boolean))]; if (c.length) found.push({ index, token, ref: c[0], candidates: c, bare }); };
    // R1 — anchored deploy paths: runner/deploy/azure-vm/X, also inside /opt/smartassess-runner/current/… , ../…, file:///…
    for (const m of lineText.matchAll(new RegExp("runner\\/deploy\\/azure-vm\\/" + P + "+", "g"))) add(m.index, m[0], [m[0]]);
    // R2 — runner-relative deploy paths (systemd unit, readiness.sh, tool usage lines): deploy/azure-vm/X
    for (const m of lineText.matchAll(new RegExp(NOT_PATH_BEFORE + "deploy\\/azure-vm\\/(" + P + "+)", "g"))) add(m.index, m[0], [DEPLOY + "/" + m[1]]);
    // R3 — repository-root paths of the other trees the package refers to
    for (const m of lineText.matchAll(new RegExp(NOT_PATH_BEFORE + "((?:runner\\/(?:scripts|gateway|workers|tests)|\\.github\\/workflows|api\\/src|api\\/tests|docs|src)\\/" + P + "+)", "g"))) add(m.index, m[0], [m[1]]);
    // R3b — runner-relative paths (WorkingDirectory=/opt/…/runner): gateway/main.js, scripts/build-images.sh
    for (const m of lineText.matchAll(new RegExp(NOT_PATH_BEFORE + "((?:gateway|scripts|workers|tests)\\/" + P + "+)", "g"))) add(m.index, m[0], ["runner/" + m[1], m[1]]);
    // R4 — shell variables of the deployment scripts: "$here/X" (this directory), "$runner/X" (runner/)
    for (const m of lineText.matchAll(new RegExp("\\$here\\/(" + P + "+)", "g"))) add(m.index, m[0], [DEPLOY + "/" + m[1]]);
    for (const m of lineText.matchAll(new RegExp("\\$runner\\/(" + P + "+)", "g"))) add(m.index, m[0], ["runner/" + m[1]]);
    // R5 — markdown link targets, relative to the document (never URLs / anchors)
    for (const m of lineText.matchAll(/\]\(([^)\s]+)\)/g)) { const t = m[1]; if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("#")) continue; add(m.index, m[0], [path.posix.join(dir, t.replace(/#.*$/, ""))]); }
    // R6 — a runbook table whose first cell names a package file: | `a.md` | … or | `a.sh` / `b.js` | …
    const row = /^\| `([^`|]+)`(?: \/ `([^`|]+)`)? \|/.exec(lineText);
    if (row) for (const name of [row[1], row[2]]) if (name && BARE_TABLE.test(name)) add(0, "`" + name + "`", [DEPLOY + "/" + name], name);
    // R7 — backticked tool names / commands: `readiness.sh --deep`, `node smoke.js callback`, `rollback.md`
    for (const m of lineText.matchAll(/`([^`\n]+)`/g)) {
      const words = m[1].trim().split(/\s+/);
      if (!words.length) continue;
      if (COMMAND_WORDS.has(words[0])) { const w = words.slice(1).find(x => !x.startsWith("-") && !COMMAND_WORDS.has(x) && x !== "smartassess-runner" && x !== "-u"); if (w && !w.includes("/") && BARE_TOOL.test(w)) add(m.index, m[0], bareCandidates(w), w); }
      else if (!words[0].includes("/") && BARE_TOOL.test(words[0])) add(m.index, m[0], bareCandidates(words[0]), words[0]);
    }
    // R8 — relative requires of the Node tools: require("./docker-api.js"), require("../../gateway/registry.js")
    for (const m of lineText.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) add(m.index, m[0], [path.posix.join(dir, /\.[a-z]+$/i.test(m[1]) ? m[1] : m[1] + ".js")]);
    found.sort((a, b) => a.index - b.index);
    const seen = new Set();
    for (const f of found) { if (seen.has(f.ref)) continue; seen.add(f.ref); out.push({ file, line: i + 1, token: f.token, ref: f.ref, candidates: f.candidates, bare: f.bare }); }
  });
  return out;
}

/** The git authority of a repository: tracked = ls-files, ignoredBy(path) = the violated rule (`.gitignore:18:*.env.*`) or "". */
function gitAuthority(repo) {
  const run = args => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const ls = run(["ls-files", "-z"]);
  if (ls.status !== 0) throw new Error("git ls-files failed: " + (ls.stderr || ls.error));
  const tracked = new Set(ls.stdout.split("\0").filter(Boolean));
  const cache = new Map();
  const ignoredBy = p => {
    if (!cache.has(p)) { const r = run(["check-ignore", "-v", "--no-index", "--", p]); cache.set(p, r.status === 0 ? r.stdout.split("\t")[0].trim() : ""); }
    return cache.get(p);
  };
  return { repo, tracked, ignoredBy };
}
const fakeAuthority = ({ tracked = [], ignored = {} } = {}) => ({ tracked: new Set(tracked), ignoredBy: p => ignored[p] || "" });

/** sources [{ file, text }] × authority → [{ file, line, token, ref, kind: "missing" | "ignored", detail }] (empty = every reference is a tracked, not ignored artifact). */
function checkDeployRefs(sources, authority) {
  const problems = [];
  let byName = null;
  const named = name => { if (!byName) { byName = new Map(); for (const t of authority.tracked) if (BARE_ROOTS.test(t)) { const b = path.posix.basename(t); if (!byName.has(b)) byName.set(b, []); byName.get(b).push(t); } } return byName.get(name) || []; };
  for (const s of sources) {
    for (const r of extractDeployRefs(s.text, { file: s.file })) {
      const options = r.bare ? [...r.candidates, ...named(r.bare)] : r.candidates;
      if (options.some(c => authority.tracked.has(c) && !authority.ignoredBy(c))) continue;
      const ignored = r.candidates.map(c => authority.ignoredBy(c)).find(Boolean) || "";
      problems.push({ file: r.file, line: r.line, token: r.token, ref: r.ref, kind: ignored ? "ignored" : "missing", detail: ignored || "not tracked by git (git ls-files)" });
    }
  }
  return problems;
}

/** Every file of the deployment package plus the 17F-A1 / 17F-A1.1 phase notes, as [{ file, text }] (repo-relative). */
function deploymentSources(repo) {
  const out = [];
  for (const f of fs.readdirSync(path.join(repo, DEPLOY)).sort()) { const abs = path.join(repo, DEPLOY, f); if (fs.statSync(abs).isFile()) out.push({ file: DEPLOY + "/" + f, text: fs.readFileSync(abs, "utf8") }); }
  for (const f of PHASE_DOCS) { const abs = path.join(repo, f); if (fs.existsSync(abs)) out.push({ file: f, text: fs.readFileSync(abs, "utf8") }); }
  return out;
}

module.exports = { DEPLOY, PHASE_DOCS, extractDeployRefs, checkDeployRefs, gitAuthority, fakeAuthority, deploymentSources };
