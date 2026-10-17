#!/usr/bin/env node
// Phase L (المواد التعليمية) — mutation campaigns for the learning-materials invariants (AGENTS.md §9). Same engine and rules as
// scripts/mutate-21h.mjs: each mutant plants ONE deliberate defect (an exact, unique text replacement), runs the focused Vitest files
// that guard it, and is KILLED only if a test fails because of it. A timeout is reported as TIMEOUT (never as killed). Every mutated
// file is restored byte-for-byte and hash-verified after each mutant — also when the run throws or the process is interrupted.
//
//   node scripts/mutate-l.mjs <campaign> [ids]     campaigns: l0, … (see CAMPAIGNS below); ids = comma-separated mutant ids to
//                                                  re-run in isolation (e.g. a TIMEOUT, or a survivor after its test was fixed)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");

const PAGE = "src/learning/LearningMaterialsPage.tsx", READER = "src/learning/reader/LearningReader.tsx";
const COUNT = "src/learning/arabicCount.ts", PANEL = "src/students/ClassLearningMaterialsPanel.tsx";
const L0_PAGE = ["src/learning/LearningMaterialsPage.l0.test.tsx", "src/learning/LearningMaterialsPage.test.tsx", "src/learning/courseHomePremium.21el1b.review.test.tsx"];
const L0_READER = ["src/learning/reader/LearningReader.l2a.21e.test.tsx", "src/learning/reader/LearningReader.presentation.test.tsx"];
const L0_COUNT = ["src/students/ClassLearningMaterialsPanel.counts.l0.test.tsx"];
const RENDERER = "src/learning/reader/LearningPageRenderer.tsx", SWIPE = "src/learning/reader/useReaderSwipe.ts", SETTINGS = "src/learning/reader/readingSettings.ts";
const UNIT = "src/learning/reader/UnitContents.tsx", L1CSS = "src/learning/reader/reader-enterprise-l1.css";
const L1 = ["src/learning/reader/LearningReader.l1.test.tsx", "src/learning/reader/reader.l1.guards.test.ts"];
const ROUTE = "src/learning/learningRoute.ts", APP = "src/App.tsx", STUDENT_LIST = "src/student/StudentLearningMaterials.tsx", PORTAL = "src/StudentPortal.tsx";
const L2 = ["src/learning/LearningMaterialsPage.l2.test.tsx", "src/student/StudentLearningMaterials.l2.test.tsx"];
const L2_APP = ["src/App.learningRoute.l2.test.tsx"], L2_PORTAL = ["src/StudentPortal.learningMaterials.test.tsx"];
const PROG_FN = "api/src/functions/learning-progress.js", PROG_LIB = "api/src/lib/learning-progress.js", PAGE_INDEX = "api/src/data/learning-pages/791381.json";
const STUDENT_READER = "src/student/StudentReader.tsx";
const L3_API = ["api/tests/learning-progress-l3.test.js"], L3_UI = ["src/student/StudentReader.progress.l3.test.tsx"];
const L3_TEACHER = ["src/learning/LearningMaterialsPage.l3.test.tsx"], L3_SYNC = ["src/learning/progress/pageIndex.sync.test.ts"];
const CLASSP_FN = "api/src/functions/learning-class-progress.js", CR_PANEL = "src/learning/classReading/ClassReadingPanel.tsx";
const L4_API = ["api/tests/learning-class-progress-l4.test.js"], L4_UI = ["src/learning/classReading/ClassReadingPanel.l4.test.tsx"];
const L4_PAGE = ["src/learning/LearningMaterialsPage.l4.test.tsx"];
const ANN_FN = "api/src/functions/learning-annotations.js", ANN_LIB = "api/src/lib/learning-annotations.js";
const ANN_UI = "src/learning/annotations/ReaderAnnotations.tsx", ANN_HOOK = "src/learning/annotations/useReaderAnnotations.ts", ANN_RANGES = "src/learning/annotations/highlightRanges.ts";
const RWT = "src/learning/training/LearningReaderWithTraining.tsx";
const L5_API = ["api/tests/learning-annotations-l5.test.js"], L5_UI = ["src/learning/annotations/ReaderAnnotations.l5.test.tsx"];
const L5_STUDENT = ["src/student/StudentReader.annotations.l5.test.tsx"];
const LC_FN = "api/src/functions/learning-content.js", LC_SRC = "src/learning/content/moduleBodySource.server.ts", GUARD = "scripts/check-bundle-budget.mjs";
const L6A_API = ["api/tests/learning-content-l6a.test.js"], L6A_SRC = ["src/learning/content/moduleBodySource.server.l6a.test.ts"];
const L6A_HOSTS = ["src/learning/contentHosts.l6a.test.tsx"], L6A_E2E = ["src/learning/reader/serverContent.l6a.test.tsx"];
const L6A_GUARD = ["scripts/check-bundle-budget.l6a.test.mjs"], L6A_SYNC = ["src/learning/content/contentData.sync.test.ts"];
const CONTENT_DATA = "api/src/data/learning-content/791381/791381-m01.json";
export const CAMPAIGNS = {
  l6a: [
    { id: "L6A-M1", what: "a student receives a module hidden from the class (or of a course not attached)", file: LC_FN,
      find: "if (!classroom || !classCanSeeLearningModule(classroom, courseId, moduleId)) return UNAVAILABLE;", replace: "if (!classroom) return UNAVAILABLE;", tests: [...L6A_API, ...L6A_E2E] },
    { id: "L6A-M2", what: "an archived class still reads", file: LC_FN,
      find: "      if (classroom && normalizeClassStatus(classroom) === \"archived\") return ARCHIVED;\n", replace: "", tests: L6A_API },
    { id: "L6A-M3", what: "an unauthenticated caller is not refused as such", file: LC_FN,
      find: "      if (!sess.ok) return sess.response;\n", replace: "", tests: L6A_API },
    { id: "L6A-M4", what: "the token's class claim decides instead of the persisted class", file: LC_FN,
      find: "const classId = String(sess.student?.classId || \"\").trim();", replace: "const classId = String(sess.user?.classId || \"\").trim();", tests: L6A_API },
    { id: "L6A-M5", what: "a 304 is answered before the gate", file: LC_FN,
      find: "    const builder = (deps.requireBuilderAuth || requireBuilderAuth)(request);", replace: "    { const early = loadModuleBody(courseId, moduleId); if (early && String(request.headers?.get?.(\"if-none-match\") || \"\") === early.etag) return { status: 304, headers: { ETag: early.etag } }; }\n    const builder = (deps.requireBuilderAuth || requireBuilderAuth)(request);", tests: L6A_API },
    { id: "L6A-M6", what: "the body is cacheable without revalidation", file: LC_FN,
      find: "\"Cache-Control\": \"private, no-cache\"", replace: "\"Cache-Control\": \"public, max-age=3600\"", tests: L6A_API },
    { id: "L6A-M7", what: "a teacher is treated as a student", file: LC_FN,
      find: "    if (!builder.ok) {", replace: "    if (true) {", tests: L6A_API },
    { id: "L6A-M8", what: "the student's Reader asks without the student's session", file: STUDENT_READER,
      find: "createContentApi(studentTrainingHeaders(token))", replace: "createContentApi()", tests: L6A_HOSTS },
    { id: "L6A-M9", what: "the teacher's book page asks without the teacher's session", file: PAGE,
      find: "(token ? createContentApi(teacherTrainingHeaders(token)) : registryContentApi)", replace: "registryContentApi", tests: L6A_HOSTS },
    { id: "L6A-M10", what: "the transport accepts a foreign or malformed body", file: LC_SRC,
      find: "if (!r.ok || j?.ok !== true || !isModuleFor(j.module, moduleId))", replace: "if (!r.ok || j?.ok !== true)", tests: L6A_SRC },
    { id: "L6A-M11", what: "the transport drops the session headers", file: LC_SRC,
      find: "{ headers, cache: \"no-cache\" }", replace: "{ cache: \"no-cache\" }", tests: [...L6A_SRC, ...L6A_E2E] },
    { id: "L6A-M12", what: "the transport reads from the HTTP cache without revalidating", file: LC_SRC,
      find: "cache: \"no-cache\" }", replace: "cache: \"force-cache\" }", tests: L6A_SRC },
    { id: "L6A-M13", what: "the build guard no longer recognises a module body", file: GUARD,
      find: "const MODULE_BODY_SIGNATURE = /[`\"']m\\d\\d-l\\d\\d-p\\d\\d-[A-Za-z]/;", replace: "const MODULE_BODY_SIGNATURE = /\"m\\d\\d-l\\d\\d-p\\d\\d-[A-Za-z]/;", tests: L6A_GUARD },
    { id: "L6A-M14", what: "the served data drifts from the authored content", file: CONTENT_DATA,
      find: "{\"id\":\"791381-m01\",\"title\":\"", replace: "{\"id\":\"791381-m01\",\"title\":\"X", tests: L6A_SYNC },
  ],
  l5: [
    { id: "L5-M1", what: "a page the book does not have is accepted", file: ANN_FN,
      find: "      if (!moduleId) return BAD_REQUEST;                                  // not a page of this book\n", replace: "", tests: L5_API },
    { id: "L5-M2", what: "a page of an unpublished unit is annotated", file: ANN_FN,
      find: "      if (!canSee(moduleId)) return UNAVAILABLE;                           // its module is not published to the class\n", replace: "", tests: L5_API },
    { id: "L5-M3", what: "an archived class still writes annotations", file: ANN_FN,
      find: "    if (classroom && normalizeClassStatus(classroom) === \"archived\") return ARCHIVED;\n", replace: "", tests: L5_API },
    { id: "L5-M4", what: "the token's class claim decides instead of the persisted class", file: ANN_FN,
      find: "const classId = String(sess.student?.classId || \"\").trim();", replace: "const classId = String(sess.user?.classId || \"\").trim();", tests: L5_API },
    { id: "L5-M5", what: "a change that alters nothing is written anyway", file: ANN_FN,
      find: "      if (!probe.changed) {", replace: "      if (false) {", tests: L5_API },
    { id: "L5-M6", what: "an over-limit change is not reported as a limit", file: ANN_FN,
      find: "      if (probe.error === \"limit\") return TOO_LARGE;\n", replace: "", tests: L5_API },
    { id: "L5-M7", what: "a bound reached by another device meanwhile is overwritten", file: ANN_FN,
      find: "          if (r.error) { failure = r.error; return (finalDoc = normalizeAnnotationsDoc(fresh)); }", replace: "          if (false) { failure = r.error; return (finalDoc = normalizeAnnotationsDoc(fresh)); }", tests: L5_API },
    { id: "L5-M8", what: "a repeated bookmark moves its time", file: ANN_LIB,
      find: "    if (change.on === has(c.bookmarks, pageId)) return { doc, changed: false };\n", replace: "", tests: L5_API },
    { id: "L5-M9", what: "a note over NOTE_MAX is stored", file: ANN_LIB,
      find: "    if (text.length > LIMITS.NOTE_MAX) return { error: \"limit\" };\n", replace: "", tests: L5_API },
    { id: "L5-M10", what: "the per-page highlight bound is dropped", file: ANN_LIB,
      find: "if (list.length >= LIMITS.HIGHLIGHTS_PER_PAGE || highlightCount(c) >= LIMITS.HIGHLIGHTS_PER_COURSE)", replace: "if (highlightCount(c) >= LIMITS.HIGHLIGHTS_PER_COURSE)", tests: L5_API },
    { id: "L5-M11", what: "the per-course highlight bound is dropped", file: ANN_LIB,
      find: "if (list.length >= LIMITS.HIGHLIGHTS_PER_PAGE || highlightCount(c) >= LIMITS.HIGHLIGHTS_PER_COURSE)", replace: "if (list.length >= LIMITS.HIGHLIGHTS_PER_PAGE)", tests: L5_API },
    { id: "L5-M12", what: "the same quote is highlighted twice", file: ANN_LIB,
      find: "    if (list.some(h => h.quote === quote)) return { doc, changed: false };\n", replace: "", tests: L5_API },
    { id: "L5-M13", what: "the view shows units the class can no longer see", file: ANN_LIB,
      find: "    if (!canSee(moduleId)) continue;\n", replace: "", tests: L5_API },
    { id: "L5-M14", what: "a stored oversize note survives normalisation", file: ANN_LIB,
      find: "text && text.length <= LIMITS.NOTE_MAX && isIso(n.updatedAt)", replace: "text && isIso(n.updatedAt)", tests: L5_API },
    { id: "L5-M15", what: "a teacher preview gets the annotations client", file: RWT,
      find: "annotations={actor === \"student\" ? annotations : null}", replace: "annotations={annotations}", tests: L5_UI },
    { id: "L5-M16", what: "the student's Reader is not given its annotations client", file: STUDENT_READER,
      find: "      annotations={annotations}\n", replace: "", tests: L5_STUDENT },
    { id: "L5-M17", what: "a selection outside the page offers «تظليل»", file: ANN_UI,
      find: "if (!sel.anchorNode || !sel.focusNode || !article.contains(sel.anchorNode) || !article.contains(sel.focusNode)) return null;", replace: "if (!sel.anchorNode || !sel.focusNode) return null;", tests: L5_UI },
    { id: "L5-M18", what: "a passage over QUOTE_MAX can be highlighted", file: ANN_UI,
      find: "const tooLong = sel.quote.length > QUOTE_MAX", replace: "const tooLong = false", tests: L5_UI },
    { id: "L5-M19", what: "a note over NOTE_MAX can be saved", file: ANN_UI,
      find: "disabled={busy || over || !changed}", replace: "disabled={busy || !changed}", tests: L5_UI },
    { id: "L5-M20", what: "a refused write is silent", file: ANN_HOOK,
      find: "      setError(e instanceof Error && e.message ? e.message : \"تعذر حفظ التغيير الآن. حاول مرة أخرى.\");\n", replace: "", tests: L5_UI },
    { id: "L5-M21", what: "the page's highlights are never painted", file: ANN_RANGES,
      find: "if (ranges.length) registry.set(HIGHLIGHT_NAME, new HighlightCtor(...ranges)); else registry.delete(HIGHLIGHT_NAME);", replace: "registry.delete(HIGHLIGHT_NAME);", tests: L5_UI },
    { id: "L5-M22", what: "a block boundary is not a space (a quote across paragraphs is lost)", file: ANN_RANGES,
      find: "    if (lastBlock && block !== lastBlock && !space) { chars.push(\" \"); at.push([text, 0]); space = true; }\n", replace: "", tests: L5_UI },
    { id: "L5-M23", what: "text inside controls is matched as page text", file: ANN_RANGES,
      find: "    if (text.parentElement?.closest(SKIP)) continue;\n", replace: "", tests: L5_UI },
  ],
  l4: [
    { id: "L4-M1", what: "another teacher's class is reported (tenancy guard dropped)", file: CLASSP_FN,
      find: "    if (!classroom || !canAccessDocument(classroom, tenantOf(auth.user))) return NOT_FOUND;\n", replace: "    if (!classroom) return NOT_FOUND;\n", tests: L4_API },
    { id: "L4-M2", what: "a class without the book is reported", file: CLASSP_FN,
      find: "    if (!classHasLearningCourse(classroom, courseId)) return NOT_FOUND;\n", replace: "", tests: L4_API },
    { id: "L4-M3", what: "an unauthenticated caller is answered", file: CLASSP_FN,
      find: "    if (!auth.ok) return auth.response;\n", replace: "", tests: L4_API },
    { id: "L4-M4", what: "an inactive student is counted", file: CLASSP_FN,
      find: "isStudentClassMember(u, classId) && u.active !== false", replace: "isStudentClassMember(u, classId)", tests: L4_API },
    { id: "L4-M5", what: "a moved / archived student is counted (membership re-check dropped)", file: CLASSP_FN,
      find: "isStudentClassMember(u, classId) && u.active !== false", replace: "u && u.active !== false", tests: L4_API },
    { id: "L4-M6", what: "units hidden from the class are reported", file: CLASSP_FN,
      find: "listLearningModules(courseId).filter(m => visibleIds.has(m.moduleId))", replace: "listLearningModules(courseId)", tests: L4_API },
    { id: "L4-M7", what: "«completed» counts every student who started", file: PROG_LIB,
      find: "reads.filter(n => n >= total).length", replace: "reads.filter(n => n > 0).length", tests: L4_API },
    { id: "L4-M8", what: "the unit average ignores the class size", file: PROG_LIB,
      find: "(rows.length * total)) * 100)", replace: "(total)) * 100)", tests: L4_API },
    { id: "L4-M9", what: "an empty class divides by zero (NaN average)", file: PROG_LIB,
      find: "rows.length ? Math.round(", replace: "true ? Math.round(", tests: L4_API },
    { id: "L4-M10", what: "a last reading in a hidden unit still shows as the last reading", file: PROG_LIB,
      find: "lastReadAt: read > 0 && c ? c.lastReadAt : null", replace: "lastReadAt: c ? c.lastReadAt : null", tests: L4_API },
    { id: "L4-M11", what: "archived classes are offered", file: CR_PANEL,
      find: "base.value.classes.filter(c => normalizeClassStatus(c) === \"active\")", replace: "base.value.classes.filter(() => true)", tests: L4_UI },
    { id: "L4-M12", what: "hiding a unit is not confirmed", file: CR_PANEL,
      find: "if (!show && !(await confirm(", replace: "if (false && !(await confirm(", tests: L4_UI },
    { id: "L4-M13", what: "units are listed and sent in catalog order, not content order", file: CR_PANEL,
      find: "?? []).slice().sort((a, b) => a.order - b.order);", replace: "?? []).slice();", tests: L4_UI },
    { id: "L4-M14", what: "the published list is sent in click order", file: CR_PANEL,
      find: "const next = units.map(u => u.moduleId).filter(id => wanted.has(id));", replace: "const next = [...wanted];", tests: L4_UI },
    { id: "L4-M15", what: "a late answer for the class the teacher left is shown", file: CR_PANEL,
      find: "      if (active) setReading({ state: \"ready\", value });\n", replace: "      setReading({ state: \"ready\", value });\n", tests: L4_UI },
    { id: "L4-M16", what: "the panel requests classes before the teacher opens it", file: CR_PANEL,
      find: "    if (!open) return;\n    let active = true;\n    Promise.all(", replace: "    let active = true;\n    Promise.all(", tests: L4_UI },
    { id: "L4-M17", what: "a student exactly INACTIVE_DAYS idle is not listed as stopped", file: CR_PANEL,
      find: ">= INACTIVE_DAYS * DAY_MS", replace: "> INACTIVE_DAYS * DAY_MS", tests: L4_UI },
    { id: "L4-M18", what: "a failed publish still updates the class", file: CR_PANEL,
      find: "      const materials = await client.publish(classroom.classId, courseId, next);\n      commit(classroom.classId, materials);\n",
      replace: "      commit(classroom.classId, [{ courseId, visibleModuleIds: next }]);\n      const materials = await client.publish(classroom.classId, courseId, next);\n      commit(classroom.classId, materials);\n", tests: L4_UI },
    { id: "L4-M19", what: "the class panel is offered without a teacher session", file: PAGE,
      find: "(token ? createClassReadingClient(teacherTrainingHeaders(token)) : null)", replace: "createClassReadingClient(teacherTrainingHeaders(token ?? \"\"))", tests: L4_PAGE },
  ],
  l3: [
    { id: "L3-M1", what: "a page the book does not have is accepted", file: PROG_FN,
      find: "      if (!moduleId) return BAD_REQUEST;                                  // not a page of this book\n", replace: "", tests: L3_API },
    { id: "L3-M2", what: "a page of an unpublished unit is recorded", file: PROG_FN,
      find: "      if (!canSee(moduleId)) return UNAVAILABLE;                           // its module is not published to the class\n", replace: "", tests: L3_API },
    { id: "L3-M3", what: "an archived class still records progress", file: PROG_FN,
      find: "    if (classroom && normalizeClassStatus(classroom) === \"archived\") return ARCHIVED;\n", replace: "", tests: L3_API },
    { id: "L3-M4", what: "the token's class claim decides instead of the persisted class", file: PROG_FN,
      find: "const classId = String(sess.student?.classId || \"\").trim();", replace: "const classId = String(sess.user?.classId || \"\").trim();", tests: L3_API },
    { id: "L3-M5", what: "the view shows units the class can no longer see", file: PROG_LIB,
      find: "    if (!canSee(moduleId)) continue;\n", replace: "", tests: L3_API },
    { id: "L3-M6", what: "the last page of a hidden unit leaks into the view", file: PROG_LIB,
      find: "const lastVisible = !!lastModule && canSee(lastModule);", replace: "const lastVisible = !!lastModule;", tests: L3_API },
    { id: "L3-M7", what: "a page's first-read time moves on every visit", file: PROG_LIB,
      find: "  if (!Object.prototype.hasOwnProperty.call(c.pages, pageId)) c.pages[pageId] = now;", replace: "  c.pages[pageId] = now;", tests: L3_API },
    { id: "L3-M8", what: "a repeat of the current page writes again", file: PROG_LIB,
      find: "  return !!c && c.lastPageId === pageId && Object.prototype.hasOwnProperty.call(c.pages, pageId);", replace: "  return false;", tests: L3_API },
    { id: "L3-M9", what: "opening the book ignores the server's last page", file: STUDENT_READER,
      find: "      initialPageId={initialPageId ?? resume.pageId}", replace: "      initialPageId={initialPageId}", tests: L3_UI },
    { id: "L3-M10", what: "the server's read pages are not merged into the index marks", file: STUDENT_READER,
      find: "      if (p) mergeVisited(visitedScope, courseId, p.visited);\n", replace: "", tests: L3_UI },
    { id: "L3-M11", what: "a slow progress read blocks the book forever", file: STUDENT_READER,
      find: "    const timer = window.setTimeout(() => { if (alive) setResume(r => (r.ready ? r : { ready: true })); }, RESUME_WAIT_MS);", replace: "    const timer = 0;", tests: L3_UI },
    { id: "L3-M12", what: "every page passed through is reported (no dwell)", file: STUDENT_READER,
      find: "    dwellRef.current = window.setTimeout(() => { void progress.visit(courseId, pageId); }, READ_DWELL_MS);", replace: "    void progress.visit(courseId, pageId);", tests: L3_UI },
    { id: "L3-M13", what: "the teacher preview loses the study client", file: PAGE,
      find: "            study={study}\n", replace: "", tests: L3_TEACHER },
    { id: "L3-M14", what: "the committed page index drifts from the book", file: PAGE_INDEX,
      find: "      \"791381-m02-l01-p02\",\n", replace: "", tests: L3_SYNC }
  ],
  l2: [
    { id: "L2-M1", what: "a view change is not a history entry (Back leaves the page)", file: PAGE,
      find: "writeLearningRoute(routeFromView(next), \"push\");", replace: "writeLearningRoute(routeFromView(next), \"replace\");", tests: L2 },
    { id: "L2-M2", what: "every page turn floods the history", file: PAGE,
      find: "writeLearningRoute({ kind: \"reader\", courseId, pageId }, \"replace\")", replace: "writeLearningRoute({ kind: \"reader\", courseId, pageId }, \"push\")", tests: L2 },
    { id: "L2-M3", what: "Back / Forward are ignored", file: PAGE,
      find: "    window.addEventListener(\"popstate\", onPop);\n", replace: "", tests: L2 },
    { id: "L2-M4", what: "the fragment outlives the page", file: PAGE,
      find: "return () => { window.removeEventListener(\"popstate\", onPop); clearLearningRoute(); };", replace: "return () => { window.removeEventListener(\"popstate\", onPop); };", tests: L2 },
    { id: "L2-M5", what: "an unknown book in a link opens a broken overview", file: PAGE,
      find: "  if (!course || course.status !== \"available\") return { kind: \"library\" };\n", replace: "  if (!course) return { kind: \"course\", courseId: route.courseId };\n", tests: L2 },
    { id: "L2-M6", what: "the parser accepts trailing segments", file: ROUTE,
      find: "if (!ID.test(courseId) || rest.length > 0) return null;", replace: "if (!ID.test(courseId)) return null;", tests: L2 },
    { id: "L2-M7", what: "the parser accepts any verb as «read»", file: ROUTE,
      find: "  if (verb !== \"read\") return null;\n", replace: "", tests: L2 },
    { id: "L2-M8", what: "the parser accepts a malformed page id", file: ROUTE,
      find: "return ID.test(pageId) ? { kind: \"reader\", courseId, pageId } : null;", replace: "return { kind: \"reader\", courseId, pageId };", tests: L2 },
    { id: "L2-M9", what: "sign-in ignores the Learning Materials link", file: APP,
      find: "        isLearningLocation() ? \"learning\" : \"builder\"\n", replace: "        \"builder\"\n", tests: L2_APP },
    { id: "L2-M10", what: "the Reader ignores the chosen unit", file: READER,
      find: "const moduleStart = initialModuleRef.current ? pages.find(p => p.module.id === initialModuleRef.current)?.page.id : undefined;", replace: "const moduleStart = undefined;", tests: L2 },
    { id: "L2-M11", what: "the unit wins over a valid page (a training return jumps away)", file: READER,
      find: "wanted && findPage(manifest, wanted) ? wanted : moduleStart ?? (pages.length > 0 ? pages[0].page.id : \"\")", replace: "moduleStart ?? (wanted && findPage(manifest, wanted) ? wanted : pages.length > 0 ? pages[0].page.id : \"\")", tests: L2 },
    { id: "L2-M12", what: "a unit hidden since load still opens", file: STUDENT_LIST,
      find: "    if (moduleId && !current.modules.some(m => m.moduleId === moduleId)) { setError(\"لم تعد هذه الوحدة متاحة لصفك حاليًا.\"); return; }\n", replace: "", tests: L2 },
    { id: "L2-M13", what: "the portal drops the chosen unit", file: PORTAL,
      find: "setReaderInitialModuleId(moduleId); setReaderCourse(course);", replace: "setReaderInitialModuleId(undefined); setReaderCourse(course);", tests: L2_PORTAL }
  ],
  l1: [
    { id: "L1-M1", what: "the index docks below 1280px again", file: READER,
      find: "const dockable = wide && !focusMode && !presentation;", replace: "const dockable = !focusMode && !presentation;", tests: L1 },
    { id: "L1-M2", what: "focus mode keeps the docked index", file: READER,
      find: "const dockable = wide && !focusMode && !presentation;", replace: "const dockable = wide && !presentation;", tests: L1 },
    { id: "L1-M3", what: "the docked / folded choice is not remembered", file: READER,
      find: "setTocDocked(docked => { saveTocDocked(!docked); return !docked; });", replace: "setTocDocked(docked => !docked);", tests: L1 },
    { id: "L1-M4", what: "the focus flag outlives focus mode and the Reader", file: READER,
      find: "    return () => html.removeAttribute(\"data-eb-reading-focus\");", replace: "    return () => {};", tests: L1 },
    { id: "L1-M5", what: "Escape no longer leaves focus mode", file: READER,
      find: "      if (e.key === \"Escape\" && focusMode && !presentation) { e.preventDefault(); setFocusMode(false); return; }\n", replace: "", tests: L1 },
    { id: "L1-M6", what: "«التالي» loses the next page's title as its description", file: READER,
      find: "aria-describedby={next && !presentation ? \"learning-reader-next-title\" : undefined}", replace: "aria-describedby={undefined}", tests: L1 },
    { id: "L1-M7", what: "the «المزيد» menu stays open after an action", file: READER,
      find: "onClick={e => { if ((e.target as Element).closest(\"button\")) setMoreOpen(false); }}", replace: "", tests: L1 },
    { id: "L1-M8", what: "the page kicker names the book number again", file: RENDERER,
      find: "<p className=\"learning-reader-kicker\">{header.moduleTitle}</p>", replace: "<p className=\"learning-reader-kicker\">كتاب {header.courseId}</p>", tests: L1 },
    { id: "L1-M9", what: "the source line is a bare line of numbers again", file: RENDERER,
      find: "        {header.source && <SourceInfo source={header.source} />}\n      </header>", replace: "        {header.source && <SourceLine source={header.source} />}\n      </header>", tests: L1 },
    { id: "L1-M10", what: "the swipe direction is inverted (LTR habit)", file: SWIPE,
      find: "if (dx > 0) onNext(); else onPrevious();", replace: "if (dx < 0) onNext(); else onPrevious();", tests: L1 },
    { id: "L1-M11", what: "a swipe that starts on a control turns the page", file: SWIPE,
      find: "  if (owner && root.contains(owner)) return true;", replace: "", tests: L1 },
    { id: "L1-M12", what: "a vertical scroll counts as a swipe", file: SWIPE,
      find: " || Math.abs(dx) < DOMINANCE * Math.abs(dy)", replace: "", tests: L1 },
    { id: "L1-M13", what: "the «داكن» choice is forgotten on reload", file: SETTINGS,
      find: "v.theme === \"sepia\" || v.theme === \"light\" || v.theme === \"dark\"", replace: "v.theme === \"sepia\" || v.theme === \"light\"", tests: L1 },
    { id: "L1-M14", what: "the unit contents list the opener lesson itself", file: UNIT,
      find: ".filter(l => l.id !== currentLessonId && l.pages.length > 0)", replace: ".filter(l => l.pages.length > 0)", tests: L1 },
    { id: "L1-M15", what: "focus mode hides the whole page column, not only its header", file: L1CSS,
      find: "html[data-eb-reading-focus] .eb-shell-main > .eb-page-header { display: none; }", replace: "html[data-eb-reading-focus] .eb-shell-main { display: none; }", tests: L1 },
    { id: "L1-M16", what: "the folded index still shows its desktop column", file: L1CSS,
      find: "  .learning-reader:not(.is-presentation)[data-toc=\"drawer\"] .learning-reader-sidebar { display: none; }", replace: "", tests: L1 }
  ],
  l0: [
    { id: "L0-M1", what: "the page-less intro is a control again (opens another section's page)", file: PAGE,
      find: "manifestState === \"ready\" && manifest !== null && sectionStats.get(batchId) === null", replace: "false", tests: L0_PAGE },
    { id: "L0-M2", what: "rows are disabled while the details load or after a failure", file: PAGE,
      find: "manifestState === \"ready\" && manifest !== null && sectionStats.get(batchId) === null", replace: "!sectionStats.get(batchId)", tests: L0_PAGE },
    { id: "L0-M3", what: "a failed manifest load is silent again", file: PAGE,
      find: "{manifestState === \"error\" && (", replace: "{false && (", tests: L0_PAGE },
    { id: "L0-M4", what: "the retry does not reload the manifest", file: PAGE,
      find: "setManifestState(\"loading\"); setAttempt(n => n + 1);", replace: "setManifestState(\"loading\");", tests: L0_PAGE },
    { id: "L0-M5", what: "the load has no visible status", file: PAGE,
      find: "{manifestState === \"loading\" && <p", replace: "{false && <p", tests: L0_PAGE },
    { id: "L0-M6", what: "the reader names the book by its number again", file: READER,
      find: "<span className=\"learning-reader-booktitle\">{bookTitle}", replace: "<span className=\"learning-reader-booktitle\">كتاب {courseId}", tests: L0_READER },
    { id: "L0-M7", what: "presentation mode is labelled by the book number", file: READER,
      find: "\"وضع العرض — \" + bookTitle", replace: "\"وضع العرض — كتاب \" + courseId", tests: L0_READER },
    { id: "L0-M8", what: "every count is printed in the plural again", file: COUNT,
      find: "  const phrase = forms[rules.select(n)];", replace: "  const phrase = forms.few;", tests: L0_COUNT },
    { id: "L0-M9", what: "the summary digits lose their emphasis", file: PANEL,
      find: "{number !== null && <strong>{number}</strong>}", replace: "{number}", tests: L0_COUNT }
  ]
};

