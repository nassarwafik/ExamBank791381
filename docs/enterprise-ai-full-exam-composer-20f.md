# Phase 20F — Enterprise AI Full Exam Composer

Baseline `20d5a48e22ed46544460a239cbb88fee9841a4af` (Phase 20E merged; post-merge CI green: Azure Static Web Apps CI/CD run 37514570509 and
Coding Runner Security & Smoke Tests run 37514568764, both success). Branch `feature/20f-enterprise-ai-full-exam-composer`.

## 1. Purpose and the one rule

A teacher describes an exam in natural language (plus structured controls) and receives a **normal Structured Exam** — sections, rich content,
presentation, composite, SmartSim, coding, parametric, open response with rubrics — that opens in the existing Builder, stays fully editable,
passes the existing finalization gates and is graded by the existing server authority. Existing exams are modified through **scope-locked
domain patches** with a diff, stale-revision protection and undo.

> **AI is an authoring assistant, never an authority.** Every model output is untrusted input: strict provider schemas AND repository-owned
> normalizers and validators decide. The composer never saves, approves, publishes, assigns or grades. Marks arithmetic, identities, versions,
> simulator configurations, private checks and expected physics values are code-owned.

## 2. Architecture

```
 Builder ──(lazy)── AiExamComposerDialog ── composerRun (client orchestration, re-verification, state machine)
                                                  │  one bounded stage per request
                                                  ▼
                                  POST /api/ai-exam-composer  (teacher session · rate limit · bounds)
                                                  │  ONE provider call (strict json_schema, 25–30 s timeout, no SDK retries)
                                                  ▼
            shared domain core (src/aiComposer → api/src/lib/shared-finalization/aiComposer, byte-identical, drift-guarded)
   catalog · intent · plan · section draft (19A normalizer reused) · SmartSim builder · rich · assembly + verdict · projection · patch · revision
                                                  │
                                                  ▼
                         existing authorities: validateStructuredExam / evaluateExamFinalization, plugin validators,
                         composite authority, student sanitizer, server grader, governance (unchanged)
```

Staged, stateless server: one provider call per request (plan; one call per section; bounded repairs; or one modify call) keeps every request
far below the Static Web Apps gateway limit. The browser holds the staged result; the server re-validates everything the browser echoes back
(the plan, a previous draft) from scratch.

## 3. Contracts

- **AiExamIntentV1** (`composerIntent.ts`): subject, course, grade, language (ar / en / he) + direction, exact integer total marks, duration,
  difficulty (+ optional profile summing to 100), section / question targets, allowed item kinds, required / excluded topics, feature toggles
  (composite, smartSim, coding, parametric, openResponse, richContent, tables, visual, rubrics), preset or auto, the teacher instruction
  (≤ 4000 chars). Strict keys, no prototype keys, bounded values. **Structured controls win**: the plan / draft are validated against the
  intent, the preset is overridden to the teacher's choice (warned), allowed kinds = allowed list ∩ toggles.
- **AiExamPlanV1** (`composerPlan.ts`): title, learning goals, preset, sections (title, instructions, integer marks, topics, ordered items:
  kind, topic, difficulty, marks, simulator, scenario, note), unsupported requests. **Code-owned arithmetic**: Σ sections = requested total,
  Σ items = section marks, positive integers, catalog-only kinds / simulators / scenarios, excluded topics refused. Coverage topic → marks.
- **Section draft** (`composerDraft.ts`): one item per planned item (same order, same kind). Single-question kinds use the **19A draft schema
  and normalizer unchanged**; `smartSim` and `composite` items carry catalog specs; `stem` optional rich blocks; `assetRequest` optional.
- **AiExamPatchV1** (`composerPatch.ts`): `{ v, baseRevision, mode, scope, summary, operations[] }` with domain operations only:
  updatePresentation, updateQuestionText, updateQuestionRichContent, updateQuestionPresentation, updateQuestionMarks, replaceQuestion,
  addQuestion, removeQuestion, moveQuestion, addSection, updateSection, removeSection, moveSection, updateCompositePartText,
  removeCompositePart. No arbitrary path writes.

## 4. Capability catalog — one source of truth

