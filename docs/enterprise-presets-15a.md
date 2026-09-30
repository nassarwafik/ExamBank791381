# Phase 15A — Reusable Assessment Presets & Blueprint Templates

Baseline: `origin/main` = `79b2f9eb6019749b0699ba597119fb266db39490` (merge of PR #227 — Phase 14B + Independent Review Fix 1;
post-merge run 852 green). Branch `feature/15a-reusable-assessment-presets`. This document is the authoritative design of the
phase; the PR body carries the evidence summary.

## 1. Objective and boundary

A teacher can save the **academic design** of an exam — Blueprint (identity, taxonomy, objectives, constraints, targets,
cognitive vocabulary, difficulty scale, Quality Policy), section structure and presentation theme — as a personal
**Assessment Preset** («قالب أكاديمي»), and later create a NEW draft exam from it. The preset carries no questions, no
stimuli, no answers, no bank references, no governance / publishing state and no history. One engine serves every subject
(Networking, Computer Science, Mathematics, Physics, Chemistry are the evidence set); there is no subject branch anywhere.

Deliberately NOT built (Phase 15B and later): sharing between teachers, an institutional catalog, preset governance /
review / publishing, versioned preset lineage across teachers, AI-generated presets, Question Bank generalization, automatic
exam assembly from a preset, migration of legacy `exam-template` blobs.

## 2. Audit of the merged 14B architecture (before implementation)

| Area | Finding |
|---|---|
| `api/src/functions/save-exam-artifact.js` | Generic artifact writer. `kind: "template"` calls `buildTemplateDocument()` and writes `templates/<date>/…` with `{ schemaVersion: 1, kind: "exam-template", templateId: "TPL-<ts>", title, originalRequest, plan, totalMarks, metadata, presentationTheme, savedAt }`. It stores a **generation plan** (the AI request and its plan), never a Blueprint, never sections, never a Quality Policy. **`legacy exam-template != Assessment Preset`.** It is untouched, not migrated and never reinterpreted (guarded). |
| `src/assessmentBlueprint.ts` | `AssessmentBlueprintV1`, `validateBlueprint(input, { sectionIds })` (section-dimension refs are validated against the given ids), `validateBlueprintForExam`. Reused as-is. |
| `src/assessmentQualityPolicy.ts` | `validateAssessmentQualityPolicy(policy, blueprint)`; rules reference constraints by `constraintId`. Reused as-is. |
| `src/examBuilderState.ts` | `BuilderSection` (`id, title, instructions, maxMarks, gradingPolicy, requiredAnswers, answerUnit, stimuli, questions`), `newSection()`, `genId(prefix)`. `StructuredExam` v2 has `blueprint` at the root; governance root fields are stripped by exam canonicalization. |
| `src/examHistory.ts` / `useStructuredExamHistory` (13A) | `open(exam, "saved" \| "unsaved")` is the only way a new exam enters the Builder; `examSaveState` derives from it. The Builder's `requestExit` shows the ONE unsaved-work confirmation («تغييرات غير محفوظة»). |
| `api/src/lib/builder-auth.js` (14B) | `requireBuilderAuth` binds the session to the auth mode / directory (`am` claim, `BUILDER_USERS`). Any new teacher endpoint inherits the cutover semantics by calling it. |
| `api/src/lib/platform-storage.js` | `uploadJsonConditional(container, name, value, etag \| null)` (If-Match / If-None-Match `*`), `isConcurrencyConflict`, `listBlobNames`, `downloadJsonWithEtagOrNull`. No conditional delete existed. |
| `scripts/build-shared-finalization.mjs` | Compiles one TS entry graph to CJS under `api/src/lib/shared-finalization/`; `assessmentBlueprint.js` and `assessmentQualityPolicy.js` were already part of that graph; the drift test pins the generated files. |
| Student path | `student-exam` sanitizer strips `blueprint` and quality keys; students never see a Blueprint, so they can never see a preset either. |

## 3. Data model (`src/assessmentPreset.ts`, pure, compiled into the shared build)

```
AssessmentPresetV1 = { schemaVersion: 1, presetId, title, description?, blueprint: AssessmentBlueprintV1,
                       sections: AssessmentPresetSection[], presentationTheme? }
AssessmentPresetSection = { presetSectionId, title, instructions?, gradingPolicy, maxMarks?, requiredAnswers?, answerUnit? }
AssessmentPresetRecordV1 = { schemaVersion: 1, presetId, ownerId, version, createdAt, updatedAt, preset }   // server envelope
AssessmentPresetSummary  = { presetId, version, title, description?, subject, course?, level?, sectionCount, topicCount,
                             objectiveCount, constraintCount, qualityRuleCount, updatedAt, presentationTheme? }
```

