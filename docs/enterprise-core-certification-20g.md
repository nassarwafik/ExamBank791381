# Phase 20G — Core Enterprise Certification

This is the phase record. It certifies the complete ExamBank core after Phase 20F, end to end, with automated and reproducible evidence:
teacher → AI Composer → plan → structured exam → Builder edits → AI patch → preview → finalization → governance → assignment → sanitized student delivery → attempt → answering (composite, SmartSim, coding) → autosave → reload / restore → continue → submit → server grading → manual-review queues → teacher review → final score → review / audit / provenance.

20G is a certification phase, not a feature phase:
- It adds certification code: a harness, five exams, a stress fixture, suites and batteries.
- It fixes the core defects the certification found. Each fix has fail-first evidence on the baseline and mutation proof.
- It records everything else as limitations or future-phase items.

No product semantics changed except the four defect fixes below. Three are merged in this PR; one (D3) is left open for the owner.

## 1. Baseline, branch, head

| Item | Value |
|---|---|
| Expected / actual baseline (`origin/main`) | `f16ac8f044e3ca239f68dcd02f347426ec0017e0` (merge of PR #271, Phase 20F) — identical; `main` did not move |
| Baseline post-merge CI | Azure SWA CI/CD run 37605982866 (Quality Gate ✓, Build and Deploy ✓ production); Coding Runner Security & Smoke 37605982917 ✓ |
| Branch | `feature/20g-core-enterprise-certification` |
| Head | recorded in the PR body and the final report (exact-head rule) |
| Clean tree / no merge-rebase-cherry-pick in progress | confirmed at branch time |

## 2. Mission and scope boundary

Certify the core and try to break it. The boundary was respected; nothing in this list was added:
- Math Renderer v2;
- new chart types;
- Surface3D / Geometry3D;
- new physics, chemistry or electricity engines;
- branding;
- networking beyond networkTopology@1 / @2 and networkCli@1.

Exam A uses only current capabilities. OSPF, RIP, EIGRP, ACL and NAT are absent, and a test pins that absence.

## 3. Repository contract

`AGENTS.md`, the agentic workflow, the validation matrix, the PR template, `README.md` and `runner/README.md` were read first, together with the design records of 20D (composite), 20D.1 (presentation), 20E (SmartSim), 20F (AI Composer), 19B/19C (parametric), 19E (open response) and 17x (coding).

How the contract was kept:
- normal commits only — no amend, rebase, squash or force-push;
- no merge and auto-merge OFF;
- no production mutation, no production load test and no live Runner;
- no secrets read or printed (test keys are fixed "test-only" literals);
- no test weakened, skipped or given a widened timeout.

A conflict with a frozen pin was resolved by not changing the code and escalating the decision to the owner (D3, §21).

Read-only parallel investigators audited three areas: the API end-to-end seams, the coding / Runner path, and SmartSim / composite / parametric. All production edits came from the one Lead Integrator worktree.

## 4. Method and harness architecture

| File | Role |
|---|---|
| `api/tests/certification-20g/platform.js` | In-process **platform**: the real handlers (`save-exam-artifact`, `manage-saved-exams`, `exam-governance`, `manage-assignments`, `student-assignment`, `student-submission`, `assignment-review`, `coding-grading` callback / regrade) on the shared in-memory blob container. Only authentication is injected; the security suite uses real signed tokens. The Runner is a recording double that executes nothing. Assignment ids are deterministic so parametric instances are reproducible. |
| `.../kit.js` | Authoring kit: one builder per production family. Every teacher-private field carries a **canary** value. |
| `.../lifecycle.js` | Drivers. `publishAndAssign` runs save → load → enable → submit-review (server finalization) → approve → publish → assign. `takeExam` runs pre-start delivery → start (idempotent) → sanitized delivery → chunked autosave, each followed by a reload with exact-restore comparison → continue from the restored state → submit → duplicate submit. |
| `.../ledger.js` | Score ledgers, read in the same `[auto, pending]` shape as the hand-derived expectations, plus the **attempt invariants**: total = Σ section maxima = official total; scores in bounds; composite group sums; pending = Σ pending; finalized ⇔ pending = 0; percentage. |
| `.../scan.js` | Recursive **privacy scanner**. Scans forbidden property names at any depth and forbidden **values** (canaries and exam-specific secrets) in strings and keys. |
| `.../exams/*.js` | The five certification exams (A–E) and the stress generator (S), with personas. Expected ledgers are derived **by hand** in comments, never by calling the grader. |
| `docs/fixtures/certification-20g/` | The five exams as importable JSON (pinned), plus the generated coverage map. |

## 5. Live capability matrix

The matrix is computed at test time from:
- the canonical Question Type Catalog, every version 1..current;
- the SmartSim plugin registry;
- the composite child identities;
- the compound part families.

Each row records the grading mode, partial credit, response kinds, compound / composite capability, AI composer support, authoring version and grader kind, plus a **disposition**:
- **A** — exercised by a 20G exam (verified by scanning the exams);
- **B** — covered by an existing authoritative test (the file must exist and name the identity);
- **C** — not applicable, with the reason.

A new type, version or plugin without a disposition fails the suite. Result: every row is **A** except `simulation@1` and `child:simulation@1` (teacher-uploaded package, manual-only), which are **B**.

Generated table: [`docs/fixtures/certification-20g/coverage-map.md`](fixtures/certification-20g/coverage-map.md), produced by `cert-20g-capability-matrix.test.js`.

## 6. The five certification exams (100 marks each, finalizable, JSON round-tripped, governed, assigned)

| Exam | Content | Personas |
|---|---|---|
| **A Networking** | IPv4 MCQ / multi-select / numeric / cloze / TF / table; a **firstNAnswered** section (2 of 3, open response + MCQ); cliFill; networkCli@1 (hostname, VLAN, access, trunk + native); networkTopology@2 Port Security and WPA2 labs; a composite on ONE shared Router-on-a-Stick context (4 linked SmartSim parts + MCQ + rubric) with a static source context; DHCP lab; the **capstone** lab (VLAN names, native 99, allowed list, VTP client, port security, enable secret, RoaS native sub-interface, two DHCP pools, WPA2, DNS + HTTP browse). | FULL 100 · PARTIAL 39.67 · MISCONFIG (trunk missing) 96 · INCOMPLETE 6 · RELOAD-and-continue (= FULL automatic part) |
| **B Physics** (physicsFreeFall@1 only) | concepts, numeric, two **parametric** (v2 `sqrt`, `^`); three simulations (classroom drop, upward throw, lunar drop); a composite on ONE shared free-fall context (5 linked parts + a firstN numeric group + MCQ + rubric); open responses (hidden and visible rubric); penalty multi-select. Hand values: t = 2.0203 s, v = 19.799 m/s, 1 + √7 s, (−5 + √187)/1.62 s. | EXACT 100 · SIM_RIGHT_EXPLAIN_WRONG 74 · EXPLAIN_RIGHT_MEAS_INCOMPLETE 61.6 · PARTIAL_SIM 77.8 · ABANDONED-and-RESTORED (= EXACT automatic part) |
| **C Computer Science** | trace / complexity / tableFill / ordering / fillBlank; **coding@2 editable** Python and Java (`manualReview` policy); **coding@3 locked template** C# (`zero` policy) and Python (`manualReview`); a composite sharing a code source with a coding@2 child and a rubric. | PERFECT 100 · PARTIAL (wrong weighted case 10/15; all-timeout program 0) · COMPILE (Java → reviewRequired → teacher 5; C# → 0 by policy; failed suite → retryable → retry → 15) = 38 · INFRA (RUNNER_BUSY → retryable → retry → 15) |
| **D Mathematics** | numeric, matrix, categorization, matching, parametric (linear equation, derivative, `10^k` range mode); **functionStudy2d** on f(x) = (2x−4)/((x−1)(x+2)) (weights 13 → 26 marks); a composite on ONE shared function-study context (domain / VA / extrema linked parts + MCQ + numeric + parametric child + rubric). | PERFECT 100 · PARTIAL 56 · second-attempt persona (attempt 2 gets its own instance; stale answers graded 0) |
| **E Mixed showcase** | 23 families in one exam: choice ×4 kinds, cloze / fill / word bank, a **capScore** section (20 raw, cap 15), numeric, parametric, hotspot + labelDiagram on teacher images, an image question whose **assetRequest** had to be resolved, networkCli, the frozen **networkTopology@1** lab, coding@2, a legacy **compound**, an advanced composite (shared **rich** source + shared SmartSim context + firstN group with an **excess** answer + rubric), a RichContent stem. | PERFECT 100 · MIXED 62.87 |

For every persona the test asserts the following:
- **Pre-start delivery** has no exam body.
- **Sanitized delivery** passes both privacy scans: keys and values.
- **Start** is idempotent.
- **Autosave restores exactly**, forged states are never stored, and continuing from the restore loses nothing.
- **Submit** happens once; a duplicate gets 409.
- **The per-question and per-part ledger** equals the hand-derived one.
- **All invariants** hold.
- **Teacher review** (rubric levels, per-part composite rubrics, explicit zeros) gives the expected FINAL score.

## 7. Stress fixture (sized by measurement)

**Shape.** `stressExam({ sections, perSection })` builds, per section, 30 rotating-family questions plus two kitchen-sink questions:
- a kitchen-sink **composite** with 3 SmartSim contexts (the cap), 2 static sources, one child of every supported child identity except the uploaded-package simulation, 3 coding children, linked SmartSim parts and a firstN group with an excess answer;
- a kitchen-sink **legacy compound** with one part of each of the 14 compound-capable families.

**Measurement.** Every pipeline stage scales linearly:

| Questions | Exam JSON | Finalize | Import | Sanitize | Normalize answers | Grade |
|---|---|---|---|---|---|---|
| 62 | 51 KB | 35 ms | 13 ms | 26 ms | 21 ms | 27 ms |
| 248 | 206 KB | 21 ms | 19 ms | 20 ms | 20 ms | 26 ms |
| 496 | 413 KB | 38 ms | 40 ms | 39 ms | 37 ms | 50 ms |

**Certified size: 8 × 32 = 256 questions.** That is about 2.5× the largest realistic school exam (≤ 100 questions). The student projection is about 183 KB and the answers about 66 KB.

**Budgets.** Each stage is budgeted at 1500 ms, and each platform step (publish, deliver, draft, submit, review GET) at 3000 ms. That is ≥ 40× the measured baseline: it catches an algorithmic blow-up, never CI noise.

**Results at that size:**
- every family-rule expectation holds per question and per composite part;
- every coding target is planned and dispatched exactly once and never graded zero while pending;
- the draft restores exactly;
- the teacher review loads all 256 questions.

## 8. AI Composer certification (deterministic scripted model; no provider call, no provider secret)

**Mode A — generate exam.** The five 20F intents run through the real endpoint and the client orchestration, then the real platform: governance with server finalization, assignment, sanitized delivery (no `aiComposer`, no `assetRequest`) and grading. The AI never owns structure:
- marks are exactly the requested total;
- ids are code-assigned from the nonce and unique;
- every family is at its catalog **authoring** version;
- prompts carry no secret and no student data.

**Modes B–E** run on the **certified** exams, whose private keys are canaried. The provider prompt never contains a private value: no canary, `hiddenTests`, `expectedOutput`, `referenceSolutions`, `checks`, `correctOptionIndex`, guidance, model answer, check values or expected outputs.

| Mode | What is proven |
|---|---|
| B modify (section scope) | Only that section's marks change; keys are untouched; the diff shows each change; the exam stays finalizable. |
| C generate section | Exactly one new section with code ids (`aicert20-ms1-k`); existing sections are byte-identical. |
| D replace question | Only the target changes and its id is kept. The same patch on an edited exam is `STALE_REVISION` and applies nothing. |
| E improve content | Text only. The hidden tests are preserved byte for byte. A marks change or an operation on another question is refused (protected-field and scope lock). |

**Also proven:**
- Selective apply changes only the selected operation.
- Undo through the Builder history authority restores the exam byte for byte.
- A rich-content patch carrying `<script>` or `javascript:` is refused (`AI_RICH_CONTENT_INVALID`), on the original attempt and on every bounded repair attempt.
- Markup in plain text stays inert: no production component renders HTML (a test greps the code for `dangerouslySetInnerHTML`, `innerHTML` and `srcdoc` sinks).
- The endpoint has no publish, assign or grade stage (`STAGE_UNKNOWN`) and requires a teacher (401).

**Live provider:** an **OWNER-MANUAL** item (§26). It was not exercised and no provider secret was touched.

## 9. Teacher lifecycle

**Builder operations:**
- save → load;
- edit;
- duplicate a composite (fresh ids, identical content) and a cliFill question (D4);
- reorder;
- change a section policy to capScore;
- check that the preview projection carries no private value;
- copy the whole exam (finalizable, unique ids).

**Governance** (Draft → Review → Approved → Published):
- an illegal transition is refused (409 `ILLEGAL_TRANSITION`);
- a stale state version is refused (409 `STALE_STATE`);
- a replayed requestId returns `replayed`;
- provenance events name the actor and never carry exam content.

**Immutable published copy:** a later revision with a different key never rewrites an existing assignment. The original assignment's student is graded by revision 1's key, and a new assignment binds revision 2.

## 10. Student lifecycle

Shown in §6, §14 and §15:
- attempt start, and a sanitized, deterministic per-attempt parametric instance;
- the answer namespace, including composite and shared-context state;
- the SmartSim action stream, which is replayed and never trusted;
- coding persistence, navigation, autosave, reload and restore;
- submit once, then duplicate, stale and concurrent submits;
- completed-attempt immutability.

**No answer silently disappears on the conforming client.** The client caps CLI commands and open-response length at the server limits. Ingest refusals for non-conforming payloads are documented in §28.

## 11. Grading and the score ledgers

Every persona of A–E has a ledger per question, and per part for composites: `[automatic score, marks pending a teacher]`, plus the expected final score after the stated review. All ledgers were derived by hand and match the server.

**Structural equalities checked on every attempt (`attemptInvariants`):** official total = Σ section maxima = attempt total, and the remaining invariants listed in §4.

**Grading behaviours certified:**
- **firstNAnswered** counts exactly the first N answered units in display order. Excess answers are ignored, never pending (A section 2, B / E composite groups, battery §20).
- **Composite:** each child grades under its own authority, and each shared simulator is replayed once. Each linked part evaluates its own checks: no double counting, no collision.
- **Open response:** never auto-scored, pending until rubric review, and a plain score is refused (`RUBRIC_GRADE_REQUIRED`).
- **Coding:** an infrastructure failure is retryable and never a zero; compile-error policies are respected.
- **Unknown or unsupported versions:** fail closed to teacher review.
- **Duplicate callbacks:** idempotent.

## 12. Sanitizer / privacy

Recursive scans run over the **actual** student projections, not property names only:
- the pre-start and started deliveries of every persona of A–E, the stress exam, the AI-generated exams and the teacher preview;
- the student projection of **every committed exam fixture** — 27 fixtures from 20D, 20D.1, 20E, 20F and 20G — including legacy private markers;
- 60 random seeded exams with planted canaries.

Markers covered:
- answer keys, accepted answers and expected values;
- hidden tests, expected outputs and reference solutions;
- rubrics, guidance and model answers;
- SmartSim checks and target states;
- teacher notes and AI metadata (`aiComposer`, `assetRequest`);
- grading keys and hashes, and HMAC or signature material.

The sanitizer's historical blank keys (`teacherNote: ""`, `hint: ""`, `history: []`) carry nothing and are accepted as blank. The coding job sent to the Runner carries only `{ jobId, language, languageVersion, source, cases: [{ token, stdin }], limits, revision, targetRef }`.

## 13. Import / export

Every committed fixture goes through export → serialize → import → canonical save → finalize again. Every question survives byte for byte:
- identity, version, marks and structure;
- grading policy and composite relations;
- RichContent and SmartSim identity;
- private teacher data and assets;
- coding policy, rubric and parametric contract.

Versions are never upgraded or stamped. Finalization decides identically. The server's canonical form differs only by the inert `history` / `redoStack` bookkeeping. 60 random exams round-trip byte-identically.

## 14. Autosave / restore matrix

One question of **every** standalone family, plus composite (with shared-context state) and legacy compound. Each goes through answer → autosave → page destroyed → hydrate from the server → exact comparison with the server-normalized answer → continue → submit, and every family is then graded as its rule says.

Covered: choice, multi-answer, text, inlineCloze, numeric, parametric, table / matrix / categorization, composite with shared context, SmartSim (three plugins), network CLI, coding (editable and template), visual, open response.

The personas of A–E repeat the restore check in 1–4 chunks each; the stress fixture repeats it at 256 questions.

## 15. Failure / recovery matrix

25 malformed-exam cases each fail closed with **one explicit code** in the Builder authority **and** are refused at governance review: 422 `FINALIZATION_REFUSED`, counts only, nothing published or assignable.

| Area | Cases |
|---|---|
| Marks | invalid marks ×3 |
| Ids | duplicate ids |
| Versions and types | unsupported versions (`multipleChoice@2`, `coding@4`); unknown type |
| SmartSim identity | unsupported plugin version; unknown plugin |
| Assets | unresolved assetRequest |
| Composite children | incompatible child; nested composite |
| firstNAnswered | impossible (too many, zero, no max, no unit) |
| Composite structure | composite firstN unequal marks; composite marks conflict; dangling context; duplicate part ids |
| Privacy | hidden tests smuggled into the public coding config |
| Executable fields | executable field ×2 |
| Section policy | an `all` section with a cap; no sections |

Runtime cases:

| Case | Where certified |
|---|---|
| Malformed import | §15 suite |
| Legacy import | §25 |
| Unknown type / version / plugin reaching a snapshot by a non-governed path | grading fails closed to review |
| Stale patch | §8 |
| Stale attempt identity | 409, nothing written |
| Duplicate and concurrent submit | exactly one attempt |
| Corrupted saved state | no crash |
| Malformed or presentation-only SmartSim action | refused at ingest |
| Out-of-budget action counts | refused |
| Runner busy, compile error, stale official result | §6 C |
| Missing manual review | not finalized |
| Client sending teacher-only fields | ignored |

## 16. Accessibility / RTL / responsive

**Automated** (`src/certification20g.a11y.test.tsx`): the student preview (same renderers) of A–E and the stress kitchen-sink, after every lazy renderer has loaded:

| Exam | Interactive controls checked |
|---|---|
| A | 28 |
| B | 29 |
| C | 40 |
| D | 30 |
| E | 88 |
| Stress | 277 |

All rules hold for every exam:
- an RTL root;
- every control has an accessible name;
- no positive tabindex;
- images have alt;
- modal dialogs are labelled;
- code is LTR.

Reduced motion and presentation-only playback: B pins that playback never alters grading state (§10). The existing `freeFallDynamic.20e` UI suite pins the reduced-motion controls.

**Manual (bounded, on the PR preview):** §26.

## 17. Performance / bundle

| | Baseline `f16ac8f` | Head |
|---|---|---|
| Initial JS graph (gzip) | 124.1 KB | 124.2 KB (+0.1 KB, from the D2 / D4 helpers) |
| Budget | 125 KB | 125 KB (**unchanged**) |
| Initial CSS | 35.4 KB | 35.4 KB |

The bundle guard passes on both builds. It proves these stay lazy:
- the AI Composer;
- Monaco (742.6 KB gzip, behind the coding editor's dynamic edge);
- the SmartSim runtime, composite, presentation and visual payloads.

The certification harness is test code. A hygiene test proves no production module imports it, and the budget constant is pinned at 125. Stress budgets: §7.

## 18. Coverage map

[`docs/fixtures/certification-20g/coverage-map.md`](fixtures/certification-20g/coverage-map.md) — generated from the live catalog (§5).

## 19. Negative paths

Each subsystem was certified with correct, partial, wrong, malformed, restore and version-compatibility cases, plus an adversarial case on every authority or security path (§6, §8, §15, §20, §23).

## 20. Seeded batteries

`cert-20g-batteries.test.js` uses mulberry32 with a fixed seed (20251007). A failure prints the seed and case; `BATTERY_SEED` overrides the seed.

| Battery | Cases |
|---|---|
| Marks / invariants | 60 random exams, random policies, random unequal marks |
| First-N selection | 60 |
| Duplicate-id injection + composite namespace | 60 |
| Round trip | 60 |
| Parametric identity through the real delivery | 60 |
| Forbidden markers | 60 |
| SmartSim replay purity | 60 |
| Function-study keys (random factored quadratics: correct accepted, perturbed refused) | 20 |
| Malformed payloads (never throw, never score) | 120 |

All batteries are clean on the fixed seed and on 8 exploratory seeds (1, 42, 1337, 777777, 99999999, 314159, 271828, 123456789). The marks battery would independently catch D1 (`section score > max`).

## 21. Defects found

| # | Severity | Defect | Fix | Fail-first (on `f16ac8f`, detached worktree) |
|---|---|---|---|---|
| **D1** | MAJOR (grading) | A **firstNAnswered** section whose questions carry unequal marks (finalization accepts it) was graded at submit **without its section cap**. A student could score 50 / 30 (attempt 125 %). Every later rebuild (teacher review, coding callback) capped it, so **the score changed when an unrelated review was saved**. | `gradeExam` caps the section exactly like capScore and like `sectionCappedScore`. | `defect-20g-d1-firstn-cap.test.js` — 3 failures, e.g. `expected [['s1',50,30],…] to deeply equal [['s1',30,30],…]` |
| **D2** | BLOCKER (governance) | The canonical exam content form stamps `history: []` / `redoStack: []` on each question (every saved copy and every governance revision), but the strict composite@1 contract refused both keys. **No governed exam containing a composite could pass review or be published (422)**, and a saved composite exam re-opened with blocking errors. | The composite contract tolerates exactly the canonical, inert form (empty arrays); any other value is still refused. | `defect-20g-d2-composite-canonical.test.js` — 2 failures, `COMPOSITE_UNKNOWN_KEY` ×2 |
| **D4** | MINOR (authoring) | Duplicating a **cliFill** question or compound part, or copying an exam containing one, left the `[[fieldId]]` placeholders on the original field ids. The copy failed finalization (`CLI_PLACEHOLDER_NO_FIELD`) and its blanks no longer matched its fields. | The clone remaps every placeholder to its field's new id. | `src/certification20g.d4-clifill-duplicate.test.ts` — 3 failures |
| **D3** | MINOR (robustness), **OPEN — owner decision** | Bound to the published exam, draft / submit ingest still **stores legacy answers verbatim**, including answers keyed by ids that are **not questions of the exam** and non-object answers, with no bound on their number or size. One authenticated student can persist megabytes of ungradable data per save (draft and every attempt record). Proven: a 5 MB ghost answer and 100 000 ghost keys are stored. | **Not merged.** The fix (refuse unknown ids and non-object answers when the exam is bound) breaks the 20D **compound freeze pin F-7**. That pin explicitly freezes this pass-through ("a changed digest … is a release blocker, never a test to update"). Bounding legacy free text also needs a product limit plus a client cap. Proposed patch: §28. | Proven by the probe in §28; no test committed — a pin would enshrine the behaviour. |

Each merged fix is a normal commit with its regression suite: D1 + D2 in `5981990`, D4 in `cb0daef`. The baseline failing assertions are recorded in the PR.

## 22. Mutation campaign

32 mutants against the cross-feature authority invariants. Each mutant was planted one at a time, the certification suites were run, and the file was restored byte for byte with SHA-256 verification; afterwards `git status` showed no production file modified. Mutants of the generated shared build exercise the server path; mutants of the TypeScript sources exercise the Builder path. The drift test is excluded from mutant runs, so it cannot kill everything trivially.

### 22.1 Results

Final: 30 KILLED, 2 EQUIVALENT of 32. No TIMEOUT, no INVALID left, no unexplained survivor. Every run restored its file byte for byte (SHA-256 verified); the only non-clean `git status` entries during the campaign were the uncommitted design record and, for the re-runs, the tightened test — never a production file.

| Id | File | Planted defect | Result | Killed by / proof |
|---|---|---|---|---|
| M01 | `api/…/lib/student-exam-sanitize.js` | sanitizer omission: the student projection keeps the question's answer key | **KILLED** | `cert-20g-A-network.test.js` |
| M02 | `api/…/lib/student-exam-sanitize.js` | private-key leak: composite children keep their answer keys in the student projection | **EQUIVALENT** | EQUIVALENT — `sanitizeQuestionForStudent` blanks `answer` to `{}` before the composite rebuild (student-exam-sanitize.js:373, the only write to `answer`); the mutant only leaves an inert empty `answer: {}` on composite children, never a key value. |
| M03 | `api/…/lib/assignment-grading.js` | marks-total bypass: the attempt total follows the earned score instead of the official section maxima | **KILLED** | `cert-20g-A-network.test.js` |
| M04 | `src/aiComposer/composerPatch.ts` | stale-patch guard removed (a patch applies to an exam edited meanwhile) | **KILLED** | `cert-20g-ai-composer.test.js` |
| M05 | `api/…/functions/student-submission.js` | stale-attempt guard removed (any asserted identity accepted) | **KILLED** | `cert-20g-student-security.test.js` |
| M06 | `api/…/functions/student-submission.js` | duplicate-submit idempotence: the active attempt is not closed by submit (unique anchor: the normal submit route) | **KILLED** | `cert-20g-E-showcase.test.js` (first run INVALID (anchor matched 3 routes); re-run with a unique anchor on the normal submit route) |
| M07 | `api/…/lib/assignment-grading.js` | composite namespace collision: a child's generation key collapses onto the parent's | **KILLED** | `cert-20g-D-mathematics.test.js` |
| M08 | `api/…/lib/exam-structure.js` | firstNAnswered off-by-one (N+1 units counted) | **KILLED** | `cert-20g-batteries.test.js` |
| M09 | `api/…/lib/shared-finalization/trustedSimRegistry.js` | SmartSim plugin-version fallback (an unknown version runs as @1) | **KILLED** | `cert-20g-teacher-governance.test.js` |
| M10 | `api/…/lib/shared-finalization/trustedSimQuestion.js` | replay ignores the last action | **KILLED** | `cert-20g-A-network.test.js` |
| M11 | `api/…/lib/shared-finalization/openResponseQuestion.js` | manual-review item auto-scored (open response becomes an automatic 0) | **KILLED** | `cert-20g-student-security.test.js` |
| M12 | `api/…/lib/coding/official-grading.js` | hidden-test leak: expected outputs sent to the Runner | **KILLED** | `cert-20g-C-computer-science.test.js` |
| M13 | `api/…/lib/coding/official-grading.js` | compile-error policy inverted | **KILLED** | `cert-20g-C-computer-science.test.js` |
| M14 | `src/examBuilderState.ts` | import / save version upgrade (coding@1 silently becomes coding@2) | **KILLED** | `cert-20g-stress.test.js` |
| M15 | `api/…/lib/assignment-grading.js` | parametric identity ignored (attempt number dropped from the generation identity) | **KILLED** | `cert-20g-D-mathematics.test.js` |
| M16 | `src/examQuality.ts` | unresolved-asset guard removed (Builder authority) | **KILLED** | `cert-20g-teacher-governance.test.js` |
| M17 | `api/…/lib/shared-finalization/examQuality.js` | unresolved-asset guard removed (server authority) | **KILLED** | `cert-20g-E-showcase.test.js` |
| M18 | `api/…/lib/shared-finalization/aiComposer/composerPatch.js` | AI scope lock removed at the SERVER authority (an op outside the selected question applies) | **KILLED** | `cert-20g-ai-composer.test.js` (first run SURVIVED: mutant planted in the TS source, which the server path does not execute, and the assertion accepted any refusal (the script ran dry → provider failure). Assertion tightened to the exact PATCH_SCOPE_VIOLATION validation verdict; re-targeted at the generated server authority) |
| M19 | `api/…/lib/shared-finalization/aiComposer/composerPatch.js` | AI protected-field lock removed at the SERVER authority (improve-content may change marks) | **KILLED** | `cert-20g-ai-composer.test.js` (first run SURVIVED: mutant planted in the TS source, which the server path does not execute, and the assertion accepted any refusal (the script ran dry → provider failure). Assertion tightened to the exact PATCH_SCOPE_VIOLATION validation verdict; re-targeted at the generated server authority) |
| M20 | `api/…/lib/assignment-grading.js` | D1 reverted: firstNAnswered section uncapped at submit | **KILLED** | `cert-20g-batteries.test.js` |
| M21 | `src/compositeQuestion.ts` | D2 reverted: canonical bookkeeping refused on composites (Builder authority) | **KILLED** | `defect-20g-d2-composite-canonical.test.js` |
| M22 | `api/…/lib/shared-finalization/compositeQuestion.js` | D2 reverted: canonical bookkeeping refused on composites (server authority) | **KILLED** | `defect-20g-d2-composite-canonical.test.js` |
| M23 | `src/examBuilderState.ts` | D4 reverted: cliFill placeholders not remapped on duplicate / copy | **KILLED** | `cert-20g-teacher-governance.test.js` |
| M24 | `api/…/lib/coding/official-grading.js` | duplicate callback idempotence removed | **KILLED** | `cert-20g-C-computer-science.test.js` |
| M25 | `api/…/lib/coding/official-grading.js` | infrastructure failure becomes a zero | **KILLED** | `cert-20g-C-computer-science.test.js` |
| M26 | `api/…/lib/exam-governance.js` | governance review without server finalization | **KILLED** | `cert-20g-teacher-governance.test.js` |
| M27 | `api/…/functions/manage-assignments.js` | assignment binds the browser body instead of the published revision | **KILLED** | `cert-20g-E-showcase.test.js` |
| M28 | `api/…/lib/assignment-grading.js` | composite group cap removed | **EQUIVALENT** | EQUIVALENT — the composite shape accepts a firstNAnswered group only with EQUAL part marks and `maxMarks = n × mark` (compositeModel.ts:124-131), at most `requiredAnswers` parts are counted (:186) and each part is clamped to its marks (assignment-grading.js:204), so `gScore ≤ officialMax` always; the cap is defense in depth (unlike D1, where section firstN allows unequal marks). |
| M29 | `api/…/lib/assignment-grading.js` | capScore section cap removed | **KILLED** | `cert-20g-batteries.test.js` |
| M30 | `api/…/lib/student-exam-sanitize.js` | AI composer metadata leaks to the student | **KILLED** | `cert-20g-import-compat.test.js` |
| M31 | `api/…/lib/draft-answers.js` | client SmartSim / CLI state and forged fields trusted (ingest binding bypassed) | **KILLED** | `cert-20g-import-compat.test.js` |
| M32 | `api/…/lib/shared-finalization/rubricEngine.js` | rubric award clamp inverted (teacher rubric can exceed the question marks) | **KILLED** | `cert-20g-B-physics.test.js` |

**Survivors were findings against the certification itself.** M18 and M19 first survived, and the cause was a weak test, not the product. The E improve-content test asserted only `ok === false` for the refused patches. The scripted model held a single response, so the bounded repair loop ran dry and the run failed as `provider`, which passed for the wrong reason. The mutants were also planted in `src/aiComposer/composerPatch.ts`, but the server endpoint normalizes with the generated `api/src/lib/shared-finalization/aiComposer/composerPatch.js`, so that source is not the authority. The test now scripts the hostile patch for every attempt and asserts `kind: "validation"`, three calls, and exactly `["PATCH_SCOPE_VIOLATION"]`. Re-targeted at the server authority, both mutants are KILLED. The drift test keeps the TypeScript source and the generated copy identical.

## 23. Security review (every finding proven, none invented)

| Probe | Result |
|---|---|
| Cross-role (real signed tokens) | A student token or none → 401 on review, governance, assignments and the AI composer. |
| Cross-class (real signed token) | A token claiming another class → 404, no exam body. |
| Cross-student | No route names another student; each student sees only its own state. |
| Teacher-only fields from the client | Score, finalized, manualOverrides, questionGrades, teacherFeedback; score / correct / state / checks inside answers → ignored; the server replays and grades. |
| Trusting a client SmartSim state or Runner verdict | Never. State is replayed; a callback with a `score` → 400; unsigned → 401; a duplicate → idempotent; stale → refused. |
| Unsafe module identity | Executable fields (`renderer`, `script`) → `EXECUTABLE_FIELD`. |
| Script / URL injection | Rich content refuses HTML and script URLs. Plain text is inert: no HTML sink in production code. |
| Code and private data in logs | None: answers, source, hidden tests, teacher comments, student names and HMAC material checked over a full lifecycle. |
| Prototype pollution | `Object.prototype` untouched. Modern binders drop `__proto__`; legacy answers keep an **inert** own `__proto__` data property. No `Object.assign` or for-in copy over answers exists, and grading proves it is ignored. Observation, part of D3. |
| Large payloads | 1001 actions, a 301-command history, a > 1 MiB composite answer → refused at ingest. A 5000-level nested body → refused before ingest, with nothing stored. Observation: it reads as a stale-attempt 409. |
| Unbounded composite recursion | Nesting refused (`COMPOSITE_CHILD_TYPE_REFUSED`). |
| Resource exhaustion | The stress budgets in §7. Unbounded legacy ingest is D3 (open). |

## 24. Governance / audit

See §9. The AI never bypasses governance: AI output reaches students only after the teacher applies it and governance publishes it. A submission corresponds to the assigned immutable revision.

## 25. Backward compatibility

| Pin | Status |
|---|---|
| Legacy exams without `questionTypeVersion` | V1 end to end: finalize, publish, grade 6 / 6; never stamped. |
| Legacy flat exams | Graded identically after `legacyToStructured`. |
| Legacy compound | Kitchen-sink compound with every part family; the 20D compound freeze pins still pass. |
| Import aliases | Resolve canonically; unknown spellings stay unknown. |
| Coding version families | coding@1 compile error = 0 and refuses a policy; coding@2 / @3 require an explicit policy. |
| SmartSim exact identities | networkTopology@1 grades its frozen lab; a version-mismatched answer → `SMARTSIM_PLUGIN_MISMATCH`. |

## 26. Manual acceptance checklist (PR preview; no production mutation)

Each item is either performed by the owner on the PR preview environment or stated as not performed — **never fabricated**:
1. Import `docs/fixtures/certification-20g/E-showcase.json` in the Builder. Open the student preview and check RTL, the composite navigation, and the hotspot / labelDiagram canvases with keyboard focus.
2. Exam B in the preview. Free-fall play / pause / restart / scrub with reduced motion ON and OFF: the controls change and no answer changes.
3. Exam C: the Monaco editor loads lazily, LTR inside an RTL page; the locked template segments are read-only.
4. AI Composer dialog: open, cancel, focus returns to the opener. **Live provider call: OWNER-MANUAL**; it needs the provider configuration, which an agent never reads.
5. Mobile width (≤ 400 px): student exam and manual-review view are readable without horizontal scroll.

The agent cannot drive a browser against the preview with credentials. These items are therefore **not performed by the agent** and are listed for the owner.

## 27. Validation and CI

See the PR body for the exact counts per suite on the head and the exact-head CI table (workflow, run, attempt, conclusion).

## 28. Known limitations, open finding D3, future phases

**D3 — proposed patch for the owner** (in `api/src/lib/draft-answers.js`, after the per-kind binders):

```js
if (bound && index.size > 0 && !index.has(id)) { rejected.push({ id, code: "ANSWER_QUESTION_UNKNOWN" }); continue; }
if (bound && (!r.answer || typeof r.answer !== "object" || Array.isArray(r.answer))) { rejected.push({ id, code: "ANSWER_INVALID" }); continue; }
```

The patch keeps every per-kind refusal code. It changes the 20D F-7 freeze digest, which only the owner can re-capture. A per-answer bound for legacy free text also needs a product limit and a matching client `maxLength`. The proof:

```
normalizeDraftAnswers({ ghost: { kind: "text", value: "x".repeat(5e6) }, … }, exam)
  → stored, 15 MB serialized
100 000 ghost keys → stored
```

**Other limitations:**
- An **unanswered legacy** shortAnswer, fillBlank or tableFill question (and a composite child of those families) goes to teacher review (pending), never to an automatic zero. This is historical, conservative behaviour, pinned by the ledgers. The teacher records an explicit zero.
- **Ingest refusals** are dropped from the stored map with 200. The conforming client cannot produce them (§10), but a non-conforming client gets no per-answer refusal report.
- The **Runner is a double** in the API certification. The real-Docker official grading path is certified by the Coding Runner CI on every PR. Local Docker was not used.
- **Live AI provider:** owner-manual.
- **simulation@1** (uploaded package) is pinned, not exercised (§5).

**Future phases** (out of the 20G boundary): the D3 decision; per-answer refusal reporting to the client; the features listed in §2.

## 29. Final verdict

Recorded in the final report and the PR body after the exact-head CI and the independent review. The certification target is **CORE ENTERPRISE CERTIFICATION: PASS**, stated only on a CLEAN independent review of the exact head with green exact-head CI.
