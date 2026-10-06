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
- **functionStudy2d@1**: safe expression language 2 only; the model's key is probed numerically for **soundness** (f(0), roots, poles,
  horizontal asymptotes, local extrema, monotonic intervals: an inconsistent key is refused) and, since Review Fix 1, for **completeness**
  inside the window. Code samples the function (2001 points; sign changes refined by bisection; touching roots, even poles and extrema by
  ternary search, a touching root only at a strict local minimum of |f|; one-sided poles at a domain edge). Poles are recognized by
  **growth**: |f| keeps increasing without slowing down, decade by decade, as the probe closes in (10⁻² … 10⁻¹²). A steep pole may
  instead rise past 10⁶ before the safe evaluator overflows; that is checked from 10⁻¹ in half-decades, and a run of overflow beside a
  pole is tested on both sides. This covers rational poles of any order the evaluator can show, logarithmic poles, steep poles
  (1000/(x−2)⁴) and exp(1/x), at any window height, while a removable hole, a cusp or a finite edge is not a pole.

  **Horizontal limits** are read at the largest magnitude t where f(t), f(t/2), f(t/4), f(t/8) and f(t/16) can all be evaluated, searched
  downward by halving from 10⁶; a logistic curve is therefore read near x = ∓60. The successive differences must shrink geometrically
  (ratio ≤ 0.8) and already be small, and the limit adds the geometric tail. That handles rational, root-like and exponential approaches
  (sigmoid, tanh, logistic), while a log, x^0.01 or an oscillation is not a limit. Limits are compared relatively. The sample points avoid
  round numbers so periodic `round` / `floor` expressions cannot alias.

  The key's **soundness** checks use the same pole test and the same limits, so a correct log asymptote or a slowly converging limit is
  never refused. The probe refuses a key that:
  - omits a root, a pole, a domain point, an extremum, a horizontal limit or a monotonic stretch (`AI_FUNCTION_KEY_INCOMPLETE`);
  - names a point outside the window (`AI_FUNCTION_KEY_OUTSIDE_WINDOW`).

  The grader compares sets, so an incomplete key would fail correct students.

  The probe is **bounded**:
  - it locates only the features of the enabled tasks;
  - it has a hard budget of 20 000 evaluations and 600 000 weighted expression-node evaluations per simulator. Function calls and powers
    weigh 10, so a large or call-heavy expression gets fewer evaluations; `AI_FUNCTION_TOO_COMPLEX` when exhausted, never a silent pass;
  - it stops as soon as a feature list exceeds what a key can hold (10);
  - a section draft or a patch may carry at most 6 function-study simulators (`AI_FUNCTION_SIM_LIMIT`), and the plan already refuses more
    than 6 in one section (`PLAN_FUNCTION_SIM_LIMIT`).

  Measured after Review Fix 4, on the reviewer's nested `log(exp(…))` chains with every completeness task enabled:
  - a curriculum simulator costs about 3–13 ms;
  - the worst simulator costs 25–47 ms;
  - the worst request, which judges an invalid echoed draft and then the provider's draft (12 probes, one reservation), takes about
    300 ms.

  A valid echoed draft is judged once.

  It is a probe, not a proof: features finer than the grid, or growing too slowly to show over the probed decades, are left to the
  teacher's review.
- **No free credit**: every SmartSim key (and every composite SmartSim part) is evaluated on an empty action stream and must award nothing.
- **composite@1**: one shared context (SmartSim spec or rich source), groups of child parts, exact part-mark sums (never redistributed),
  first-N groups with equal marks and code-computed maxima, no nesting, no code stimulus in a part, and a SmartSim check id grades at most
  one part (`AI_COMPOSITE_SIM_CHECK_OVERLAP`); then the composite authority decides. On the wire the composite is flat (item fields
  `compositeText / compositeContext / compositeGroups / compositeParts`, each part naming its group) and code rebuilds the nested shape.
- **Coding**: public material only (statement, language, starter, public examples). Hidden tests, reference solutions and automatic grading
  are never AI-authored (19F policy, re-checked by the verdict and the client): generated coding questions are graded manually until the
  teacher adds verified hidden tests.
