import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Tadris+ P9-B1 — the certification INDEX of the blueprint's 15 mandatory acceptance tests (§14.2). Each acceptance test names the
// tests that prove it, by file and exact title; this check fails when a named test is renamed or removed, when an acceptance test is
// left without evidence at a level the blueprint asks for, or when the certification record (docs/enterprise-certification-p9b1.md)
// stops listing it. The E2E level is the real-Chromium gate scripts/check-access-e2e-p9b1.mjs (its own workflow).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const E2E = "scripts/check-access-e2e-p9b1.mjs";
const DOC = "docs/enterprise-certification-p9b1.md";

// level: "API" (api/tests), "UI" (src/ tests), "E2E" (the browser gate: `title` is the exact fragment of its source), "Mutation"
const INDEX = {
  1: [
    ["API", "api/tests/enforcement-routes-p3b.test.js", "blueprint test #1: a learning-only teacher does not open the exam builder or its AI"],
    ["API", "api/tests/enforce-switch-p3b2.test.js", "enforcement on → a learning-only teacher's AI tools are refused, classes allowed; back to observe → allowed on the next request"],
    ["API", "api/tests/certification-route-sweep-p9b1.test.js", "never assigned (default deny): every route, every action, GET and POST → 403 CAPABILITY_DENIED; nothing stored changes"],
    ["UI", "src/AppShell.p3c.test.tsx", "enforced learning-only: lands on its dashboard, the builder is not offered, and no extra request is made"],
    ["E2E", E2E, 'check("#1 server ']
  ],
  2: [
    ["API", "api/tests/course-entitlements-p5a.test.js", "enforce, only A: the teacher's library, trainings, item preview, class release and the students all follow"],
    ["API", "api/tests/course-entitlements-p5a.test.js", "a course the teacher is NOT entitled to is not served to the teacher (enforce), nor to their students"],
    ["API", "api/tests/course-entitlements-p5a.test.js", "no list = every published course; an empty list = none"],
    ["E2E", E2E, 'check("#2 catalog"']
  ],
  3: [
    ["API", "api/tests/learning-content-l6a.test.js", "acceptance test #3: a module published to class A never opens for a student of class B (B publishes another); each sees its own"],
    ["API", "api/tests/learning-content-l6a.test.js", "the PERSISTED class decides, never the token's class claim"],
    ["API", "api/tests/student-learning-materials.test.js", "Case 5: token says class A, persisted student is in class B → class B's publication wins"],
    ["API", "api/tests/learning-study.test.js", "MOVED STUDENT: the persisted class decides over the token"]
  ],
  4: [
    ["API", "api/tests/course-entitlements-p5a.test.js", "acceptance test #4: narrowing the teacher's courses hides B, keeps every stored byte (progress, notes, class), and widening restores it"],
    ["API", "api/tests/course-entitlements-p5a.test.js", "history stays: the student's own progress and notes are still readable; nothing stored changes"],
    ["API", "api/tests/class-learning-materials.test.js", "removes only the selected learning course; roster, projects and lifecycle untouched; content is never deleted"]
  ],
  5: [
    ["API", "api/tests/library-keys-p6a.test.js", "assign by reference, edit the assignment, change the received copy: the item, its ETag and the next assignment are unchanged"],
    ["API", "api/tests/library-keys-p6a.test.js", "no API module can write the library: no route or library module writes files, and the one asset writer is a build-script helper"],
    ["API", "api/tests/content-asset-route-p5c.test.js", "the window's signed copy is shared and deep-frozen: changing one response never reaches the next (module and library item)"],
    ["API", "api/tests/library-keys-p6a.test.js", "a READY-assignments-only teacher cannot send a snapshot of their own (enforce); with libraryRef they can"],
    ["API", "api/tests/library-keys-p6a.test.js", "the stored snapshot is exactly the library's (cleaned like any snapshot); a browser snapshot sent alongside is ignored"],
    ["UI", "src/assignments/libraryRef.p6.test.tsx", "a library item is assigned by reference"],
    ["E2E", E2E, 'check("#5 template unchanged"']
  ],
  6: [
    ["API", "api/tests/certification-route-sweep-p9b1.test.js", "an assigned revision that denies everything: the same — 403 CAPABILITY_DENIED everywhere; nothing stored changes"],
    ["API", "api/tests/certification-route-sweep-p9b1.test.js", "observe: the very same requests are never refused (the 403s above are the enforcement, not a malformed request)"],
    ["API", "api/tests/route-capabilities-p3b.test.js", "every teacher route is declared or exempt — exactly once"],
    ["API", "api/tests/route-capabilities-p3b.test.js", "every declared route asks requireCapability with its own file name; an exempt route never does"]
  ],
  7: [
    ["API", "api/tests/dashboard-widgets-p7a2.test.js", "reports: without «ملخص العلامات» the academic part is withheld and the assessments report refused; without «تقييم المشاريع» the project reports"],
    ["API", "api/tests/dashboard-widgets-p7a2.test.js", "follow-up / insights only: no assignment document or submission is read"],
    ["API", "api/tests/dashboard-widgets-p7a2.test.js", "AI analysis without «ملخص العلامات» → 403 WIDGET_NOT_AVAILABLE, the model is never called"],
    ["API", "api/tests/dashboard-widgets-p7a2.test.js", "no assignment widget chosen: the assignment sources are not read at all, even with the capability"]
  ],
  8: [
    ["API", "api/tests/student-messages-p7b1.test.js", "the thread is refused, and nothing can be sent"],
    ["API", "api/tests/student-messages-p7b1.test.js", "the bell carries no message count and no message preview (the events stay)"],
    ["API", "api/tests/certification-route-sweep-p9b1.test.js", "never assigned (default deny): every route, every action, GET and POST → 403 CAPABILITY_DENIED; nothing stored changes"],
    ["UI", "src/StudentPortal.services.p7b1.test.tsx", "no messaging from the teacher: no «الرسائل» entry and no messages chip"]
  ],
  9: [
    ["API", "api/tests/teacher-tenancy-21g0.test.js", "another teacher's class cannot be changed, and is reported exactly like a missing one"],
    ["API", "api/tests/teacher-tenancy-21g0.test.js", "another teacher's student cannot be viewed, changed, reset, archived or moved"],
    ["API", "api/tests/teacher-tenancy-21g0.test.js", "another teacher cannot read the gradebook, a student's paper, the item analysis, or change attempts"],
    ["API", "api/tests/student-scope-p5b1.test.js", "only my own classes: another teacher's class or student is answered like a missing one; nothing written"]
  ],
  10: [
    ["API", "api/tests/student-scope-p5b1.test.js", "a student added to my class is archived and restored; their submissions are never touched"]
  ],
  11: [
    ["API", "api/tests/teacher-accounts-p2a2.test.js", "suspend → the very next request is 401; reactivating does NOT revive the old token"],
    ["API", "api/tests/teacher-accounts-p2a2.test.js", "an account marked suspended by any path (no authVersion change) is refused on the next request — the status guard alone"],
    ["API", "api/tests/legacy-import-p2b.test.js", "the imported account is an ordinary managed account: suspension takes effect on the next request"],
    ["Mutation", "scripts/mutate-p2a2a.mjs", ""]
  ],
  12: [
    ["API", "api/tests/teacher-appearance-p8a1.test.js", "a learning-only teacher with every appearance stored is still refused an assignments route"],
    ["API", "api/tests/teacher-appearance-p8a1.test.js", "no access / identity module reads the teacher profile document or its appearance"],
    ["UI", "src/shell/TeacherAppShell.p3c.test.tsx", "every palette and density: the same destinations (all, and limited), and a refused one stays «غير مفعّلة»"]
  ],
  13: [
    ["UI", "src/AppShell.p3c.test.tsx", "enforced learning-only after a reload: the probe's access applies — the builder is «غير مفعّلة», not offered, its data never requested"],
    ["UI", "src/AppShell.p3c.test.tsx", "the same reload when the access cannot be read: nothing is offered (fail closed), never the stored «teacher» everything"],
    ["UI", "src/shell/TeacherAppShell.p3c.test.tsx", "a destination reached directly that is not enabled shows «غير مفعّلة» (not the page), with a way to an allowed one"],
    ["E2E", E2E, '["reload", () => page.reload()]'],
    ["E2E", E2E, '["deep link /builder", () => page.goto(origin + "/builder")]'],
    ["E2E", E2E, 'check("#13 forged tab storage"']
  ],
  14: [
    ["API", "api/tests/access-registry-p3a.test.js", "an identity it cannot classify is refused (never full access)"],
    ["API", "api/tests/enforcement-routes-p3b.test.js", "the mode or a revision cannot be read → 503, never allowed"],
    ["API", "api/tests/owner-access-p3a.test.js", "a revision that cannot be trusted: the session stays valid, access is «unavailable» with no capabilities"],
    ["API", "api/tests/course-entitlements-p5a.test.js", "a revision that cannot be trusted while enforcing → unavailable (fail closed), never «everything»"],
    ["UI", "src/shell/TeacherAppShell.p3c.test.tsx", "access unavailable: nothing is offered (fail closed) and the teacher can retry"],
    ["UI", "src/AppShell.p3c.test.tsx", "unavailable: nothing is offered; «إعادة المحاولة» re-reads the session and recovers"],
    ["Mutation", "scripts/mutate-p3a.mjs", ""],
    ["Mutation", "scripts/mutate-p3c.mjs", ""]
  ],
  15: [
    ["API", "api/tests/legacy-ownership-p9a1.test.js", "applied: the class and its unowned students stamped; results byte-identical; the ledger keeps the previous values; audited twice"],
    ["API", "api/tests/legacy-ownership-p9a1.test.js", "«archive»: archived with the teachers' own rule, results kept; undo makes it active again"],
    ["API", "api/tests/legacy-import-p2b.test.js", "end to end: invitation → own password → sign-in by username → the old classes, exactly as before; new classes are its own"]
  ]
};
// The levels §14.2 asks for, per acceptance test (E2E where the blueprint says so; UI where it says UI).
const REQUIRED = { 1: ["API", "E2E"], 2: ["API", "E2E"], 3: ["API"], 4: ["API"], 5: ["API", "E2E"], 6: ["API"], 7: ["API"], 8: ["API", "UI"], 9: ["API"], 10: ["API"], 11: ["API", "Mutation"], 12: ["API", "UI"], 13: ["E2E"], 14: ["API", "UI", "Mutation"], 15: ["API"] };

