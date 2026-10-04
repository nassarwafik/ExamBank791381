// Phase 18A — REPOSITORY GOVERNANCE CONTRACT check. The root operating contract (AGENTS.md), the development documents
// and the pull request template must exist and keep their non-negotiable rules. Dependency-free: Node fs + Vitest only.
// It reads the real repository (no fixtures) and fails BY NAME when a file disappears, a rule is dropped, a relative
// link breaks, a documented command no longer exists, or a transient SHA is hard-coded into the reusable template.
// Review Fix 1: the §2 authority rules are checked by POLARITY (inside the must-NOT block, absent from the may block), the
// phase-record rule is the consistent one, and the PR template's preview wording is conditional on the deploy job's result.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const exists = rel => fs.existsSync(path.join(ROOT, rel));
/** A missing file reads as empty so that every rule below fails BY NAME instead of the whole file failing to collect. */
const read = rel => (exists(rel) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : "");

const FILES = {
  agents: "AGENTS.md",
  workflow: "docs/development/agentic-development-workflow.md",
  matrix: "docs/development/validation-matrix.md",
  template: ".github/pull_request_template.md",
  readme: "README.md",
};

/** AGENTS.md: numbered sections that must stay (title text is matched case-insensitively, number is free). */
const AGENTS_SECTIONS = [
  "Repository map and architecture boundaries", "Authority", "The canonical development loop", "Baseline gate",
  "Branches and commits", "Exact-head rule", "Parallel windows and reconciliation", "Fail-first policy", "Mutation policy",
  "Safety invariants that no phase may weaken", "Deployment boundaries", "Testing expectations", "Independent review handoff",
];

/**
 * AGENTS.md §2: the owner-only merge authority sentence, and the two polarity blocks. FORBIDDEN rules must sit INSIDE the
 * `Agents **must NOT**:` block and NOWHERE in the `Agents **may**:` block; ALLOWED rules the other way round. Presence of the
 * vocabulary alone is not enough — inverting the heading or moving a bullet between the blocks fails (RF1-1).
 */
const AUTHORITY_SENTENCES = [
  "repository owner is the final merge authority",
  "nothing merges to `main` without the owner performing the merge manually after an independent review",
];
const FORBIDDEN = [
  "merge their own pull request, or any pull request",
  "enable auto-merge, or ask another agent or bot to merge",
  "force-push, rebase, amend, squash or otherwise rewrite history that has been pushed for review",
  "deploy to production or to the live coding runner without explicit, written owner authorization",
  "rotate, read out, print, or move secrets, hmac keys, tokens or connection strings",
  "mutate production data, production azure settings, dns, nsg rules, app settings or vm configuration",
  "weaken, skip, disable, quarantine or loosen a test, a lint rule, a bundle budget or a ci gate to obtain green",
  "copy or cherry-pick unmerged work from another parallel branch",
];
const ALLOWED = [
  "create branches and push normal commits to their assigned branch",
  "run tests, builds, lint, mutation campaigns and local harness runs",
  "open pull requests and update their bodies",
  "respond to review findings with a review fix commit on the same branch",
];
/** Any sentence in §2 outside the must-NOT block that grants an agent merging or deploying (polarity inversion). */
const AGENT_GRANT = /\bagents?\b[^.\n|]*\b(may|can|could|allowed|permitted|authori[sz]ed)\b[^.\n|]*\b(merg|deploy|auto-merge|force-push|rebase)/i;

/** AGENTS.md: other non-negotiable rules, as phrases the file must contain verbatim (case-insensitive, whitespace-insensitive). */
const AGENTS_RULES = [
  // loop + exact head + reconciliation
  "baseline gate",
  "exact final commit sha proposed for merge",
  "green ci on an earlier commit is not evidence for a newer head",
  "git merge origin/main",
  "never a rebase",
  "never reset `main` backwards",
  // fail-first + mutation
  "reproducible fail-first evidence",
  "actually executed against the defective baseline",
  "a **timeout is not a killed mutant.**",
  "files are restored byte-for-byte after each mutation",
  // grading + coding safety
  "never manufacture an academic zero",
  "trusted hidden-test grading",
  "runner isolation",
  "api-owned grading authority",
  "versioned coding question semantics",
  "`reviewrequired` compile-error policy",
  "target revision authority",
  "callback / hmac boundaries",
  // phase record (RF1-2): no enterprise document is manufactured for governance phases
  "governance or documentation-only phases use their canonical development document",
  "never create an enterprise document only to satisfy wording",
  // deployment
  "never report \"nothing deployed\" when a pr preview was actually created",
  "a preview exists **only when the `build and deploy job` succeeded**",
  "never claim a preview when that job failed, was cancelled or did not run",
  "never deploy the live runner",
  "smartassess_allow_production_load_test=i_understand",
  // handoff
  "⛔ do not merge — independent review required",
  "does not modify production code during the review",
];