- **Parametric**: 19B / 19C draft through the 19A normalizer (safe engine, generation probe); rich stems are not applied to parametric
  (unsupported by the type) and the drop is reported.
- **RichContentV1**: flat bounded block descriptors mapped by code and judged by the 20D.1 validator (raw HTML, script / style / SVG,
  javascript: URLs refused). CLI / code / math / tables are their own LTR blocks.
- **PresentationV1**: preset selection (+ table variant) only, validated by the 20D.1 validator.
- **Images**: the model never invents a URL. An image need becomes an explicit `assetRequest` (teacher TODO) that **blocks finalization**
  until the teacher attaches the image and resolves the request in the Builder's question editor («تم إرفاق الصورة — إزالة الطلب»); it
  never reaches students.

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
- **Session and rate limit.** A teacher session is required. A per-teacher distributed token bucket (40 calls / 10 min, hashed blob
  names) fails closed. **One reservation per request, taken before any heavy work**: judging a client-echoed `previous` draft (SmartSim
  builds, completeness probes, dry-run applies) is charged even when it needs no provider call, and a refused reservation means nothing is
  judged.
- **Bounds.** Request ≤ 2 MB; instruction ≤ 4000 chars; ≤ 8 sections, ≤ 60 items, ≤ 40 patch operations, ≤ 12 composite parts, ≤ 6
  function-study simulators per draft / patch; AI context ≤ 60 KB.
- Prompt-injection defence: role separation; exam content, previous drafts and teacher text are fenced as UNTRUSTED DATA (the fenced JSON
  escapes `<` / `>`, so content can never open or close a fence; validator issues quoting AI-authored text travel inside a fence of their
  own in the repair prompt); the strict schemas, the scope lock and every deterministic gate remain
  the authority.
- Provider schema size: every composer schema stays inside the strict json_schema limits with margin (object nesting: plan 3, section 7,
  patch 8 — limit 10; properties, enum values and schema characters far below the limits), guarded by a test.
- Provider failures map to fixed messages (502 / 504 / 429 / 503 / malformed); provider text and keys are never returned; logs carry
  bounded metadata only (stage, attempt, error name).
- No student data: the composer works on teacher-authored exams only; the projection is allow-listed; tests scan the provider payload.

## 9. UX

Lazy dialog with five modes; structured controls + free instruction; meaningful stage progress (one polite status line, no token streaming,
no fake percentage); cancel; summary, coverage, issues, warnings; «فتح في المحرر» only when the verdict passes (replacing a non-empty exam
asks first and is undoable; the generated exam replaces the title, sections and presentation, while the cover page, the blueprint, the
theme, other metadata and the exam's earlier composer history are kept and the status returns to draft); diff with atomic group checkboxes; stale handling (an apply whose
functional update finds a changed exam is reported STALE, never «تم التطبيق»); undo; distinct error messages per failure kind;
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

### 11.5 Full validation (before the review; the counts on the final head and its exact-head CI are recorded in the pull request)

