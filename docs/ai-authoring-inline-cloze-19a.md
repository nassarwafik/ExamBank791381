# Phase 19A — AI-Assisted Question Authoring + Inline Cloze (`inlineCloze@1`)

Baseline `91b1f3d821f804b1a8ff20394121cd282e8c8178` (post-merge of Phases 18A, 18B and 18C). Branch
`feature/19a-ai-authoring-inline-cloze`. Two deliverables on the 16A Question Type Registry: a new auto-graded question family
`inlineCloze@1` («إكمال نص تفاعلي»), and AI-assisted authoring in the Structured Exam Builder that can deliberately generate
`networkCli@1` and `inlineCloze@1` (and the ordinary families) — always judged by the same canonical validators as manual
authoring.

## 1. Architecture (audit → decisions)

| seam | canonical infrastructure (reused) | 19A |
|---|---|---|
| catalog / versions | `src/questionTypeCatalog.ts` (`PRODUCTION_ROWS`, `effectiveQuestionTypeVersion`) | row `inlineCloze` (v1, `response`, `auto`, flags `apo`, responseKinds `["fields"]`, not compound) — catalog 18 → **19** |
| validators | `registerTypeValidator` | `validateInlineClozeQuestion` (shared build) |
| defaults | `registerTypeDefaults` | one-blank passage + key whose empty accepted list blocks finalization |
| authoring / student registries | lazy `import()` edges | `editors/InlineClozeEditor`, `student/InlineClozeResponse` |
| server grader | `registerGrader` via `assignment-grading.gradeQuestion` | `scoreInlineCloze` (shared build) |
| answer kind | existing `fields` Answer (blank id → value), like matrix / categorization | **no new Answer kind** — `answered()`, autosave, restore, pause and submit are unchanged |
| ingest | `api/src/lib/draft-answers.js` | `bindInlineClozeAnswerToQuestion` for answers to inlineCloze questions only |
| sanitizer | `student-exam-sanitize.js` | strict projection `projectInlineClozeConfigForStudent` (a malformed config is withheld) |
| teacher review | `assignment-review.js` + `AssignmentReview.tsx` | payload carries `inlineCloze`; `InlineClozeReviewView` |
| shared finalization | `scripts/build-shared-finalization.mjs` + drift test | entries `src/inlineClozeQuestion.ts`, `src/aiQuestionDraft.ts` (regenerated with the generator) |
| AI | `quality-fix-ai-client.js` (OpenAI only, strict structured output, no SDK retries) | new endpoint `api/src/functions/ai-question-author.js` + shared normalizer `src/aiQuestionDraft.ts` |
| bundle guard | `scripts/check-bundle-budget.mjs` | `CLOZE_SIGNATURES` (renderer, token editor, review, AI dialog must stay lazy) |

**Where AI authoring lives.** The legacy App.tsx bank generator (`generate-exam`, `interpret-exam-request`, `question-ai-action`)
produces the historical flat `ExamQuestion` whose `presentationType` union cannot carry `networkCli` / `inlineCloze` configuration.
Interactive types live in the Structured Exam Builder, so 19A adds «✨ سؤال بالذكاء الاصطناعي» there (an App-owned service, lazy
dialog). The legacy AI endpoints are unchanged.

## 2. `inlineCloze@1` schema

PUBLIC (`question.inlineCloze`, the only part a student receives):

```
{ v: 1,
  segments: [
    { type: "text", text: "يعمل البروتوكول " },
    { type: "blank", id: "b1", control: "text" },
    { type: "text", text: " في الطبقة الثالثة، وعنوان MAC يعمل في " },
    { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "Physical" }, { id: "o2", label: "Data Link" }] }
  ] }
```

PRIVATE (`question.answer`, removed by the sanitizer):

```
{ scoring: "proportional" | "allOrNothing",
  blanks: { b1: { accepted: ["IP", "Internet Protocol"], caseSensitive: false }, b2: { correctOptionId: "o2" } } }
```

Student answer: `{ kind: "fields", values: { b1: "<typed text>", b2: "<option id>" } }`.

