# Phase 19F — Advanced Coding Question Modes

Status: implemented on `feature/19f-advanced-coding-modes` (baseline `784a59e`). Owner review required before merge.

## 1. What a teacher can create

| Mode (Arabic label) | Stored as | Graded by | Runner |
|---|---|---|---|
| كتابة برنامج كامل — write a program | `coding@2` | teacher, or hidden tests the teacher writes | yes (official + practice) |
| إصلاح خطأ — fix the bug | `coding@2` (buggy starter code) | same | yes |
| إكمال كود — complete code | `coding@2` (incomplete starter code) | same | yes |
| إكمال كود بأجزاء مقفلة — complete code with locked parts | **`coding@3`** (locked template) | same | yes — the server rebuilds the program |
| توقع الناتج — predict the output | `multipleChoice` (or `shortAnswer`) + `codeStimulus` | the existing graders | **no** |
| تتبع التنفيذ — trace the execution | `tableFill` + `codeStimulus` | the existing grader (partial credit) | **no** |

- No new question type exists. The catalog stays at **23** types.
- Modes are **authoring presets** (`src/codingPresets.ts`). Each is a factory that builds an existing type at an existing version with example content the teacher edits.
- No preset marker is stored. The palette card says exactly what will be created.
- A preset never creates a hidden test. Automatic grading still needs hidden tests that the teacher writes and verifies.

## 2. Versions

`coding` is now **current version 3**, but a new coding question is still **authored at version 2** (`AUTHORING_VERSIONS` and `authoringQuestionTypeVersion` in `src/questionTypeCatalog.ts`). Only the locked-template preset creates `coding@3`.

- **`coding@1` / `coding@2` are unchanged.** That covers their validation, projection, binding, grading, compile-error policy and fingerprint recipe.
  - A `template` key on them is still `CODING_CONFIG_UNKNOWN_KEY`.
  - Their questionFingerprint bytes are pinned by test S11 (17C and 17F-C2 recipe).
- **`coding@4` is unsupported everywhere** and fails closed: no editor, renderer or grader, a blocking validation error, and `QUESTION_INVALID` on the official path. It is never read as `coding@3`.
- Earlier tests that used `coding@3` as "the unsupported next version" now use `coding@4`. Each moved line carries a comment.

## 3. The coding@3 locked-template contract (`src/codingTemplate.ts`, shared server build)

```text
coding.template = { language, segments: [ { kind: "locked", text } | { kind: "editable", id, starter } ] }
answer          = { kind: "codeTemplate", language, languageVersion, values: { [gapId]: string } }
```

**Template rules** (strict; nothing is repaired):
- Exact keys only.
- `language` is a registered language. It must equal the single allowed language and the default language.
- 1–100 segments.
- Locked text is non-empty, and two locked segments are never adjacent (one canonical form).
- 1–30 gaps.
- Gap ids match `^[A-Za-z][A-Za-z0-9_-]{0,31}$`, are unique, and are never `__proto__`, `constructor` or `prototype`.
- Each starter is at most 16 KB.
- The starters' program fits the question's `limits.sourceBytes`, and never more than 64 KB.
- Free `starterCode` is refused (`CODING_TEMPLATE_STARTER_CONFLICT`). Each gap carries its own starter.
- An explicit compile-error policy is required, as for `coding@2`.

**Answer binding** (`bindCodeTemplateAnswer`, `bindCodingTemplateAnswerToQuestion`):
- The language must be the template's language.
- The values must name exactly the template's gaps. A missing, unknown or prototype key is refused.
- Each value is a string of at most 16 KB.
- The reconstructed program must fit the source limit.
- Extra fields (a client `source`, locked text, a score) are dropped and never stored.

**Reconstruction semantics.** The official program is built by plain concatenation, in segment order, of the published locked text and the bound gap values, byte for byte:
- There is no regex, `eval`, interpolation or template syntax.
- There is no trimming, re-indentation, newline conversion or final-newline insertion.
- `\r\n` stays `\r\n`, and a gap with no trailing newline stays that way.
- The template author writes every newline and indent in the locked text. A gap value is inserted verbatim.