`buildComposerCatalog()` derives the model's vocabulary from the production registries and verifies it at build time: item kinds at exact
authoring versions (coding@2, composite@1, smartSim@1, …), SmartSim plugins by exact identity (networkTopology@2, physicsFreeFall@1,
functionStudy2d@1), the networkTopology@2 curriculum scenarios (= the production templates roas, dhcp, vtp, portsec, wireless, capstone),
physics task vocabulary and bounds, the function-study language and tasks, the presentation presets, the RichContentV1 blocks the AI may
emit (no image / figure / columns: no URL, data URL or layout nesting), coding languages (python, java, csharp), and the capabilities the
platform does not have (OSPF, RIP, EIGRP, BGP, static routing, ACL, NAT / PAT, STP, EtherChannel, IPv6, VPN, Metro Ethernet). Every provider
schema uses these as enums; every normalizer re-checks them; "latest" does not exist.

## 5. SmartSim, composite, coding, parametric, rich content, presentation

- **networkTopology@2**: the model picks a scenario id; config + private checks are the production template (pinned to give no free credit).
  A composite SmartSim part takes a subset of the scenario's check ids. Unsupported routing features are never simulated: the request is
  reported as a structured `CAPABILITY_UNSUPPORTED` warning with a safe theory alternative.
- **physicsFreeFall@1**: the model picks a bounded model and task kinds; every expected value (impact time / speed, peak height, apex time,
  apex / impact points) is computed by code; apex tasks only for an upward throw; probe time inside the flight.
- **functionStudy2d@1**: safe expression language 2 only; the model's key is probed numerically (f(0), roots, poles, horizontal asymptotes,
  local extrema, monotonic intervals) and an inconsistent key is refused.
- **No free credit**: every SmartSim key (and every composite SmartSim part) is evaluated on an empty action stream and must award nothing.
- **composite@1**: one shared context (SmartSim spec or rich source), groups of child parts, exact part-mark sums (never redistributed),
  first-N groups with equal marks and code-computed maxima, no nesting, no code stimulus in a part; then the composite authority decides.
- **Coding**: public material only (statement, language, starter, public examples). Hidden tests, reference solutions and automatic grading
  are never AI-authored (19F policy, re-checked by the verdict and the client): generated coding questions are graded manually until the
  teacher adds verified hidden tests.
- **Parametric**: 19B / 19C draft through the 19A normalizer (safe engine, generation probe); rich stems are not applied to parametric
  (unsupported by the type) and the drop is reported.
- **RichContentV1**: flat bounded block descriptors mapped by code and judged by the 20D.1 validator (raw HTML, script / style / SVG,
  javascript: URLs refused). CLI / code / math / tables are their own LTR blocks.
- **PresentationV1**: preset selection (+ table variant) only, validated by the 20D.1 validator.
- **Images**: the model never invents a URL. An image need becomes an explicit `assetRequest` (teacher TODO) that **blocks finalization**
  until the teacher attaches the image and removes the request; it never reaches students.

## 6. Modify existing exams — patches, scope lock, protected fields, stale revision, diff, undo

- **AI-safe projection** (`composerProjection.ts`): built by allow-list — ids, numbers, types / versions, marks, public stems (bounded),
  public option texts of in-scope questions, composite outlines, simulator identity, coverage topics. Never answers, accepted values,
  rubrics / guidance / model answers, private SmartSim checks, coding hidden tests / reference solutions / grading mode, media data,
  metadata other than coverage, governance or student data. Out-of-scope questions are outlines; the projection is byte-bounded; a second
  guard refuses a payload carrying any forbidden marker.