Rules (ONE strict authority, `validateInlineClozeConfig` + `validateInlineClozeAnswerKey`, every problem blocks finalization):
root exactly `{ v: 1, segments }`; segment exactly a non-empty text (≤ 2000 chars) or a blank; blank ids `^[A-Za-z][A-Za-z0-9_-]{0,31}$`
(never `constructor` / `prototype` / `__proto__`), unique across the passage, 1–50 blanks; controls `text` (exact keys) or
`dropdown` (2–12 options, unique option ids, non-empty unique labels); unknown fields / controls / segment types are refused,
never dropped. Key root exactly `{ scoring, blanks }`; scoring is never defaulted; every blank has exactly one key and no key names
an unknown blank; a text key is `{ accepted: string[1..20], caseSensitive?: boolean }` with every accepted answer non-empty after
normalization; a dropdown key is exactly `{ correctOptionId }` naming ONE of its options. Prototype-sensitive keys are refused at
every level. Codes: `CLOZE_CONFIG_MISSING`, `CLOZE_CONFIG_UNKNOWN_KEY`, `CLOZE_CONFIG_VERSION`, `CLOZE_SEGMENTS_INVALID`,
`CLOZE_SEGMENT_INVALID`, `CLOZE_BLANK_ID_INVALID`, `CLOZE_BLANK_ID_DUPLICATE`, `CLOZE_CONTROL_UNKNOWN`,
`CLOZE_DROPDOWN_OPTIONS_INVALID`, `CLOZE_OPTION_INVALID`, `CLOZE_OPTION_ID_DUPLICATE`, `CLOZE_OPTION_LABEL_DUPLICATE`,
`CLOZE_NO_BLANKS`, `CLOZE_TOO_MANY_BLANKS`, `CLOZE_PASSAGE_TOO_LONG`, `CLOZE_KEY_CONFIG_INVALID`, `CLOZE_ANSWER_KEY_INVALID`,
`CLOZE_SCORING_UNKNOWN`, `CLOZE_KEY_UNKNOWN_BLANK`, `CLOZE_KEY_MISSING_BLANK`, `CLOZE_DROPDOWN_KEY_INVALID`,
`CLOZE_TEXT_KEY_INVALID`, `CLOZE_TEXT_ACCEPTED_EMPTY`, `CLOZE_VERSION_UNSUPPORTED`.

## 3. Scoring

`scoreInlineCloze` re-validates the published config AND the key before comparing anything. Each blank is one grading part.
`proportional` = marks × correct ÷ total; `allOrNothing` = marks only when every blank is correct; no negative marking; the platform
rounds to 2 decimals in `gradeExam`. Text comparison is deterministic and server-owned: NFC, trim, internal whitespace collapsed,
lower-case only when `caseSensitive` is false; an empty response never matches; no fuzzy / AI grading. A dropdown is graded by
OPTION ID, never by label.

* Malformed PRIVATE authority (or public config, or `inlineCloze@2`) ⇒ `{ score 0, correct false, manualReview true }` — the
  question's marks stay pending manual review; never a partial grade of a valid-looking subset.
* Malformed STUDENT input under a valid contract (another kind, non-string values, over-long text, a label instead of an option id)
  ⇒ an ordinary incorrect answer (`manualReview false`).

## 4. Secrecy

The sanitizer blanks `answer` (as for every type) and REBUILDS `inlineCloze` through the strict projection: only text, blank ids /
controls and option ids / labels survive; a config with any unknown field (a smuggled `accepted` / `correctOptionId`) is withheld
entirely. Fail-first evidence: on the baseline the generic type-config policy passed a smuggled `correctOptionId` / `accepted`
inside an `inlineCloze` object straight to the student payload. The student renderer, the teacher preview and the emitted Answer
never contain accepted answers or a correct-option marker (tested in DOM, payload and preview model). The teacher review receives the
key as `expectedAnswer` (teachers only, existing pattern).

## 5. Student, author and review experience

* **Student** (`InlineClozeResponse`, lazy): the passage is one `<p dir="auto">`; controls are inline boxes inside the running text
  (wrap with the text, never wider than the line). Text blanks are `<input dir="auto">` with `unicode-bidi: plaintext`, so an English
  / CLI answer is never forced RTL inside an Arabic passage; width follows the student's own text (6–24ch), never the key; 500-char
  cap. Dropdowns are labelled `<select>` with «اختر…». Labels «الفراغ N» are positional. Read-only / restore through the existing
  pipeline. A malformed config renders an explicit unavailable note.
* **Author** (`InlineClozeEditor`, lazy): text pieces (textareas) and blank cards; «+ فراغ كتابة» / «+ قائمة منسدلة» split the text at
  the caret; accepted answers as a list (add / remove), case policy, options with one correct radio, remove blank (neighbouring text
  merges), scoring mode, live preview with «[فراغ N]» markers, inline canonical validation. Blank ids are stable (next unused number;
  text edits never re-id), so keys follow their blanks. No contentEditable, no raw JSON.
* **Review** (`InlineClozeReviewView`): passage with each response inline, per-blank ✓ / ✗, accepted answers / correct option,
  options list, earned parts; an invalid config or key shows an explicit manual-review state without ✓ / ✗. Everything is text.

## 6. AI-assisted authoring