const name = process.argv[2];
const campaign = CAMPAIGNS[name];
if (!campaign) { console.error("usage: node scripts/mutate-l.mjs <" + Object.keys(CAMPAIGNS).join("|") + ">"); process.exit(2); }

const originals = new Map();
const restoreAll = () => {
  for (const [file, { buf, hash }] of originals) {
    writeFileSync(path.join(root, file), buf);
    if (sha(readFileSync(path.join(root, file))) !== hash) { console.error("RESTORE FAILED for " + file); process.exitCode = 3; }
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { restoreAll(); process.exit(130); });
process.on("exit", restoreAll);

const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const results = [];
for (const m of campaign.filter(x => !only || only.has(x.id))) {
  const abs = path.join(root, m.file);
  if (!originals.has(m.file)) { const buf = readFileSync(abs); originals.set(m.file, { buf, hash: sha(buf) }); }
  const source = originals.get(m.file).buf.toString("utf8");
  const count = source.split(m.find).length - 1;
  if (count !== 1) { results.push({ ...m, verdict: "INVALID (find matched " + count + "×)" }); continue; }
  writeFileSync(abs, source.replace(m.find, m.replace));
  let verdict, killer = "";
  try {
    const run = spawnSync("npx", ["vitest", "run", ...m.tests], { cwd: root, encoding: "utf8", timeout: 600000 });
    if (run.error && run.error.code === "ETIMEDOUT") verdict = "TIMEOUT";
    else if (run.status === 0) verdict = "SURVIVED";
    else {
      const out = (run.stdout || "") + (run.stderr || "");
      const failed = out.match(/FAIL\s+(\S+)\s+>\s+([^\n]+)/);
      verdict = /Tests\s+\d+ failed/.test(out) ? "KILLED" : "ERROR (suite did not run)";
      killer = failed ? failed[1] + " > " + failed[2].trim() : "";
    }
  } finally {
    const { buf, hash } = originals.get(m.file);
    writeFileSync(abs, buf);
    if (sha(readFileSync(abs)) !== hash) { console.error("RESTORE FAILED for " + m.file); process.exit(3); }
  }
  results.push({ ...m, verdict, killer });
  console.log(m.id + " " + verdict + " — " + m.what + (killer ? "\n    killed by: " + killer : ""));
}
// Every mutated file is back to the exact bytes it had before the campaign (hash-verified above); `git status` then shows only what
// was already there before the run (a campaign is run on a committed tree, so it is clean).
const git = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
const status = git.stdout.trim();
console.log("\n" + name + ": " + results.filter(r => r.verdict === "KILLED").length + "/" + results.length + " KILLED; every mutated file restored byte-for-byte (sha256 verified); git status: " + (status ? "\n" + status : "clean"));
if (results.some(r => r.verdict !== "KILLED")) process.exitCode = 1;
