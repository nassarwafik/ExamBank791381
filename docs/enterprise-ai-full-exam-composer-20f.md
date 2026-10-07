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
- **functionStudy2d@1**: safe expression language 2, restricted for AI-authored keys (Review Fix 5) to numbers, x, + − × ÷ ^, abs, sqrt,
  exp, log and log10. round / floor / ceil / min / max / % are refused (`AI_FUNCTION_UNSUPPORTED`; the teacher authors those manually)
  because their jumps and noise defeat a numerical probe. The model's key is probed numerically for **soundness** (f(0), roots, poles,
  horizontal asymptotes, local extrema, monotonic intervals: an inconsistent key is refused) and, since Review Fix 1, for **completeness**
  inside the window. Code samples the function (2001 points; sign changes refined by bisection; touching roots and extrema by ternary
  search, a touching root only at a strict local minimum of |f| beyond rounding noise; one-sided poles at a domain edge; even poles and
  holes through the guards, Review Fix 8). Poles are recognized by
  **growth** and classified **fail-closed** (Review Fix 5). Each side of a candidate is sampled at 10⁻² … 10⁻¹², with the evaluator's
  overflow told apart from undefined points, and classified as:
  - **pole**: |f| keeps increasing without slowing down, or rises strongly until the evaluator overflows;
  - **bounded**: undefined on that side, not increasing, or increasing with geometrically vanishing steps (a cusp);
  - **uncertain**: anything else, such as overflow already at 10⁻² (an overflow edge is not a pole) or growth too slow to decide
    (√|log|x||).

  A candidate that lands on an overflow plateau, or on its finite edge, is moved to the plateau's centre. Poles and holes at any position
  are also found through the expression's guards (below; Review Fix 8 replaced RF6's grid snapping). A
  **narrow** overflow run (at most 2 samples, finite on both sides) is classified at its centre and must be a pole. An uncertain
  candidate, an uncertain key point, or any wider overflow run inside the window **refuses** the key (`AI_FUNCTION_TOO_COMPLEX`) rather
  than guessing. This covers rational poles of order 1 to about 8
  (1000/(x−2)⁴, 10⁶/(x−2)³) and logarithmic poles at any window height. A hole, a cusp or a finite edge is not a pole. Very steep poles
  (1/(x−2)¹⁰) and exp(1/x) are refused, never keyed incompletely.

  **Horizontal limits** are read at the largest magnitude t where f(t), f(t/2), f(t/4), f(t/8) and f(t/16) can all be evaluated, searched
  downward by halving from 10⁶; a logistic curve is therefore read near x = ∓60. The successive differences must shrink geometrically
  (ratio ≤ 0.8) and already be small, and the limit adds the geometric tail. That handles rational, root-like and exponential approaches
  (sigmoid, tanh and logistic at moderate rates). Each side is decided **three ways**:
  - a limit;
  - none: steps of one sign that do not shrink (ratios ≥ 0.999: polynomial, exp, log, x^0.01);
  - uncertain: noise, a non-monotone approach, steps shrinking too slowly to tell (ratios between 0.8 and 0.999: x^−0.15, 1/log x —
    Review Fix 6), or a side defined at moderate |x| but at no evaluable magnitude (a very steep logistic). An uncertain side refuses the
    key.

  Evaluator rounding counts as flat.

  The key's **soundness** checks use the same pole test and the same limits, so a correct log asymptote is never refused. Since
  Review Fix 6, key and probe must agree **in both directions within 0.005**, half the grading tolerance of 0.01. The grader compares
  a student's answer with the key, so a key off by more would fail a student who answers correctly. The probe refuses a key that:
  - omits a root, a pole, a domain point, an extremum, a horizontal limit or a monotonic stretch (`AI_FUNCTION_KEY_INCOMPLETE`);
  - lists a root, an extremum or a limit the probe does not find within 0.005, gives f(0) or an extremum's value off by more than 0.005,
    or lists two values closer than 0.01 (`AI_FUNCTION_KEY_INCONSISTENT`);
  - has a monotonic interval that does not hold over its whole length, or does not end at an extremum, a pole or a domain edge, or
    crosses a pole, a domain point or a domain edge, or overlaps another interval (`AI_FUNCTION_KEY_INCONSISTENT`);
  - names a point outside the window (`AI_FUNCTION_KEY_OUTSIDE_WINDOW`);
  - has, beyond the window, a root, a pole, a domain change or an extremum that its tasks ask for (`AI_FUNCTION_WINDOW_TOO_NARROW`).
    Since Review Fix 7 the student studies the **whole** function ("the graph is for exploration only"), so the window must contain
    every such feature. Each side beyond the window is scanned on a geometric grid out to 10⁶ past the edge (≈ 2.6 % apart). The scan
    tells a root (a sign change through 0, an exact zero f leaves again, or a touching root) from a pole or a domain edge.

  **Guards (Review Fix 8).** Where the expression excludes x is found from the expression itself, whatever the grid: the zeros of every
  denominator, every log argument and every power base under a negative exponent. Each guarded sub-expression is sampled; its sign
  changes are bisected, and its exact and touching zeros are refined. Results:
  - a removable hole that no sample lands on ((x−1)/(x²−1) at 1) is a domain point;
  - such a point is also a pole if f grows there;
  - beyond the window, such a point refuses the key.

  A touching zero counts when it is exactly 0 at its 12-digit rounded position, negligible, or **vanishes** there (Review Fix 10). An
  expression vanishes at m when |g| falls like a steady power of the distance as x closes in, at 10⁻², 10⁻⁴, 10⁻⁶ and 10⁻⁸ from m, with
  an exponent above 0.05 and the three steps within 25 % of each other:
  - √|x − a|, |x − a|^0.25 and (x − a)² vanish;
  - a shallow minimum (x² + 10⁻⁷) does not, and neither does an offset cusp (|x − a| + 10⁻⁷).

  The same rule decides f's own touching roots, inside the window (x·√|x − 1.3|) and beyond it (x·√|x − 7| on [−5, 5]), and a zero at
  the edge of a guard's own domain (√(x + 2) at −2, (x² − 2)^0.25 at ±√2), on the defined side only. A zero exactly halfway between two
  samples is found (ties count, Review Fix 9). The guards are bounded (at most 12 guarded sub-expressions within the node budget; more refuses the key as too complex).

  A domain edge where f tends to 0 is a **root** when the edge belongs to the domain. An edge that is a guard zero (a log argument, a
  denominator) is open; any other edge is closed. So x·√(4−x²) at ±2 and x·√(1.21−x²) at ±1.1 are roots, while x·log x at 0 is not.
  A domain exclusion must be an **isolated** undefined point (a hole, a jump, a pole), not a point inside a domain gap. A window end that
  is a domain edge (√x on [0, 9]) may end a monotonic interval. A very flat extremum (x⁵ − 5x⁴ + 50 at 0, (x−2)⁸ + 1000) is detected by comparing samples 4 and 16 steps away when its
  neighbours tie with it, and is located at the centre of its flat stretch. One too flat for the probe is accepted only within 0.005 of
  the centre of the stretch where f equals the key's value within rounding, with f rising (falling) beyond it on both sides.

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

  It is a probe, not a proof, and it **fails closed**: whatever it cannot decide is refused. A refused key is a teacher task; an accepted
  wrong or incomplete key would fail correct students. Features finer than the grid remain the teacher's review.
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

**Fail-first.** `composerReviewFix4.20f.test.ts` was executed on `ce23bdd`. The first three tests **failed 3 of 3**; the fourth, added in
`8b33d7e`, also fails there (4 of 4, confirmed by the RF5 reviewer). The assertions were:
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
  - T02 (pole growth starting at 10⁻³) was claimed equivalent here. **That claim was wrong**: the RF5 re-review showed √|log|x|| changes
    outcome under it. §11.10 records how it is answered.
