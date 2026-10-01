import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Phase 17A — architecture / security guards for the coding engine core (C32 + spec §28 / §74):
//   • NO student code is ever executed by the application: no eval / new Function / node:vm / child_process / worker_threads
//     / exec / spawn / fork / non-literal dynamic import / non-literal require anywhere in production source (src/ + api/src/)
//   • the coding UI never renders source through dangerouslySetInnerHTML / innerHTML / srcdoc / document.write
//   • the coding engine and SmartSim stay separate (no code answer reaches the simulator runtime)
//   • the test-only fake provider is never imported by production code
//   • nothing branches on a language literal or a subject; the editor and coding panels stay LAZY (never in the initial graph)
// Fail-first on 7af619a4 (coding files absent).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const raw = f => fs.readFileSync(path.join(repo, f), "utf8");
const read = f => strip(raw(f));
const exists = f => fs.existsSync(path.join(repo, f));

const SHARED_FILES = ["src/codingQuestion.ts", "src/codingContract.ts"];
const CLIENT_FILES = ["src/coding/CodingEditor.tsx", "src/coding/CodeSourceView.tsx", "src/coding/codingExecution.ts", "src/coding/codingTests.ts", "src/questionTypes/student/CodingResponse.tsx", "src/questionTypes/editors/CodingQuestionEditor.tsx"];
const SERVER_FILES = ["api/src/lib/coding/execution-provider.js"];
const CODING_FILES = [...SHARED_FILES, ...CLIENT_FILES, ...SERVER_FILES];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "tests", "dist"].includes(e.name)) walk(rel, out); continue; }
    if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(rel);
  }
  return out;
}
const PRODUCTION = [...walk("src"), ...walk("api/src")];