**Answered.** At least one gap holds non-blank text. An all-blank answer is "no-answer", and the locked text alone is never an answer. A student who never edits a gap records nothing.

## 4. Server authority and lifecycle

- **Ingest** (`api/src/lib/draft-answers.js`, bound to the published exam):
  - On a `coding@3` question only a `codeTemplate` answer is accepted. A full-source `code` answer, a `text` answer or anything else is refused (`CODE_QUESTION_MISMATCH`), because a full source could rewrite locked text.
  - A `codeTemplate` answer on any other question, an unknown id or a compound part is refused.
  - Refused answers are dropped and never reach a runner.
- **The single seam.** `boundAnswer` in `api/src/lib/coding/official-grading.js` turns a bound template answer into `{ kind: "code", language, languageVersion, source }`, where `source` is rebuilt on the server. Dispatch, `answerHash`, `gradingKey`, callback binding (`409 STALE_RESULT`), retry, force regrade, recovery sweep and teacher evidence all recompute through `targetAuthority`, so they see the same program.
- **Fingerprint.** For `coding@3` the questionFingerprint adds the validated `template`. Changing locked text or a starter re-keys grading. `coding@1` and `coding@2` add nothing.
- **Compile errors, scoring, evidence, recovery, regrade and `reviewRequired`** are inherited unchanged from `coding@2`. An infrastructure failure stays a retryable technical state, never an academic zero.
- **Practice run.** `POST /api/coding/run` accepts a second strict six-field body `{ assignmentId, questionId, language, languageVersion, values, stdin }` for `coding@3`. The server binds the values to the published template and runs the program it rebuilds. A `source` body on `coding@3`, and a body carrying both `source` and `values`, are refused.
- **Teacher review.** `GET /api/assignment-review` adds `codeTemplateReview = { ok, language, source }`, which is the program the server rebuilt. A refusal is reported as `{ ok: false, code }` and the UI shows a notice instead of a guessed source.
- **Student projection.** `projectCodingConfigForStudent` delivers the strict canonical template. A malformed one is withheld. Hidden tests, reference solutions and policies stay under `answer`, which is always blanked.
- **The Runner is unchanged.** It still receives one plain source string of at most 64 KB plus opaque case tokens. No file under `runner/` changed.

## 5. The read-only code stimulus (`src/codeStimulus.ts`, shared server build)

`codeStimulus = { language, source, label? }` is an optional, public, read-only program on any top-level question. The answer stays the question type's own.

- **Rules:**
  - Exact keys only.
  - `language` is one of python, java, csharp or pseudocode.
  - `source` is non-empty, at most 16 KB and at most 400 lines.
  - `label` is at most 120 characters.
- **Validation:** finalization blocks a malformed stimulus, and a compound part never carries one (`CODE_STIMULUS_PART_UNSUPPORTED`).
- **Projection:** the student sanitizer rebuilds the stimulus strictly. Any other field (a smuggled answer, an expected value) withholds the whole stimulus.
- **Rendering:** `CodeStimulusView` loads lazily, only for a question that has a stimulus. It renders the source as a text child of an LTR, focusable `<pre><code>` with an accessible name. The source is never treated as HTML and never executed. The same view is used in the student exam, teacher preview, compound questions and teacher review.
- **Type changes** carry the stimulus, like media.

**Predict output.** `multipleChoice` is the recommended vehicle. `shortAnswer` is offered with a note: its comparison collapses whitespace and case, and a mismatch goes to manual review, never to an automatic 0.

## 6. Teacher and student experience