- **13 INVALID,** because their target lines were rewritten; each is re-targeted or covered:
  - R04, R08 and R12 by R04b, R08b and R12b (KILLED in this run);
  - R09, R10 and R11 by S09, S06b / S07b and U04;
  - S01, S03 and S06 by S01b, S03b and S06b (KILLED in this run);
  - S07 by S07b and T07 by T07b (both re-targeted at the RF4 code and KILLED);
  - S08 by U04 and T06 by U06.

With RF4's 6 (5 KILLED, U02 equivalent), every planted defect in the RF4 code was killed except 4 claimed equivalents (C19, C42, T02,
U02); the T02 claim was later withdrawn (§11.10). There were 0 timeouts, and every file was restored byte-for-byte with a clean `git status` after every campaign.

### 11.10 Fresh re-review and Review Fix 5: the function-study key check fails closed

A fresh re-review of `838e7f4` found 0 BLOCKER, 0 MAJOR, 3 MINOR findings and 4 notes.
- **MINOR-1** was an RF4 regression: the steep branch jumped across an overflow run, so its edges were accepted as asymptotes.
- **MINOR-2:** noisy, non-monotone or very steep approaches at ±∞ lost a limit and accepted the one-sided key.
- **MINOR-3:** the T02 equivalence claim was wrong (√|log|x||).

Four rounds had shown that every heuristic refinement of the numerical probe opened new corner cases. So Review Fix 5 (`34ac5d7`, then
the tests `8396f15`, `0fc0b33`, `4e462ef`, `2ae0362` and `20257aa`) changes the **principle** instead of adding a fifth heuristic. A refused key costs the teacher a manual question; an
accepted wrong key fails correct students. The probe therefore fails closed:

| Change | Answers |
|---|---|
| AI vocabulary for function study: numbers, x, + − × ÷ ^, abs, sqrt, exp, log, log10 (round / floor / ceil / min / max / % → `AI_FUNCTION_UNSUPPORTED`; stated in the prompt rules) | MINOR-2 noisy / periodic cases |
| three-way pole classification (pole / bounded / uncertain) with evaluator overflow distinguished from undefined; the steep branch removed; plateau candidates moved to the plateau centre | MINOR-1 |
| an overflow run inside the window, an uncertain candidate or an uncertain key point refuses the key (`AI_FUNCTION_TOO_COMPLEX`) | MINOR-1, MINOR-3 |
| three-way limits (limit / none / uncertain); an uncertain side refuses the key | MINOR-2 |

Battery (an uncommitted probe script; the cases that matter are pinned by the tests below): 25 correct curriculum keys are accepted,
and 7 wrong or incomplete keys are refused. The battery covers rationals, poles of order
1–4, log poles, sqrt, abs, plateaus, slowly converging and logistic / tanh limits, and extrema / monotonic keys. The expected changes from
earlier rounds are exp(1/x), now refused (an RF4 test updated to expect the refusal), and the round-based test expressions, rewritten in
the allowed vocabulary with the same intent.

**Fail-first.** `composerReviewFix5.20f.test.ts` (the first five tests) was executed on `838e7f4` in a detached worktree: **5 of 5
failed**. Sample assertions:
- `1/(x-2)^10 {"verticalAsymptotes":[1.97,2.03]}: expected true to be false`
- `expected [ 'AI_FUNCTION_KEY_INCOMPLETE' ] to deeply equal [ 'AI_FUNCTION_TOO_COMPLEX' ]`
- `exp(x)*exp(-abs(x)) {"horizontalAsymptotes":[0]}: expected true to be false`
- `expected [] to deeply equal [ 'AI_FUNCTION_UNSUPPORTED' ]`
- `sqrt(abs(log(abs(x))))+1/(x-3) {"verticalAsymptotes":[3]}: expected true to be false`

All pass on the head. The layer-isolating tests (seven in the last `describe` block: four in `8396f15` / `0fc0b33`, then `4e462ef` and
the two of `2ae0362` / `20257aa`) were added after the first mutation run.

**RF5 mutation campaign.** 20 mutants: the 13 RF5 mutants (V01–V13) and 7 re-targets of earlier mutants whose lines RF5 rewrote
(T02b, S03c, S06c, S07c, T04c, T05c, U05c). Result: **20 KILLED, 0 SURVIVED, 0 TIMEOUT**. Some first survived because another
fail-closed layer caught the same input:
- V03, V04, V05, V08 and V09, now killed by the layer-isolating tests (`8396f15`, `0fc0b33`);
- S07c and T05c, now killed by `2ae0362` and `20257aa`, which assert the pole classification directly.

T02b, the old T02 change, is killed by several tests: the RF4 steep-pole test (listed in the table, the first to fail), the order-6
pole test (`4e462ef`) and the slow-growth test.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| V01 | `composerSim.ts` | AI vocabulary check removed | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 MINOR-2 an undecidable behaviour at ±∞ never accepts a one- |
| V02 | `composerSim.ts` | evaluator overflow treated as undefined | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 MINOR-1 the edges of an overflow run are never vertical asy |
| V03 | `composerSim.ts` | overflow run inside the window not refused | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 each fail-closed layer holds on its own › a domain point hi |
| V04 | `composerSim.ts` | overflow already at 1e-2 counted as a pole | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 each fail-closed layer holds on its own › a coarse grid doe |
| V05 | `composerSim.ts` | a pole side outweighs an uncertain side | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 each fail-closed layer holds on its own › one side a fast p |
| V06 | `composerSim.ts` | slow growth counted as bounded | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 MINOR-3 a pole that grows too slowly to confirm refuses the |
| V07 | `composerSim.ts` | uncertain candidate ignored by the probe | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 MINOR-3 a pole that grows too slowly to confirm refuses the |
| V08 | `composerSim.ts` | uncertain limits ignored by the probe | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 each fail-closed layer holds on its own › an undecided appr |
| V09 | `composerSim.ts` | undecided approach treated as no limit | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 each fail-closed layer holds on its own › an undecided appr |
| V10 | `composerSim.ts` | defined-but-unevaluable side treated as no limit | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 MINOR-2 an undecidable behaviour at ±∞ never accepts a one- |
| V11 | `composerSim.ts` | candidate left on the edge of an overflow plateau | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-2 high-order poles are found › poles of order 3 and 4 |
| V12 | `composerSim.ts` | uncertain key pole reported as inconsistent | KILLED | composerReviewFix4.20f.test.ts › 20F-RF4 MINOR-C very steep poles and exp(1/x) are vertical asymptot |
| V13 | `composerSim.ts` | growth toward a tiny gap always uncertain | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-m1 / N-m2 poles and limits are recognized by growth, limi |
| T02b | `composerSim.ts` | pole growth starts at 1e-3 (RF5 code) | KILLED | composerReviewFix4.20f.test.ts › 20F-RF4 MINOR-C very steep poles and exp(1/x) are vertical asymptot |
| S03c | `composerSim.ts` | task gating removed (RF5 code) | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 task gating: only the enabled tasks' features are located › |
| S06c | `composerSim.ts` | slowing growth counted as a pole (RF5 code) | KILLED | composerReviewFix2.20f.test.ts › 20F-RF2 N-m1 / N-m2 poles and limits are recognized by growth, limi |
| S07c | `composerSim.ts` | overflow after weak growth counted as a pole (RF5 code) | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 each fail-closed layer holds on its own › weak growth that  |
| T04c | `composerSim.ts` | vertical-asymptote key soundness skipped (RF5 code) | KILLED | composerCore.20f.test.ts › 20F-SIM SmartSim through the catalog: code-owned config and private check |
| T05c | `composerSim.ts` | horizontal-asymptote key soundness skipped (RF5 code) | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 each fail-closed layer holds on its own › a key value that  |
| U05c | `composerSim.ts` | limit = last sample, no geometric tail (RF5 code) | KILLED | composerReviewFix4.20f.test.ts › 20F-RF4 MINOR-B sigmoid and tanh limits are found on both sides › a |

**Final re-run on the Review Fix 5 code.** Every earlier mutant list was re-run: 105 mutants (the 97 of the RF4 re-run, RF4's 6 and
the 2 RF4 re-targets).
- **80 KILLED.**
- **4 EQUIVALENT:**
  - C19 and C42 (proved in §11.4);
  - U02 (`^` is parsed as a `pow` call, so the `bin "^"` cost branch is unreachable);
  - T07b (the off-round limit sample offset only prevents periodic aliasing, and the AI vocabulary no longer contains a periodic
    operator).
