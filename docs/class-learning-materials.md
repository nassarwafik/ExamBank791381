# Class Learning Materials — authority chain

The single path by which a converted book reaches a student. Every arrow is server-side and default-deny; the only
teacher-controlled step is module publication.

```text
Teacher (builder session)
  ↓  POST /api/classrooms  { action: "setLearningCourseModules" | "removeLearningCourse", classId, courseId, moduleIds }
  ↓  ids validated against api/src/lib/learning-materials-registry.js (791381: m01, m02, m07 — content order)
  ↓  CAS write (mutateJsonWithRetry), archived class → 403, audit class.learningMaterials.*
Class document   platform/classes/<classId>.json
  ↓  learningMaterials: [ { courseId, visibleModuleIds } ]        (metadata only; [] = attached, nothing released)
  ↓  read ONLY through api/src/lib/class-learning-materials.js    (normalize · canonical order · unknown ids dropped)
Student persisted document   platform/users/<userId>.json
  ↓  requireActiveStudentSession → student.classId                (never the token's classId, never the browser's)
GET /api/student-learning-materials
  ↓  one class read → lifecycle (archived → 403) → publication ∩ registry → { courseId, title, modules[] }
Allowed module ids (published only; no hidden titles, no hidden count)
  ↓  createRestrictedReaderContentApi(courseId, allowedModuleIds)
  ↓  loadManifest = filterManifestByModuleIds(canonical manifest)  · hasModule = false unless released
  ↓  loadModule rejects before the lazy loader for anything not released
LearningReader (the SAME Reader the teacher uses; exitLabel «العودة إلى موادي التعليمية»)
```

## Invariants

- **Deployment ≠ publication.** Shipping a module body, or registering a new module in the server registry, never
  changes any class's `visibleModuleIds`. The teacher publishes explicitly.
- **Class-level only.** All active members of a class receive the same published modules. No per-student exceptions,
  no page/lesson-level release, no scheduling (later phases if wanted).
- **Independent domain.** `learningMaterials` never reads or writes `programCodes` (projects) or
  `platform/assignments/` (exams).
- **Middle module hidden = absent.** Released `m01 + m07` reads m01's last page → m07's first page. Nothing is shown
  for m02: no placeholder, no «قيد الإعداد», no locked item, no title, no page in the total.
- **Consistency:** next portal load / refresh / course re-open (the open button re-validates). No realtime.
- **Static-asset boundary:** bodies are frontend chunks; access is default-deny through every supported app path,
  not asset-level confidentiality (see `docs/learning-content-architecture.md`).
- **Same gate for trainings.** `GET/POST /api/learning-training` (Learning Practice, T01–T04) reuses this exact
  authority: persisted `classId` → active class → course assigned → the training's `requiredModuleId` published. A
  hidden module hides the training's TITLE too (only the printed label + availability note render). Teachers may
  open every training. See `docs/learning-content-architecture.md` → *Learning Practice*.
- **No reading progress yet** (Phase 6). Answer checking exists only as (a) inline `practice-table` worksheets —
  local, unstored, unscored — and (b) Learning-Practice trainings graded server-side (best score only, Strength
  points, never an assignment record).
