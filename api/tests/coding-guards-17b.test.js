import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Phase 17B — architecture / security guards for the secure coding runner:
//   • student code NEVER executes inside src/ or api/src/ (the 17A global scan stays in force); process-spawning production code
//     exists ONLY in runner/ — and inside runner/ only in the one sandbox module, with a fixed argument array and no shell;
//   • application code never imports from runner/; the runner never imports platform storage / auth / grading / OpenAI and
//     never reads application secrets; the runner has zero third-party dependencies;
//   • exactly three languages end-to-end (python, java, csharp): app registry, gateway registry, worker images;
//   • worker images are built from digest-pinned official bases, run as a numeric non-root user, never fetch packages at run time;
//   • hidden tests / reference solutions never reach the practice path; coding@1 stays manual-graded (17C owns official grading);
//   • the new CI workflow uses no secrets and the SWA workflow keeps every gate.
// Fail-first on fe086e36: runner/, the run route, the remote provider and the workflow do not exist.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const raw = f => fs.readFileSync(path.join(repo, f), "utf8");
const read = f => strip(raw(f));
const exists = f => fs.existsSync(path.join(repo, f));
function walk(dir, out = [], re = /\.(ts|tsx|js|mjs|cjs)$/) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(path.join(repo, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "dist"].includes(e.name)) walk(rel, out, re); continue; }
    if (re.test(e.name)) out.push(rel);
  }
  return out;
}
const isTest = f => /(^|\/)tests\/|\.test\.|\.rtest\.|\.d\.ts$/.test(f);

// Phase 17C deliberately adds official.js (the bounded official grading queue) and callback.js (signed evidence delivery); neither
// may start a process — child_process stays confined to sandbox.js (asserted below).
const RUNNER_GATEWAY = ["runner/gateway/main.js", "runner/gateway/server.js", "runner/gateway/auth.js", "runner/gateway/registry.js", "runner/gateway/validate.js", "runner/gateway/sandbox.js", "runner/gateway/official.js", "runner/gateway/callback.js"];
const RUNNER_FILES = [...RUNNER_GATEWAY, "runner/workers/supervisor.py", "runner/workers/python/Dockerfile", "runner/workers/java/Dockerfile", "runner/workers/csharp/Dockerfile", "runner/workers/python/toolchain.json", "runner/workers/java/toolchain.json", "runner/workers/csharp/toolchain.json", "runner/package.json", "runner/README.md", "runner/scripts/build-images.sh"];
const API_FILES = ["api/src/functions/coding-run.js", "api/src/lib/coding/execution-provider.js", "api/src/lib/coding/runner-config.js", "api/src/lib/coding/runner-protocol.js", "api/src/lib/coding/run-rate-limit.js"];
const CLIENT_FILES = ["src/coding/codingRunClient.ts", "src/questionTypes/student/CodingResponse.tsx", "src/questionTypes/studentAttemptContext.ts"];