- **T02** survived here only because its suite list predates `composerReviewFix5`. The identical change, re-run with the current suites
  as T02b, is **KILLED** (table above). The RF4 equivalence claim for T02 is withdrawn.
- **20 INVALID,** because RF5 rewrote their target lines. Each is re-targeted or covered:
  - R04, R08 and R12 by R04b, R08b and R12b;
  - R09, R10 and R11 by S09, S06c and U04;
  - S01 by S01b;
  - S03 and S03b by S03c;
  - S06 and S06b by S06c;
  - S07 and S07b by S07c;
  - S08 by U04;
  - T04 by T04c, T05 by T05c, T06 by U06 and T07 by T07b;
  - U03: the steep-pole branch it mutated was removed by RF5;
  - U05 by U05c.

Every planted defect in the current code is killed except the 4 proven equivalents (C19, C42, U02, T07b). There were 0 timeouts, and
every file was restored byte-for-byte with a clean `git status` after every campaign.

### 11.11 Fresh re-review and Review Fix 6: key values must match the probe within half the grading tolerance

A fresh re-review of `f27d136` found 0 BLOCKER, 1 MAJOR, 3 MINOR findings and 4 notes. The MAJOR finding was not an RF5 regression: it
had been in the code since RF1. MINOR-1 was an RF5 regression.

| Finding | Fix |
|---|---|
| MAJOR-1 a monotonic-interval key was checked only at its midpoint: an endpoint sign slip (`dec(−∞,2), inc(−2,+∞)` for x²−4x+3), an interval past a turning point or across a pole was accepted, and the grader then failed a correct student | every probed slope inside an interval must have its direction; finite endpoints must lie within 0.005 of an extremum, a pole, a domain point or a domain edge; no pole, domain point or domain edge inside an interval; no overlapping intervals. Probing after the first mutation run also found `(x+1)/(x−2)` keyed as one decreasing interval over (−∞, +∞), accepted on `f27d136`: refused now |
| MINOR-1 (RF5 regression) correct keys for poles at one-decimal positions (34–38 of 89 per family) and some order-4 poles were refused: a grid sample one rounding step off the pole overflowed, and an even pole's search stopped on the overflow plateau's finite edge | grid snapped to 12 significant digits; a narrow overflow run (≤ 2 samples) classified at its plateau centre; a search on the finite edge moved inside. Probing also found a pole at the window's edge refused (the gap bisection treated overflow as undefined): the gap now starts where f is undefined |
| MINOR-2 slowly converging approaches at ±∞ (x^−0.15, 1/(1+log x) on one side) were read as "no limit", so a one-sided key was accepted | "no limit" only when steps do not shrink (ratios ≥ 0.999); between 0.8 and 0.999 the side is uncertain and refuses the key |
| MINOR-3 key tolerances (0.02, 1 %, 0.1 %·\|l\|) were looser than the grading tolerance 0.01: ±1.4 for 0.2x²−0.4 was accepted and a student answering ±1.414 failed | one key tolerance, 0.005 (half the grading tolerance), in both directions: completeness, roots / extrema / limits matched to the probe, f(0) and extremum values absolute; key values closer than 0.01 refused; a very flat extremum ((x−2)⁶) the probe does not record is checked at x ± 0.005 |
| N1 the RF5 battery was not committed | stated in §11.10; the RF6 cases are pinned by tests |
| N2 / N3 T02b killer and the count of layer-isolating tests | aligned in §11.10 |
| N4 an environment-variable name in negative test assertions | not a model identifier; no change |

The prompt's function-study rule now also asks for values to at least three decimals, and for monotonic intervals that end only at an
extremum, a pole or a domain edge and never overlap.

**Fail-first.** `composerReviewFix6.20f.test.ts` was executed on `f27d136` in a detached worktree (`0d18a62`'s version of the file, 10
tests): **7 failed and 3 passed**. The 3 that passed are pins: correct keys that must keep passing, and the grader's verdict on the slip.
The commit message of `0d18a62` says "6 of 9" because the window-edge test was added before that commit but after the first run. Sample
assertions on `f27d136`:
- `x^2-4*x+3 {"intervals":[…"decreasing","-inf","2"…"increasing","-2","+inf"…]}: expected true to be false`
- `1/(x-1.3) {"verticalAsymptotes":[1.3],"horizontalAsymptotes":[0]}: expected '[{"code":"AI_FUNCTION_TOO_COMPLEX",…' to be 'ok'`
- `2/(x-3)^4-1 {"xMin":-3,"xMax":3,…}: expected '[{"code":"AI_FUNCTION_TOO_COMPLEX",…' to be 'ok'`
- `1/(1+log(1+abs(x)+x)) {"horizontalAsymptotes":[1]}: expected true to be false`
- `0.2*x^2-0.4 {"xIntercepts":[-1.4,1.4]}: expected true to be false`

The tests added later were checked on `f27d136` through its generated module:
- **Accepted there, refused on the head (fail-first):**
  - the near-duplicate root and the extra limit value (`836aab8`);
  - `(x+1)/(x-2)` over (−∞, +∞);
  - the removable hole at 1.3;
  - the flat-line extra intercept.
- **Already refused there:**
  - the duplicated interval was refused later, by the plugin validator (`AI_SIM_CHECKS_INVALID`); its test isolates the earlier,
    clearer refusal;
  - the narrow overflow spike is a **pin** of the new narrow-run path.

**Batteries on the head:**
- The reviewer's three rational batteries: decimal poles refused **0 / 89** per family (was 34–38), order-4 poles **0** (was 6 / 64 and
  6 / 53), and **0 of 672** in the window × pole-position battery (was 2). The only other refusals are correct ones: `(2x+1)/(x+0.5)`
  has a removable hole, not a pole.
- A monotonic / extrema / root battery: **23 of 23** correct curriculum keys accepted and **10 of 10** wrong keys refused.
- The fuzzer: **0 exceptions** in 3 000 expressions, worst build 38 ms.