`POST /api/ai-question-author` `{ request, preferredType? }` (teacher session required; 1–2000 chars). The prompt names the exact
type vocabulary, the networkCli@1 capability scope (hostname, VLAN database 2–4094 without 1002–1005, names, FastEthernet0/1-24 and
GigabitEthernet0/1-2 access / trunk, access VLAN, native VLAN, up / shutdown, SVI IPv4 + mask) and the unsupported list. The model
fills a strict json_schema (every object `additionalProperties: false`, every property required, nullable payloads). Then
`src/aiQuestionDraft.ts`:

1. **Shape** — exact keys and types, prototype keys refused ⇒ otherwise `AI_DRAFT_MALFORMED` (a smuggled `targetState` or `answer`
   is malformed output).
2. **Intent** — `multipleChoice | trueFalse | shortAnswer | fillBlank | inlineCloze | networkCli` are generated; `simulation` /
   `coding` are recognised and refused with guidance (`AI_TYPE_NOT_GENERATED`: they need a teacher package / teacher-verified hidden
   tests); `unsupported` ⇒ `AI_REQUEST_UNSUPPORTED`; anything else ⇒ `AI_INTENT_UNKNOWN`.
3. **Simulator guard** — a networkCli draft is refused (`AI_NETCLI_UNSUPPORTED_CAPABILITY`) when the model declares, or the request
   clearly asks for, a capability outside the V1 switch (router / routing, static routes, OSPF, EIGRP, RIP, BGP, ACL, NAT, DHCP, STP,
   port-security, EtherChannel, VTP, SSH / Telnet, interface range, allowed VLAN lists, ping / traceroute, IPv6) — even when the model
   invents a switch contract; an `ambiguous` networkCli draft ⇒ `AI_NETCLI_AMBIGUOUS` (ask again or generate an ordinary question).
   The bilingual request signals are advisory (they shape the prompt and add this conservative guard); they never generate anything.
4. **Mapping** — deterministic, field by field: interface names through the engine's own spelling authority (an unknown name is kept
   as written so the validator refuses it; two spellings of one interface are refused), `""` / `0` = not graded, VLAN ids as keys;
   cloze pieces → segments with ids `b1..bn` / `o1..on` (empty text pieces dropped, adjacent text merged — presentation only).
5. **Judgment** — `verifyAiQuestionNode`: only the canonical keys of the type, then the structured-exam quality gate
   (`validateStructuredExam`, which runs the registered `validateNetworkCliQuestion` / `validateInlineClozeQuestion` and the legacy
   structural rules). Any error ⇒ `AI_DRAFT_INVALID` with the canonical issues. Nothing is repaired after the fact.

The Builder dialog re-runs `verifyAiQuestionNode` on the server's answer (defense in depth), shows a factual summary (type, marks,
networkCli check count, cloze passage with blank markers — never private answers) and inserts the question as ONE builder update with
fresh ids only when the teacher confirms. Provider failures are a 502 with a safe Arabic message (no provider error text). Finalization
gates still apply to the inserted draft.

## 7. Backward compatibility

Existing exams load unchanged (no migration): legacy `fillBlank` keeps its type, contract and grader (an answer to a legacy question
is never touched by the cloze binding — tested); `simulation@1`, `networkCli@1`, `coding@1/@2` are untouched; no existing type is
reinterpreted. The `fields` Answer semantics are unchanged.

## 8. Bundle

Initial graph (gzip level 9, `npm run check:bundle`), the guard stays 125 KB (128,000 bytes):

| Build | Files | Bytes | KB |
|---|---|---|---|
| baseline `91b1f3d` | 16 | 127,858 | 124.9 |
| head before the saving below | 16 | 128,143 | 125.1 (guard FAILED) |
| head | 16 | 127,734 | 124.7 |

The renderer, the token editor, the review view and the AI dialog ship in lazy chunks (`CLOZE_SIGNATURES`). What 19A adds to the
initial graph is small but real: the catalog row, the inlineCloze default literal (the defaults registry is part of the initial
graph), two lazy-import registrations with their preload lists, and the App-owned AI service. To stay under the unchanged limit,
the legacy builder's «convert question type» AI instruction text (about a kilobyte of Arabic wording, needed only when a teacher
clicks a conversion button) moved **verbatim** from `App.tsx` into the lazy module `src/legacyTypeConversionInstruction.ts`,
loaded inside the conversion's existing `try` block (a chunk-load failure reports the normal error and clears the busy state).
`src/legacyTypeConversionInstruction.test.ts` pins the exact text for every legacy target type against the baseline wording.

## 9. Unsupported in V1

Compound parts (inlineCloze is not compound-capable), rich text / images inside the passage, per-blank weights, negative marking,
fuzzy / numeric-tolerance matching, regular expressions, Arabic orthographic normalization (hamza / taa marbuta), drag-and-drop
word banks inside the passage, AI generation of simulation / coding questions, AI routers or any networkCli capability outside the V1
switch, AI editing of existing questions from this dialog.
