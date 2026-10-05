# Phase 19E — Open Response + Rubrics (`openResponse@1`, the rubric engine)

> **AI DOES NOT OWN THE OFFICIAL GRADE IN 19E.** AI can help author a question and its rubric, but it can never assign the
> official student score. The teacher grades with the published rubric, and the server computes the score.

## 1. One family, many profiles

`openResponse@1` («إجابة مفتوحة مع سلم تقييم») is the single canonical family for extended written answers. The pedagogical
wordings are **profiles of one type**, not separate types:

| Profile | Arabic | Suggested `maxChars` |
|---|---|---|
| `essay` | مقال | 8000 |
| `explain` | شرح | 3000 |
| `justify` | تعليل | 2000 |
| `compare` | مقارنة | 4000 |
| `analyze` | تحليل | 6000 |
| `sourceBased` | إجابة مستندة إلى مصدر | 6000 |
| `general` | إجابة مفتوحة | 6000 |

A profile is an authoring and presentation hint. It suggests a length bound and labels the question for the student. It never
creates a grading authority, never changes the rubric and is never used to infer a grade. Changing a profile in the editor keeps
every authored criterion. The length bound follows the profile only while the teacher has not changed it.

Catalog: `["openResponse", "إجابة مفتوحة مع سلم تقييم", "response", "manual", "mpo", ["text"], false]`. The type has manual
grading, partial credit through rubric levels and works offline. It is **not** a compound part (V1 decision): the existing manual
override is stored per top-level question, so a rubric part could only ever be scored as one compound total. The catalog grows
from 22 to 23 types.

## 2. Contract

| Where | Shape | Who sees it |
|---|---|---|
| `question.openResponse` (public) | `{ v: 1, profile, instructions, response: { minChars, maxChars }, studentRubricVisibility: "visible" \| "hidden" }` | everyone |
| `question.answer` (private) | `{ rubric: RubricV1, modelAnswer }` | the teacher only (blanked for students) |
| Student answer | the existing `{ kind: "text", value }` Answer | the student and the teacher |
| Teacher grade | `manualOverrides[qid] = { score, comment, reviewedAt, rubric: { v: 1, awards, awarded, total } }` | the teacher only |

Validation is strict, with exact key sets, and nothing is ever repaired:

- **Config:** `maxChars` must be an integer from 1 to 20,000. `minChars` must be an integer from 0 to `maxChars` and is
  **guidance only**: it never blocks a save or a submission and never affects a score. `instructions` may have up to 2,000
  characters. The profile and visibility vocabularies are closed, and any other version is refused.
- **Private key:** the rubric goes through the engine. `modelAnswer` is plain text of up to 10,000 characters. Marks must be
  positive.
- **Fail closed:** an unsupported `questionTypeVersion` (for example `openResponse@2`) is refused everywhere and is never routed
  to V1.

## 3. The rubric engine (`src/rubricEngine.ts`)

The engine is pure and domain-neutral, with no React, DOM, network or AI. It is compiled into the shared server build and can be
reused by any manual or hybrid type later.

```
RubricV1 = { v: 1, criteria: [ { id, title, description, maxPoints, allowCustomPoints, guidance, levels: [ { id, label, points, description } ] } ] }
```

Invariants:

- **Criteria:** 1–12 per rubric.
- **Ids:** criterion ids and level ids use the strict grammar `^[A-Za-z][A-Za-z0-9_-]{0,31}$`, never `__proto__`,
  `constructor` or `prototype`. Ids are unique, and level ids are unique within their criterion.
- **Text bounds:** title 1–120 characters; description up to 600; private guidance up to 1,000; level label 1–60.
- **`maxPoints`:** finite, greater than 0, at most 100 and at most 2 decimals.
- **Levels:** 2–8 per criterion. Level points are finite, non-negative, no higher than the criterion's `maxPoints`, at most 2
  decimals and **unique**. There is always **one level at `maxPoints` and one at 0**.
- **Rubric total:** at most 1,000.
- **Shape:** unknown keys or prototype keys are refused at every level.

API:

| Function | Purpose |
|---|---|
| `validateRubric(raw)` | Returns the canonical rubric (optional fields made explicit), or every issue with its path. |
| `projectRubricForStudent(rubric)` | Returns titles, public descriptions, `maxPoints` and level labels / points / descriptions. It never returns guidance, ids or flags. |
| `bindRubricAwards(rubric, awards)` | Each criterion must appear **exactly once**. A `{ levelId }` is looked up only in **that** criterion's levels. `{ points }` is accepted only when `allowCustomPoints` is set, within 0..`maxPoints` and with at most 2 decimals. Unknown criteria or levels, forged keys and prototype keys are refused. |
| `scoreRubric({ rubric, awards, maxMarks })` | `score = round2(maxMarks × awarded / Σ maxPoints)`, using the project's canonical 2-decimal rounding. It is clamped only after the authority has been validated. |