Both key sets are **closed allow-lists** (`PRESET_KEYS`, `SECTION_KEYS`); any other key — `questions`, `stimuli`, `answers`,
`bankRefs`, `lifecycleState`, `revisionId`, `ownerId`, `history`, … — is `FORBIDDEN_FIELD`. Limits: title 120, description 500,
sections 1..50, ids `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`.

### 3.1 One validator, reused twice

`validateAssessmentPreset(input)` checks the envelope and sections, then **reuses**
`validateBlueprint(input.blueprint, { sectionIds: presetSectionIds })` (→ `BLUEPRINT_INVALID`) and
`validateAssessmentQualityPolicy(bp.qualityPolicy, bp)` (→ `QUALITY_POLICY_INVALID`). No Blueprint or policy math is
re-implemented. The server calls the same function through the generated shared module
`api/src/lib/shared-finalization/assessmentPreset.js` (entry added to `SHARED_ENTRIES`; drift test now pins 17 files). There is
no third validator.

### 3.2 Extraction is an allow-list (`assessmentPresetFromExam`)

The preset is **constructed field by field** from the exam — never copy-then-strip. `copyBlueprintWithSectionRefs` copies the
Blueprint identity, topics, objectives, constraints, targets, cognitive levels, difficulty scale, notes and Quality Policy by
named fields; `presetSectionOf` copies `title, instructions, gradingPolicy, maxMarks, requiredAnswers, answerUnit` only.
Without a Blueprint the function returns `null` — nothing is invented. Topic / objective / constraint / rule ids are preserved
(they are the academic vocabulary); section ids are replaced by fresh `presetSectionId`s and every section-dimension
constraint `ref` is rewritten exam-section-id → presetSectionId. The Quality Policy is copied exactly (enabled / effect /
relations / trigger / source constraint ids), never derived from a coverage report.

### 3.3 Instantiation is pure (`instantiateExamFromPreset`)

Returns a NEW `StructuredExam` v2: fresh `examId`, `status: "draft"`, fresh section ids (`genId("sec")`), `stimuli: {}`,
`questions: []`, structural configuration copied, the Blueprint deep-copied with section-dimension refs rewritten
presetSectionId → new section id, theme copied when present. No governance / revision / owner / history field exists on the
result; two instantiations share no identity and no object reference.

## 4. Server (`api/src/lib/assessment-presets.js`, `api/src/functions/assessment-presets.js`)

| Concern | Design |
|---|---|
| Namespace | `assessment-presets/<ownerKey>/<presetId>.json`, `ownerKey = sha256("assessment-preset:" + actorId)` (32 hex). Separate from `templates/`, `exams/`, governance and bank namespaces. |
| Ownership | `ownerId = String(auth.user.sub)` from `requireBuilderAuth` only. `body.ownerId / version / createdAt / updatedAt` are never read. A record whose stored `ownerId` differs from the caller is the same 404 as an absent one. Legacy single-teacher mode works unchanged (one owner key). |
| Endpoint | `POST /api/assessment-presets` — `list` (bounded summaries, default 20 / max 50, `cursor`, `q` filter on title / subject / course / level, NFKC), `load`, `create`, `update`, `delete`. Students / anonymous → 401; unknown action → 400 `INVALID`. |
| Validation | Server re-validates every create / update through the shared `validateAssessmentPreset`; failures → 400 `PRESET_INVALID` with `issues`. The client's `presetId` on create is replaced by the server-minted `apr-<uuid>`. |
| Concurrency | Create: `uploadJsonConditional(..., null)` (If-None-Match `*`; a collision → 409 `PRESET_EXISTS`, never an overwrite). Update / delete: `expectedVersion` is required, checked against the record, then the write / delete is ETag compare-and-set (`uploadJsonConditional(..., etag)` / new `deleteBlobConditional`); a lost race → 409 `STALE_VERSION` carrying the fresh record. No unconditional `uploadJson` / `deleteBlob` (guarded). |
| Session | Inherits the 14B binding: a legacy token after the multi-user cutover, a removed account, a malformed `BUILDER_USERS` → 401 exactly like every other teacher endpoint. |

## 5. UI

- Builder button `📋 القوالب الأكاديمية` (only when the host passes a preset service) opens a **lazy** dialog
  `src/presets/PresetLibraryPanel.tsx` — not inside the Blueprint, Quality or Governance panels.
- Library cards show factual metadata only (title, subject, course, level, counts, version, updated). No quality score.
- Preview: الهوية الأكاديمية / الأهداف / الأقسام / القيود / سياسات الجودة, from the loaded record.
- Save current design: requires a Blueprint (`أضف مخطط الامتحان أولًا قبل حفظ قالب أكاديمي.`), title / description dialog,
  server create. The exam is not mutated: no history entry, no dirty state, no autosave, no governance write.