**RF6 mutation campaign.** 21 mutants: **21 KILLED, 0 SURVIVED, 0 TIMEOUT**. W01, W03, W04, W06 and W11 first survived because another
layer caught the same inputs. The layer-isolating tests (`94bb3ea`) now kill them. W01's outcome (refused) is also reached through
completeness plus the overlap check, so its test asserts the repair message that names the wrong stretch.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| W01 | `composerSim.ts` | interval slope direction not checked | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 each new layer holds on its own › a wrong direction inside  |
| W02 | `composerSim.ts` | interval endpoint need not be a breakpoint | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MAJOR-1 a monotonic-interval key must hold over its whole l |
| W03 | `composerSim.ts` | overlapping intervals accepted | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 each new layer holds on its own › a duplicated interval is  |
| W04 | `composerSim.ts` | grid not snapped | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 each new layer holds on its own › a removable hole at a dec |
| W05 | `composerSim.ts` | every overflow run refused (no narrow-run classification) | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-1 poles at decimal positions keep their correct keys  |
| W06 | `composerSim.ts` | narrow-run centre not classified | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 each new layer holds on its own › PIN (new path): a narrow  |
| W07 | `composerSim.ts` | search on the plateau edge not moved inside | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-1 poles at decimal positions keep their correct keys  |
| W08 | `composerSim.ts` | gap edge bisected on 'not finite' (overflow = undefined) | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-1 poles at decimal positions keep their correct keys  |
| W09 | `composerSim.ts` | 'no limit' at ratios >= 0.9 (slow convergence) | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-2 a slowly converging approach is undecided, never 'n |
| W10 | `composerSim.ts` | key tolerance 0.02 | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MAJOR-1 a monotonic-interval key must hold over its whole l |
| W11 | `composerSim.ts` | key roots not matched to probed roots | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 each new layer holds on its own › an x-intercept the probe  |
| W12 | `composerSim.ts` | key extrema not matched to probed extrema | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-3 key values are held to half the grading tolerance › |
| W13 | `composerSim.ts` | flat-extremum fallback never accepts | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-3 key values are held to half the grading tolerance › |
| W14 | `composerSim.ts` | flat-extremum fallback slack 1e-9 | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-3 key values are held to half the grading tolerance › |
| W15 | `composerSim.ts` | near-duplicate key values accepted | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-3 key values are held to half the grading tolerance › |
| W16 | `composerSim.ts` | touching-root search started on rounding noise | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-3 flat stretches are not touching roots › piecewise-l |
| W17 | `composerSim.ts` | relative tolerance for intercept / extremum values | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-3 key values are held to half the grading tolerance › |
| W18 | `composerSim.ts` | limit key soundness tolerance 0.5 | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-3 key values are held to half the grading tolerance › |
| W19 | `composerSim.ts` | domain-gap edges not recorded | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MAJOR-1 a monotonic-interval key must hold over its whole l |
| W20 | `composerSim.ts` | completeness tolerance 0.02 | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MAJOR-1 a monotonic-interval key must hold over its whole l |
| W21 | `composerSim.ts` | an interval may cross a pole / domain point / edge | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MAJOR-1 a monotonic-interval key must hold over its whole l |
| R04c | `composerSim.ts` | horizontal asymptote completeness removed (RF6 code) | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside the window ( |
| T03b | `composerSim.ts` | plateau points start touching-root searches (RF6 code) | KILLED | composerReviewFix3.20f.test.ts › 20F-RF3 MINOR-3 flat stretches are not touching roots › piecewise-l |
| V03b | `composerSim.ts` | wide overflow run inside the window not refused (RF6 code) | KILLED | composerReviewFix4.20f.test.ts › 20F-RF4 MINOR-C very steep poles and exp(1/x) are vertical asymptot |
| T05d | `composerSim.ts` | horizontal-asymptote key soundness skipped (RF6 code) | KILLED | composerReviewFix5.20f.test.ts › 20F-RF5 each fail-closed layer holds on its own › a key value that  |

The table also lists 4 re-targets (R04c, T03b, V03b, T05d) of earlier mutants whose lines RF6 rewrote; all 4 are KILLED. They ran in
the RF6 campaign, not among the 146 below; the RF7 final re-run (§11.12) includes them.

**Final re-run on the Review Fix 6 code.** Every mutant list was re-run, 146 mutants in all:
- the 105 of the RF5 final re-run;
- RF5's 13 and its 7 re-targets;
- RF6's 21.

Mutants on `composerSim.ts` ran against every function-study suite, RF5 and RF6 included.
- **119 KILLED.** This includes T02, now that its suite list includes the RF5 tests, and R04, whose original line RF6 restored.
- **4 EQUIVALENT:** C19, C42, U02 and T07b, as proved in §11.4, §11.9 and §11.10.
- **23 INVALID,** because their target lines were rewritten. Each is re-targeted or covered:
  - R04b by R04c (the same planted defect as R04, which is also KILLED);
  - R08 and R12 by R08b and R12b;
  - R09, R10 and R11 by S09, S06c and U04;
  - S01 by S01b;
  - S03 and S03b by S03c;
  - S06 and S06b by S06c;
  - S07 and S07b by S07c;
  - S08 by U04;
  - T03 by T03b;
  - T04 by T04c, T05 and T05c by T05d, T06 by U06 and T07 by T07b;
  - U03: the steep-pole branch was removed by RF5;
  - U05 by U05c;
  - V03 by V03b.

Every planted defect in the current code is killed except the 4 proven equivalents. There were 0 timeouts, and every file was restored
byte-for-byte with a clean `git status` after every campaign.

### 11.12 Fresh re-review and Review Fix 7: the window contains every feature; edge roots, flat extrema, isolated exclusions

A fresh re-review of `ff25763` found 0 BLOCKER, 2 MAJOR, 1 MINOR findings and 4 notes. RF6 itself held up:
- 4 356 perturbed wrong keys on curriculum functions: 0 accepted (1 132 on `f27d136`);
- the decimal-pole batteries are fixed.

Both MAJOR findings were older gaps.

| Finding | Fix |
|---|---|
| MAJOR-1 a root at the edge of the domain (x·√(4−x²) at ±2 on [−3, 3]) was found only when a grid sample landed on it: the key without it was accepted (32 / 90 in the reviewer's battery), and since RF6 the correct key was refused (34 / 90) | a domain edge where \|f\| shrinks steadily to 0 and that belongs to the domain is a root. An open edge (x·log x at 0) is not: when the edge is a round number, f must be defined exactly there |
| MAJOR-2 features outside the window could be left out (x³ − 12x on [−3, 3] keyed with the root 0 only), though the student studies the whole function | each side beyond the window is scanned on a geometric grid out to 10⁶ past the edge; a root (sign change through 0, exact zero, touching root), a pole or domain change, or a slope change asked for by the tasks refuses the key (`AI_FUNCTION_WINDOW_TOO_NARROW`). A run of exact zeros (underflow: x·e^−x far out) is not a root; a plain domain edge matters to exclusions and monotony only, a pole to asymptotes. The prompt rule now asks for a window that contains every feature |
| MINOR-1 flat extrema at a large \|f\| (x⁵ − 5x⁴ + 50 at 0) escaped the probe; the flat-extremum fallback accepted (x−2)⁶ + 10 at 2.012 | grid detection compares 4 and 16 samples away when the neighbours tie; the rise is measured 1, 4 and 16 steps away with the same 10⁻¹² relative threshold; a flat extremum is located at the centre of its flat stretch; the fallback's slack is the evaluator's rounding (4 ε) |
| NOTE-1 an extra domain-exclusion value was checked only as "f undefined there" | it must be a probed point or an isolated undefined point (f defined just beside it on both sides) |
| NOTE-2 a contrived power-law sum misleads the limit extrapolation | recorded in §12 (not curriculum) |
| NOTE-3 the §12 claim about ±1.41 | corrected |
| NOTE-4 the RF6 re-targets were not in the 146 | stated in §11.11; included in the re-run below |

**Fail-first.** `composerReviewFix7.20f.test.ts` (`77878bc`'s version, 9 tests) was executed on `ff25763`: **6 failed and 3 passed**.
The 3 that passed are pins: a non-root edge, correct keys in a wide enough window, and holes and poles. Sample assertions:
- `x*sqrt(4-x^2) {"xMin":-3,"xMax":3,"xIntercepts":[-2,0,2]}: expected '[{"code":"AI_FUNCTION_KEY_INCONSISTENT",…' to be 'ok'`
- `expected [] to deeply equal [ 'AI_FUNCTION_WINDOW_TOO_NARROW' ]`
- `expected [] to deeply equal [ 'AI_FUNCTION_KEY_INCOMPLETE' ]` (x⁵ − 5x⁴ + 50 without its maximum)
- `1/(x-1)+sqrt(x+3) {"domainExclusions":[1,-4]}: expected true to be false`

The tests added afterwards have the following status:
- **Pins** (accepted on `ff25763` and kept accepted): the underflow tail, the open log edge and the off-grid jump, all found while fixing
  (`cb37820`).
- **Layer-isolating tests** (`c265a27`, `6857d6f`, `bb8ead4`): an edge close to 0, a pole beyond the window against a plain edge, a
  touching root beyond the window, flat-extremum detection and centring, and a narrow window.

**Batteries on the head:**
- **Reviewer's edge-root battery:** incomplete keys accepted **0 / 90** (was 32). Correct keys refused **3 / 90**: all three windows
  leave a root outside, so "widen the window" is correct.
- **Reviewer's curriculum correct-key battery:** **0 / 1 312** refused.
- **Perturbed wrong keys:** **0 / 4 356** accepted.
- **Earlier batteries:** decimal poles 0 / 89 per family and 0 / 672; the monotonic battery 23 / 23 and 10 / 10.
- **Fuzzers:** **0 exceptions**; worst build 63 ms.

**RF7 mutation campaign.** 20 mutants: **20 KILLED, 0 SURVIVED, 0 TIMEOUT**. X02, X08, X11, X14 and X15 first survived because
another layer caught the same inputs, or because the probe did not reach the mutated line. Investigating X14 showed that very flat
extrema were not detected on the grid at all, which is now fixed (`6857d6f`). The layer-isolating tests now kill all five.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| X01 | `composerSim.ts` | domain-edge roots not recorded | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 MAJOR-1 a root at the edge of the domain is a root › correc |
| X02 | `composerSim.ts` | edge-root growth test dropped (any edge with tiny |f| is a root) | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › an edge where f only come |
| X03 | `composerSim.ts` | open round edge counted as a root (domain membership not checked) | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 found while fixing (PINS: accepted on ff25763, kept accepte |
| X04 | `composerSim.ts` | edge gap branch runs only for singular tasks (roots-only skips edges) | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 MAJOR-1 a root at the edge of the domain is a root › correc |
| X05 | `composerSim.ts` | outside-window scan not called | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 MAJOR-2 the window must contain every feature the tasks ask |
| X06 | `composerSim.ts` | outside scan ignores sign changes | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 MAJOR-2 the window must contain every feature the tasks ask |
| X07 | `composerSim.ts` | outside scan ignores slope changes | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 MAJOR-2 the window must contain every feature the tasks ask |
| X08 | `composerSim.ts` | beyond the window: domain flips ignored for exclusions / monotony | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › beyond the window: a pole |
| X09 | `composerSim.ts` | outside scan: root/pole classification inverted | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 MAJOR-2 the window must contain every feature the tasks ask |
| X10 | `composerSim.ts` | outside scan: an underflow stretch of zeros is a root | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 found while fixing (PINS: accepted on ff25763, kept accepte |
| X11 | `composerSim.ts` | outside scan: touching roots not checked | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › beyond the window: a touc |
| X12 | `composerSim.ts` | outside scan starts on the window edge | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MINOR-1 poles at decimal positions keep their correct keys  |
| X13 | `composerSim.ts` | extremum rise measured one step away only | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › a flat extremum beside a  |
| X14 | `composerSim.ts` | flat extremum not centred | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › a flat extremum wider tha |
| X15 | `composerSim.ts` | flat-extremum fallback slack 1e-12 relative | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › a flat extremum too flat  |
| X16 | `composerSim.ts` | domain exclusion: isolated-point check accepts gap points | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 NOTE-1 a domain exclusion must be an isolated excluded poin |
| X17 | `composerSim.ts` | domain exclusion: isolated-point fallback removed | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 found while fixing (PINS: accepted on ff25763, kept accepte |
| X18 | `composerSim.ts` | beyond the window: a pole at a domain edge ignored for asymptotes | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › beyond the window: a pole |
| X19 | `composerSim.ts` | flat extremum: grid comparison 4 / 16 samples away removed | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › a flat extremum beside a  |
| X20 | `composerSim.ts` | extremum rise threshold 1e-10 relative | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › a flat extremum beside a  |
| U04b | `composerSim.ts` | domain-gap edges never classified as poles (RF7 code) | KILLED | composerReviewFix1.20f.test.ts › 20F-RF1 M1 function-study keys must be COMPLETE inside the window ( |
| W14b | `composerSim.ts` | flat-extremum fallback slack 1e-9 (RF7 code) | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › a flat extremum too flat  |
| W19b | `composerSim.ts` | domain-gap edges not recorded (RF7 code) | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MAJOR-1 a monotonic-interval key must hold over its whole l |

The table also lists 3 re-targets (U04b, W14b, W19b) of earlier mutants whose lines RF7 rewrote; all 3 are KILLED.

**Final re-run on the Review Fix 7 code.** Every mutant list was re-run, 170 mutants in all:
- the 146 of the RF6 re-run;
- RF6's 4 re-targets;
- RF7's 20.

Mutants on `composerSim.ts` ran against every function-study suite, RF7 included.
- **140 KILLED.**
- **4 EQUIVALENT:** C19, C42, U02 and T07b (§11.4, §11.9, §11.10).
- **26 INVALID,** because their target lines were rewritten. Each is re-targeted or covered. Every re-target named here is KILLED except
  T07b, which is one of the 4 equivalents. The 3 RF7 re-targets (U04b, W14b, W19b) ran in the RF7 campaign, not among the 170;
  §11.13 includes them:
  - R04b by R04c (R04 itself is also KILLED);
  - R08 and R12 by R08b and R12b;
  - R09, R10 and R11 by S09, S06c and U04b;
  - S01 by S01b;
  - S03 and S03b by S03c;
  - S06 and S06b by S06c;
  - S07 and S07b by S07c;
  - S08 by U04b;
  - T03 by T03b;
  - T04 by T04c, T05 and T05c by T05d, T06 by U06 and T07 by T07b;
  - U03: the steep-pole branch was removed by RF5;
  - U04 by U04b, U05 by U05c and V03 by V03b;
  - W14 by W14b and W19 by W19b.

Every planted defect in the current code is killed except the 4 proven equivalents. There were 0 timeouts, and every file was restored
byte-for-byte with a clean `git status` after every campaign.

### 11.13 Fresh re-review and Review Fix 8: the expression's own exclusions (guards)

A fresh re-review of `7fa0578` (relaunched after a container restart; the first attempt reported nothing) found 0 BLOCKER, 1 MAJOR,
3 MINOR findings and 3 notes. RF7 held up: 0 / 4 356 wrong keys accepted, 0 / 1 312 correct curriculum keys refused. The MAJOR finding
was an older gap that earlier rounds missed.

| Finding | Fix |
|---|---|
| MAJOR-1 a removable hole that no grid sample lands on was invisible: `(x−1)/(x²−1)` on [−6, 6] keyed without the hole at 1 was accepted (215 / 342 integer windows; 22 / 50 symmetric ones), and the monotonic key ignored it | **guards**: the zeros of every denominator, log argument and power base under a negative exponent are located on the sub-expression itself, inside the window (a domain point, a pole if it grows) and beyond it (widen the window). Probing the survivor Y17 also showed the grid could miss a pole that its denominator reveals (`(x+1)/((x−2.7)³(x+2.5)²)+x` on [−70, 70]): found now |
| MINOR-1 a closed domain edge with decimal coefficients (x·√(1.21−x²) at ±1.1) evaluates as undefined after rounding: the root was missed and the correct key refused | edge closedness from the guards (a log or denominator zero is open, anything else closed); a key root where f rounds to undefined is matched to the probe instead of refused |
| MINOR-2 a very flat degree-8 minimum beside a large constant accepted a key 0.03 away | the flat fallback locates the centre of the flat stretch (within 0.005) and requires f to rise (fall) beyond it |
| MINOR-3 a monotonic interval ending at a domain edge that is the window's end was refused | window ends that are domain edges are breakpoints |
| NOTE-1 a root within 10⁻³ past the window's edge was missed | the scan beyond the window starts from the edge's value |
| NOTE-2 fail-closed over-refusals beyond the window | recorded in §12 |
| NOTE-3 §11.12 wording on T07b and the RF6 / RF7 re-targets | corrected |
| (simplification) the guards made five earlier layers redundant: RF6's grid snapping, RF7's isolated-point fallback for exclusions, RF7's pole check at a domain change beyond the window, RF7's round-number edge test, and the grid's even-pole search (RF1–RF5); the full mutation re-runs showed them surviving (W04, X03, X17, X18, S09) | removed (`31cb87e`, `c11c024`); every test and battery is unchanged without them. Removing the even-pole search exposed a steep touching zero below the guard threshold (1/√\|x − 1.3\|), now found |

**Fail-first.** The first 7-test draft of `composerReviewFix8.20f.test.ts` was executed on `7fa0578`: **7 of 7 failed**. Three tests
were added before the first commit, so `41baf36`'s version has 10 tests; the RF9 reviewer ran it on `7fa0578`: **9 failed, 1 passed**
(the log-edge pin). Sample assertions:
- `expected [] to deeply equal [ 'AI_FUNCTION_KEY_INCOMPLETE' ]` (the hole at 1)
- `x*sqrt(1.21-x^2) {…"xIntercepts":[-1.1,0,1.1]}: expected '[{"code":"AI_FUNCTION_KEY_INCONSISTENT",…' to be 'ok'`
- `(x-2)^8+1000 {…"x":2.03…}: expected true to be false`
- `sqrt(x) {"xMin":0,"xMax":9,…}: expected '[{"code":"AI_FUNCTION_KEY_INCONSISTENT",…' to be 'ok'`

The other tests were checked on `7fa0578` through its generated module. Most were already in `41baf36` (the touching-zero hole, the
guard cap, the log-edge pin); the pole only its denominator reveals was added in `3ac8e15`.
- **Fail-first** (accepted there, refused on the head): the touching-zero hole, and the pole only its denominator reveals.
- **New fail-closed behaviour:** the guard cap.
- **Pin:** the log-edge exclusion.

**Batteries on the head:**
- **Reviewer's hole batteries:** incomplete keys accepted **0 / 342** and **0 / 50**.
- **Decimal edges:** radii 0 / 45 and linear coefficients 0 / 44, both for incomplete-accepted and for correct-refused.
- **Flat degree-8:** 0 / 540 shifted keys accepted, 0 / 180 correct keys refused.
- **Earlier batteries:**
  - curriculum correct keys 0 / 1 312, and 2 / 2 388 in the extended set (the fail-closed extrema-with-pole-beyond case);
  - wrong keys 0 / 4 356;
  - edge roots 0 / 90 incomplete keys accepted;
  - decimal poles 0 / 89 per family;
  - monotonic 23 / 23 and 10 / 10.
- **Fuzzers:** **0 exceptions**. The heaviest CPU case found builds in 21 ms, and the worst fuzz figure (which also includes a separate
  full probe) is 157 ms.

**RF8 mutation campaign.** 17 mutants: **17 KILLED, 0 SURVIVED, 0 TIMEOUT** in the RF8 campaign. Y06 and Y07 later became INVALID
when `31cb87e` simplified their line; Y06b re-targets them (KILLED), which is why the table shows them INVALID. Y17 first survived. Investigating it found the missed pole
above, and its test now kills it.

Three more RF8 tests were added after the first runs:
- the asymmetric flat minimum (`b9170f9`), a pin that isolates the flat-stretch tolerance (answers the re-targets X15b and W14c);
- a plateau carrying rounding noise (`c11c024`), a pin that isolates RF6's touching-root noise threshold (W16);
- the steep touching zero (accepted) and a shallow minimum (refused) (`c11c024`), pins of the 7fa0578 outcome kept through the simplification;
- the two found-while-fixing tests listed above.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| Y01 | `composerSim.ts` | denominators not guarded | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MAJOR-1 the expression's own exclusions are found whatever  |
| Y02 | `composerSim.ts` | log arguments not guarded | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 found while fixing (PINS: accepted on ff25763, kept accepte |
| Y03 | `composerSim.ts` | every zero of a power base excluded (exponent ignored) | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MAJOR-1 the expression's own exclusions are found whatever  |
| Y04 | `composerSim.ts` | guard exclusions not added to the probe's points | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MAJOR-1 the expression's own exclusions are found whatever  |
| Y05 | `composerSim.ts` | guard zeros inside a domain gap added as points | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 each new layer holds on its own › a zero of a log argument  |
| Y06 | `composerSim.ts` | edge closedness from guards ignored (round-number test) | INVALID |  |
| Y07 | `composerSim.ts` | every guarded edge taken as closed | INVALID |  |
| Y08 | `composerSim.ts` | guard exclusions beyond the window ignored | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MAJOR-1 the expression's own exclusions are found whatever  |
| Y09 | `composerSim.ts` | outer scan not seeded with the window's edge value | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 NOTE-1 the scan beyond the window starts from the window's  |
| Y10 | `composerSim.ts` | window-end domain edges not recorded | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MINOR-3 a window end that is a domain edge ends a monotonic |
| Y11 | `composerSim.ts` | key root where f rounds to undefined refused outright | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MINOR-1 a closed domain edge is a root whatever its roundin |
| Y12 | `composerSim.ts` | flat fallback: centre not checked | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MINOR-2 a flat extremum the probe does not record is locate |
| Y13 | `composerSim.ts` | flat fallback: direction beyond the stretch not checked | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 each new layer holds on its own › a flat extremum too flat  |
| Y14 | `composerSim.ts` | guards: touching zeros not found | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 each new layer holds on its own › a hole whose denominator  |
| Y15 | `composerSim.ts` | guards: sign changes not refined | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MAJOR-1 the expression's own exclusions are found whatever  |
| Y16 | `composerSim.ts` | guard cap removed | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 each new layer holds on its own › more guarded sub-expressi |
| Y17 | `composerSim.ts` | guard zeros inside the window: pole classification dropped | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 found while fixing: a pole the grid misses is found through |
| X12b | `composerSim.ts` | outside scan starts on the window edge (RF8 code) | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 MINOR-3 a window end that is a domain edge ends a monotonic |
| X15b | `composerSim.ts` | flat-extremum fallback tolerance 1e-12 relative (RF8 code) | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 the flat-stretch fallback measures the stretch at the evalu |
| W14c | `composerSim.ts` | flat-extremum fallback tolerance 1e-9 (RF8 code) | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 the flat-stretch fallback measures the stretch at the evalu |
| Y06b | `composerSim.ts` | every domain edge taken as closed (RF8 code) | KILLED | composerReviewFix7.20f.test.ts › 20F-RF7 found while fixing (PINS: accepted on ff25763, kept accepte |
| Y18 | `composerSim.ts` | guards: steep touching zeros not accepted | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 a steep touching zero of a denominator is a guard zero › 1/ |
| Y19 | `composerSim.ts` | guards: shallow minima accepted as zeros | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 a steep touching zero of a denominator is a guard zero › 1/ |

The table also lists 6 re-targets of lines RF8 rewrote (X12b, X15b, W14c, Y06b) and the steep-zero rule (Y18, Y19). The final run below
includes all of them.

**Final re-run on the Review Fix 8 code (`b8f8a41`).** Every mutant list was re-run, 196 mutants in all:
- the 170 of the RF7 re-run;
- RF7's 3 re-targets;
- RF8's 17;
- RF8's 6 re-targets and new mutants.

Mutants on `composerSim.ts` ran against every function-study suite, RF8 included.
- **153 KILLED.**
- **4 EQUIVALENT:** C19, C42, U02 and T07b (§11.4, §11.9, §11.10).
- **0 SURVIVED, 0 TIMEOUT.**
- **39 INVALID,** because their target lines were rewritten or removed. Each is re-targeted (every re-target named here is KILLED except
  T07b, an equivalent) or its feature is gone:
  - R04b by R04c (R04 itself is also KILLED);
  - R08 and R12 by R08b and R12b;
  - R10 and R11 by S06c and U04b;
  - S01 by S01b;
  - S03 and S03b by S03c;
  - S06 and S06b by S06c;
  - S07 and S07b by S07c;
  - S08 by U04b;
  - T03 by T03b;
  - T04 by T04c, T05 and T05c by T05d, T06 by U06 and T07 by T07b;
  - U04 by U04b, U05 by U05c and V03 by V03b;
  - W14, W14b and X15 by W14c and X15b;
  - W19 by W19b, X12 by X12b, and Y06 and Y07 by Y06b;
  - **features removed:**
    - U03: RF5's steep branch;
    - R09, S09 and V11: the grid even-pole search (even poles are guard zeros: Y14, Y17);
    - W07: its plateau-edge seed;
    - W04, X03, X16, X17 and X18: RF6's snapping, RF7's round-number test, RF7's isolated-point fallback and RF7's beyond-window flip
      pole check.

Every planted defect in the current code is killed except the 4 proven equivalents. Every file was restored byte-for-byte, with a
clean `git status` after every campaign.

### 11.14 Fresh re-review and Review Fix 9: regressions of RF8's removals

A fresh re-review of `0f8911f` found 0 BLOCKER, 2 MAJOR, 1 MINOR findings and 3 notes. All three code findings were regressions of RF8's
removals. `7fa0578` handled every one of these cases; the guards did not yet cover them.

| Finding | Fix |
|---|---|
| MAJOR-1 a guard's touching zero exactly halfway between two samples (log\|2x − 1\| on [−8, 8], 1/(2x − 1)²) was never refined, because both neighbours were equal: incomplete exclusion / asymptote keys were accepted (227–237 per form in the reviewer's battery) and the correct key refused. A steep zero of √(10\|x − a\|) stayed above the absolute 10⁻⁶ threshold | ties count as a local minimum of \|g\|; a touching zero is exactly 0 at its 12-digit rounded position, negligible, or small and steep, judged by its ratio to the values beside it rather than by an absolute level |
| MAJOR-2 a denominator's zero at the edge of its own domain (√(x + 2) at −2) was not a guard zero: the open edge of (x² − 4)/√(x + 2) was accepted as a root (94 / 314) and the correct key refused; a one-sided pole beyond the window (1/√(7 − x)) went unseen | a guard's zero at the edge of its own domain (g vanishing there relative to its value 10⁻⁴ inside) is a guard zero: open, and a pole beyond the window when f grows there |
| MINOR-1 a guard zero beyond the window where f is not even defined (√x/(x² − 4) at −2 on [0, 5]) refused correct keys (96 / 112) | a guard zero beyond the window counts only where f is defined beside it |
| NOTE-1 the RF8 fail-first count (`41baf36` has 10 tests: 9 failed, 1 pin on `7fa0578`) | corrected in §11.13 |
| NOTE-2 "17 KILLED" against Y06 / Y07 shown INVALID | clarified in §11.13 |
| NOTE-3 §12 on guard zeros at their own domain's edge | updated |

**Fail-first.** `composerReviewFix9.20f.test.ts` (`1d5252b`'s version, 5 tests) was executed on `0f8911f` in a detached worktree:
**5 of 5 failed**. Sample assertions:
- `log(abs(2*x-1))+1/x: expected '[]' to be 'incomplete'`
- `1/sqrt(abs(10*x-7))+1/x: expected '[]' to be 'incomplete'`
- `(x^2-4)/sqrt(x+2) … xIntercepts [-2, 2]: expected true to be false`
- `1/sqrt(7-x)+1/x: expected [] to deeply equal [ 'AI_FUNCTION_WINDOW_TOO_NARROW' ]`
- `sqrt(x)/(x^2-4) {"xMin":0,"xMax":5,…}: expected '[{"code":"AI_FUNCTION_WINDOW_TOO_NARROW",…' to be 'ok'`

The three guard-rule tests added afterwards (`7ca1bf2`, `46c71b7`) fail there too, checked through its generated module:
- the irrational open edge (a correct key refused);
- the very flat zero and the steep zero at an unrounded position (incomplete keys accepted).

**Batteries on the head:**
- **Reviewer's RF9 batteries:** incomplete keys accepted **0** per form (was 227–237); edge-as-root accepted **0 / 314** (was 94); the
  correct exclusion keys of the over-refusal battery refused **0 / 112** (was 96). The remaining "correct keys refused" of the
  log|Cx − D|/(x − B) form (280) are all cases where log|C·B − D| = 0: B is a hole, not a pole, so the battery's key is wrong there.
- **Every earlier battery is unchanged:**
  - curriculum correct keys 0 / 1 312;
  - wrong keys 0 / 4 356;
  - holes 0 / 342;
  - decimal edges 0 / 45;
  - flat degree-8 0 / 540;
  - decimal poles 0 / 89 per family;
  - fuzzers 0 exceptions.

**RF9 mutation campaign.** 10 mutants (8 new, 2 re-targets of RF8's steep rule). Some first survived:
- Z04 (the vanishing ratio at a guard edge), Z06 (exact zero at the rounded point), and Z07 and Y18b (the steep ratio): each now has an
  isolating test.
- Z03 (an exact zero at the rounded guard edge) was redundant with g(edge) = 0, which bisection reaches on any representable edge. It
  was removed (`7ca1bf2`).

Final outcome: **9 KILLED, 0 SURVIVED, 0 TIMEOUT**, and Z03 INVALID (its feature was removed).

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| Z01 | `composerSim.ts` | guard edge zero not checked when g becomes undefined | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 MAJOR-2 a denominator's zero at the edge of its own domain  |
| Z02 | `composerSim.ts` | guard edge zero not checked when g becomes defined | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 MAJOR-2 a denominator's zero at the edge of its own domain  |
| Z03 | `composerSim.ts` | guard edge zero: exact zero at the rounded edge ignored | INVALID |  |
| Z04 | `composerSim.ts` | guard edge zero: vanishing ratio ignored | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 each new guard rule holds on its own › an irrational guard  |
| Z05 | `composerSim.ts` | touching zeros: ties not allowed | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 MAJOR-1 a guard's touching zero is found wherever it falls  |
| Z06 | `composerSim.ts` | touching zeros: exact zero at the rounded point ignored | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 each new guard rule holds on its own › a zero too flat for  |
| Z07 | `composerSim.ts` | steep zeros: absolute 1e-6 level (RF8) | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 each new guard rule holds on its own › a steep zero far abo |
| Z08 | `composerSim.ts` | beyond the window: guard zeros where f is undefined counted | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 MINOR-1 a guard zero beyond the window counts only where f  |
| Y18b | `composerSim.ts` | guards: steep touching zeros not accepted (RF9 code) | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 each new guard rule holds on its own › a steep zero far abo |
| Y19b | `composerSim.ts` | guards: shallow minima accepted as zeros (RF9 code) | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 a steep touching zero of a denominator is a guard zero › 1/ |
| Y14b | `composerSim.ts` | guards: touching zeros not found (RF9 code) | KILLED | composerReviewFix8.20f.test.ts › 20F-RF8 each new layer holds on its own › a hole whose denominator  |

The table also lists the re-target Y14b (the touching-zero branch, rewritten by RF9), which is KILLED.

**Final re-run on the Review Fix 9 code (`46c71b7`).** Every mutant list was re-run: 206 mutants (the 196 of the RF8 re-run and RF9's
10). Mutants on `composerSim.ts` ran against every function-study suite, RF9 included.
- **159 KILLED.**
- **4 EQUIVALENT:** C19, C42, U02 and T07b (§11.4, §11.9, §11.10).
- **0 SURVIVED, 0 TIMEOUT.**
- **43 INVALID.** These are the 39 of §11.13, mapped as there, and 4 more:
  - Y14 by Y14b (KILLED, run separately);
  - Y18 and Y19 by Y18b and Y19b (KILLED in this run);
  - Z03, whose feature was removed.

Every planted defect in the current code is killed except the 4 proven equivalents. Every file was restored byte-for-byte, with a
clean `git status` after every campaign.

### 11.15 Fresh re-review and Review Fix 10: one vanishing rule

A fresh re-review of `15eaedc` found 0 BLOCKER, 1 MAJOR, 2 MINOR findings and 3 notes. RF9 held up: 0 incomplete keys accepted in every
RF9 battery.

| Finding | Fix |
|---|---|
| MAJOR-1 a steep touching root of f itself (x·√\|x − 1.3\| at 1.3) was judged by an absolute level: missed inside the window (88 / 160 in the reviewer's battery; RF8's removal of snapping made it worse) and beyond it (x·√\|x − 7\| on [−5, 5], present since RF7) | f's touching roots, inside and beyond the window, use the **vanishing rule**: \|f\| falls like a steady power of the distance |
| MINOR-1 a guard zero of a small fractional power (\|3x − 1\|^0.25, ^(1/3) in wide windows) escaped RF9's ratio rules (1 243 / 1 500), and (x² − 2)^0.25's open edges were taken as roots | the guards' touching zeros and edge zeros use the same vanishing rule, which replaces both RF9 ratio rules |
| MINOR-2 a monotonic stretch beyond a window edge that is a pole (1/(x² − 4) on [−2, 2]) was never required | the slope just beyond each window edge joins the monotonic key's completeness; the scan beyond the window has already ruled out any change further out |
| NOTE-1 two §11.14 sample assertions were paraphrased | quoted exactly |
| NOTE-2 the RF9 steep rule made an offset cusp (\|x − a\| + 10⁻⁷) a false guard zero (a correct key refused) | the vanishing rule requires a steady power: no longer a zero (test) |
| NOTE-3 the provider env-var name in a negative bundle test | not a model identifier; no change |

**Fail-first.** `composerReviewFix10.20f.test.ts` (`2b1339a`'s first four tests) was executed on `15eaedc`: **4 of 4 failed**. Sample
assertions:
- `x*sqrt(abs(x-1.3)) {"xIntercepts":[0]}: expected true to be false`
- `expected [] to deeply equal [ 'AI_FUNCTION_WINDOW_TOO_NARROW' ]` (x·√|x − 7|)
- `1/abs(3*x-1)^0.25+1/x {…}: expected true to be false`
- `1/(x^2-4) {"xMin":-2,"xMax":2,…}: expected true to be false`

The offset-cusp test fails there too, as a correct key refused.

**Batteries on the head:**
- **Reviewer's RF10 batteries:**
  - √ touching roots 0 / 160 incomplete keys accepted, 0 correct keys refused (was 88 / 88);
  - fractional-power guards 0 / 2 700 (was 2 700 on `0f8911f` and 1 120 on `7fa0578`);
  - all window-edge monotonic cases now required;
  - touching roots beyond the window 0 / 90 (`7fa0578`: 90 / 90).
- **Every earlier battery is unchanged:**
  - curriculum 0 / 1 312;
  - wrong keys 0 / 4 356;
  - holes 0 / 342;
  - RF9 batteries 0;
  - decimal poles 0 / 89;
  - flat degree-8 0 / 540;
  - fuzzers 0 exceptions (worst probe + build 277 ms in fuzz9, which includes a separate full probe).

**RF10 mutation campaign.** 9 mutants: **9 KILLED, 0 SURVIVED, 0 TIMEOUT** on the first run.

| Id | File | Planted defect | Outcome | Killed by |
|---|---|---|---|---|
| AA01 | `composerSim.ts` | vanishing rule never holds | KILLED | composerReviewFix9.20f.test.ts › 20F-RF9 each new guard rule holds on its own › an irrational guard  |
| AA02 | `composerSim.ts` | vanishing rule: no steady-power check | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 the vanishing rule needs a STEADY power › an offset cusp  |
| AA03 | `composerSim.ts` | vanishing rule: steadiness (25 %) not required | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 the vanishing rule needs a STEADY power › an offset cusp  |
| AA04 | `composerSim.ts` | f's touching roots: vanishing rule not used inside the window | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 MAJOR-1 a steep touching root of f is a root › inside the |
| AA05 | `composerSim.ts` | f's touching roots: vanishing rule not used beyond the window | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 MAJOR-1 a steep touching root of f is a root › beyond the |
| AA06 | `composerSim.ts` | guard edge zeros: vanishing rule not used | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 MINOR-1 a guard zero of a small fractional power is found |
| AA07 | `composerSim.ts` | guard touching zeros: vanishing rule not used | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 MINOR-1 a guard zero of a small fractional power is found |
| AA08 | `composerSim.ts` | slope beyond the window edges not required | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 MINOR-2 a monotonic stretch beyond a window edge is requi |
| AA09 | `composerSim.ts` | slope beyond the window edges: direction inverted | KILLED | composerReviewFix6.20f.test.ts › 20F-RF6 MAJOR-1 a monotonic-interval key must hold over its whole l |
| R08c | `composerSim.ts` | touching roots not detected (RF10 code) | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 MAJOR-1 a steep touching root of f is a root › inside the |
| X11b | `composerSim.ts` | outside scan: touching roots not checked (RF10 code) | KILLED | composerReviewFix10.20f.test.ts › 20F-RF10 MAJOR-1 a steep touching root of f is a root › beyond the |

The table also lists the re-targets R08c and X11b (f's touching-root lines, rewritten by RF10); both are KILLED.

**Final re-run on the Review Fix 10 code (`2b1339a`).** Every mutant list was re-run: 216 mutants (the 206 of the RF9 re-run, Y14b, and
RF10's 9). Mutants on `composerSim.ts` ran against every function-study suite, RF10 included.
- **163 KILLED.**
- **4 EQUIVALENT:** C19, C42, U02 and T07b (§11.4, §11.9, §11.10).
- **0 SURVIVED, 0 TIMEOUT.**
- **49 INVALID.** These are the 43 of §11.14, mapped as there, and 6 more:
  - R08b and X11 by R08c and X11b (KILLED, run separately);
  - Z04, Z07, Y18b and Y19b: RF9's ratio rules, replaced by the vanishing rule, whose mutants AA02, AA03, AA06 and AA07 are KILLED.

Every planted defect in the current code is killed except the 4 proven equivalents. Every file was restored byte-for-byte, with a
clean `git status` after every campaign.

## 12. Known limitations

- Visual types (hotspot / labelDiagram) are not AI-generated (19D policy: no invented geometry); images are explicit teacher requests.
- No source-material (RAG) mode yet: the intent / prompt contracts leave room for excerpts and objectives.
- Selective apply is per target group; rebasing a stale patch is not offered (regenerate instead).
- A section with many items can hit the 30 s provider timeout; the teacher is told to reduce items per section.
- Applying a generated exam replaces the title, sections and presentation (cover page, blueprint and other settings kept) — one undoable
  step, confirmed first.
- The function-study completeness probe is a probe, not a proof. These cases are left to the teacher's review:
  - features finer than the 2001-point grid;
  - functions the probe cannot decide (very steep poles, exp(1/x), growth too slow to confirm, undecidable behaviour at ±∞, overflow
    inside the window) are refused, never keyed: the teacher authors them;
  - round / floor / ceil / min / max / % are not AI vocabulary for function study;
  - vertical asymptotes and domain exclusions at non-terminating decimals (1/(3x−1), 1/√|1000x − 707.1…|), which can only be keyed
    with the exact double: a correct key rounded to fewer digits is refused (safe). An incomplete key that leaves such a point out is
    refused too, since the guards locate it (Review Fix 10);
  - key values must be within 0.005 of the truth (half the grading tolerance), so a key rounded to two decimals is refused when it is
    more than 0.005 off (±1.4 for √2 is refused, ±1.41 is accepted);
  - slowly converging limits (x^−0.15, 1/log x) are undecided and refused;
  - a function with a flat stretch has no extremum to end a monotonic interval on, so its monotonic key is refused;
  - the scan beyond the window runs out to 10⁶ past the edge on a grid ≈ 2.6 % apart: two features closer than that, far from the
    window, can hide each other;
  - a domain edge that is not a guard zero (a zero of a log argument or a denominator, including one at the edge of that guard's own
    domain, Review Fix 9) is taken as closed (in the domain);
  - an extremum or slope change beyond the window where |f| and its changes stay below the evaluator's rounding scale (a Gaussian tail
    at |f| ≈ 10⁻⁹) is not seen by the scan beyond the window (15 of 5 333 in the reviewer's battery);
  - a pole beyond the window refuses an extrema-only key (fail closed: "widen the window");
  - a contrived sum of power laws (100·(|x|+1)^−0.7 + 0.3·(|x|+1)^−0.02) can mislead the limit extrapolation; it is not curriculum.
- No live provider call was made (no network in the development environment): the provider schemas are checked against the documented
  strict-mode limits by a test, not by a live acceptance call. The first production composer call is the live check.
- Notes accepted from the review: a replaceQuestion may change the marks of the selected question (shown in the diff); removing a composite
  part clamps a first-N group's required answers (the marks warning is shown); the client trusts the server's scope lock (it re-verifies
  revision, verdict, node policy, duplicate ids and presentation).