## 4. Grading authority

1. **Automatic grading never awards marks.** The registered `openResponse@1` grader always returns
   `{ score: 0, correct: false, manualReview: true }`. The attempt's `manualReviewMarks` therefore carries the full question
   marks, the attempt stays `pendingReview`, and no academic zero is ever final. Nothing is inferred from length, keywords,
   similarity, the model answer or AI.
2. **The teacher grades in the existing review** (`POST /api/assignment-review`, `saveReview`). For an `openResponse` question an
   override **must** carry `rubricAwards`. The server then:
   - loads the assignment snapshot (immutable after publication) and finds the exact question by its section-scoped id;
   - re-validates type, version, config, rubric and marks, refusing with `RUBRIC_AUTHORITY_INVALID` when any of them is invalid;
   - binds the awards to **that question's** published rubric;
   - **computes the score itself**. Any client `score`, `total`, `maxMarks` or `criterionMax` is ignored or refused.

   Any malformed, partial, unknown, forged, wrong-question or score-only entry rejects the **whole** save with `400` and a code
   **before anything is written**. The valid result is persisted additively on the existing override record, through the
   **same** CAS write (`mutateJsonWithRetry`) and the **same** canonical rebuild (`rebuildAttemptGrades`, which reads only
   `score` / `comment`). Every other type's override is unchanged.
3. **Authorization and concurrency are the existing ones.** `requireBuilderAuth` applies, so student and anonymous callers get
   `401`. Safe ids are required. The student must belong to the assignment's class or the submission must prove ownership.
   Attempt identity is `(assignmentId, studentId, attemptNumber)`.

   Storage concurrency is the existing ETag compare-and-set with retries: a concurrent writer's changes survive (no stale
   overwrite), and persistent conflicts return `503` with nothing written. No second concurrency system was introduced. The
   existing review save has no teacher-revision number, so two teachers saving the **same** question are still last-writer-wins
   per question, exactly as for every other type (documented limitation).
4. **Teacher review GET.** The teacher receives `openResponse` (public), `expectedAnswer` (the rubric with guidance plus the model
   answer), `studentAnswer`, `questionTypeVersion` and `rubricReview` (the stored awards). The panel re-binds stored awards
   against the current published rubric. A stored selection that no longer binds is flagged **stale** and never shown as a grade.

## 5. Student secrecy

- **Sanitizer.** The student sanitizer rebuilds `openResponse` through the strict allow-list projection
  `projectOpenResponseForStudent(config, answer)`: the canonical config, plus `publicRubric` only when the teacher chose
  `visible`. A config with any other field (a smuggled rubric, public rubric or model answer) is **withheld entirely**.
  `openResponse` is a structural key because it is fully rebuilt; otherwise the secret-key denylist would drop the
  `…Rubric…` key names.
- **Never delivered.** `answer` is blanked. `modelAnswer`, `rubric` and `rubricAwards` are also stripped if they ever appear at
  the top level (defense in depth). Criterion guidance, ids and flags never leave `answer`.
- **Proven through the real handlers.** The student GET for the assignment and the submission state never contain the model
  answer, guidance, awards, level ids or per-question teacher comments, both before and after grading.
- **Ingest.** An answer on an `openResponse` question is rebuilt to exactly `{ kind: "text", value }`: the text is kept verbatim,
  and any client score, rubric, model answer or comment is dropped. The answer is bounded by the question's `maxChars`. Longer text
  is **refused, never truncated**; the browser's `maxLength` stops input before that point. No HTML is ever interpreted.

## 6. AI authoring boundary

- **The intent.** The AI intent is `openResponse`. Arabic and English essay, explain, justify, compare and analyze requests all
  map to it, with an advisory `suggestedProfile`.
- **The payload.** The AI payload (`profile`, `instructions`, `minChars`, `maxChars`, `rubricVisibility`, `criteria[]` with
  `maxScore` / `levels[]` with `score`, `modelAnswer`) is mapped field by field:
  - deterministic ids `c1…` and `l1…` are assigned;
  - `maxScore` becomes `maxPoints`, and `score` becomes `points`.