- Update from the current design sends `expectedVersion`; a 409 shows the conflict and reloads — never an automatic retry.
- Delete asks for confirmation and states that exams already created from the preset are unaffected.
- Create new exam: `instantiateExamFromPreset` → the Builder's ONE 13A unsaved-work confirmation (`confirmLeaveUnsaved`,
  shared with `requestExit`) → `App.openExamFromPreset` → `structuredHistory.open(newExam, "unsaved")`. The new exam starts
  with empty undo / redo and `saveState: "dirty"`; the first edit is undoable.
- RTL-first stylesheet `presetLibrary.css`: 44px targets, narrow-screen rule, no fixed widths.
- The Builder never receives the auth token; App owns the service (`apiRequestRef` → `/api/assessment-presets`).
- Bundle: the library panel (7.0 KB gzip + 0.8 KB CSS) and the client (0.6 KB) are lazy chunks; the initial JS graph moved from
  118.9 KB to 120.0 KB gzip (13 files; the extra file is the shared `assessmentTypes` chunk Vite split out), under the 125 KB budget.

## 6. Security

Owner is the token subject only; foreign records are indistinguishable from absent ones; students / anonymous are 401; no
secret, key or token in code, tests, logs or this document; presets never enter student payloads (the student sanitizer
already strips the Blueprint); presets never contain governance manifest / audit / reviewer identity / capabilities /
revisions; the legacy `templates/` blobs are never listed or reinterpreted as presets.

## 7. Five-subject evidence

`src/assessmentPreset.15a.test.ts` runs one `it.each` over Networking, Computer Science, Mathematics (custom cognitive levels and
difficulty labels), Physics and Chemistry: extract → validate (0 issues) → instantiate twice; each subject keeps its own
vocabulary (topic / objective / constraint / rule ids, labels, targets, policy), only section ids and section-dimension refs
change, and the two exams share no identity. `presetSummary` reports the subject's counts.

## 8. Tests

| Suite | Tests | Covers |
|---|---|---|
| `src/assessmentPreset.15a.test.ts` | 15 | P1 validator (accept / reject / forbidden fields / validator reuse), P2 allow-list extraction, P3 / P4 instantiation and remap integrity, policy reference integrity through JSON, title independence, five subjects |
| `api/tests/assessment-presets-15a.test.js` | 12 | P5 create / list / load with server-owned metadata, create-only, server validation, bounded list and filter, P7 CAS update / concurrent update / stale delete, P6 cross-account isolation, 401 / 400, 14B session inheritance, legacy exam-template compatibility |
| `api/tests/assessment-presets-guards-15a.test.js` | 11 | source guards: model dependencies, allow-list construction, instantiation guards, validator reuse, ownership, shared validator + build entry, CAS, namespace / legacy, UI / Builder / CSS |
| `src/presets/PresetLibraryPanel.15a.test.tsx` | 10 | P8 library / preview, P9 save / no-blueprint / server issues / 409 / delete, P10 create new exam through history, dirty protection, identity independence |
| `api/tests/shared-finalization-drift-14a.test.js` | existing | now pins `assessmentPreset.js` in the generated shared build |

### 8.1 Fail-first on the baseline

`scratchpad/15a/fail-first-79b2f9e.log`: on `79b2f9eb` the two new suites fail to load (`./assessmentPreset` and
`api/src/functions/assessment-presets.js` absent — P1–P10 have no implementation), and a behavioural probe of the unchanged
`save-exam-artifact` template path returns `kind: "exam-template"` with `blueprintKept=false sectionsKept=false`.

### 8.2 Mutation matrix (each applied alone, suites run, reverted, tree fingerprint identical)