// Execution primitives that must never appear in production code (comments are stripped first; string DATA such as the
// executable-field denylist "eval" is not a call and is not matched).
const EXECUTION_PATTERNS = [
  ["eval(", /(?<![.\w$])eval\s*\(/],
  ["new Function", /\bnew\s+Function\s*\(/],
  ["Function( constructor", /(?<![.\w$])Function\s*\(\s*["'`]/],
  ["node:vm", /from\s*["'](node:)?vm["']|require\(\s*["'](node:)?vm["']\s*\)/],
  ["child_process", /child_process/],
  ["worker_threads", /worker_threads/],
  ["exec/spawn/fork", /(?<![.\w$])(exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/],
  ["non-literal dynamic import", /(?<![.\w$])import\s*\(\s*(?!["'`])[^)]/],
  ["non-literal require", /(?<![.\w$])require\s*\(\s*(?!["'`])[^)]/],
  ["string timer", /(?<![.\w$])set(Timeout|Interval)\s*\(\s*["'`]/]
];
const HTML_SINKS = /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|srcdoc|srcDoc/;

describe("C32 — no production source path can execute student code", () => {
  it("every coding module exists (shared contract, client UI, server provider)", () => {
    for (const f of CODING_FILES) expect(exists(f), f).toBe(true);
  });
  it("the coding modules contain NO execution primitive (eval, new Function, vm, child_process, worker_threads, exec / spawn / fork, dynamic import / require of a variable, string timers)", () => {
    for (const f of CODING_FILES) {
      const src = read(f);
      for (const [name, re] of EXECUTION_PATTERNS) expect(re.test(src), f + " uses " + name).toBe(false);
    }
  });
  it("GLOBAL: the whole production tree (src/ + api/src/) is free of every execution primitive — the API process is not a sandbox", () => {
    const hits = [];
    for (const f of PRODUCTION) {
      const src = read(f);
      for (const [name, re] of EXECUTION_PATTERNS) if (re.test(src)) hits.push(f + ": " + name);
    }
    expect(hits).toEqual([]);
  });
  it("no Docker / container orchestration / process spawning is introduced (Phase 17B owns the isolated runner deployment)", () => {
    for (const f of CODING_FILES) expect(read(f), f).not.toMatch(/docker|dockerode|kubectl|containerd|process\.binding|\.spawn\(/i);
    expect(exists("api/src/functions/coding-run.js")).toBe(false);                                  // no /api/coding/run in 17A (deferred, documented)
  });
  it("the server provider never falls back to local execution: without a trusted provider it answers EXECUTION_UNAVAILABLE", () => {
    const src = read("api/src/lib/coding/execution-provider.js");
    expect(src).toContain("EXECUTION_UNAVAILABLE");
    expect(src).not.toMatch(/require\(["']\.\.\/\.\.\/\.\.\/tests|fake-coding-execution-provider/);
  });
  it("the test-only fake provider is never imported by production code", () => {
    for (const f of PRODUCTION) expect(raw(f), f).not.toContain("fake-coding-execution-provider");
  });
});

describe("Student source is TEXT everywhere it is displayed", () => {
  it("the coding UI and the teacher review never use an HTML sink (dangerouslySetInnerHTML / innerHTML / srcdoc / document.write)", () => {
    for (const f of [...CLIENT_FILES, "src/AssignmentReview.tsx"]) expect(HTML_SINKS.test(read(f)), f).toBe(false);
  });
  it("the review renders a code answer through the shared read-only CodeSourceView (text children only)", () => {
    expect(read("src/AssignmentReview.tsx")).toMatch(/CodeSourceView/);
    expect(read("src/coding/CodeSourceView.tsx")).toMatch(/<pre[\s\S]*\{source\}/);
  });
});

describe("Coding and SmartSim stay separate products", () => {
  it("no code answer is ever sent to the SmartSim runtime; the coding modules never import the simulation host / bridge", () => {
    for (const f of ["src/smartsim/SimulationSandboxHost.tsx", "src/smartsim/smartsimBridge.ts", "src/questionTypes/student/SimulationResponse.tsx"]) expect(read(f), f).not.toMatch(/kind:\s*"code"|coding/);
    for (const f of CODING_FILES) expect(read(f), f).not.toMatch(/smartsim|SimulationSandboxHost|srcdoc|<iframe/i);
  });
});

describe("Language is data; the engine is domain-neutral", () => {
  it("no coding module branches on a language literal (if language === 'python' …) — behaviour comes from the registry", () => {
    for (const f of [...CLIENT_FILES, ...SERVER_FILES, "src/codingContract.ts"]) expect(read(f), f).not.toMatch(/[!=]==?\s*["'](javascript|typescript|python|java|csharp|cpp|sql)["']|case\s+["'](javascript|typescript|python|java|csharp|cpp|sql)["']/);
  });
  it("no subject-specific branch anywhere in the coding engine", () => {
    for (const f of CODING_FILES) expect(read(f), f).not.toMatch(/subject\s*[!=]==|computerScience|networking|physics|mathematics/i);
  });
  it("17A promises no runtime / toolchain versions, no internet, no package installation", () => {
    for (const f of CODING_FILES) expect(read(f), f).not.toMatch(/python\s*3\.\d|java\s*2\d|npm install|pip install|nuget|maven/i);
  });
});

describe("CM18 — the editor and coding panels never enter the initial graph", () => {
  const INITIAL_PATH = ["src/main.tsx", "src/App.tsx", "src/StudentExamPage.tsx", "src/StudentQuestionCard.tsx", "src/questionTypeCatalog.ts", "src/answerState.ts", "src/examBuilderState.ts", "src/questionTypeDefaults.ts", "src/examPreviewModel.ts", "src/examStructure.ts"];
  it("initial-path modules never import a coding module statically", () => {
    for (const f of INITIAL_PATH) expect(read(f), f).not.toMatch(/from\s*["'][./]*(coding\/|codingQuestion|codingContract|questionTypes\/(student|editors)\/Coding)/);
  });
  it("the registries load the coding renderer / editor through lazy(() => import(...)) only", () => {
    expect(read("src/questionTypes/studentRegistry.tsx")).toMatch(/registerStudentRenderer\("coding",\s*1,\s*lazy\(\(\)\s*=>\s*import\("\.\/student\/CodingResponse"\)\)\)/);
    expect(read("src/questionTypes/authoringRegistry.tsx")).toMatch(/registerAuthoringEditor\("coding",\s*1,\s*lazy\(\(\)\s*=>\s*import\("\.\/editors\/CodingQuestionEditor"\)\)\)/);
    for (const f of ["src/questionTypes/studentRegistry.tsx", "src/questionTypes/authoringRegistry.tsx"]) expect(read(f), f).not.toMatch(/^import[^;]*Coding/m);
  });
  it("the production bundle guard refuses a build whose INITIAL graph carries the coding editor payload", () => {
    const guard = raw("scripts/check-bundle-budget.mjs");
    expect(guard).toMatch(/CODING_SIGNATURES/);
    expect(guard).toMatch(/cx-code-input/);
    expect(read("src/coding/CodingEditor.tsx")).toContain("cx-code-input");
  });
});