`npm test` 745 files / 9856 tests passed; `npm run lint` 0 errors (warnings are pre-existing, plus two `no-control-regex` warnings in the
generated CJS copy of `composerSchemaKit`, the same pattern as the existing generated `richContentModel.js`: the shared build drops the
source's disable comments); `npx tsc -b` clean; `npm run build` + bundle guard: initial JS graph 124.1 KB gzip (budget 125 KB, unchanged),
composer payload only in the lazy `AiExamComposerDialog` chunk; `git diff --check` clean; shared-finalization drift test green.

### 11.6 Independent review and Review Fix 1

A read-only independent review of `50fd21f`, run in a separate worktree, found 0 BLOCKER, 3 MAJOR and 7 MINOR findings.
- **m5, m6 and m7** (an EOF blank line, a vendor name in a comment, the missing design record) were already fixed at `470a99b`.
- **Every other finding** was answered in Review Fix 1 (`4056f86`, `8c8996f`, `9fd0260`):

| Finding | Fix |
|---|---|
| M1 function-study keys checked for soundness only (an incomplete key passed) | completeness probe inside the window + key points must lie in the window |
| M2 an AI image request could not be resolved in the Builder | the question editor shows the request and resolves it |
| M3 provider schemas nested 9 / 11 object levels (strict-mode limit 10) | flat composite + addSection items beside the header: section 7, patch 8; limits test |
| m1 a fence could be closed by content | fenced JSON escapes `<` / `>` |
| m2 «فتح في المحرر» dropped cover page / blueprint / metadata | only title, sections, presentation replaced; status draft |
| m3 a refused functional update was reported as applied | the updater's verdict decides APPLIED vs STALE |
| m4 two SmartSim parts could grade the same check | `AI_COMPOSITE_SIM_CHECK_OVERLAP` |
| note: the handler's ISO clock reached the limiter | the limiter keeps its own millisecond clock |

**Fail-first.** `composerReviewFix1.20f.test.ts` and `composerReviewFix1Ui.20f.test.tsx` were executed on `470a99b` before any fix: **13 of 15 failed**. Sample assertions:
- `expected [] to deeply equal [ 'AI_FUNCTION_KEY_INCOMPLETE' ]`
- `section: expected 9 to be less than or equal to 8` and `patch: expected 11 to be less than or equal to 8`
- `expected 4 to be 2` (END fence markers)
- `expected [] to include 'AI_COMPOSITE_SIM_CHECK_OVERLAP'`
- `Unable to find … [data-testid="ai-asset-request"]`
- `expected <h3 … applied-head> to be null`

The limiter-clock test returns 503 instead of 200 against the unfixed handler. All of these pass on the head.

**RF1 mutation campaign.** 23 mutants: **23 KILLED, 0 SURVIVED, 0 TIMEOUT**, with byte-for-byte restore and a clean `git status`. R08, R09 and R12 survived the first run because the test features sat exactly on grid samples; off-grid cases were added in `9fd0260` and all three were re-run KILLED.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| R01 | `composerSim.ts` | roots completeness removed | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R02 | `composerSim.ts` | vertical asymptote completeness removed | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R03 | `composerSim.ts` | domain exclusion completeness removed | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R04 | `composerSim.ts` | horizontal asymptote completeness removed | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R05 | `composerSim.ts` | extrema completeness removed | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R06 | `composerSim.ts` | monotonic coverage removed | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R07 | `composerSim.ts` | key outside the window accepted | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R08 | `composerSim.ts` | touching roots not detected | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R09 | `composerSim.ts` | even poles between samples not detected | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R10 | `composerSim.ts` | pole test without growth ratio (removable hole = pole) | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R11 | `composerSim.ts` | one-sided pole at a domain edge not detected | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R12 | `composerSim.ts` | sign-change root classification dropped | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| R13 | `composerPrompts.ts` | fence content not escaped | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 m1 an UNTRUSTED DATA fence cannot be closed by it |
| R14 | `composerDraft.ts` | overlapping SmartSim check ids accepted | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 m4 SmartSim parts of one composite never grade th |
| R15 | `composerDraft.ts` | part of a missing group accepted | KILLED | composerCore.20f.test.ts › 20F-DRAFT section items: 19A normalizer reused unchanged, compo |
| R16 | `composerDraft.ts` | composite fields on a non-composite item ignored | KILLED | composerCore.20f.test.ts › 20F-DRAFT section items: 19A normalizer reused unchanged, compo |
| R17 | `AiExamComposerDialog.tsx` | generate apply drops the teacher's other exam fields | KILLED | composerReviewFix1Ui.20f.test.tsx › 20F-RF1 UI findings |
| R18 | `AiExamComposerDialog.tsx` | generate apply drops non-composer metadata | KILLED | composerReviewFix1Ui.20f.test.tsx › 20F-RF1 UI findings |
| R19 | `AiExamComposerDialog.tsx` | settle reports applied for any outcome | KILLED | composerReviewFix1Ui.20f.test.tsx › 20F-RF1 UI findings |
| R20 | `AiExamComposerDialog.tsx` | modify updater claims applied when refused | KILLED | composerReviewFix1Ui.20f.test.tsx › 20F-RF1 UI findings |
| R21 | `AiExamComposerDialog.tsx` | generate updater claims applied when stale | KILLED | composerReviewFix1Ui.20f.test.tsx › 20F-RF1 UI findings |
| R22 | `StructuredQuestionEditor.tsx` | image request cannot be resolved | KILLED | composerReviewFix1Ui.20f.test.tsx › 20F-RF1 UI findings |
| R23 | `ai-exam-composer.js` | handler's ISO clock passed to the limiter | KILLED | ai-exam-composer-20f.test.js › 20F-API privacy boundary, prompt injection, provider failur |

### 11.7 Fresh re-review and Review Fix 2

A fresh read-only re-review of `4799542` confirmed every Review Fix 1 item. It found one new MAJOR, introduced by the RF1 probe, plus 2 MINOR
findings and 4 notes. Review Fix 2 (`407751f`, `dc50ad5`, `82d1d1a`) answers them:

| Finding | Fix |
|---|---|
| N-M1 the completeness probe was unbounded (~650 000 evaluations for a crafted expression), and a client-echoed draft was judged before the rate-limit reservation | 20 000-evaluation budget per simulator; task-gated probing; key-sized early stop; ≤ 6 function simulators per draft / patch; one reservation per request before any judging |
| N-m1 logarithmic poles and poles in a tall window were missed | growth-based pole test |
| N-m2 a correct large horizontal asymptote was refused | extrapolated limits, relative comparison |
| note: issue text outside a fence | validator issues fenced |
| note: «فتح في المحرر» dropped earlier composer history | builder history + staged history kept |

The two remaining notes need no change. React flushes a click handler's update before the timer that reads the apply outcome, so the
`settle()` ordering holds. The provider key name appears only in leak assertions, which already exist in baseline tests.

**Fail-first.** `composerReviewFix2.20f.test.ts` and `ai-exam-composer-rf2-20f.test.js` were executed on `4799542` before any fix: **8 of 9
failed**. The ninth, a 429 before any judging, already held there and is labelled a **pin**. Sample assertions:
- `expected 652681 to be less than or equal to 25000`
- `expected [ 'AI_FUNCTION_KEY_INCOMPLETE' ] to deeply equal [ 'AI_FUNCTION_TOO_COMPLEX' ]`
- `expected [] to deeply equal [ 'AI_FUNCTION_SIM_LIMIT' ]`
- `expected [] to deeply equal [ 'teacher-1' ]` (no reservation)
- `expected [] to deeply equal [ 'AI_FUNCTION_KEY_INCOMPLETE' ]` (log poles, tall window)
- `expected false to be true` (HA 500)
- issue text outside a fence

The history test failed on `4799542` with `expected [ 'generate' ] to deeply equal [ 'modifyExam', 'generate' ]`. All of them pass on the
head.

**The reviewer's CPU reproduction on the RF2 head:**
- 30 function simulators were refused by the cap (9 ms), with one reservation.
- 6 `yIntercept`-only sawtooth simulators were judged in 23 ms (the probe is skipped).

The "about 60 ms" worst case per simulator measured for RF2 was too low for large expressions. Review Fix 3 corrects it (§11.8).

**RF2 mutation campaign.** 14 mutants: **14 KILLED, 0 SURVIVED, 0 TIMEOUT**, with byte-for-byte restore and a clean `git status`. S10
(feature overflow ignored) first survived: the outcome code is the same, because a key holds at most 10 values. A test asserting the
explicit overflow reason now kills it (`82d1d1a`).

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| S01 | `composerSim.ts` | probe evaluation budget removed | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-M1 the completeness probe is bounded |
| S02 | `composerSim.ts` | exhausted budget not reported as too complex | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-M1 the completeness probe is bounded |
| S03 | `composerSim.ts` | task gating removed (every feature probed) | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-M1 the completeness probe is bounded |
| S04 | `composerDraft.ts` | section simulator cap removed | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-M1 the completeness probe is bounded |
| S05 | `composerPatch.ts` | patch simulator cap removed | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-M1 the completeness probe is bounded |
| S06 | `composerSim.ts` | growth test accepts slowing growth | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-m1 / N-m2 poles and limits are recognized by gr |
| S07 | `composerSim.ts` | growth ending in overflow accepted without strong growth | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-m1 / N-m2 poles and limits are recognized by gr |
| S08 | `composerSim.ts` | domain-edge growth probed on the wrong side | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-m1 / N-m2 poles and limits are recognized by gr |
| S09 | `composerSim.ts` | even-pole candidates ignored | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside th |
| S10 | `composerSim.ts` | overflow of a key-sized list ignored for growth / extrema stop | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-M1 the completeness probe is bounded |
| S11 | `composerPrompts.ts` | repair issues outside a fence | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 note: AI-authored issue text stays inside a fence |
| S12 | `AiExamComposerDialog.tsx` | earlier composer history dropped on apply | KILLED | composerReviewFix1Ui.20f.test.tsx › 20F-RF1 UI findings |
| S13 | `AiExamComposerDialog.tsx` | staged draft history dropped on apply | KILLED | aiComposerUi.20f.test.tsx › 20F AI Full Exam Composer dialog |
| S14 | `ai-exam-composer.js` | echoed previous judged before the reservation | KILLED | ai-exam-composer-rf2-20f.test.js › 20F-RF2 N-M1 a client-echoed previous draft is charged  |

**Final re-run on the Review Fix 2 code.** All 68 earlier mutants (the original 45 plus RF1's 23) were re-run:
- **60 KILLED.**
- **2 EQUIVALENT:** C19 and C42 (proved in §11.4).
- **6 INVALID,** because RF2 rewrote their target lines:
  - R04, R08 and R12 were re-targeted at the new code as R04b, R08b and R12b, and all three were KILLED;
  - R09, R10 and R11 are covered by RF2's S09, S06/S07 and S08.

Across the phase, every planted defect in current code is killed except the 2 proven equivalents. There were 0 timeouts, and every file
was restored byte-for-byte with a clean `git status`.

### 11.8 Fresh re-review and Review Fix 3

A fresh re-review of `bd71428` found 0 BLOCKER, 0 MAJOR and 5 MINOR findings. Two of them, MINOR-2 and MINOR-3, were regressions introduced
by RF2. Review Fix 3 (`8dc1113`, `899233e`) answers all five:

| Finding | Fix |
|---|---|
| MINOR-1 the evaluation budget ignored expression size (a large expression cost ~470 ms per simulator, ~4 s per request), and a valid echoed draft was judged twice | budget also in expression-node evaluations; the judgement of a valid echoed draft is reused (judged once); now ~107 ms worst simulator, ~350 ms per request |
| MINOR-2 (RF2 regression) poles of order ≥ 3 overflowed before the growth test saw them | growth measured decade by decade from 10⁻² |
| MINOR-3 (RF2 regression) flat stretches started a ternary search at every sample (false TOO_COMPLEX) | a touching root needs a strict local minimum of \|f\| |
| MINOR-4 the older soundness checks used absolute thresholds (log poles, slowly converging / logistic limits refused) | soundness uses the same pole test and the same extrapolated limits (tiered, alias-free sample points; no round-number fallback) |
| MINOR-5 the plan accepted more function simulators than a section may carry | `PLAN_FUNCTION_SIM_LIMIT`; the cap is stated in the prompt rules |

**Fail-first.**
- `composerReviewFix3.20f.test.ts` was executed on `bd71428`: **6 of 6 failed**, with:
  - `expected 20000 to be less than or equal to 8000`
  - `expected [] to deeply equal [ 'AI_FUNCTION_KEY_INCOMPLETE' ]` (order-3 / order-4 poles)
  - `expected false to be true` (plateau keys, log asymptote, slow and logistic limits)
  - `expected [] to include 'PLAN_FUNCTION_SIM_LIMIT'`
- `ai-exam-composer-rf3-20f.test.js` against the `bd71428` handler: `expected 2 to be 1` (two dry-run applies).
- The periodic-limit test against `8dc1113`: `expected [] to deeply equal [ 'AI_FUNCTION_KEY_INCONSISTENT' ]`.

All of them pass on the head.

**RF3 mutation campaign.** 9 mutants: **9 KILLED, 0 SURVIVED, 0 TIMEOUT**, with byte-for-byte restore and a clean `git status`.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| T01 | `composerSim.ts` | probe budget not weighted by expression size | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-1 the probe budget is weighted by the expre |
| T02 | `composerSim.ts` | pole growth starts at 1e-3 (high-order poles overflow) | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-2 high-order poles are found |
| T03 | `composerSim.ts` | plateau points start touching-root searches | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-3 flat stretches are not touching roots |
| T04 | `composerSim.ts` | vertical-asymptote soundness by absolute height | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-4 soundness uses the same pole / limit logi |
| T05 | `composerSim.ts` | horizontal-asymptote soundness ignores the extrapolated limits | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-4 soundness uses the same pole / limit logi |
| T06 | `composerSim.ts` | limit tiers do not fall back on overflow | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-4 soundness uses the same pole / limit logi |
| T07 | `composerSim.ts` | limit sample points at round magnitudes | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-4 soundness uses the same pole / limit logi |
| T08 | `composerPlan.ts` | plan simulator cap removed | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-5 the plan respects the per-section functio |
| T09 | `ai-exam-composer.js` | valid echoed draft judged twice | KILLED | ai-exam-composer-rf3-20f.test.js › 20F-RF3 a valid echoed draft is judged once |

**Final re-run on the Review Fix 3 code.** Every earlier mutant list was re-run (the original 45, RF1 23, the RF1 re-targets 3, RF2 14; 85 in total):
- **74 KILLED.**
- **2 EQUIVALENT:** C19 and C42 (proved in §11.4).
- **9 INVALID,** because their target lines were rewritten:
  - S01, S03 and S06 were re-targeted at the RF3 code as S01b, S03b and S06b, and all three were KILLED. S03b first survived; a task-gating test (`67b2550`) now kills it.
  - R04, R08 and R12 are covered by the re-targets R04b, R08b and R12b, which were KILLED in this run.
  - R09, R10 and R11 are covered by S09, S06b / S07 and S08.

Together with RF3's 9: every planted defect in the current code is killed except the 2 proven equivalents. There were 0 timeouts, and every file was restored byte-for-byte with a clean `git status` after each campaign.

### 11.9 Fresh re-review and Review Fix 4

A fresh re-review of `ce23bdd` found 0 BLOCKER, 0 MAJOR, 3 MINOR findings and 4 notes. MINOR-C was a regression introduced by RF3. Review
Fix 4 (`be566ca`, `8b33d7e`, `9f2d3e6`) answers them:

| Finding | Fix |
|---|---|
| MINOR-A the budget weighed every AST node 1, though exp / log / pow / round cost ~10×; the documented timings were too low | calls and powers weigh 10; measured worst simulator 25–47 ms, worst request ~300 ms (was 1.9–2.4 s) |
| MINOR-B sigmoid / tanh / logistic limits missed (correct keys refused, one-sided keys accepted) | limits read at the largest evaluable magnitude with a geometric-convergence test and tail |
| MINOR-C (RF3 regression) a very steep pole overflowed after one finite sample; exp(1/x) refused | steep-pole check from 10⁻¹; overflow runs tested on both sides |
| NOTE-1 stale probe comments | updated |

The other notes need no change:
- NOTE-2: a long expression may be refused as too complex, which is a safe refusal.
- NOTE-3: a non-terminating decimal pole can be keyed only with the exact double (§12).
- NOTE-4: aliasing occurs only at an adversarial frequency.

**Fail-first.** `composerReviewFix4.20f.test.ts` was executed on `ce23bdd`: **3 of 3 failed**, with:
- `expected 8955 to be less than or equal to 5000`
- `5/(1+exp(-0.5*x)) ["AI_FUNCTION_KEY_INCONSISTENT"]: expected false to be true`
- `1/(x+3)+1000/(x-2)^4 ["AI_FUNCTION_KEY_INCONSISTENT"]: expected false to be true`

All pass on the head. A battery of 17 correct curriculum keys (rationals, roots, exp, log, logistic, plateaus, sqrt) is all accepted, and
5 incomplete or unsound keys are all refused.

**RF4 mutation campaign.** 6 mutants: **5 KILLED, 1 EQUIVALENT, 0 TIMEOUT**. U02 is equivalent: function-study expressions are always
parsed in expression language 2, where `^` becomes a `pow` call (`parametricEngine.ts:126`). The `bin "^"` weight is therefore unreachable,
and powers are already weighted as calls.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| U01 | `composerSim.ts` | function calls weigh 1 in the probe cost | KILLED | composerReviewFix4.20f.test.ts › 20F-RF4 MINOR-A expensive calls weigh more in the probe b |
| U02 | `composerSim.ts` | powers weigh 1 in the probe cost | EQUIVALENT |  |
| U03 | `composerSim.ts` | steep-pole check removed | KILLED | composerReviewFix4.20f.test.ts › 20F-RF4 MINOR-C very steep poles and exp(1/x) are vertica |
| U04 | `composerSim.ts` | gap edges tested on one side only | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-m1 / N-m2 poles and limits are recognized by gr |
| U05 | `composerSim.ts` | limit = last sample (no geometric tail) | KILLED | composerReviewFix4.20f.test.ts › 20F-RF4 MINOR-B sigmoid and tanh limits are found on both |
| U06 | `composerSim.ts` | no downward search for an evaluable magnitude | KILLED | composerReviewFix4.20f.test.ts › 20F-RF4 MINOR-B sigmoid and tanh limits are found on both |

**Final re-run on the Review Fix 4 code.** Every earlier mutant list was re-run, 97 mutants in total: the original 45, RF1 23, the RF1
re-targets 3, RF2 14, the RF2 re-targets 3 and RF3 9.
- **81 KILLED.**
- **3 EQUIVALENT:**
  - C19 and C42 (proved in §11.4);
  - T02 (pole growth starting at 10⁻³): RF4's steep check from 10⁻¹ already recognizes the high-order poles that the 10⁻² start was
    added for, so dropping the first decade changes no outcome.
- **13 INVALID,** because their target lines were rewritten; each is re-targeted or covered:
  - R04, R08 and R12 by R04b, R08b and R12b (KILLED in this run);
  - R09, R10 and R11 by S09, S06b / S07b and U04;
  - S01, S03 and S06 by S01b, S03b and S06b (KILLED in this run);
  - S07 by S07b and T07 by T07b (both re-targeted at the RF4 code and KILLED);
  - S08 by U04 and T06 by U06.

With RF4's 6 (5 KILLED, U02 equivalent), every planted defect in the current code is killed except 4 proven equivalents (C19, C42, T02,
U02). There were 0 timeouts, and every file was restored byte-for-byte with a clean `git status` after every campaign.

## 12. Known limitations

- Visual types (hotspot / labelDiagram) are not AI-generated (19D policy: no invented geometry); images are explicit teacher requests.
- No source-material (RAG) mode yet: the intent / prompt contracts leave room for excerpts and objectives.
- Selective apply is per target group; rebasing a stale patch is not offered (regenerate instead).
- A section with many items can hit the 30 s provider timeout; the teacher is told to reduce items per section.
- Applying a generated exam replaces the title, sections and presentation (cover page, blueprint and other settings kept) — one undoable
  step, confirmed first.
- The function-study completeness probe is a probe, not a proof. These cases are left to the teacher's review:
  - features finer than the 2001-point grid;
  - poles that overflow the safe evaluator before growth shows, beyond the steep check;
  - vertical asymptotes at non-terminating decimals (1/(3x−1)), which can only be keyed with the exact double; refusing them is safe.
- No live provider call was made (no network in the development environment): the provider schemas are checked against the documented
  strict-mode limits by a test, not by a live acceptance call. The first production composer call is the live check.
- Notes accepted from the review: a replaceQuestion may change the marks of the selected question (shown in the diff); removing a composite
  part clamps a first-N group's required answers (the marks warning is shown); the client trusts the server's scope lock (it re-verifies
  revision, verdict, node policy, duplicate ids and presentation).