| # | Mutation | Result |
|---|---|---|
| M1 | extraction copies section `questions` into the preset section | **killed** — 11 failed / 50 (tree clean); first: «accepts a minimal valid preset and a complete one (Blueprint + Quality Policy + three grading policies + theme…» |
| M2 | extraction copies section `stimuli` into the preset section | **killed** — 11 failed / 50 (tree clean); first: «accepts a minimal valid preset and a complete one (Blueprint + Quality Policy + three grading policies + theme…» |
| M3 | instantiation reuses `presetSectionId` as the exam section id | **killed** — 10 failed / 50 (tree clean); first: «creates a NEW draft: fresh examId, fresh section ids, zero questions, empty stimuli, structural config copied,…» |
| M4 | instantiation stops remapping section-dimension constraint refs (`ref => ref`) | **killed** — 11 failed / 50 (tree clean); first: «creates a NEW draft: fresh examId, fresh section ids, zero questions, empty stimuli, structural config copied,…» |
| M5 | extraction drops the Quality Policy from the copied Blueprint | **killed** — 10 failed / 50 (tree clean); first: «extracts ONLY the academic design: identity, taxonomy, objectives, constraints (section refs rewritten), targe…» |
| M6 | copied quality rules point to a different constraint (`constraintId + "-x"`) | **killed** — 14 failed / 50 (tree clean); first: «accepts a minimal valid preset and a complete one (Blueprint + Quality Policy + three grading policies + theme…» |
| M7 | function trusts `body.ownerId` as the owner | **killed** — 4 failed / 50 (tree clean); first: «create: the server chooses presetId, ownerId (token subject), version 1 and timestamps; the client's presetId …» |
| M8 | constant owner key + `readRecord` / `list` stop checking the stored `ownerId` | **killed** — 5 failed / 50 (tree clean); first: «ownership is ONLY the authenticated subject: the function uses requireBuilderAuth and never reads body.ownerId…» |
| M9 | constant owner key + `deletePreset` reads the raw blob without the ownership check | **killed** — 3 failed / 50 (tree clean); first: «ownership is ONLY the authenticated subject: the function uses requireBuilderAuth and never reads body.ownerId…» |
| M10 | update writes with unconditional `uploadJson` (no ETag CAS) | **killed** — 2 failed / 50 (tree clean); first: «create is create-only; update and delete are ETag compare-and-set gated by expectedVersion — no unconditional …» |
| M11 | delete skips the `expectedVersion` staleness check | **killed** — 1 failed / 50 (tree clean); first: «delete requires the current version: a stale delete is refused and the newer edit survives; the owner's fresh …» |
| M12 | extraction copies governance fields (`lifecycleState`, `stateVersion`, `revisionId`, `publishedRevisionId`, `reviewWorkflow`) into the preset | **killed** — 8 failed / 50 (tree clean); first: «accepts a minimal valid preset and a complete one (Blueprint + Quality Policy + three grading policies + theme…» |
| M13 | instantiated exam starts as `status: "final"` | **killed** — 4 failed / 50 (tree clean); first: «creates a NEW draft: fresh examId, fresh section ids, zero questions, empty stimuli, structural config copied,…» |
| M14 | preset id = the exam id and instantiated exam id = the preset id (shared identity) | **killed** — 8 failed / 50 (tree clean); first: «extracts ONLY the academic design: identity, taxonomy, objectives, constraints (section refs rewritten), targe…» |
| M15 | deterministic section ids `"sec-" + presetSectionId` (two instantiations collide) | **killed** — 10 failed / 50 (tree clean); first: «creates a NEW draft: fresh examId, fresh section ids, zero questions, empty stimuli, structural config copied,…» |
| M16 | server `issues = []` (no validation) + model skips `validateBlueprint` | **killed** — 6 failed / 50 (tree clean); first: «rejects a broken section constraint reference, a malformed Blueprint and a malformed Quality Policy (reusing t…» |
| M17 | model skips `validateAssessmentQualityPolicy` | **killed** — 3 failed / 50 (tree clean); first: «rejects a broken section constraint reference, a malformed Blueprint and a malformed Quality Policy (reusing t…» |
| M18 | function bypasses `requireBuilderAuth` (anonymous / student become a teacher) | **killed** — 2 failed / 50 (tree clean); first: «anonymous and student tokens are 401; unsupported actions are 400; nothing is written…» |
| M19 | list also scans `templates/` and reinterprets legacy `exam-template` blobs as presets | **killed** — 2 failed / 50 (tree clean); first: «the legacy save-exam-artifact template path is untouched: kind template still writes an exam-template blob und…» |
| M20 | instantiation mutates the preset's Blueprint in place (`Object.assign(preset.blueprint, …)`) | **killed** — 10 failed / 50 (tree clean); first: «creates a NEW draft: fresh examId, fresh section ids, zero questions, empty stimuli, structural config copied,…» |

Fingerprint before = after; 20 / 20 killed (`scratchpad/15a/mutations-15a-summary.txt`).

Suites run per mutation: model, API, guards, UI, shared-build drift.

## 9. Phase 15B handoff

- **Sharing / catalog**: add an institutional namespace (`assessment-preset-catalog/…`) with explicit publish / unpublish of a
  preset *version*; personal presets stay private; the summary shape is already share-ready (no owner secrets).
- **Preset governance**: reuse the 14A/14B state machine for a preset review cycle only if institutions require it; the
  preset record already carries `version` for lineage.
- **Lineage**: record `sourcePresetId` / `sourcePresetVersion` on an instantiated exam only when a product decision requires
  provenance (15A intentionally keeps exams independent).
- **Import / export**: `AssessmentPresetV1` is JSON-stable and validated by one function; an export is the record's `preset`.
- **Legacy `exam-template`**: remains a generation-plan artifact; a migration would need a Blueprint author, so it is not
  automatic.
