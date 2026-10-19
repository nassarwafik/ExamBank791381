# Phase P7 — Condensed project stages (899373, 883589, 794589)

## Problem

The three project templates listed every page and screen of the project as its own stage: 28 active stages for 899373,
52 for 883589 and 105 for 794589. The teacher grades and approves each one, and the student marks each one. Entering
progress for a class is long and tiring, and the student's list is very long on a phone.

## Owner decisions (recorded for this phase)

| Question | Decision |
|---|---|
| Stage sets | The condensed lists below, approved by the owner for all three projects. |
| Classes that already started | **Converted automatically** on first access, with their progress. |
| Stage weight | **The number of items it merges** (Σ of the merged stages' weights, 1 each by default). A fully approved group therefore keeps exactly the project value it had. |
| A merged stage the student finished only in part | **«بانتظار الاعتماد» (ready for review) for the teacher**, with a note naming what was done. Never an automatic approval, never a silent loss. |
| Branch | `feature/p7-condensed-stages`, separate from P6. |

## The condensed sets

Each new stage keeps `mergedFrom` (the old stage ids, in the template) and `description` (the items it covers, shown to the
student as «يشمل: …» and to the teacher in the stage details). Group ids are new (`bk_g*`, `ac_g1`, `vs_g*`, `pt_g*`).
Track weights, project configuration and storage paths do not change.

### 899373 (الكتاب + Access) — 28 active stages → 11 (template v1 → v2)

| Stage | Group | Title | Merges | Weight |
|---|---|---|---|---|
| BK01 | بداية الكتاب | بداية الكتاب: الغلاف والفهرست والمقدمة | B01–B03 | 3 |
| BK02 | الجداول وقاعدة البيانات | الجداول الأربعة | B04–B07 | 4 |
| BK03 | الجداول وقاعدة البيانات | معطيات الجداول وصورها | B08، B09 | 2 |
| BK04 | الجداول وقاعدة البيانات | SQL Server Code والعلاقات بين الجداول | B10، B11 | 2 |
| BK05 | الاستعلامات | استعلامات الإضافة والحذف والتعديل | B12–B14 | 3 |
| BK06 | الاستعلامات | استعلامات البحث والحساب والبارامتر | B15–B17 | 3 |
| BK07 | نهاية الكتاب | نهاية الكتاب: التقارير والمردود والمصادر | B18–B20 | 3 |
| AC01 | قاعدة بيانات Access | الجداول الأربعة | A01–A04 | 4 |
| AC02 | قاعدة بيانات Access | العلاقات بين الجداول والمعطيات | A05، A06 | 2 |
| AC03 | قاعدة بيانات Access | الاستعلامات | A07 | 1 |
| AC04 | قاعدة بيانات Access | التقارير | A08 | 1 |

### 883589 (الكتاب + Visual Studio) — 52 active stages → 18 (template v1 → v2)

| Stage | Group | Title | Merges | Weight |
|---|---|---|---|---|
| BK01 | بداية الكتاب | بداية الكتاب: الغلاف والفهرست والمقدمة | B01–B03 | 3 |
| BK02 | الجداول وقاعدة البيانات | الجداول الخمسة | B04–B08 | 5 |
| BK03 | الجداول وقاعدة البيانات | معطيات الجداول وصورها | B09، B10 | 2 |
| BK04 | الجداول وقاعدة البيانات | SQL Server Code والعلاقات بين الجداول | B11، B12 | 2 |
| BK05 | الاستعلامات | استعلامات الإضافة والحذف والتعديل | B13–B15 | 3 |
| BK06 | الاستعلامات | استعلامات البحث والحساب والبارامتر | B16–B18 | 3 |
| BK07 | البرمجة وخدمات الويب | البرمجة: اللغات المستعملة والفئات | B19، B20 | 2 |
| BK08 | البرمجة وخدمات الويب | Web Services: Add / Update / Delete / Parameter | B21–B24 | 4 |
| BK09 | المخططات | مخططات XML وDFD وDSD | B25–B27 | 3 |
| BK10 | المخططات | مخططات Sequence وActivity وERD وUse Case | B28–B31 | 4 |
| BK11 | الموقع ونهاية الكتاب | الموقع: مبنى المشروع والصفحات | B32، B33 | 2 |
| BK12 | الموقع ونهاية الكتاب | نهاية الكتاب: المردود والمصادر | B34، B35 | 2 |
| VS01 | تهيئة المشروع والخدمات | تهيئة المشروع: التعريف والمجلدات والصور | V01–V03 | 3 |
| VS02 | تهيئة المشروع والخدمات | قاعدة البيانات MDF | V04 | 1 |
| VS03 | تهيئة المشروع والخدمات | WCF وخدمات الويب وفحصها | V05–V07 | 3 |
| VS04 | صفحات الموقع والمخرجات | بناء الموقع والصفحات العامة: الرئيسية، من نحن، تواصل معنا | V08–V11 | 4 |
| VS05 | صفحات الموقع والمخرجات | الدخول وصفحات المستخدمين: المدير، الزبون، العامل | V12–V15 | 4 |
| VS06 | صفحات الموقع والمخرجات | المخرجات: الرسوم البيانية والتقارير | V16، V17 | 2 |

### 794589 (الكتاب + Packet Tracer) — 105 active stages → 20 (template v2 → v3)

| Stage | Group | Title | Merges | Weight |
|---|---|---|---|---|
| BK01 | بداية الكتاب | بداية الكتاب: الغلاف والفهرست ومقترح المشروع والمقدمة | B01–B04 | 4 |
| BK02 | الفرع الأول | الفرع الأول: الجداول والتخطيط | B05–B12 | 8 |
| BK03 | الفرع الأول | الفرع الأول: الخوادم وصورها | B13–B18 | 6 |
| BK04 | الفرع الأول | الفرع الأول: صور الأقسام والفرع | B19، B20 | 2 |
| BK05 | الفرع الأول | الفرع الأول: الحماية والربط | B21–B24 | 4 |
| BK06 | الفرع الأول | الفرع الأول: أوامر Show من السويتش والراوتر | B25–B29 | 5 |
| BK07 | الفرعان الثاني والثالث | الفرع الثاني: الجداول والتخطيط والصور | B30–B39 | 10 |
| BK08 | الفرعان الثاني والثالث | الفرع الثالث: الجداول والتخطيط والصور | B40–B49 | 10 |
| BK09 | الخدمات الخارجية ونهاية الكتاب | الخدمات الخارجية: سيرفر خارجي وموقع خارجي وصور السيرفر | B50–B52 | 3 |
| BK10 | الخدمات الخارجية ونهاية الكتاب | نهاية الكتاب: المردود والمصادر | B53، B54 | 2 |
| PT01 | الفرع الأول | الفرع الأول: بناء الفرع | P01–P07 | 7 |
| PT02 | الفرع الأول | الفرع الأول: VTP وVLAN والمنافذ وTrunk وDot1Q | P08–P12 | 5 |
| PT03 | الفرع الأول | الفرع الأول: وضع الخوادم | P13–P17 | 5 |
| PT04 | الفرع الأول | الفرع الأول: تعريف الخدمات DNS وHTTP وDHCP وFTP وEmail | P18–P22 | 5 |
| PT05 | الفرع الأول | الفرع الأول: Port Security وكلمات السر وOSPF | P23–P25 | 3 |
| PT06 | الفرع الثاني | الفرع الثاني: بناء الفرع | P26–P32 | 7 |
| PT07 | الفرع الثاني | الفرع الثاني: إعداد الشبكة وOSPF | P33–P38 | 6 |
| PT08 | الفرع الثالث والسيرفرات الخارجية | الفرع الثالث: بناء الفرع | P39–P45 | 7 |
| PT09 | الفرع الثالث والسيرفرات الخارجية | الفرع الثالث: إعداد الشبكة والعناوين الثابتة | P46–P50 | 5 |
| PT10 | الفرع الثالث والسيرفرات الخارجية | السيرفرات الخارجية (جوجل) | P51 | 1 |

## Conversion of a class that started (`api/src/lib/project-tracker/condense.js`, `service.condenseClass`)

### When

`ensureClassConfig` (every teacher read and every write) converts an **active** class whose snapshot is on the version the
condensed template replaces (`snapshotUpgrade.condenseFrom`: 1 for 899373 / 883589, 2 for 794589). Archived classes are
never touched (read-only, as before). A class created after P7 gets the condensed set directly.

### Rules per student (pure, `condenseEntry`)

Computed over the old stages **active in the class snapshot** (the teacher's own activation is respected):

| Old stages of the merged stage | New stage |
|---|---|
| all approved | approved; score = the average **only when every one is scored**, otherwise no score (and a note with the scores that existed); approvedAt / By = the latest |
| some approved, or all approved / ready | **ready_for_review** + note «تحويل المراحل المختصرة — B01 صفحة الغلاف: معتمدة (90) · B02 الفهرست: جاهزة للفحص · لم تبدأ: B03» |
| some started | in_progress + the same note |
| none touched | no entry (not started) |

- A student's own unconfirmed marks (P2/P3) stay the student's own on the merged stage (`selfReportedAt / By`); an undo returns
  it to «بانتظار الاعتماد» when part of it was teacher-approved, else to not started.
- The teacher's notes on the old stages are carried into the note («B02: …»), bounded to 1000 characters.
- The old entries are archived in the progress document (`condensedFrom: { templateVersion, at, stages }`); **nothing is lost**.

### Rules per class (`buildCondensePlan`)

- A new stage is active when any of its old stages is active, required when any active one is required; its weight is the Σ
  of the active old stages' weights (the teacher's own weights count).
- Teacher-added stages (ids outside the old template) are carried with their own group; a stage of an old template group
  joins its track's first new group.
- A teacher-added stage or group whose id collides with a new id: the class is **left exactly as it is** and marked
  `condenseSkipped` (one `project.template.condense_skipped` audit).

### Orchestration (idempotent passes)

0. **Lock:** the snapshot carries `conversion { toVersion, lockId, startedAt }` (CAS). A fresh lock held by another request:
   this request serves the old set. A lock older than 120 s (a crashed conversion) is taken over.
1. Every progress document gains the new entries **next to** the old keys (a reader of the old snapshot still sees them),
   `stageTemplateVersion` and the archive. An existing new key is never overwritten; a converted document is returned as is.
2. The snapshot switches to the condensed set (only by the lock holder; the lock leaves with it).
3. The documents are listed again: any that appeared meanwhile are converted, then the old keys leave `stages`.
4. One `project.template.condense` audit (students, stages before / after).

Storage writes use `mutateIfChanged` (ETag CAS; a no-op callback writes nothing).

### Safety

- **Writers** (`updateStudentProgress`, `selfReportStages`, before and inside the CAS) refuse with `StorageConflictError`
  (503, retryable) while a fresh lock is held, or when the document was converted to a newer set than the snapshot the
  write was checked against. No write ever lands on a stage that is about to disappear.
- **A failed conversion** releases its lock at once and the request is served on the old set (logged
  `project.condense.failed`); the next access completes it (pass 1 is idempotent).
- **Student reads never write** (R33 B2): the student sees the class as it **will be** after the conversion, computed in
  memory by the same rules (`condensedView`). The stored conversion happens on the next teacher read or write.
- 794589 classes still on template v1 **with progress** stay as they are (the existing v1 → v2 policy only upgrades
  progress-free classes); they are not converted by P7.

## UI

- Student portal «مشاريعي»: each stage shows «يشمل: …» under its title (`.eb-sp-stage-items`).
- Teacher profile: the stage details show the description and the conversion note; «اعتماد» approves the merged stage.
- No other UI change: every screen reads the stage set from the class snapshot.

## Tests

| File | What |
|---|---|
| `api/tests/project-condense-p7.test.js` (21) | the sets (counts, every old active stage merged exactly once, weight = count); the pure rules; plan settings / required / own stages / collision; grade preserved for a fully approved group; class conversion idempotent with archive and one audit; archived untouched; fresh lock → old set and 503 writes; stale lock taken over; failed conversion releases the lock and the next read completes it; a document appearing during the conversion is converted by the sweep; writer guard; collision skipped once; the student read shows the converted class without writing; 794589 v2 → v3, v1 with progress untouched |
| `src/projects/ProjectCondensed.p7.test.tsx` (2) | over the real handlers: the student sees only BK… with «يشمل: …», a partly done merge not approved, nothing written; the teacher profile shows BK01 ready with the conversion note and «اعتماد» approves it, the old entry archived |
| `scripts/check-project-condensed-browser-p7.mjs` | real Chromium on the production build at 390 / 1024 / 1440 px (see below) |

### Fail-first (baseline `69a6705b`)

- `project-condense-p7.test.js`: the file fails to import (no `condense.js`). With that import stubbed, **17 of 18** fail on
  assertions (for example `expected { schemaVersion: 1, … } to match object { templateVersion: 2 }`, `expected 200 to be 503`,
  `expected [ 'B01', … ] to include 'BK01'`). The one that passes, «an archived class is never converted», is a **pin**.
- `ProjectCondensed.p7.test.tsx`: **2 of 2** fail (`expected [ 'B01', 'B02', 'B03', 'B08', …(12) ] to deeply equal [ 'B01', 'B02',
  'B03', 'B04', …(16) ]`: the old list is shown; `expected null to be truthy`: there is no BK01 row).
- The browser gate on the **baseline UI build** fails exactly on the item list at all three widths («missing / wrong item list»).

### Tests updated deliberately (they encoded the old stage ids, titles or counts)

- API: `project-794589-template.test.js` and `project-794589-v2-integration.test.js` read the pre-P7 v2 template from
  `api/tests/fixtures/project-templates-pre-p7/` (copied byte-for-byte from `main`); `registry.test.js`,
  `snapshot-upgrade.test.js`, `engine.test.js`, `project-evaluation-9b`, `project-performance` (6.375 / 7.5),
  `phase8d-integration`, `teacher-project-evaluation-9c`, `student-dashboard-strength`, `achievement-events` use the new ids.
- R33 (`legacy-794589-convergence-r33`): the golden was regenerated. The seeds are byte-identical to `main`'s; no status
  code changed; student routes still write nothing; the legacy-vs-generic mismatch set is identical before and after;
  every difference inspected is the conversion (c1 v2 → v3 with one condense audit; a progress-free class upgraded to v3;
  a v1 class with progress untouched). The B-section invariants now expect the conversion writes where the class converts.
- UI: `ProjectStudentDetail.8c`, `projectEvaluation.9b` (BK0x / AC01 / VS02 / PT01), `ProjectScoreGrid.p4` (the grid opens
  the first book group with three stages), `StudentProjectOneTap.p3` (groups by their new titles; the four-stage group check
  uses the Access group), `ProjectSafety.p1s` (the stored weight is the template's).
- Browser gates P3 and P4 pick the first group with enough stages (the condensed first group has one); both pass on the head.

## Mutation proof

Runner: hash-verified apply / restore per mutant (tree clean after the campaign). 20 mutants, **20 KILLED** (4 survived the
first round and were killed by the tests added for them).

| Id | Planted defect | Result | Killed by |
|---|---|---|---|
| Q01 | a partly done merge is approved automatically | KILLED | partly done (2 of 3 approved) → «بانتظار الاعتماد» |
| Q02 | a partial set of scores is averaged as if complete | KILLED | all approved, one unscored → approved without a score |
| Q03 | the teacher's stage weights are ignored | KILLED | the plan respects the teacher's settings |
| Q04 | the teacher's deactivated stages count | KILLED | the plan respects the teacher's settings |
| Q05 | a student's own marks become teacher approvals | KILLED | the student's own unconfirmed marks stay the student's own |
| Q06 | a write made under the new set is overwritten | KILLED (round 2) | a document is converted once |
| Q07 | old entries are not archived | KILLED | the first read converts…; the teacher profile UI test |
| Q08 | a converted document is converted again | KILLED (round 2) | a document is converted once |
| Q09 | a fresh lock held by another request is ignored | KILLED | while another request holds a fresh conversion lock… |
| Q10 | writes land while the class converts | KILLED | while another request holds a fresh conversion lock… |
| Q11 | an old-set write lands on a converted document | KILLED | a write never lands on a document converted to a newer set… |
| Q12 | a failed conversion keeps its lock | KILLED | a conversion that fails mid-way releases its lock |
| Q13 | a failed conversion fails the read | KILLED | a conversion that fails mid-way releases its lock |
| Q14 | archived classes are converted | KILLED | an archived class is never converted |
| Q15 | a colliding own stage is overwritten | KILLED | a colliding id makes the class skip conversion |
| Q16 | the student sees the old set | KILLED | the student's read shows the converted class; the student UI test |
| Q17 | old keys stay in the progress documents | KILLED | the first read converts the class… |
| Q18 | the student panel hides the merged items | KILLED | the student UI test |
| Q19 | documents created during the conversion are not converted | KILLED (round 2) | a progress document that appears while the class converts… |
| Q20 | an optional old stage makes the merged one optional | KILLED (round 2) | a merged stage is required when any of its old stages is |

## Real-browser gate (`scripts/check-project-condensed-browser-p7.mjs`)

Production build + the real API in process; one class on the old 899373 set, one student per viewport with B01 approved
(90), B02 ready and B04–B07 approved (80). At 390 (touch) / 1024 / 1440 px: only BK01–BK07 listed, every stage with its
«يشمل: …», BK02 approved and BK01 not, the student read writes nothing, no horizontal overflow, axe (WCAG 2.1 A/AA) without
a serious or critical violation. Then one teacher read converts the class: snapshot v2 without a lock, BK01 ready with the
conversion note, BK02 approved with 80, old entries archived and gone, one audit, a second read changes nothing; the student
page after the conversion lists the same stages. **Passed** on the head. Output goes to `.harness-p7/` (ignored).

## Known limits

- A 794589 class still on template v1 with progress keeps its old set (unchanged policy); converting it needs an owner decision.
- The P6 branch (open PR) has tests and a browser gate that use old 899373 ids; whichever of P6 / P7 merges second
  reconciles them with a normal merge and runs the full validation again.
- Observed, not changed (it is identical on `main`): at 1440 px the student portal's project card header is squeezed into a
  narrow column (the project title wraps one character per line).