const TEMPLATE_SECTIONS = [
  "Baseline and branch", "Files changed", "Fail-first evidence", "Tests", "Mutations", "Backward compatibility",
  "Security and privacy", "Deployment boundary", "Exact-head CI", "Known limitations", "Independent-review status",
];
const TEMPLATE_FIELDS = ["Baseline SHA", "Branch", "Head SHA", "Scope", "AUTO-MERGE OFF", "PR preview environment"];

const norm = s => s.toLowerCase().replace(/\r\n/g, "\n");
/** Hard-wrapped prose compares as a single line. */
const flat = s => norm(s).replace(/\s+/g, " ");
/** Relative markdown links / backticked repository paths that must resolve: `path/to/file.ext` with a known extension. */
const repoPaths = text => [...new Set([...text.matchAll(/`((?:\.github|docs|scripts|src|api|runner)\/[A-Za-z0-9_./-]+\.(?:md|mjs|js|ts|tsx|yml|json))`/g)].map(m => m[1]))].filter(p => !p.includes("*") && !p.includes("<"));

describe("repository governance contract (18A)", () => {
  it.each(Object.values(FILES))("%s exists and is not empty", rel => {
    expect(exists(rel), rel + " must exist").toBe(true);
    expect(read(rel).trim().length, rel + " must not be empty").toBeGreaterThan(200);
  });

  describe("AGENTS.md", () => {
    const text = read(FILES.agents), low = norm(text), one = flat(text);
    it.each(AGENTS_SECTIONS)("keeps the section “%s”", title => {
      expect(low).toMatch(new RegExp("^##\\s+\\d+\\.\\s+" + title.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "m"));
    });
    it.each(AGENTS_RULES)("keeps the rule “%s”", rule => {
      expect(one, "AGENTS.md lost a non-negotiable rule").toContain(rule);
    });

    // §2 Authority — polarity, not vocabulary. The section runs from its heading to the next "## " heading; the two blocks
    // are delimited by their exact headings. A heading that appears 0 or 2+ times, or in the wrong order, fails here.
    const authority = (low.match(/^##\s+\d+\.\s+authority\s*$[\s\S]*?(?=^##\s)/m) || [""])[0];
    const MAY = "agents **may**:", MUST_NOT = "agents **must not**:";
    const mayAt = authority.indexOf(MAY), mustNotAt = authority.indexOf(MUST_NOT);
    const mayBlock = flat(mayAt >= 0 && mustNotAt > mayAt ? authority.slice(mayAt, mustNotAt) : "");
    const mustNotBlock = flat(mustNotAt >= 0 ? authority.slice(mustNotAt) : "");
    const outsideMustNot = flat(mustNotAt >= 0 ? authority.slice(0, mustNotAt) : authority);
    it("§2 has exactly one `Agents **may**:` block followed by exactly one `Agents **must NOT**:` block", () => {
      expect(authority, "Authority section missing").not.toBe("");
      expect(authority.split(MAY).length - 1, "may-heading count").toBe(1);
      expect(authority.split(MUST_NOT).length - 1, "must-NOT-heading count").toBe(1);
      expect(mayAt, "may block must come before the must-NOT block").toBeLessThan(mustNotAt);
      expect(mayBlock.length).toBeGreaterThan(40);
      expect(mustNotBlock.length).toBeGreaterThan(40);
    });
    it.each(AUTHORITY_SENTENCES)("§2 states owner-only merge authority: “%s”", s => {
      expect(flat(authority)).toContain(s);
    });
    it.each(FORBIDDEN)("§2 forbids (inside must-NOT, absent from may): “%s”", rule => {
      expect(mustNotBlock, "forbidden rule left the must-NOT block").toContain(rule);
      expect(mayBlock, "forbidden rule appears in the may block").not.toContain(rule);
    });
    it.each(ALLOWED)("§2 allows (inside may, absent from must-NOT): “%s”", rule => {
      expect(mayBlock, "allowed rule left the may block").toContain(rule);
      expect(mustNotBlock, "allowed rule appears in the must-NOT block").not.toContain(rule);
    });
    it("§2 never grants an agent merge / deploy / history-rewrite authority outside the must-NOT block", () => {
      expect(outsideMustNot).not.toMatch(AGENT_GRANT);
      expect(mayBlock).not.toMatch(/\b(merge|deploy|auto-merge|force-push|rebase|amend|squash|secret|rotate|production data)\b/);
    });
    it("spells out the canonical loop, in order, in its own fenced block", () => {
      const block = low.match(/```\n(baseline gate[\s\S]*?)```/);
      expect(block, "the canonical loop code block is missing").not.toBeNull();
      const loop = block[1].replace(/\s+/g, " ");
      const steps = ["baseline gate", "branch", "fail-first", "implementation", "focused tests", "full validation", "mutation proof", "exact-head ci", "independent review", "review fix", "owner manual merge", "post-merge verification"];
      let pos = -1;
      for (const s of steps) { const i = loop.indexOf(s, pos + 1); expect(i, "loop step missing or out of order: " + s).toBeGreaterThan(pos); pos = i; }
    });
    it("points at the companion documents and the contract check", () => {
      for (const rel of [FILES.workflow, FILES.matrix, FILES.template, "scripts/repo-governance-contract.test.mjs"]) expect(text).toContain(rel);
    });
    it("names the five deployment tiers", () => {
      for (const tier of ["local tests", "ci", "azure pr preview", "production static web app", "live coding runner vm"]) expect(one).toContain(tier);
    });
  });

  describe("development documents", () => {
    it("the workflow document defines the five roles and the review protocol", () => {
      const low = flat(read(FILES.workflow));
      for (const role of ["repository owner", "implementation agent", "independent reviewer", "github actions", "codex / future agents"]) expect(low, "role row missing: " + role).toContain("| **" + role + "** |");
      for (const rule of ["do not modify production code during the review", "do not merge", "normal merge", "tool-neutral", "clean — approved for owner merge", "not ready — review fix required"]) expect(low).toContain(rule);
    });
    it("the validation matrix covers every required check and the Docker clarifications", () => {
      const low = flat(read(FILES.matrix));
      for (const check of ["root unit / api / ui tests", "lint", "typescript build / typecheck", "application build", "bundle guard", "runner unit suite", "docker security / smoke tests", "official grading docker tests", "mutation tests", "load / certification harness", "diff-check"]) expect(low, "matrix check row missing: " + check).toMatch(new RegExp("\\| c\\d+ \\| " + check.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + " \\|"));
      expect(low).toContain("documentation-only pr does not run docker manually");
      expect(low).toContain("production runner changes must satisfy the existing runner ci");
    });
    it("every npm script the matrix names exists in the package it belongs to", () => {
      const rootScripts = JSON.parse(read("package.json")).scripts, runnerScripts = JSON.parse(read("runner/package.json")).scripts;
      const text = read(FILES.matrix) + read(FILES.agents);
      for (const m of text.matchAll(/npm run ([a-z:-]+)/g)) expect(rootScripts, "root script missing: " + m[1]).toHaveProperty(m[1]);
      for (const m of text.matchAll(/npm --prefix runner run ([a-z:-]+)/g)) expect(runnerScripts, "runner script missing: " + m[1]).toHaveProperty(m[1]);
    });
    it("the workflows the documents name exist", () => {
      const text = read(FILES.workflow) + read(FILES.matrix) + read(FILES.agents);
      for (const m of text.matchAll(/`([a-z-]+\.yml)`/g)) {
        const file = m[1];
        expect(exists(".github/workflows/" + file), "workflow missing: " + file).toBe(true);
      }
    });
    it("README points at the operating contract", () => {
      expect(read(FILES.readme)).toContain("`AGENTS.md`");
    });
  });

  describe("pull request template", () => {
    const text = read(FILES.template), low = norm(text), one = flat(text);
    it("starts with the DO NOT MERGE line and auto-merge OFF", () => {
      expect(low.split("\n")[0]).toContain("⛔ do not merge — independent review required");
      expect(low.split("\n")[0]).toContain("auto-merge off");
    });
    it.each(TEMPLATE_SECTIONS)("has the section “%s”", s => {
      expect(low).toMatch(new RegExp("^##\\s+" + s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "m"));
    });
    it.each(TEMPLATE_FIELDS)("captures “%s”", f => { expect(one).toContain(f.toLowerCase()); });
    it("hard-codes no transient commit SHA (placeholders only)", () => {
      expect(text, "full SHA in template").not.toMatch(/\b[0-9a-f]{40}\b/);
      expect(text, "short SHA in template").not.toMatch(/`[0-9a-f]{7,12}`/);
    });
    it("tells the author to report the OBSERVED preview result, never an unconditional claim (RF1-3)", () => {
      expect(one).toContain("pr preview environment");
      expect(one).toContain("live coding runner vm");
      expect(one).toContain("only when the `build and deploy job` succeeded");
      expect(one).toContain("never claim a preview when that job did not succeed");
      expect(one, "unconditional preview claim").not.toMatch(/preview environment[^.]*\b(is|are) created[^.]*for every pull request/);
    });
  });

  it("every repository path the governance files mention resolves", () => {
    for (const rel of [FILES.agents, FILES.workflow, FILES.matrix, FILES.template]) {
      for (const p of repoPaths(read(rel))) expect(exists(p), rel + " references a missing path: " + p).toBe(true);
    }
  });
});