const read = rel => readFileSync(join(ROOT, rel), "utf8");

describe("P9-B1 certification index — the 15 acceptance tests", () => {
  it("covers exactly the 15 acceptance tests, each at every level the blueprint asks for", () => {
    expect(Object.keys(INDEX).map(Number)).toEqual([...Array(15)].map((_, i) => i + 1));
    for (const [n, levels] of Object.entries(REQUIRED)) expect({ n, missing: levels.filter(l => !INDEX[n].some(e => e[0] === l)) }).toEqual({ n, missing: [] });
  });
  it("every named test exists, with its exact title, in its file (a test title in a test file; a check label in the browser gate)", () => {
    const missing = [];
    for (const [n, entries] of Object.entries(INDEX)) for (const [level, file, title] of entries) {
      if (!existsSync(join(ROOT, file))) { missing.push("#" + n + " " + file + " (no file)"); continue; }
      const text = read(file);
      if (level === "E2E") { if (!text.includes(title)) missing.push("#" + n + " " + file + " :: " + title); continue; }   // the gate's own source
      if (level === "Mutation") continue;
      const asTitle = ["it(\"", "it(`", "test(\""].some(p => text.includes(p + title));
      if (!asTitle) missing.push("#" + n + " " + file + " :: " + title);
    }
    expect(missing).toEqual([]);
  });
  it("the E2E gate runs in CI on its own workflow, enforcing, on the production build", () => {
    const wf = read(".github/workflows/access-e2e-p9b1.yml");
    expect(wf).toContain("node " + E2E);
    expect(wf).toContain("npm run build");
    expect(read(E2E)).toMatch(/mode: "enforce"/);
  });
  it("the certification record lists every acceptance test and every file of its evidence", () => {
    const doc = read(DOC);
    const gaps = [];
    for (const [n, entries] of Object.entries(INDEX)) {
      if (!new RegExp("\\|\\s*" + n + "\\s*\\|").test(doc)) gaps.push("#" + n + " row");
      for (const [, file] of entries) if (!doc.includes(file.split("/").pop())) gaps.push("#" + n + " " + file);
    }
    expect([...new Set(gaps)]).toEqual([]);
  });
});
