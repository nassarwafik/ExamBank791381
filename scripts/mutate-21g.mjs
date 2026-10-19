#!/usr/bin/env node
// Phase 21G — mutation campaigns for the assignments / teacher-tenancy invariants (AGENTS.md §9). Same engine and rules as
// scripts/mutate-21f.mjs: each mutant plants ONE deliberate defect (an exact, unique text replacement), runs the focused Vitest files
// that guard it, and is KILLED only if a test fails because of it. A timeout is reported as TIMEOUT (never as killed). Every mutated
// file is restored byte-for-byte and hash-verified after each mutant — also when the run throws or the process is interrupted.
//
//   node scripts/mutate-21g.mjs <campaign> [ids]   campaigns: g0, g1, g2, g3, … (see CAMPAIGNS below); ids = comma-separated mutant ids to
//                                                  re-run in isolation (e.g. a TIMEOUT, or a survivor after its test was fixed)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = buf => createHash("sha256").update(buf).digest("hex");

const TEN = ["api/tests/teacher-tenancy-21g0.test.js"];
const BANK = ["api/tests/bank-tenancy-21g0.test.js"];
const CONTENT = ["api/tests/content-tenancy-21g0.test.js"];
const ALL = [...TEN, ...BANK, ...CONTENT];
const DETAILS = ["api/tests/assignment-details-21g0.test.js"];
const LIB = "api/src/lib/teacher-tenancy.js";
const BQ = "api/src/functions/bank-questions.js";
const VIEW = "src/assignments/assignmentsView.ts", CTRL = "src/assignments/useAssignmentsController.ts", COMPOSER = "src/assignments/useAssignmentComposer.ts";
const G1_UNIT = ["src/assignments/assignmentsView.21g1.test.ts", "src/assignments/assignmentsApi.21g1.test.ts"];
const G1_PANEL = ["src/AssignmentsPanel.ux5.test.tsx", "src/AssignmentsPanel.drill.12b.test.tsx", "src/AssignmentsPanel.lifecycle.test.tsx", "src/AssignmentsPanel.export.21e2.test.tsx", "src/AssignmentsPanel.timing5a.test.tsx"];
const CACHE = "api/src/lib/assignment-summary-cache.js", PROG = "api/src/lib/assignment-progress.js", HOME = "src/assignments/assignmentsHome.ts";
const G2_CACHE = ["api/tests/assignment-summary-cache-21g2.test.js"], G2_PROG = ["api/tests/assignment-progress-21g2.test.js"];
const G2_HOME = ["src/assignments/assignmentsHome.21g2.test.ts", "src/AssignmentsPanel.home.21g2.test.tsx"];
const PAGE = "src/assignments/assignmentPage.ts";
const G3_UNIT = ["src/assignments/assignmentPage.21g3.test.ts"], G3_PANEL = ["src/AssignmentsPanel.page.21g3.test.tsx", "src/AssignmentsPanel.ux5.test.tsx", "src/AssignmentsPanel.r7.test.tsx"];
const G4_UNIT = ["src/assignments/gradebookStatus.21g4.test.ts", "src/assignments/questionGrid.21g4.test.ts"], G4_PANEL = ["src/AssignmentsPanel.gradebook.21g4.test.tsx", "src/AssignmentsPanel.ux5.test.tsx", "src/AssignmentsPanel.grading.test.tsx"], G4_API = ["api/tests/assignment-item-grid-21g4.test.js"];
const GBS = "src/assignments/gradebookStatus.ts", ITEM = "api/src/functions/assignment-item-analysis.js";
const G5_API = ["api/tests/results-release-21g5.test.js"], G5_UI = ["src/assignments/resultsRelease.21g5.test.tsx", "src/AssignmentsPanel.grading.21g5.test.tsx"], G5_NAV = ["src/assignments/reviewNav.21g5.test.ts", "src/AssignmentReview.nav.21g5.test.tsx", "src/AssignmentsPanel.grading.21g5.test.tsx"];
const REL = "api/src/lib/results-release.js", SUB = "api/src/functions/student-submission.js", DASH = "api/src/functions/student-dashboard.js", MANAGE = "api/src/functions/manage-assignments.js", REVIEW = "src/AssignmentReview.tsx";
const G6_UNIT = ["src/assignments/assignmentWizard.21g6.test.ts"], G6_PANEL = ["src/AssignmentsPanel.wizard.21g6.test.tsx", "src/AssignmentsPanel.ux5.test.tsx", "src/AssignmentsPanel.lifecycle.test.tsx"];
const WIZ = "src/assignments/assignmentWizard.ts", COMP = "src/assignments/AssignmentComposer.tsx", COMPOSER_HOOK = "src/assignments/useAssignmentComposer.ts";
const G7_API = ["api/tests/assignment-reminders-21g7.test.js"], G7_UI = ["src/reports/xlsx.21g7.test.ts", "src/reports/printReport.21g7.test.ts", "src/AssignmentsPanel.reports.21g7.test.tsx", "src/assignments/a11yGate.21g7.test.tsx"];
const RES = "api/src/functions/assignment-results.js", XLSX = "src/reports/xlsx.ts", PRINT = "src/reports/printReport.ts";
export const CAMPAIGNS = {
  g7: [
    { id: "G7-M1", what: "a student who already submitted is reminded", file: RES,
      find: "if(attempts.length>0||ts.isClosed||ts.availability===\"scheduled\"){notNeeded++;continue}", replace: "if(ts.isClosed||ts.availability===\"scheduled\"){notNeeded++;continue}", tests: G7_API },
    { id: "G7-M2", what: "a closed assignment still reminds", file: RES,
      find: "if(attempts.length>0||ts.isClosed||ts.availability===\"scheduled\")", replace: "if(attempts.length>0||ts.availability===\"scheduled\")", tests: G7_API },
    { id: "G7-M3", what: "reminders repeat the same day (no date in the dedupe key)", file: RES,
      find: "dedupeKey:\"reminder:\"+id+\":\"+u.userId+\":\"+day,", replace: "dedupeKey:\"reminder:\"+id+\":\"+u.userId+\":\"+Date.now(),", tests: G7_API },
    { id: "G7-M4", what: "a draft assignment can remind", file: RES,
      find: "if(normalizeAssignmentStatus(a)!==\"published\")return {status:409,jsonBody:{ok:false,error:\"لا يمكن تذكير", replace: "if(false)return {status:409,jsonBody:{ok:false,error:\"لا يمكن تذكير", tests: G7_API },
    { id: "G7-M5", what: "studentIds is not validated", file: RES,
      find: "if(b.studentIds!==undefined&&(!Array.isArray(b.studentIds)||b.studentIds.some(x=>!SAFE_ID.test(String(x)))))return", replace: "if(false)return", tests: G7_API },
    { id: "G7-M6", what: "a ticked student of ANOTHER class is reminded", file: RES,
      find: "filter(x=>isStudentClassMember(x,a.classId)&&(!wanted||wanted.has(String(x.userId))))", replace: "filter(x=>(wanted?wanted.has(String(x.userId)):isStudentClassMember(x,a.classId)))", tests: G7_API },
    { id: "G7-M7", what: "an Excel text cell becomes a formula (formula injection)", file: XLSX,
      find: "return text === \"\" ? \"\" : '<c r=\"' + ref + '\" t=\"inlineStr\"' + style + '><is><t xml:space=\"preserve\">' + xml(text) + \"</t></is></c>\";", replace: "return text === \"\" ? \"\" : text.startsWith(\"=\") ? '<c r=\"' + ref + '\"' + style + '><f>' + xml(text.slice(1)) + '</f></c>' : '<c r=\"' + ref + '\" t=\"inlineStr\"' + style + '><is><t xml:space=\"preserve\">' + xml(text) + \"</t></is></c>\";", tests: G7_UI },
    { id: "G7-M8", what: "Excel cells are not XML-escaped", file: XLSX,
      find: ".replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\").replace(/\"/g, \"&quot;\");\n\n/**", replace: ";\n\n/**", tests: G7_UI },
    { id: "G7-M9", what: "a wrong CRC-32 is written (a corrupt file)", file: XLSX,
      find: "return (c ^ 0xffffffff) >>> 0;", replace: "return c >>> 0;", tests: G7_UI },
    { id: "G7-M10", what: "the sheet is left-to-right", file: XLSX,
      find: "(o.rtl ? ' rightToLeft=\"1\"' : \"\")", replace: "\"\"", tests: G7_UI },
    { id: "G7-M11", what: "the print report does not escape a cell (markup injection)", file: PRINT,
      find: "return \"<td\" + (typeof v === \"number\" ? \" class=\\\"num\\\"\" : \"\") + \">\" + esc(v ?? \"\") + \"</td>\";", replace: "return \"<td\" + (typeof v === \"number\" ? \" class=\\\"num\\\"\" : \"\") + \">\" + String(v ?? \"\") + \"</td>\";", tests: G7_UI },
    { id: "G7-M12", what: "the print frame is left behind after printing", file: PRINT,
      find: "  win.addEventListener(\"afterprint\", cleanup, { once: true });\n", replace: "", tests: G7_UI },
    { id: "G7-M13", what: "the scrolling analysis table is not keyboard-focusable (axe scrollable-region-focusable)", file: "src/assignments/AssignmentDetail.tsx",
      find: "role=\"region\" aria-label=\"جدول تحليل الأسئلة\" tabIndex={0}", replace: "role=\"region\" aria-label=\"جدول تحليل الأسئلة\"", tests: G7_UI },
    { id: "G7-M14", what: "the blocking reasons list carries role=status again (axe listitem)", file: "src/assignments/AssignmentComposer.tsx",
      find: "<div role=\"status\" aria-label=\"ما يمنع المتابعة\"><ul className=\"eb-wizard-issues\">", replace: "<div><ul className=\"eb-wizard-issues\" role=\"status\" aria-label=\"ما يمنع المتابعة\">", tests: G7_UI },
    { id: "G7-M15", what: "the Excel export carries only the searched / filtered rows", file: "src/AssignmentsPanel.tsx",
      find: "\"\"),gradebookCsvRows(d.item,g.results,rowGrading),{sheetName:", replace: "\"\"),gradebookCsvRows(d.item,g.rows,rowGrading),{sheetName:", tests: G7_UI },
    { id: "G7-M16", what: "the PDF report carries only the searched / filtered rows", file: "src/AssignmentsPanel.tsx",
      find: "printReport(gradebookPrintReport(d.item,g.results,rowGrading,d.stats))", replace: "printReport(gradebookPrintReport(d.item,g.rows,rowGrading,d.stats))", tests: G7_UI }
  ],
  g6: [
    { id: "G6-M1", what: "the content step lets the teacher go on without a title", file: WIZ,
      find: "    if (!w.title.trim()) out.push(\"عنوان الواجب مطلوب.\");\n", replace: "", tests: [...G6_UNIT, ...G6_PANEL] },
    { id: "G6-M2", what: "the classes step lets the teacher go on with none", file: WIZ,
      find: "    if (!w.classIds.length) out.push(", replace: "    if (false) out.push(", tests: [...G6_UNIT, ...G6_PANEL] },
    { id: "G6-M3", what: "a past deadline (a warning) blocks the timing step", file: WIZ,
      find: "for (const i of w.windowIssues) if (i.blocking) out.push(i.message);", replace: "for (const i of w.windowIssues) out.push(i.message);", tests: [...G6_UNIT, ...G6_PANEL] },
    { id: "G6-M4", what: "jumping forward skips the steps in between", file: WIZ,
      find: "for (let i = from; i < target; i++) if (stepIssues(ORDER[i], w).length) return false;", replace: "if (stepIssues(ORDER[from], w).length) return false;", tests: [...G6_UNIT, ...G6_PANEL] },
    { id: "G6-M5", what: "«التالي» ignores the step's blocking reasons", file: COMP,
      find: "onClick={() => goTo(WIZARD_STEPS[at + 1].key)} disabled={blocking.length > 0}>التالي", replace: "onClick={() => { stepMoved.current = true; setStep(WIZARD_STEPS[at + 1].key); }}>التالي", tests: G6_PANEL },
    { id: "G6-M6", what: "only the first chosen class gets a copy", file: CTRL,
      find: "sourceExam = composer.source.sourceExam, ids = [...f.classIds];", replace: "sourceExam = composer.source.sourceExam, ids = f.classIds.slice(0, 1);", tests: G6_PANEL },
    { id: "G6-M7", what: "a class that succeeded stays chosen (a retry creates a second copy there)", file: CTRL,
      find: "setItems(x => [r.assignment, ...x]); f.setClassIds(x => x.filter(y => y !== id)); }", replace: "setItems(x => [r.assignment, ...x]); }", tests: G6_PANEL },
    { id: "G6-M8", what: "the wizard closes although a class failed", file: CTRL,
      find: "    else closeComposer();\n  }", replace: "    closeComposer();\n  }", tests: G6_PANEL },
    { id: "G6-M9", what: "the default class is re-filled behind the teacher after a create", file: COMPOSER_HOOK,
      find: "if (!classDefaulted.current && active[0]) {", replace: "if (active[0] && !classIds.length) {", tests: G6_PANEL },
    { id: "G6-M10", what: "the copy count reads «2 نسخ»", file: WIZ,
      find: "n === 2 ? \"نسختان\" :", replace: "", tests: [...G6_UNIT, ...G6_PANEL] }
  ],
  g5: [
    { id: "G5-M1", what: "«بعد الموعد النهائي» releases before the due date", file: REL,
      find: "return validIso(a.dueAt) && nowMs >= Date.parse(a.dueAt);", replace: "return validIso(a.dueAt);", tests: G5_API },
    { id: "G5-M2", what: "an unknown mode releases (fails open)", file: REL,
      find: "  if (mode === \"manual\") return validIso(a.resultsReleasedAt);\n  return false;", replace: "  if (mode === \"manual\") return validIso(a.resultsReleasedAt);\n  return true;", tests: G5_API },
    { id: "G5-M3", what: "an unreadable publication date releases", file: REL,
      find: "if (mode === \"manual\") return validIso(a.resultsReleasedAt);", replace: "if (mode === \"manual\") return !!a.resultsReleasedAt;", tests: G5_API },
    { id: "G5-M4", what: "the teacher's feedback is not withheld", file: REL,
      find: "\"manualReviewMarks\", \"teacherFeedback\", \"latestScore\"", replace: "\"manualReviewMarks\", \"latestScore\"", tests: G5_API },
    { id: "G5-M5", what: "the submission projection ignores the release", file: SUB,
      find: "return rel.resultsVisible?{...out,resultsVisible:true}:", replace: "return true?{...out,resultsVisible:true}:", tests: G5_API },
    { id: "G5-M6", what: "older attempts in the submission state are not gated", file: SUB,
      find: "attempts:attempts.map(x=>pub(x,a,nowMs))", replace: "attempts:attempts.map(x=>pub(x,{},nowMs))", tests: G5_API },
    { id: "G5-M7", what: "the dashboard average counts an unreleased mark", file: DASH,
      find: "if(latest){completed++;if(released){sum+=", replace: "if(latest){completed++;if(true){sum+=", tests: G5_API },
    { id: "G5-M8", what: "the final average and Strength count an unreleased mark", file: DASH,
      find: "if(gradingStatus===\"final\"&&latest&&released){finalSum+=", replace: "if(gradingStatus===\"final\"&&latest){finalSum+=", tests: G5_API },
    { id: "G5-M9", what: "latestPercentage leaks an unreleased mark", file: DASH,
      find: "latestPercentage:latest&&released?Number(latest.percentage||0):null", replace: "latestPercentage:latest?Number(latest.percentage||0):null", tests: G5_API },
    { id: "G5-M10", what: "an unreleased result earns a dashboard medal", file: DASH,
      find: "||!a.latestResult||a.latestResult.resultsVisible===false)continue;", replace: "||!a.latestResult)continue;", tests: G5_API },
    { id: "G5-M11", what: "an unreleased medal post is listed in the feed", file: "api/src/functions/achievement-feed.js",
      find: ".filter(post => !withheld.has(assessmentMedalOf(post)))", replace: ".filter(post => !!post)", tests: G5_API },
    { id: "G5-M12", what: "a review notification is shown before release", file: "api/src/lib/notification-center.js",
      find: "case \"assignment_reviewed\": if (!resultsReleased(a, Date.now())) return null; return", replace: "case \"assignment_reviewed\": return", tests: G5_API },
    { id: "G5-M13", what: "changing the mode keeps a manual publication (a surprise release on switching back)", file: MANAGE,
      find: "{current.resultsRelease=mode;delete current.resultsReleasedAt}", replace: "{current.resultsRelease=mode}", tests: G5_API },
    { id: "G5-M14", what: "results can be published outside «يدويًا» mode", file: MANAGE,
      find: "if(previous.mode!==\"manual\"){const err=new Error(\"نشر النتائج يدويًا", replace: "if(false){const err=new Error(\"نشر النتائج يدويًا", tests: G5_API },
    { id: "G5-M15", what: "create accepts an unknown release mode", file: MANAGE,
      find: "if(resultsRelease===null)return {status:400", replace: "if(false)return {status:400", tests: G5_API },
    { id: "G5-M16", what: "the student resolver shows an unreleased result as a mark", file: "src/codingGradingStatus.ts",
      find: "  if (resultsNotReleased(result)) return true;\n", replace: "", tests: G5_UI },
    { id: "G5-M17", what: "the portal gives a medal for an unreleased result", file: "src/student/portalPresentation.ts",
      find: "    if (lr.resultsVisible === false) continue;", replace: "", tests: G5_UI },
    { id: "G5-M18", what: "«التالي بانتظار التصحيح» can name the current student", file: "src/assignments/reviewNav.ts",
      find: "for (let k = 1; k < list.length; k++)", replace: "for (let k = 0; k < list.length; k++)", tests: G5_NAV },
    { id: "G5-M19", what: "«التالي بانتظار التصحيح» does not wrap round", file: "src/assignments/reviewNav.ts",
      find: "const s = list[(i + k) % list.length];", replace: "const s = list[Math.min(i + k, list.length - 1)];", tests: G5_NAV },
    { id: "G5-M20", what: "switching student drops unsaved edits without asking", file: REVIEW,
      find: "if(!t||!onGo||t.studentId===studentId)return;if(dirtyRef.current&&", replace: "if(!t||!onGo||t.studentId===studentId)return;if(false&&", tests: G5_NAV },
    { id: "G5-M21", what: "the shortcut keys fire while typing in a field", file: REVIEW,
      find: "if(el&&(el.closest(\"input,textarea,select,[contenteditable='true']\")))return;", replace: "", tests: G5_NAV },
    { id: "G5-M22", what: "«حفظ والانتقال» moves although the save failed", file: REVIEW,
      find: "if(await save()&&t&&onGo&&mountedRef.current)", replace: "await save();if(t&&onGo&&mountedRef.current)", tests: G5_NAV },
    { id: "G5-M23", what: "the review position ignores the gradebook's sort (moves in another order)", file: CTRL,
      find: "reviewNav(gradebookRows(results, \"\", \"all\", gbSort), review.studentId, rowGrading)", replace: "reviewNav([...results].reverse(), review.studentId, rowGrading)", tests: G5_NAV }
  ],
  g4: [
    { id: "G4-M1", what: "a final result gives way to a live attempt (grading no longer first)", file: GBS,
      find: "  if (gs === \"final\") return", replace: "  if (gs === \"final\" && !s.activeAttempt) return", tests: [...G4_UNIT, ...G4_PANEL] },
    { id: "G4-M2", what: "a pending review is shown as not submitted", file: GBS,
      find: "  if (gs === \"pendingReview\") {", replace: "  if (false) {", tests: [...G4_UNIT, ...G4_PANEL] },
    { id: "G4-M3", what: "a filter keeps the selection (a bulk action could reach rows ticked under another view)", file: CTRL,
      find: "setFilter: (v: GradebookFilter) => { setGbFilter(v); clearSelection(); }", replace: "setFilter: (v: GradebookFilter) => { setGbFilter(v); }", tests: G4_PANEL },
    { id: "G4-M4", what: "a bulk run continues after the teacher left the page", file: CTRL,
      find: "        if (bulkRun.current !== run) return false;\n", replace: "", tests: G4_PANEL },
    { id: "G4-M5", what: "leaving the page during a bulk run leaves the workspace busy", file: CTRL,
      find: "if (bulkBusy.current) { bulkBusy.current = false; setBusy(false); }", replace: "", tests: G4_PANEL },
    { id: "G4-M6", what: "the students a bulk action failed for are unticked (no retry path)", file: CTRL,
      find: "setSelected(new Set(failed.map(f => f.s.studentId)));", replace: "setSelected(new Set());", tests: G4_PANEL },
    { id: "G4-M7", what: "a bulk answer is not merged into the row", file: CTRL,
      find: "if (bulkRun.current !== run) return false; mergeSnap(s.studentId, r); ok++;", replace: "if (bulkRun.current !== run) return false; ok++;", tests: G4_PANEL },
    { id: "G4-M8", what: "an archived assignment offers selection", file: "src/assignments/Gradebook.tsx",
      find: "const sel = archived ? undefined : p.selection;", replace: "const sel = p.selection;", tests: G4_PANEL },
    { id: "G4-M9", what: "a question waiting for manual review is sent as a grade", file: ITEM,
      find: "if(g.manualReview===true||questionAutoGradingPending(attempt,q.questionId))", replace: "if(questionAutoGradingPending(attempt,q.questionId))", tests: G4_API },
    { id: "G4-M10", what: "a question whose coding execution is open is sent as a grade", file: ITEM,
      find: "if(g.manualReview===true||questionAutoGradingPending(attempt,q.questionId))", replace: "if(g.manualReview===true)", tests: G4_API },
    { id: "G4-M11", what: "a pending cell carries its provisional score", file: ITEM,
      find: "return {state:\"pending\"};", replace: "return {state:\"pending\",score:round2(g.score)};", tests: G4_API },
    { id: "G4-M12", what: "an open target of a composite part does not hold its question", file: "api/src/lib/coding/official-grading.js",
      find: "return (c ? c.questionId : id) === q &&", replace: "return id === q &&", tests: G4_API },
    { id: "G4-M13", what: "the grid draws a pending cell as a mark", file: "src/assignments/questionGrid.ts",
      find: "        if (c?.state === \"pending\") return", replace: "        if (c?.state === \"pending\" && false) return", tests: [...G4_UNIT, ...G4_PANEL] },
    { id: "G4-M14", what: "the grid's bands drift from the distribution's (a 90% lands in 80–89)", file: "src/assignments/questionGrid.ts",
      find: "bandOf(c.score / q.maxMarks * 100).key", replace: "bandOf(c.score / q.maxMarks * 100 - 1).key", tests: [...G4_UNIT, ...G4_PANEL] },
    { id: "G4-M15", what: "the header no longer stays in view", file: "src/assignments-pro.css",
      find: ".eb-gradebook-table thead th { position: sticky; inset-block-start: 0;", replace: ".eb-gradebook-table thead th { inset-block-start: 0;", tests: G4_PANEL },
    { id: "G4-M16", what: "phone cards keep the table's 620px minimum (they spill off the screen)", file: "src/assignments-pro.css",
      find: "display: block; inline-size: 100%; min-inline-size: 0; }", replace: "display: block; inline-size: 100%; }", tests: G4_PANEL }
  ],
  g3: [
    { id: "G3-M1", what: "a pending review is drawn as a score", file: PAGE,
      find: "    if (g === \"pendingReview\") { pendingReview++; continue; }\n", replace: "", tests: [...G3_UNIT, ...G3_PANEL] },
    { id: "G3-M2", what: "band edges move (a 50% lands below 50)", file: PAGE,
      find: "return BANDS.find(b => pct >= b.min && pct < b.max)", replace: "return BANDS.find(b => pct > b.min && pct <= b.max)", tests: [...G3_UNIT, ...G3_PANEL] },
    { id: "G3-M3", what: "a student in an attempt counts as not submitted", file: PAGE,
      find: "    else if (s.activeAttempt) at(\"active\").count++;\n", replace: "", tests: [...G3_UNIT, ...G3_PANEL] },
    { id: "G3-M4", what: "the list stays visible beside the page", file: "src/AssignmentsPanel.tsx",
      find: "<AssignmentList hidden={pageOpen} ", replace: "<AssignmentList hidden={false} ", tests: G3_PANEL },
    { id: "G3-M5", what: "the KPI strip stays above an open page", file: "src/AssignmentsPanel.tsx",
      find: "{!t.showArchived&&!pageOpen&&<AssignmentsHomeKpis", replace: "{!t.showArchived&&<AssignmentsHomeKpis", tests: G3_PANEL },
    { id: "G3-M6", what: "a newly opened assignment keeps the previous section", file: "src/assignments/useAssignmentsController.ts",
      find: "setMode(\"list\"); setPageTab(\"students\"); stopBulk();", replace: "setMode(\"list\"); stopBulk();", tests: G3_PANEL },
    { id: "G3-M7", what: "the analysis is re-read on every visit", file: "src/assignments/useAssignmentsController.ts",
      find: "if (t === \"analysis\" && !analysis && !analysisBusy) void loadItemAnalysis();", replace: "if (t === \"analysis\") void loadItemAnalysis();", tests: G3_PANEL },
    { id: "G3-M8", what: "closing the page loses focus (the opener is never refocused)", file: "src/assignments/useAssignmentsController.ts",
      find: "    if (el.isConnected) el.focus();\n  }, [resultsFor]);", replace: "  }, [resultsFor]);", tests: G3_PANEL },
    { id: "G3-M9", what: "the page header has no action menu (the hidden row's actions are unreachable)", file: "src/assignments/AssignmentDetail.tsx",
      find: "        {p.actions && <div className=\"eb-assign-detail-actions\">{p.actions}</div>}\n", replace: "", tests: G3_PANEL },
    { id: "G3-M10", what: "the hidden list's display:flex overrides the hidden attribute (it stays visible in a browser)", file: "src/assignments-pro.css",
      find: ".eb-assign-list[hidden] { display: none; }\n", replace: "", tests: ["src/designSystem/hiddenAttribute.guard.test.ts"] },
    { id: "G3-M11", what: "the overview's status bar restyles the gradebook's .eb-status-stack badge column", file: "src/assignments-pro.css",
      find: ".eb-status-bar { display: flex;", replace: ".eb-status-stack { display: flex;", tests: ["src/AssignmentsPanel.page.21g3.test.tsx"] }
  ],
  g2: [
    { id: "G2-M1", what: "a cached summary is served without checking its ETag", file: CACHE,
      find: "if (e.etag && hit && hit.etag === e.etag && hit.summary && typeof hit.summary === \"object\") next[id] = hit;", replace: "if (hit && hit.summary && typeof hit.summary === \"object\") next[id] = hit;", tests: G2_CACHE },
    { id: "G2-M2", what: "a listing without ETags trusts the cache", file: CACHE,
      find: "if (e.etag && hit && hit.etag === e.etag", replace: "if (hit && (!e.etag || hit.etag === e.etag)", tests: G2_CACHE },
    { id: "G2-M3", what: "an older summary version is trusted", file: CACHE,
      find: " && value.summaryVersion === summaryVersion", replace: "", tests: G2_CACHE },
    { id: "G2-M4", what: "a cache write failure fails the list", file: CACHE,
      find: "    catch (err) { if (typeof deps.onCacheError === \"function\") { try { deps.onCacheError(err); } catch { /* never fail a read */ } } }\n  }\n  return { summaries", replace: "    catch (err) { throw err; }\n  }\n  return { summaries", tests: G2_CACHE },
    { id: "G2-M5", what: "the cache is never written (every list downloads everything)", file: CACHE,
      find: "  if (stale.length || pruned || cached.outdated) {", replace: "  if (false) {", tests: G2_CACHE },
    { id: "G2-M6", what: "pending review is counted as graded", file: PROG,
      find: "if (g === \"pendingReview\") pendingReview++; else if (g === \"final\") graded++;", replace: "if (g === \"final\" || g === \"pendingReview\") graded++;", tests: G2_PROG },
    { id: "G2-M7", what: "the average covers graded attempts only (differs from the gradebook)", file: PROG,
      find: "submitted++; sum += Number(latest.percentage || 0);", replace: "submitted++; if (deriveGradingStatus(latest) === \"final\") sum += Number(latest.percentage || 0);", tests: G2_PROG },
    { id: "G2-M8", what: "live attempts are counted only for students who never submitted", file: PROG,
      find: "    if (activeAttemptOf(s)) active++;", replace: "    if (activeAttemptOf(s) && !latest) active++;", tests: G2_PROG },
    { id: "G2-M9", what: "the progress read covers every teacher's classes", file: "api/src/functions/assignment-progress.js",
      find: "const classes = filterAccessible(allClasses, tenantOf(auth.user));", replace: "const classes = allClasses;", tests: G2_PROG },
    { id: "G2-M10", what: "closing soon starts at the deadline (never shown)", file: HOME,
      find: "if (due !== null && due - now <= CLOSING_SOON_MS) return \"closingSoon\";", replace: "", tests: G2_HOME },
    { id: "G2-M11", what: "«مفتوحة» leaves out the ones closing soon", file: HOME,
      find: "return f === \"open\" ? s === \"open\" || s === \"closingSoon\" : s === f;", replace: "return s === f;", tests: G2_HOME },
    { id: "G2-M12", what: "an unavailable progress read is shown as zero", file: HOME,
      find: "progressKnown: progress !== null };", replace: "progressKnown: true };", tests: G2_HOME },
    { id: "G2-M13", what: "the submission rate counts closed assignments too", file: HOME,
      find: "if (s === \"open\" || s === \"closingSoon\") { open++; if (s === \"closingSoon\") closingSoon++; if (p) { submitted += p.submitted; expected += p.expected; } }", replace: "if (s === \"open\" || s === \"closingSoon\") { open++; if (s === \"closingSoon\") closingSoon++; } if (p) { submitted += p.submitted; expected += p.expected; }", tests: G2_HOME },
    { id: "G2-M14", what: "the time filter is not part of the master scope (a hidden detail stays open)", file: "src/assignments/assignmentsView.ts",
      find: "  if (!s.showArchived && s.time && s.time !== \"all\" && !matchesTimeFilter(x, s.time, s.now ?? 0)) return false;\n", replace: "", tests: G2_HOME },
    { id: "G2-M15", what: "the list defaults to the first class again", file: "src/assignments/useAssignmentsController.ts",
      find: "  const effectiveFilter = filterClassId;", replace: "  const effectiveFilter = filterClassId || (active[0]?.classId || \"\");", tests: G2_HOME },
    { id: "G2-M16", what: "publishing does not re-read the progress", file: "src/assignments/useAssignmentsController.ts",
      find: " if (body.action === \"setStatus\") void loadProgress();", replace: "", tests: G2_HOME }
  ],
  g1: [
    { id: "G1-M1", what: "the archived view and the current view are swapped", file: VIEW,
      find: 'if (s.showArchived ? x.status !== "archived" : x.status === "archived") return false;', replace: 'if (s.showArchived ? x.status === "archived" : x.status !== "archived") return false;', tests: [...G1_UNIT, ...G1_PANEL] },
    { id: "G1-M2", what: "the class filter no longer filters", file: VIEW,
      find: "if (s.classId && x.classId !== s.classId) return false;", replace: "", tests: [...G1_UNIT, ...G1_PANEL] },
    { id: "G1-M3", what: "the list search no longer filters", file: VIEW,
      find: '  if (s.q && ![x.title, x.className].join(" ").toLocaleLowerCase("ar").includes(s.q)) return false;\n', replace: "", tests: [...G1_UNIT, ...G1_PANEL] },
    { id: "G1-M4", what: "the server's grading status is ignored (re-derived locally)", file: VIEW,
      find: "(s.gradingStatus ? s.gradingStatus : resolveGradingStatus(s.latestResult))", replace: "resolveGradingStatus(s.latestResult)", tests: [...G1_UNIT, ...G1_PANEL] },
    { id: "G1-M5", what: "the «active» gradebook filter keeps every row", file: VIEW,
      find: 'if (filter === "active") return !!s.activeAttempt;', replace: 'if (filter === "active") return true;', tests: [...G1_UNIT, ...G1_PANEL] },
    { id: "G1-M6", what: "students without a result sort first by score", file: VIEW,
      find: "if (av === null) return 1; if (bv === null) return -1;", replace: "if (av === null) return -1; if (bv === null) return 1;", tests: [...G1_UNIT, ...G1_PANEL] },
    { id: "G1-M7", what: "a drilled student who no longer matches is hidden by the filter", file: VIEW,
      find: 'filter: matches ? wanted : "all"', replace: "filter: wanted", tests: [...G1_UNIT, ...G1_PANEL] },
    { id: "G1-M8", what: "a refused request is treated as a success", file: "src/assignments/assignmentsApi.ts",
      find: '    if (!r.ok) throw new Error(withTrackingCode(j.error || "حدث خطأ.", r.status, r));\n', replace: "", tests: [...G1_UNIT, ...G1_PANEL] },
    { id: "G1-M9", what: "an older results read overwrites a newer selection", file: CTRL,
      find: "      if (seq !== resultsSeq.current) return;\n", replace: "", tests: G1_PANEL },
    { id: "G1-M10", what: "a mutation's answer no longer replaces the list row", file: CTRL,
      find: "    setItems(x => x.map(y => (y.assignmentId === updated.assignmentId ? updated : y)));\n", replace: "", tests: G1_PANEL },
    { id: "G1-M11", what: "choosing a saved exam no longer pre-fills the title", file: COMPOSER,
      find: 'setTitle(String(r.exam?.title || meta?.title || ""));', replace: "", tests: G1_PANEL },
    { id: "G1-M12", what: "the gradebook export uses the searched / filtered subset", file: "src/AssignmentsPanel.tsx",
      find: "d.item.title),gradebookCsvRows(d.item,g.results,rowGrading))}}", replace: "d.item.title),gradebookCsvRows(d.item,g.rows,rowGrading))}}", tests: G1_PANEL },
    { id: "G1-M13", what: "the create request is sent while the window is invalid", file: CTRL,
      find: " || windowBlocks(assignmentWindowIssues(f.openAt, f.dueAt))) return;", replace: ") return;", tests: [...G1_PANEL, "src/assignments/useAssignmentsController.21g1.test.tsx"] },
    { id: "G1-M14", what: "the create button is enabled while the window is invalid", file: CTRL,
      find: " && !windowBlocks(composer.windowIssues);", replace: ";", tests: G1_PANEL }
  ],
  g0: [
    { id: "G0-M1", what: "multi-user sessions get no tenant (isolation switched off)", file: LIB,
      find: 'return user && user.am === "multi-user" && typeof user.sub === "string" && user.sub ? user.sub : null;', replace: "return null;", tests: ALL },
    { id: "G0-M2", what: "the owner comparison is removed (every document accessible)", file: LIB,
      find: "return owner === null || owner === tenant;", replace: "return true;", tests: ALL },
    { id: "G0-M3", what: "LEGACY_DATA_OWNER is ignored (pre-tenancy data stays shared for ever)", file: LIB,
      find: "  return v || null;", replace: "  return null;", tests: ALL },
    { id: "G0-M4", what: "a new document is never stamped with its owner", file: LIB,
      find: "return tenant ? { ownerId: tenant } : {};", replace: "return {};", tests: ALL },
    { id: "G0-M5", what: "a student's own owner stamp is ignored in favour of nothing (any stamped student accessible)", file: LIB,
      find: 'if (typeof student.ownerId === "string" && student.ownerId) return canAccessDocument(student, tenant, env);', replace: 'if (typeof student.ownerId === "string" && student.ownerId) return true;', tests: TEN },
    { id: "G0-M6", what: "the class list shows other teachers' classes", file: "api/src/functions/manage-classrooms.js",
      find: "if (!document || !canAccessDocument(document, tenant)) continue;", replace: "if (!document) continue;", tests: TEN },
    { id: "G0-M7", what: "class actions skip the ownership pre-check", file: "api/src/functions/manage-classrooms.js",
      find: "if (targetId && (!target || !canAccessDocument(target, tenant)))", replace: "if (targetId && !target)", tests: TEN },
    { id: "G0-M8", what: "student actions accept another teacher's student", file: "api/src/functions/manage-students.js",
      find: 'if (student && typeof student.ownerId === "string" && student.ownerId) return canAccessDocument(student, tenant);\n        return classOk(student?.classId);', replace: "return true;", tests: TEN },
    { id: "G0-M9", what: "assignment actions skip the class pre-check", file: "api/src/functions/manage-assignments.js",
      find: 'if(target&&!(await classAccessible(n=>dl(c,n),target.classId,tenant)))return {status:404,jsonBody:{ok:false,error:"الواجب غير موجود."}};', replace: "", tests: TEN },
    { id: "G0-M10", what: "an assignment can be created in another teacher's class", file: "api/src/functions/manage-assignments.js",
      find: "if(!classroom||!canAccessDocument(classroom,tenant)||", replace: "if(!classroom||", tests: TEN },
    { id: "G0-M11", what: "a student's paper of another teacher's class can be reviewed", file: "api/src/functions/assignment-review.js",
      find: "if(!assignment||!student||!(await classAccessible(n=>dl(c,n),assignment.classId,tenantOf(auth.user))))", replace: "if(!assignment||!student)", tests: TEN },
    { id: "G0-M12", what: "messages to another teacher's student are allowed", file: "api/src/functions/messages.js",
      find: 'if (body.studentId !== undefined && !(await ownStudent(String(body.studentId || "").trim()))) return notFound(MSG.studentNotFound);', replace: "", tests: TEN },
    { id: "G0-M13", what: "another teacher's class report is served", file: "api/src/functions/reports.js",
      find: 'if (classId && !(await classAccessible(load, classId, tenant))) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };', replace: "", tests: TEN },
    { id: "G0-M14", what: "the project route (794589 included) serves another teacher's class", file: "api/src/functions/project-tracker.js",
      find: "const ownClassroom = classroom => !!classroom && canAccessDocument(classroom, tenant);", replace: "const ownClassroom = classroom => !!classroom;", tests: TEN },
    { id: "G0-M15", what: "the bank list shows other teachers' questions", file: BQ,
      find: "          if (!bankEntryVisible(ownershipOf(question, byId.get(String(question.id)), sourceId), tenant)) continue;\n", replace: "", tests: BANK },
    { id: "G0-M16", what: "another teacher's bank question can be changed or deleted", file: BQ,
      find: '      if (!bankEntryVisible(ownershipOf(stored, entry, sourceId), tenant)) return { error: bad(404, "السؤال غير موجود في بنك الأسئلة.") };\n', replace: "", tests: BANK },
    { id: "G0-M17", what: "another teacher's dangling index entry is healed (removed)", file: BQ,
      find: '        if (entry && !bankEntryVisible(ownershipOf(null, entry, String(entry.sourceId || "")), tenant)) return { error: bad(404, "السؤال غير موجود في بنك الأسئلة.") };\n', replace: "", tests: BANK },
    { id: "G0-M18", what: "a re-used create key hands another teacher's question over", file: BQ,
      find: ' || String(existing.ownerId || "") !== String(fresh.ownerId || "")', replace: "", tests: BANK },
    { id: "G0-M19", what: "the index entry does not carry the owner", file: BQ,
      find: '    ...(typeof question.ownerId === "string" && question.ownerId ? { ownerId: question.ownerId } : {})\n', replace: "", tests: BANK },
    { id: "G0-M20", what: "the official bank stops being shared once a legacy owner is named", file: "api/src/lib/bank-tenancy.js",
      find: "if (!tenant || isOfficialBankEntry(entry)) return true;", replace: "if (!tenant) return true;", tests: BANK },
    { id: "G0-M21", what: "insert-from-bank serves another teacher's question", file: "api/src/functions/bank-question-select.js",
      find: "if (!stored || !bankEntryVisible(", replace: "if (!stored || bankEntryVisible(", tests: BANK },
    { id: "G0-M22", what: "replace-from-bank draws on every teacher's questions", file: "api/src/functions/question-bank-action.js",
      find: "const allQuestions = visibleBankEntries(Array.isArray(index?.questions) ? index.questions : [], tenantOf(auth.user));", replace: "const allQuestions = Array.isArray(index?.questions) ? index.questions : [];", tests: BANK },
    { id: "G0-M23", what: "the import duplicate check offers another teacher's text", file: "api/src/functions/bank-import-action.js",
      find: "if (question?.id && question?.text && bankEntryVisible(question, tenant)) {", replace: "if (question?.id && question?.text) {", tests: BANK },
    { id: "G0-M24", what: "the template list shows other teachers' templates", file: "api/src/functions/manage-templates.js",
      find: 'if (document?.kind !== "exam-template" || !canAccessDocument(document, tenant)) continue;', replace: 'if (document?.kind !== "exam-template") continue;', tests: CONTENT },
    { id: "G0-M25", what: "another teacher's template can be loaded", file: "api/src/functions/manage-templates.js",
      find: "if (!template || !canAccessDocument(template, tenant)) return", replace: "if (!template) return", tests: CONTENT },
    { id: "G0-M26", what: "another teacher's template can be deleted", file: "api/src/functions/manage-templates.js",
      find: "if (!stored || !canAccessDocument(stored, tenant)) return { status: 200, jsonBody: { ok: true, deleted: false } };", replace: "", tests: CONTENT },
    { id: "G0-M27", what: "the saved-exam page counts other teachers' exams again", file: "api/src/functions/manage-saved-exams.js",
      find: "      exams.length >= MAX_LISTED ||\n      examined >= MAX_EXAMINED", replace: "      examined >= MAX_LISTED", tests: CONTENT },
    { id: "G0-M28", what: "saved exams ignore LEGACY_DATA_OWNER (D2 claim always open)", file: "api/src/lib/saved-exam-access.js",
      find: "  return canAccessDocument(document, owner, env);", replace: "  const stored = storedOwnerOf(document);\n  return !owner || !stored || stored === owner;", tests: CONTENT },
    { id: "G0-M29", what: "two templates saved in one millisecond share a blob name", file: "api/src/functions/save-exam-artifact.js",
      find: '              crypto.randomBytes(4).toString("hex") +\n              "-" +\n', replace: "", tests: CONTENT },
    { id: "G0-M30", what: "an archived assignment's title can still be edited", file: "api/src/functions/manage-assignments.js",
      find: 'if(normalizeAssignmentStatus(current)==="archived"){const err=new Error("الواجب مؤرشف. استعده أولًا قبل تعديل بياناته.");err.httpStatus=409;throw err}', replace: "", tests: DETAILS },
    { id: "G0-M31", what: "an empty title is accepted on edit", file: "api/src/functions/manage-assignments.js",
      find: 'if(!title)return {status:400,jsonBody:{ok:false,error:"عنوان الواجب مطلوب."}};', replace: "", tests: DETAILS },
    { id: "G0-M32", what: "editing the title also rewrites the instructions when none were sent", file: "api/src/functions/manage-assignments.js",
      find: "current.title=title;if(instructions!==null)current.instructions=instructions;", replace: 'current.title=title;current.instructions=instructions||"";', tests: DETAILS }
  ]
};

const name = process.argv[2];
const campaign = CAMPAIGNS[name];
if (!campaign) { console.error("usage: node scripts/mutate-21g.mjs <" + Object.keys(CAMPAIGNS).join("|") + ">"); process.exit(2); }

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
