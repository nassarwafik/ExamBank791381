# Phase 13B — Enterprise Authoring Productivity

Baseline: `41325e53461aa89f55cc5c2207d62123601fd0b7` (merge of PR #221 / Phase 13A).

## Pre-implementation audit (what is reused)

| Area | Finding | Reused by 13B |
|---|---|---|
| Question identity | `BuilderQuestion.examQuestionId`, `BuilderSection.id`; display numbers are never identity (`examBuilderState.genId`) | navigator, selection, every bulk operation |
| Deep identity clone | `cloneQuestionWithNewIds` regenerates question / part / field ids (used by `duplicateQuestion`, Live Challenge) | bulk duplicate, bank insertion (nested ids) |
| Per-question helpers | `moveQuestionToSection` appends to the target; `duplicateQuestion` inserts the copy right after the original; `insertAt` | bulk semantics follow the same conventions |
| History authority | `useStructuredExamHistory` → `updateExamHistory` (functional updater on the LATEST present; a structurally no-op result creates no entry) | every 13B mutation is ONE `onChange(updater)` |
| Media guard | `pendingMedia` counts per question id in `StructuredExamBuilder`; `pendingMediaIds` blocks move-to-section in the card | bulk move / delete / duplicate refuse while a selected question is pending |
| Marks rule | `examQuality.validateQuestion`: `Number.isFinite(marks) && marks > 0`; card input `step 0.25` | bulk marks validation |
| Dialogs | `ui/Dialog` (stacking, focus trap, focus return), `ui/useConfirm` (ConfirmDialog, never `window.confirm`) | bulk delete confirmation, picker, preview |
| Question Bank store | `bank/index/questions-index.json` + `bank/sources/<sourceId>.json`; `GET /api/bank-questions` lists rows (`BankQuestionRow`, editable projection); `POST /api/question-bank-action` replaces ONE question by scoring | picker list = the existing GET; no second bank, no second format |
| Canonical conversion | `api/src/lib/bank-question-exam.js` `buildExamQuestion(full, indexEntry, current)`: presentation type, answer keys, metadata (`bankQuestionId`, `sourceId`, `sourceQuestionId`, `questionNumber`, `topic`, `secondaryTopics`, `difficulty`, `familyKey`, `hasCLI`, `requiresCalculation`, `wordBank`, `textHtml`, `hint`) and **signed image assets** (`createSignedAssetParams`) | the new exact-id endpoint calls it unchanged |
| Legacy → structured bridge | `legacyToStructured` wraps legacy exam questions **verbatim** as `BuilderQuestion`s: the engine shape is shared (fields/options/answer/image) | the client bridge only stamps identity, marks and the `open → shortAnswer` type name |
| Bank labels | `bank/bankQuestionModel.ts` (`SECTION_LABELS`, `TYPE_LABELS`, `SOURCE_LABELS`, `filterRows`, `distinctTopics`) | picker filters and rows |
| Stale index handling | `question-bank-action.isBlobNotFound`: only 404 / `BlobNotFound` is "missing"; every other storage error is a real error | exact-id endpoint |
| Auth ownership | App owns `apiRequest` (token header); the builder receives authenticated callbacks (`requestQuestionImage`) and never the token | `bankPicker.list` / `bankPicker.select` callbacks |
| Lazy loading | `App.tsx` lazy-loads the builder chunk; `lazyWithRetry` | the picker is `React.lazy` inside the builder chunk |

Not found on the baseline (added here): a flattened navigator index, multi-selection, bulk operations, an exact-id bank
retrieval, a bank → structured bridge, and any navigator / picker UI.

## Architecture

- **Pure model** `src/structuredExamProductivity.ts`: `indexExamQuestions`, `filterNavigatorEntries`, `bulkDeleteQuestions`,
  `bulkMoveQuestions`, `bulkDuplicateQuestions`, `bulkSetMarks`, `insertQuestionsIntoSection`, `pruneSelection`,
  `usedBankQuestionIds`, `bankExamQuestionToBuilderQuestion`. Stable ids only; every operation returns the SAME sections
  reference when nothing changes, so the history authority records no entry.
- **Selection** is builder UI state (`Set<examQuestionId>`): never saved, never autosaved, never in history. It is pruned
  after every exam change and reset when another exam opens.
- **Bulk transaction** = one `onChange(prev => ({ ...prev, sections: bulkX(prev.sections, …) }))` → one undo step.
- **Bank picker** (`src/BankQuestionPicker.tsx`, lazy): lists through the App-owned `bankPicker.list()` (the existing
  `GET /api/bank-questions`), inserts through `bankPicker.select(ids)` (the new exact-id endpoint) → client bridge → ONE
  updater. Exact `bankQuestionId`s already in the exam are shown as `مضاف` and cannot be selected.
- **Exact-id retrieval** `POST /api/bank-question-select { ids }` (`api/src/functions/bank-question-select.js`): builder
  auth, validated ids, ≤ 50, requested order, source document is the authority, all-or-nothing, read-only, converts
  with the unchanged `buildExamQuestion`.

## Deliberate conversion decisions

- Bank `open` questions arrive from the canonical converter as `presentationType: "open"` (legacy naming). The structured
  builder's authorable type for that content is `shortAnswer`; the bridge maps the type NAME only and keeps the canonical
  `answer` (`anyAccepted` / `manual`), so grading is unchanged (manual review unless `answer.text`).
- Bank `multiPart` questions are not insertable (the structured compound shape differs): the endpoint rejects them with a
  clear error and nothing is inserted.
- Every inserted question receives a fresh `examQuestionId` and fresh nested field / part ids; the bank id lives only in
  `bankQuestionId`. All canonical metadata is preserved on the question.

## Review fix 1 — target-deletion insertion race (R3) and recovery provenance

- The exam authority read when a pending exact fetch resolves (`latestExamRef`) is refreshed in the COMMIT phase
  (`useLayoutEffect`), never in a passive `useEffect`. React commits a non-discrete update in one scheduler task and runs
  passive effects in a later task (the commit calls `requestPaint()`, so the scheduler yields); a resolved fetch's microtask
  can run between the two and would read the previous exam — reporting `"ok"` for a target that is already gone while the
  functional updater (correctly) inserted nothing. A render-phase ref write was rejected: it is flagged by the project's
  `react(refs)` lint rule and may run in a discarded render. Layers kept: commit-phase outer check (drives the picker's
  visible outcome), the updater's own exam-id + target check, and the pure helper's no-fallback guard.
- `POST /api/bank-question-select`: when an id is not found in the source its index entry names and is recovered from
  another source by scan, the index entry is stale for that id; the question is converted from its OWN stored
  classification (`entryFromStored`), never mixed with the stale entry's section / topic / difficulty. The normal indexed
  path keeps the index classification (the bank UI's projection).

## Review fix 2 — exact bank duplicate invariant at insertion time

The invariant «an exact bank question already present in the exam is never inserted again by the picker» is keyed on
`bankQuestionId` only (never text, display / source numbers or `examQuestionId`) and is enforced at three layers:

- **Picker** — the actionable selection is DERIVED every render as `selected − usedBankQuestionIds` (never stored, never
  stale): a question that became `مضاف` while the picker stayed open is not counted, not shown checked and never submitted.
- **Owner** (`insertBankQuestions`) — decides against the COMMITTED exam authority (exam id, target section, exact bank
  duplicates via `hasAnyUsedBankQuestion`); a batch the committed authority rejects is refused synchronously and never
  dispatched. `"already-used"` → `أحد الأسئلة المحددة أُضيف إلى الامتحان أثناء العملية. راجع التحديد ثم أعد المحاولة.`
- **Updater** — the ONE functional updater re-decides the same three invariants against the `prev` it actually receives;
  any duplicate rejects the WHOLE batch (`prev` returned) — never a partial or filtered insertion.

Outcome contract: the updater records its decision per batch number; the picker's outcome promise is settled from a
COMMIT-phase effect after the render that processed the updater (the builder always commits then: its own batch state
changed in the same tick, so a parent bail-out cannot skip it). `"ok"` is therefore never reported for a batch the exam
authority did not apply — the same class of outcome race as R3. An updater that never ran settles as `"stale"`.

## Review fix 3 — bank image URLs are transient delivery data, never persisted state

- **Durable identity vs. credential.** A bank image is stored once in the bank assets container; `blobName` is its durable
  identity. The `/api/question-image?blob=…&exp=…&sig=…` URL is a signed, 8-hour credential (`createSignedAssetParams` /
  `verifySignedAssetParams`). Persisted exams and assignment snapshots keep ONLY `{ id, origin: "bank", blobName,
  contentType }` (`normalizeBankAssetsForStorage` in `save-exam-artifact.cleanQuestion` and `manage-assignments.cleanExam`);
  the authoring-time URL is never stored as if it were durable. Uploaded / AI-generated embedded rasters are untouched.
- **One helper, re-signed at delivery.** `api/src/lib/bank-asset-hydrate.js` traverses the canonical media tree
  (`sections[].questions[]`, legacy `questions[]`, `image.assets[]`, compound `parts[].image.assets[]`), signs only bank
  assets with a safe `blobName`, keeps every other asset by the same reference, path-copies (never mutates the stored
  document) and never touches storage. `buildExamQuestion` mints its authoring-time URL through the same helper (one
  signing implementation). Re-sign points: teacher `POST /api/saved-exams load`, student `GET /api/student-assignment/:id`
  (hydrate → sanitizer LAST, so hidden media and answer keys can never be reintroduced), student learning-training delivery.
- **Client.** `bankExamQuestionToBuilderQuestion` keeps the fresh URL for the current authoring session only; a reopened
  exam receives newly signed URLs from the server. `BuilderImageAsset.blobName` is typed (additive).
- `/api/question-image` still verifies every request; an expired signature is rejected before any storage access.