- **Validation.** The same canonical validators as manual authoring judge the result. A malformed rubric (no max level, no zero
  level, duplicate scores, a level above its maximum, an unknown profile, bad bounds…) is refused with `AI_DRAFT_INVALID` and the
  exact issue codes. Totals are never repaired.
- **What the AI never does.** The prompt forbids grading students. No AI call exists in the grading or review path, and nothing in
  the engine or model imports a network or AI client.

## 7. UI and accessibility

- **Student** (`OpenResponseView`, lazy):
  - a labelled `<textarea>` with `aria-labelledby` set to the question text, `dir="auto"` (Arabic, Hebrew and English) and the
    hard `maxLength`;
  - instructions and the profile;
  - a guidance-only minimum, and a character + word counter that is not announced on every keystroke, with a polite status only
    when the limit is reached;
  - a collapsible visible rubric.
- **Teacher editor** (`OpenResponseEditor` + the reusable `RubricEditor`, lazy):
  - the profile, instructions, length bounds and visibility;
  - the one-click useful default rubric (content 4, reasoning 3, organization 2, terminology 1);
  - criteria and levels with add, remove and reorder buttons (never drag-only);
  - private guidance, "custom points allowed" and the private model answer;
  - every validation issue next to its field (`aria-invalid` + `aria-describedby`, with errors outside the label);
  - a live student preview. There is no raw JSON.
- **Teacher grading** (`RubricGradingPanel`, lazy via `lazyWithRetry("teacher-rubric-grading")`):
  - the student's text stays visible (sticky on wide screens, stacked on phones);
  - each criterion has a native radio group of levels (keyboard and screen reader), plus bounded custom points only where allowed;
  - private guidance and the model answer are shown to the teacher only;
  - a live **estimate** computed with the same shared engine, with the done / remaining counts;
  - the save sends the selections, never a number, and a partial rubric blocks the save with a precise message.
- **Common to all three:** controls are at least 40px and use the canonical focus ring tokens.

## 8. Persistence, migration and backward compatibility

- **No database or migration.** The grade lives in the existing submission blob, `attempts[i].manualOverrides[qid]`, with one
  additive optional field, `rubric`. Old attempts, old grades and every existing override are untouched. A stray `rubricAwards`
  on another type's override is inert.
- **The other 22 types are unchanged** (`hotspot@1`, `labelDiagram@1`, `parametricNumeric`, `inlineCloze`, `networkCli`,
  `coding`, `simulation` and all legacy types). Their generic seams received only additive registrations. The genuine catalog
  pins (count 22 → 23, tail positions) were updated.
- **The Runner and the coding grading path are not modified.**

## 9. Bundle

The 128,000-byte (125 KB) guard is **unchanged**.

1. **Relief first** (its own commit): the question import panel and the teacher profile dialog load on demand through the
   existing `lazyWithRetry` recovery. The import-session factory moved verbatim to `src/importSession.ts`. The initial graph went
   from **127,924 to 120,937 bytes** (−6,987).
2. **19E wiring:** +225 bytes for the catalog row, the default literals, two lazy registry edges and the review's lazy panel edge.
   The initial graph is now about **121,162 bytes**, with about **6,838 bytes** of headroom.
3. **Guard check:** the guard's new `OPEN_RESPONSE_SIGNATURES` prove the editor, rubric editor, grading panel, student view and
   rubric engine stay out of the initial graph.

## 10. Limitations (V1)

- Plain text only: no rich text, attachments, handwriting or OCR. No word-count enforcement; `minChars` is guidance.
- `studentRubricVisibility` is `visible` or `hidden`. There is no `afterSubmission` mode, because the product has no
  result-release lifecycle to bind it to safely.
- One overall teacher comment per question (the existing comment). There are no per-criterion notes, so no second comment system
  was built.
- Not a compound part. Source-based questions use the existing per-section stimulus (`groupId`), which suits a standalone
  `sourceBased` question.
- The teacher review save has no revision number. Concurrent saves on the same question are last-writer-wins (storage CAS
  protects every other field), which is the existing behaviour for all types.
- **Whole-exam preview gap.** The whole-exam teacher preview (`toSafePreviewExam`) scrubs `answer`, so a visible rubric shows
  there as a note. The editor's built-in student preview shows exactly what the student receives.

## 11. Future path (not implemented)

AI rubric suggestions during review (teacher-confirmed, never official), moderation / second marker, criterion-level class
analytics, a shared rubric library and presets, a student-visible rubric after submission, peer review, AI feedback drafts. The
engine's pure API (`validateRubric` / `projectRubricForStudent` / `bindRubricAwards` / `scoreRubric`) is the seam for all of them.