- **Modes and scope lock**: modifyExam (exam or section), generateSection (addSection only), replaceQuestion (that question only),
  improveContent (text / rich / presentation variant of the selected question, or the selected section's title / instructions),
  presentation (updatePresentation only). Any out-of-scope operation refuses the whole patch.
- **Protected fields**: text / rich / presentation operations never touch answer, marks, type or ids; composite marks derive from parts;
  hidden tests and private checks change only through an explicit replaceQuestion, shown with a diff warning.
- **Stale protection**: the patch carries the revision (content fingerprint) of the exam it was computed for; the Builder refuses to apply
  it to any other revision («تم تعديل الامتحان أثناء عمل الذكاء الاصطناعي.») and offers regenerate / discard.
- **Diff**: teacher-readable «field: before → after» entries with warnings; selective apply keeps every operation group of one target atomic.
- **Apply**: pure, re-verifies new nodes (19A node allow-list + coding policy), refuses any newly introduced blocking issue, appends a bounded
  authoring history entry (teacher-only metadata: time, mode, short request summary, base revision, status, counts — never prompts or
  reasoning) and lands as ONE Builder update (one undo step).

## 7. Validation, repair, summary

Deterministic first: whitespace / control characters, code-owned ids and display numbers. Academic content (answers, marks intent, meaning)
is never silently repaired: a refused plan / section / patch is returned with structured issues and the model gets at most **2 repair
attempts** (bounded on the server and the client). The verdict = canonical finalization + composer gates; warnings cover diversity (runs of
one type, one dominant type), duplicate stems / options, uncovered required topics, difficulty profile (an authoring heuristic, never a
proof), unresolved image requests. The summary (marks, sections, questions, type mix, automatic vs manual marks, composite / SmartSim /
coding / parametric / tables, preset, blocking / warnings) and the topic coverage are computed by code from the exam.

## 8. Security, privacy, provider boundary

- Provider: the existing server-side provider client (strict json_schema, no SDK retries); no key, SDK or provider call in the browser.
- Teacher session required; per-teacher distributed token bucket (40 calls / 10 min, hashed blob names) failing closed; request ≤ 2 MB;
  instruction ≤ 4000 chars; ≤ 8 sections, ≤ 60 items, ≤ 40 patch operations, ≤ 12 composite parts, AI context ≤ 60 KB.
- Prompt-injection defence: role separation; exam content, previous drafts and teacher text are fenced as UNTRUSTED DATA; the strict
  schemas, the scope lock and every deterministic gate remain the authority.
- Provider failures map to fixed messages (502 / 504 / 429 / 503 / malformed); provider text and keys are never returned; logs carry
  bounded metadata only (stage, attempt, error name).
- No student data: the composer works on teacher-authored exams only; the projection is allow-listed; tests scan the provider payload.

## 9. UX

Lazy dialog with five modes; structured controls + free instruction; meaningful stage progress (one polite status line, no token streaming,
no fake percentage); cancel; summary, coverage, issues, warnings; «فتح في المحرر» only when the verdict passes (replacing a non-empty exam
asks first and is undoable); diff with atomic group checkboxes; stale handling; undo; distinct error messages per failure kind;
«مسودة من الذكاء الاصطناعي — راجعها قبل الاعتماد».

## 10. Bundle

Initial JS budget 125 KB gzip unchanged. Initial graph 127 080 B on the head vs 127 031 B on the baseline (124.1 KB both): the single
`composeExam` line on the App-owned AI service (+49 B). The dialog, the domain core and every prompt / schema helper live in the lazy
`AiExamComposerDialog` chunk; `COMPOSER_SIGNATURES` (`ai-composer-dialog`, `AI_COMPOSER_CATALOG_V1`, `ai-composer-diff`) are refused in
initial files and must exist in a lazy chunk.

## 11. Evidence

### 11.1 Freeze pins (existing AI-assisted authoring unchanged)

`src/aiComposer/aiAuthoringFreeze.20f.test.ts` pins the 19A authoring vocabulary and limits, the SHA-256 of every existing provider schema,
the prompts produced for 12 representative teacher requests, the request signals, the normalizer outcome of 15 drafts (valid and hostile),
the scenario prompt and the coding node policy. The pins were captured on the baseline `20d5a48` and re-captured on the head: both captures
are byte-identical (SHA-256 `33ffce4e755bc1192141bd99ab2c3911d32c7920083f19f3ffd8a753c7e7486b`). The composer reuses the 19A schema and
normalizer; it does not change them.

### 11.2 Fail-first (executed on the baseline `20d5a48`, detached worktree)

| Suite | Result on `20d5a48` | Result on the head |
|---|---|---|
| `src/aiComposer/composerCore.20f.test.ts` | FAIL — `Cannot find module './composerCatalog'` | pass |
| `src/aiComposer/composerAcceptance.20f.test.ts` | FAIL — `Cannot find module './composerRun'` | pass |
| `src/aiComposer/composerRun.20f.test.ts` | FAIL — `Cannot find module './composerRun'` | pass |
| `api/tests/ai-exam-composer-20f.test.js` | FAIL — `Cannot find module '../src/functions/ai-exam-composer.js'` | pass |
| `api/tests/ai-composer-rate-limit-20f.test.js` | FAIL — `Cannot find module '../src/lib/ai-composer-rate-limit.js'` | pass |
| `src/aiComposer/composerSeams.20f.test.ts` (existing authorities) | FAIL 2 / 2 by assertion: `expected [] to deeply equal [ 'AI_ASSET_REQUEST_UNRESOLVED' ]`; the student payload still carried `assetRequest` / `aiComposer` | pass |

The import failures are a new feature's modules being absent (behavioural fail-first for the feature); the two seam assertions are real
behaviour on existing authorities (finalization and the student sanitizer).

### 11.3 Tests

New suites: composerCore (domain core), composerAcceptance (fixtures A–E through the real endpoint handler with a scripted deterministic
model + modify scenarios F), composerRun (client orchestration), composerSeams (existing authorities), aiComposerUi (dialog in the real
Builder), ai-exam-composer-20f (endpoint), ai-composer-rate-limit-20f, aiAuthoringFreeze (pins). Fixtures A–E are pinned under
`docs/fixtures/ai-composer-20f/`; each generates with zero blocking issues, exact totals, a Builder round trip, a clean student projection and
zero marks on an empty attempt.

### 11.4 Mutation campaign

45 mutants, one at a time, exact single-occurrence replacement, SHA-256-verified byte-for-byte restore in a `finally`, `git status` clean
afterwards. Result: **43 KILLED, 2 EQUIVALENT (proved below), 0 TIMEOUT, 0 non-equivalent survivor.** The first run left 11 survivors and
one malformed mutant; each was answered by a strengthened test (commits `34c838c`, `50fd21f`) and re-run KILLED.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| C01 | `composerPlan.ts` | plan total marks not checked | KILLED | composerCore.20f.test.ts › 20F-PLAN plan: code-owned marks arithmetic and catalog rules |
| C02 | `composerPlan.ts` | plan section marks not checked | KILLED | composerCore.20f.test.ts › 20F-PLAN plan: code-owned marks arithmetic and catalog rules |
| C03 | `composerExam.ts` | exam total vs request not checked | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C04 | `composerPlan.ts` | allowed type check removed | KILLED | composerCore.20f.test.ts › 20F-PLAN plan: code-owned marks arithmetic and catalog rules |
| C05 | `composerExam.ts` | exact version check removed | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C06 | `composerExam.ts` | SmartSim plugin allowlist removed | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C07 | `composerSim.ts` | no-free-credit gate removed | KILLED | composerCore.20f.test.ts › 20F-SIM SmartSim through the catalog: code-owned config and pri |
| C08 | `composerExam.ts` | coding hidden-test policy removed from verdict | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C09 | `composerRich.ts` | RichContent canonical validator bypassed | KILLED | composerCore.20f.test.ts › 20F-RICH AI rich blocks → RichContentV1 (20D.1 vocabulary only, |
| C10 | `composerPlan.ts` | plan preset enum not enforced | KILLED | composerCore.20f.test.ts › 20F-PLAN plan: code-owned marks arithmetic and catalog rules |
| C11 | `composerPatch.ts` | presentation validation after apply removed | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C12 | `composerProjection.ts` | projection leaks the answer | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C13 | `composerProjection.ts` | payload guard disabled | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C14 | `composerPatch.ts` | scope lock (question scope) removed | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C15 | `composerPatch.ts` | mode operation allowlist removed | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C16 | `composerPatch.ts` | patch target id not checked | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C17 | `composerPatch.ts` | stale revision guard removed | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C18 | `api/src/functions/ai-exam-composer.js` | server repair bound removed | KILLED | ai-exam-composer-20f.test.js › 20F-API authorization and request bounds (no provider call  |
| C19 | `composerRun.ts` | client repair bound off by one | EQUIVALENT |  |
| C20 | `composerPatch.ts` | unknown operation accepted | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C21 | `composerExam.ts` | composite nesting not detected | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C22 | `composerPatch.ts` | text edit wipes the answer (hidden authority not preserved) | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C23 | `api/src/functions/ai-exam-composer.js` | malformed provider JSON not classified | KILLED | ai-exam-composer-20f.test.js › 20F-API malicious model outputs fail closed (never stored,  |
| C24 | `composerIntent.ts` | instruction length bound removed | KILLED | composerCore.20f.test.ts › 20F-INT intent: strict, bounded, structured controls win |
| C25 | `api/src/functions/ai-exam-composer.js` | modify instruction length bound removed | KILLED | ai-exam-composer-20f.test.js › 20F-API authorization and request bounds (no provider call  |
| C26 | `composerDraft.ts` | composite exact mark sum not checked | KILLED | composerCore.20f.test.ts › 20F-DRAFT section items: 19A normalizer reused unchanged, compo |
| C27 | `composerProjection.ts` | out-of-scope questions sent in full | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C28 | `composerPatch.ts` | replaceQuestion does not keep the stable id | KILLED | composerAcceptance.20f.test.ts › 20F-MOD modify existing exams through scope-locked domain |
| C29 | `composerPatch.ts` | new blocking issue not refused | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C30 | `composerRun.ts` | client trusts the staged plan | KILLED | composerRun.20f.test.ts › 20F-RUN client orchestration |
| C31 | `src/examQuality.ts` | asset request does not block finalization | KILLED | composerSeams.20f.test.ts › 20F-SEAM existing authorities |
| C32 | `api/src/lib/student-exam-sanitize.js` | sanitizer keeps composer metadata | KILLED | composerSeams.20f.test.ts › 20F-SEAM existing authorities |
| C33 | `composerSim.ts` | physics expected value not computed from the model | KILLED | composerCore.20f.test.ts › 20F-SIM SmartSim through the catalog: code-owned config and pri |
| C34 | `composerSim.ts` | function y-intercept probe removed | KILLED | composerCore.20f.test.ts › 20F-SIM SmartSim through the catalog: code-owned config and pri |
| C35 | `composerPatch.ts` | section scope: addQuestion target not locked | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C36 | `api/src/lib/ai-composer-rate-limit.js` | rate limit allows an empty bucket | KILLED | ai-composer-rate-limit-20f.test.js › 20F-RL composer rate limit |
| C37 | `composerPatch.ts` | atomic groups broken | KILLED | composerCore.20f.test.ts › 20F-PATCH domain patches: scope lock, protected fields, stale p |
| C38 | `composerIntent.ts` | intent unknown keys accepted | KILLED | composerCore.20f.test.ts › 20F-INT intent: strict, bounded, structured controls win |
| C39 | `composerPrompts.ts` | exam projection not fenced as untrusted data | KILLED | composerCore.20f.test.ts › 20F-EXAM verdict, history, revision, projection |
| C40 | `src/StructuredExamBuilder.tsx` | composer dialog statically imported | KILLED | aiComposerUi.20f.test.tsx › 20F AI Full Exam Composer dialog |
| C41 | `AiExamComposerDialog.tsx` | open-in-builder offered for a failing verdict | KILLED | aiComposerUi.20f.test.tsx › 20F AI Full Exam Composer dialog |
| C42 | `AiExamComposerDialog.tsx` | modify apply ignores the base revision | EQUIVALENT |  |
| C43 | `composerSim.ts` | network scenario not from the plan | KILLED | composerCore.20f.test.ts › 20F-SIM SmartSim through the catalog: code-owned config and pri |
| C44 | `composerDraft.ts` | model marks used instead of plan marks | KILLED | composerCore.20f.test.ts › 20F-DRAFT section items: 19A normalizer reused unchanged, compo |
| C19b | `composerRun.ts` | client repair bound: the stop condition off by one | KILLED | composerRun.20f.test.ts › 20F-RUN client orchestration |

Equivalence proofs:

- **C19** (loop bound `attempt <= repairAttempts + 1`): the loop body returns on every path when `attempt === repairAttempts` (success, a
  non-repairable answer, or the explicit stop condition), so the loop condition is never the exit. The stop condition itself is mutant
  **C19b**, KILLED.
- **C42** (dialog's early revision check removed): the very next statement is the dry-run `applyComposerPatch`, whose first check is the same
  revision comparison and whose `STALE_REVISION` result dispatches the same `STALE` event; the observable behaviour is identical. The
  authoritative stale guard in `applyComposerPatch` is mutant C17, KILLED.

### 11.5 Full validation on the head

`npm test` 745 files / 9856 tests passed; `npm run lint` 0 errors (warnings are pre-existing, plus two `no-control-regex` warnings in the
generated CJS copy of `composerSchemaKit`, the same pattern as the existing generated `richContentModel.js`: the shared build drops the
source's disable comments); `npx tsc -b` clean; `npm run build` + bundle guard: initial JS graph 124.1 KB gzip (budget 125 KB, unchanged),
composer payload only in the lazy `AiExamComposerDialog` chunk; `git diff --check` clean; shared-finalization drift test green.

## 12. Known limitations

- Visual types (hotspot / labelDiagram) are not AI-generated (19D policy: no invented geometry); images are explicit teacher requests.
- No source-material (RAG) mode yet: the intent / prompt contracts leave room for excerpts and objectives.
- Selective apply is per target group; rebasing a stale patch is not offered (regenerate instead).
- A section with many items can hit the 30 s provider timeout; the teacher is told to reduce items per section.
- Applying a generated exam replaces the current exam content (cover page, blueprint included) — one undoable step, confirmed first.