const EXEC = [
  ["eval(", /(?<![.\w$])eval\s*\(/], ["new Function", /\bnew\s+Function\s*\(/], ["node:vm", /from\s*["'](node:)?vm["']|require\(\s*["'](node:)?vm["']\s*\)/],
  ["child_process", /child_process/], ["worker_threads", /worker_threads/], ["exec/spawn/fork", /(?<![.\w$])(exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(/],
  ["non-literal require", /(?<![.\w$])require\s*\(\s*(?!["'`])[^)]/], ["non-literal import", /(?<![.\w$])import\s*\(\s*(?!["'`])[^)]/]
];

describe("R1 — the runner subtree exists, is self-contained and is the ONLY place that may start processes", () => {
  it("every runner component exists (gateway, workers, supervisor, images, build script, README, package)", () => {
    for (const f of RUNNER_FILES) expect(exists(f), f).toBe(true);
    for (const f of [...API_FILES, ...CLIENT_FILES]) expect(exists(f), f).toBe(true);
  });
  it("GLOBAL: src/ and api/src/ (production) still contain NO execution primitive — the 17A invariant is not relaxed", () => {
    const hits = [];
    for (const f of [...walk("src"), ...walk("api/src")].filter(f => !isTest(f))) for (const [n, re] of EXEC) if (re.test(read(f))) hits.push(f + ": " + n);
    expect(hits).toEqual([]);
  });
  it("inside runner/, child_process appears ONLY in gateway/sandbox.js; no eval / vm / workers / exec / execFile / shell anywhere", () => {
    const prod = walk("runner").filter(f => !isTest(f));
    expect(prod.sort()).toEqual([...RUNNER_GATEWAY].sort());
    for (const f of prod) {
      const src = read(f);
      if (f !== "runner/gateway/sandbox.js") for (const [n, re] of EXEC) expect(re.test(src), f + " uses " + n).toBe(false);
      expect(src, f).not.toMatch(/shell:\s*true|execSync|execFile|(?<![.\w$])exec\s*\(|spawnSync|eval\s*\(|new\s+Function|node:vm|worker_threads/);
    }
    const sb = read("runner/gateway/sandbox.js");
    expect(sb).toMatch(/require\(["']node:child_process["']\)/);
    expect(sb).toMatch(/shell:\s*false/);
  });
  it("the runner has zero third-party dependencies and is not an Azure Function / not part of the Vite graph", () => {
    const pkg = JSON.parse(raw("runner/package.json"));
    expect(pkg.dependencies || {}).toEqual({}); expect(pkg.devDependencies || {}).toEqual({});
    expect(pkg.private).toBe(true);
    for (const f of walk("runner").filter(f => !isTest(f))) {
      const src = read(f);
      expect(src, f).not.toMatch(/@azure\/functions|app\.http\(|from\s+["']react|require\(["'](?!node:)[^"'./][^"']*["']\)/);
    }
    for (const f of ["vite.config.ts", "tsconfig.app.json", "tsconfig.json"]) expect(raw(f), f).not.toMatch(/runner\//);
  });
});

describe("R2 — import boundaries in both directions", () => {
  it("application / API / build code never imports from runner/", () => {
    for (const f of [...walk("src"), ...walk("api/src"), ...walk("scripts")].filter(f => !isTest(f))) expect(raw(f), f).not.toMatch(/(from\s*|require\(\s*|import\(\s*)["'][^"']*\brunner\/(gateway|workers)/);
  });
  it("the runner never imports platform storage, student / builder auth, assignment grading, OpenAI, Azure SDKs or anything from src/ / api/", () => {
    for (const f of walk("runner").filter(f => !isTest(f))) {
      const src = raw(f);
      expect(src, f).not.toMatch(/platform-storage|student-auth|builder-auth|assignment-grading|question-type-graders|openai|@azure|api\/src|\.\.\/\.\.\/src\/|draft-answers|student-exam-sanitize/);
    }
  });
  it("the runner never reads application secrets (storage connection strings, session secrets, OpenAI / VAPID keys); its own key has its own name", () => {
    for (const f of [...walk("runner").filter(f => !isTest(f)), ...walk("runner", [], /(Dockerfile|\.py|\.sh|\.json)$/)]) {
      expect(raw(f), f).not.toMatch(/AZURE_STORAGE_CONNECTION_STRING|STUDENT_SESSION_SECRET|BUILDER_SESSION_SECRET|BUILDER_PASSWORD|BANK_SETUP_KEY|OPENAI_API_KEY|VAPID|CODING_RUNNER_HMAC_KEY/);
    }
    expect(read("runner/gateway/main.js")).toMatch(/RUNNER_HMAC_KEY/);
    expect(read("api/src/lib/coding/runner-config.js")).toMatch(/CODING_RUNNER_HMAC_KEY/);
  });
  it("the HMAC key is never logged or echoed by the gateway or the API configuration", () => {
    expect(read("runner/gateway/main.js")).not.toMatch(/(log|info|warn|error)\([^)]*(key|KEY)\b/);
    expect(read("api/src/lib/coding/runner-config.js")).toMatch(/enumerable:\s*false|#key|WeakMap/);
  });
});

describe("R3 — exactly three languages, data-driven", () => {
  it("app registry, gateway registry and worker images all name EXACTLY python, java, csharp", async () => {
    const reg = (await import("../../runner/gateway/registry.js")).default || (await import("../../runner/gateway/registry.js"));
    expect(Object.values(reg.LANGUAGES).map(e => e.key).sort()).toEqual(["csharp", "java", "python"]);
    expect(fs.readdirSync(path.join(repo, "runner/workers"), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort()).toEqual(["csharp", "java", "python"]);
    expect(read("src/codingQuestion.ts").match(/lang\("([a-z]+)"/g)).toEqual(['lang("python"', 'lang("java"', 'lang("csharp"']);
    for (const w of ["python", "java", "csharp"]) expect(JSON.parse(raw("runner/workers/" + w + "/toolchain.json"))).toMatchObject({ language: w, languageVersion: 1 });
  });
  it("no application / API / gateway logic branches on a language literal (only the registries carry language data)", () => {
    for (const f of [...API_FILES, ...CLIENT_FILES, "runner/gateway/server.js", "runner/gateway/sandbox.js", "runner/gateway/validate.js", "runner/gateway/auth.js", "runner/gateway/main.js"]) {
      expect(read(f), f).not.toMatch(/[!=]==?\s*["'](python|java|csharp)["']|case\s+["'](python|java|csharp)["']|\[["'](python|java|csharp)["']\]/);
    }
    expect(read("runner/workers/supervisor.py")).not.toMatch(/==\s*["'](python|java|csharp)["']/);
  });
  it("no other toolchain is introduced (no JavaScript / Node / C++ / SQL worker, no Maven / Gradle / NuGet / pip at run time)", () => {
    for (const f of walk("runner/workers", [], /(Dockerfile|\.json|\.py)$/)) {
      expect(raw(f), f).not.toMatch(/\bnode(js)?:|gcc|g\+\+|clang|sqlite|postgres|mysql|mvn |gradle|nuget|pip install|npm install|apt-get install|apk add/i);
    }
  });
});

describe("R4 — worker images: pinned, non-root, offline", () => {
  it("every FROM is an official image pinned by sha256 digest", () => {
    for (const w of ["python", "java", "csharp"]) {
      const froms = raw("runner/workers/" + w + "/Dockerfile").split("\n").filter(l => /^\s*FROM\s/i.test(l));
      expect(froms.length, w).toBeGreaterThan(0);
      for (const l of froms) expect(l, w).toMatch(/^FROM (public\.ecr\.aws\/docker\/library\/(python|eclipse-temurin)|mcr\.microsoft\.com\/dotnet\/sdk)@sha256:[0-9a-f]{64}( AS \w+)?\s*$/);
    }
  });
  it("images run as a numeric non-root USER, add no remote content and bake no secrets", () => {
    for (const w of ["python", "java", "csharp"]) {
      const d = raw("runner/workers/" + w + "/Dockerfile");
      expect(d, w).toMatch(/^USER 10001:10001\s*$/m);
      expect(d, w).not.toMatch(/^ADD\s+https?:|curl |wget |SECRET|TOKEN|PASSWORD|_KEY=/m);
      expect(d, w).toMatch(/ENTRYPOINT \["\/usr\/local\/bin\/python3", "-I", "-S", "\/opt\/runner\/supervisor\.py"\]/);
    }
  });
});

describe("R5 — practice only: no hidden tests on the run path, no official grading change", () => {
  it("the run route, the client and the provider never read hidden tests, expected outputs, reference solutions or the answer key", () => {
    for (const f of [...API_FILES, ...CLIENT_FILES]) expect(read(f), f).not.toMatch(/hiddenTests|expectedOutput|referenceSolutions|\.answer\b|weightedPassFraction/);
  });
  it("coding@1 is still graded manually (score 0) and weightedPassFraction is not wired to marks", () => {
    expect(read("api/src/lib/question-type-graders.js")).toMatch(/registerBuiltIn\("coding",\s*\(\)\s*=>\s*\(\{\s*score:\s*0,\s*manualReview:\s*true/);
    for (const f of walk("api/src").filter(f => !isTest(f) && !f.includes("shared-finalization"))) expect(read(f), f).not.toMatch(/weightedPassFraction/);
  });
  it("the Answer shape is unchanged: no execution result is ever stored in a code answer", () => {
    expect(read("src/answerState.ts")).toMatch(/\{kind:"code";language:string;languageVersion:number;source:string\}/);
    expect(read("src/questionTypes/student/CodingResponse.tsx")).toMatch(/onAnswer\(\{ kind: "code", language: lang, languageVersion: codingLanguage\(lang\)!\.version, source: src \}\)/);
  });
});

describe("R6 — UI wiring stays lazy and token-safe", () => {
  it("the initial path never imports coding modules; the run client is imported only by the lazy coding renderer", () => {
    for (const f of ["src/StudentExamPage.tsx", "src/StudentQuestionCard.tsx", "src/App.tsx", "src/main.tsx"]) expect(read(f), f).not.toMatch(/from\s*["'][./]*(coding\/|codingQuestion|codingContract)/);
    const importers = [...walk("src")].filter(f => !isTest(f) && /codingRunClient/.test(read(f)));
    expect(importers).toEqual(["src/questionTypes/student/CodingResponse.tsx"]);
  });
  it("StudentExamPage provides the generic attempt context; the token stays inside a request function (never in context data, storage or the exam state)", () => {
    const page = read("src/StudentExamPage.tsx");
    expect(page).toMatch(/StudentAttemptContext\.Provider/);
    const ctx = read("src/questionTypes/studentAttemptContext.ts");
    expect(ctx).not.toMatch(/token\s*:/);
    for (const f of CLIENT_FILES) expect(read(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
  it("execution output is rendered as text only", () => {
    for (const f of CLIENT_FILES) expect(read(f), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML|srcdoc|document\.write/);
  });
});

describe("R7 — CI: a dedicated runner workflow with no secrets; the SWA gates are untouched", () => {
  const wf = ".github/workflows/coding-runner-security.yml";
  it("the runner workflow exists, is named, uses no secrets / Azure credentials, and has read-only permissions", () => {
    expect(exists(wf)).toBe(true);
    const y = raw(wf);
    expect(y).toMatch(/^name: Coding Runner Security & Smoke Tests$/m);
    expect(y).not.toMatch(/secrets\.|azure|AZURE|continue-on-error:\s*true/);
    expect(y).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    for (const step of ["npm --prefix runner test", "npm --prefix runner run build:images", "npm --prefix runner run test:docker"]) expect(y, step).toContain(step);
  });
  it("the SWA workflow still runs tests, build and lint before deploy (not weakened, nothing skipped)", () => {
    const y = raw(".github/workflows/azure-static-web-apps-white-grass-0ce642c10.yml");
    for (const s of ["run: npm test", "run: npm run build", "run: npm run lint", "needs: quality_gate"]) expect(y, s).toContain(s);
    expect(y).not.toMatch(/continue-on-error|--passWithNoTests|\|\| true/);
  });
});