**Palette.** A «أنماط أسئلة البرمجة» group lists the six modes. It has a language selector (Python, Java, C#) and a choice of answer method for predict-output. Each card states «ينشئ: …», and type cards stay at 23.

**Coding editor:**
- The inspector shows the node's real version (it used to show a hard-coded «1»).
- For `coding@3` the starter-code editor and language checkboxes are replaced by the template section:
  - choose the language;
  - paste a full program;
  - select a span and turn it into a gap («اجعل النص المحدد فراغًا»), with ids generated as `gap1`, `gap2`, …;
  - edit locked text and starters in place, or turn a gap back into locked text;
  - preview the program as the student starts with it.
- There is no raw JSON. The pure operations are in `src/coding/templateAuthoring.ts`.

**Stimulus authoring.** «إضافة كود مرفق للقراءة» on any question offers a language, an optional caption and the program, with the canonical validator's message shown inline.

**Student template editor** (`CodingTemplateResponse`, lazy):
- Locked segments are read-only `<pre>` blocks. They are marked by a visible «🔒 مقفل» label, a dashed frame and an accessible name, so the distinction never depends on colour alone.
- Each gap is a native LTR `<textarea>` labelled «فراغ N من M». Spellcheck, autocomplete, autocorrect and autocapitalize are off.
- Alt+↓ and Alt+↑ move between gaps. Tab is never captured, so there is no keyboard trap.
- Each gap has its own reset, and there is a confirmed reset for all gaps.
- An over-limit edit is refused with an alert, never truncated.
- A read-only full-program view is available.
- Native textareas are the mobile fallback, with 16 px input text and 44 px controls on phones. There is no Monaco.
- Practice runs, results, samples and the teacher-preview notice behave as in `coding@2`.

## 7. AI authoring (`src/aiQuestionDraft.ts`)

The AI may propose:
- **predict-output:** `multipleChoice` or `shortAnswer` plus `codeStimulus`;
- **trace-execution:** a new `tableFill` intent with `headers`, `rows` and `answerCells`. Answer cells are forced empty in the visible grid;
- **coding@2 public material:** `mode` (writeProgram, fixBug or completeCode), `language`, `starterCode` and public examples.

The AI can never supply hidden tests, reference solutions, scoring or grading mode:
- The schema has no such fields, and any extra key is malformed.
- `verifyAiQuestionNode` refuses an AI coding node unless it is `coding@2` with empty hidden tests, empty reference solutions and manual grading.
- Every AI coding draft carries a note that it is graded manually until the teacher adds and verifies hidden tests.
- A stimulus on any other intent is refused.

## 8. Bundle

- The initial JS graph is 121,636 bytes gzip-9. The baseline was about 121,167 bytes, the target is under 123,000, and the guard limit is unchanged at 128,000.
- The stimulus view is lazy, and the template renderer and template editor live in lazy coding chunks.
- The guard now also requires the `CodingTemplateResponse-*.js` root and checks that it cannot reach Monaco statically. This is a stricter check, not a looser one.

## 9. Tests

| Suite | Scope |
|---|---|
| `src/codingTemplate.19f.test.ts` | template contract, reconstruction, binding (§23 pure cases), coding@3 rules, version authority, stimulus contract, presets, authoring operations |
| `api/tests/coding-19f-template.test.js` | real dispatch (values → API reconstruction → runner receives the exact program), §23 at ingest (nothing reaches the runner), single authority (fingerprint, answer hash, callback, force regrade, evidence, compile-error policy), v1/v2 fingerprint pin, practice run, projection, stimulus sanitizer and review |
| `src/questionTypes/codingTemplate.19f.test.tsx` | student editor (locked vs editable, values-only answer, keyboard, reset, limits, practice body, preview), stimulus view, palette presets, coding@3 authoring, stimulus authoring, review |
| `src/aiCodingModes.19f.test.ts` | AI schema, prompt and signals; predict-output and trace; coding public material only; trusted material refused |

Fail-first evidence was recorded on `784a59e`; see the PR body.

## 10. Known limitations

- A template has exactly one language. A multi-language template would be a new version.
- Gap ids are generated (`gapN`). There is no free-form naming UI.
- The student template editor uses native textareas, not the Monaco engine. This is deliberate: Monaco has no editable-range model that could guarantee locked text.
- `shortAnswer` predict-output compares normalized text. Exact multi-line output is better asked as `multipleChoice`.
