#!/usr/bin/env node
// Phase UX-R0 — VISUAL BASELINE capture for the UX-R redesign programme (certification only; never shipped).
// Drives a production build (DIST, default ./dist) in real Chromium against a small local mock of the platform API (payload
// shapes the app reads; no token, nothing deployed, service workers blocked, reduced motion) and screenshots EVERY page the
// redesign touches — every teacher sidebar destination, the student portal and the login screen — at three viewports.
// Each UX-R phase runs it twice (LABEL=before on the baseline build, LABEL=after on the phase head) and attaches the pairs to
// its pull request. It also records, per page, horizontal overflow and page errors, so a redesign that breaks a page shows up
// as data and not only as a picture.
// PART=gallery (or "all") also builds browser-harness/ux-r-gallery.html FROM THE CHECKED-OUT SOURCE and screenshots the shared
// component kit (closed and with the action menu open); run it from a worktree of the baseline to get the "before" kit.
//   DIST=./dist LABEL=before PAGES=dashboard,students VIEWPORTS=desktop PART=all node scripts/capture-visual-baseline-ux-r.mjs
// Output: HARNESS_OUT/<label>/<viewport>/<page>.png (+ gallery/<viewport>*.png) + record.json; one CHECK line per capture.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const only = (process.env.PAGES || "").split(",").map(s => s.trim()).filter(Boolean);
const onlyVp = (process.env.VIEWPORTS || "").split(",").map(s => s.trim()).filter(Boolean);
const part = process.env.PART || "pages";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-ux-r"), label);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
if (part !== "gallery" && !fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- fixtures (the shapes of the Vitest fixtures of the same components; demo names only) ----
const NOW = "2026-10-20T08:30:00.000Z";
const CLASSES = [
  { classId: "c1", name: "العاشر – أ", grade: "10", schoolYear: "2026", active: true, status: "active", studentCount: 6, createdAt: NOW },
  { classId: "c2", name: "الحادي عشر – ب", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 4, createdAt: NOW },
  { classId: "c3", name: "الثاني عشر – أ", grade: "12", schoolYear: "2026", active: true, status: "active", studentCount: 0, createdAt: NOW },
];
const NAMES = [["أحمد", "الحسن"], ["بسمة", "عودة"], ["جود", "النجار"], ["حمزة", "المصري"], ["رنا", "سليمان"], ["سلمى", "قاسم"], ["ليث", "فادي"], ["مريم", "يوسف"], ["نور", "خليل"], ["يزن", "عمر"]];
const STUDENTS = NAMES.map(([firstName, familyName], i) => ({
  userId: "u" + (i + 1), code: "C-" + (101 + i), identityNumber: String(400000000 + i * 1111), firstName, familyName, displayName: firstName + " " + familyName,
  classId: i < 6 ? "c1" : "c2", active: i !== 4, archived: false, createdAt: NOW, updatedAt: NOW, lastLoginAt: i === 4 ? "" : NOW,
  submittedAssignmentsCount: 3 + (i % 4), likesCount: i % 3, profilePhoto: null, avatarId: "",
}));
const trend = n => ({ assignmentId: "a" + n, classId: "c1", className: "العاشر – أ", title: "واجب " + n, dueAt: "2026-09-0" + n + "T10:00:00.000Z", date: "2026-09-0" + n, students: 20, submitted: 15 + n, missing: 5 - n, pendingReview: n, completionRate: 70 + n, average: 60 + n * 5, highest: 95, lowest: 40 });
const analytics = { ok: true, generatedAt: NOW, scope: { classId: "", className: "كل الصفوف", from: "", to: "" },
  classes: CLASSES.map(c => ({ classId: c.classId, name: c.name, grade: c.grade, schoolYear: c.schoolYear, active: true, studentCount: c.studentCount })),
  kpis: { activeClasses: 3, activeStudents: 10, publishedAssignments: 7, submissions: 51, expectedSubmissions: 60, missingSubmissions: 9, pendingReview: 4, lateSubmissions: 3, completionRate: 85, average: 72.4, highest: 98, lowest: 31, performanceChange: 3.2, followUpStudents: 2, neverLogged: 1 },
  submissionStatus: { submitted: 51, missing: 9, pendingReview: 4, late: 3 },
  gradeDistribution: [{ label: "90-100", count: 6 }, { label: "80-89", count: 10 }, { label: "70-79", count: 9 }, { label: "50-69", count: 8 }, { label: "أقل من 50", count: 3 }],
  assignmentTrend: [trend(1), trend(2), trend(3), trend(4)],
  classComparison: [{ classId: "c1", name: "العاشر – أ", grade: "10", students: 6, assignments: 4, expected: 24, submitted: 22, missing: 2, pendingReview: 2, completionRate: 91.7, average: 84.2 }, { classId: "c2", name: "الحادي عشر – ب", grade: "11", students: 4, assignments: 3, expected: 12, submitted: 10, missing: 2, pendingReview: 2, completionRate: 83.3, average: 71 }],
  topicAnalytics: ["الدوال التربيعية", "المعادلات الخطية", "الهندسة التحليلية", "الإحصاء", "المتتاليات", "الاحتمالات"].map((topic, i) => ({ topic, average: [91, 87, 79, 74, 66, 58][i], gradedQuestions: 10 + i })),
  followUp: [{ userId: "u3", displayName: "جود النجار", identityNumber: "400002222", classId: "c1", className: "العاشر – أ", average: 48, assigned: 5, completed: 3, missing: 2, completionRate: 60, trendDelta: -12, trend: "declining", lastLoginAt: NOW, severity: "high", reasons: ["المعدل منخفض"] }],
  topImprovers: [], insights: [{ tone: "info", title: "نسبة التسليم جيدة", text: "ارتفعت نسبة التسليم ٥٪ عن الشهر الماضي." }], students: [], studentDetail: null };
const ASSIGNMENTS = [
  ["a1", "c1", "اختبار الدوال التربيعية", "2026-10-20T20:00:00.000Z", 10],
  ["a2", "c2", "برمجة: الحلقات والمصفوفات", "2026-10-21T20:59:00.000Z", 6],
  ["a3", "c2", "واجب الشبكات ٣", "2026-10-22T20:00:00.000Z", 12],
  ["a4", "c1", "مراجعة الوحدة الثانية", "2026-10-30T20:00:00.000Z", 8],
].map(([assignmentId, classId, title, dueAt, questionCount]) => ({ assignmentId, classId, className: CLASSES.find(c => c.classId === classId).name, title, instructions: "", status: "published", openAt: "", dueAt, questionCount, totalMarks: 100, maxAttempts: 3, durationMinutes: 0 }));
const lr = (o = {}) => ({ attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-10-01T09:05:00.000Z", finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview", ...o });
const fin = p => lr({ score: p, percentage: p, finalized: true, manualReviewMarks: 0, gradingStatus: "final" });
const resultRows = STUDENTS.slice(0, 6).map((s, i) => {
  const latest = i === 4 ? null : i === 2 ? lr() : fin(70 + i * 5);
  return { studentId: s.userId, studentName: s.displayName, studentCode: s.identityNumber, attemptsUsed: latest ? 1 : 0, allowedAttempts: 3, dueAtOverride: null, attemptStatus: latest ? "submitted" : "notStarted", gradingStatus: latest ? latest.gradingStatus : "notSubmitted", activeAttempt: null, attempts: latest ? [latest] : [], latestResult: latest };
});
const results = { ok: true, assignment: { assignmentId: "a1", title: ASSIGNMENTS[0].title, dueAt: ASSIGNMENTS[0].dueAt, durationMinutes: 0, maxAttempts: 3, totalMarks: 100 }, stats: { students: 6, submitted: 5, pendingReview: 1, finalized: 4, notSubmitted: 1, active: 0, average: 79, highest: 95, lowest: 62 }, students: resultRows };
const studentDashboard = { ok: true, student: { userId: "u1", code: "C-101", displayName: "أحمد الحسن", classId: "c1", shareAchievements: false }, classroom: { classId: "c1", name: "العاشر – أ", grade: "10", schoolYear: "2026" },
  assignments: ASSIGNMENTS.filter(a => a.classId === "c1").map(a => ({ assignmentId: a.assignmentId, title: a.title, status: "published", dueAt: a.dueAt, totalMarks: 100, questionCount: a.questionCount, maxAttempts: 3, attemptsUsed: 0, durationMinutes: 0 })), stats: { assigned: 2, completed: 0, average: 0 } };

// UX-R4 — the Today hub's summary (GET /api/teacher-today), so the dashboard's live attention cards render with rows.
const teacherToday = { ok: true, generatedAt: NOW, scope: { activeClasses: 3, students: 10, publishedAssignments: 4 },
  attention: {
    activeAttempts: { count: 1, items: [{ assignmentId: "a2", title: ASSIGNMENTS[1].title, className: "الحادي عشر – ب", studentId: "u7", studentName: "ليث فادي", startedAt: "2026-10-20T08:21:00.000Z", status: "started", lastActivityAt: "2026-10-20T08:27:00.000Z" }] },
    staleAttempts: { count: 0, items: [] },
    dueSoon: { count: 1, items: [{ assignmentId: "a2", title: ASSIGNMENTS[1].title, className: "الحادي عشر – ب", dueAt: ASSIGNMENTS[1].dueAt, notSubmitted: 3, expected: 4 }] },
    resultsUnreleased: { count: 0, items: [] },
    openingSoon: { count: 0, items: [] },
    notStarted: { count: 5, assignments: 2, items: [{ assignmentId: "a3", title: ASSIGNMENTS[2].title, className: "الحادي عشر – ب", dueAt: ASSIGNMENTS[2].dueAt, notStarted: 3, expected: 4 }, { assignmentId: "a1", title: ASSIGNMENTS[0].title, className: "العاشر – أ", dueAt: ASSIGNMENTS[0].dueAt, notStarted: 2, expected: 6 }] },
    pendingReview: { count: 12, assignments: 1, items: [{ assignmentId: "a1", title: ASSIGNMENTS[0].title, className: "العاشر – أ", pendingReview: 12 }] },
    unreadMessages: { total: 2, capped: false },
  },
  recent: [{ kind: "submitted", at: "2026-10-20T08:12:00.000Z", assignmentId: "a1", title: ASSIGNMENTS[0].title, className: "العاشر – أ", studentId: "u1", studentName: "أحمد الحسن", percentage: 86 }, { kind: "started", at: "2026-10-20T08:21:00.000Z", assignmentId: "a2", title: ASSIGNMENTS[1].title, className: "الحادي عشر – ب", studentId: "u7", studentName: "ليث فادي" }],
  partial: [] };

// UX-R7 — the Reports Center (GET /api/reports): the filters, a class's students and the assessments report (the shapes of the
// ReportsCenter.ux6b fixtures), so an opened report renders its KPIs, distribution chart, tables and matrix.
const REPORTS = {
  filters: { ok: true, schoolYears: ["2026"], classes: CLASSES.map(c => ({ classId: c.classId, name: c.name, schoolYear: c.schoolYear, status: "active", programCodes: [] })), projects: [] },
  classStudents: { ok: true, students: STUDENTS.slice(0, 6).map(s => ({ studentId: s.userId, displayName: s.displayName })) },
  assignments: { ok: true, type: "assignments", class: { classId: "c1", name: CLASSES[0].name },
    students: STUDENTS.slice(0, 3).map(s => ({ studentId: s.userId, displayName: s.displayName })),
    overall: { assessmentCount: 2, participants: 6, average: 68.5, submissionRate: 83, distribution: { "0-49": 1, "50-59": 1, "60-69": 1, "70-79": 1, "80-89": 1, "90-100": 1 } },
    perAssignment: [{ assignmentId: "a1", title: ASSIGNMENTS[0].title, students: 6, submitted: 5, missing: 1, zeroScores: 0, submissionRate: 83, average: 72, avgAttempts: 1.2 }, { assignmentId: "a4", title: ASSIGNMENTS[3].title, students: 6, submitted: 4, missing: 2, zeroScores: 1, submissionRate: 67, average: 61, avgAttempts: 1 }],
    matrix: [
      { assignmentId: "a1", title: ASSIGNMENTS[0].title, cells: STUDENTS.slice(0, 3).map((s, i) => ({ studentId: s.userId, state: i === 2 ? "missing" : "submitted", percentage: i === 2 ? null : 80 - i * 15 })) },
      { assignmentId: "a4", title: ASSIGNMENTS[3].title, cells: STUDENTS.slice(0, 3).map((s, i) => ({ studentId: s.userId, state: i === 1 ? "pending" : "submitted", percentage: i === 1 ? null : 70 })) },
    ] },
};
// UX-R9a — the learning book page's «قراءة صفوفي» (the shapes of the ClassReadingPanel.l4 fixtures): class c1 carries the book
// with two published units, so the panel shows its KPI strip and tables. Served only while a learning scene is captured, so the
// shared classes payload (and every other page's capture) stays as it is.
const LEARNING_COURSE = "791381";
const LEARNING_MODULES = [["791381-m01", "الوحدة الأولى"], ["791381-m02", "الوحدة الثانية"], ["791381-m03", "الوحدة الثالثة"]].map(([moduleId, title], i) => ({ moduleId, title, order: i + 1 }));
const LEARNING = {
  classes: { ok: true, classes: CLASSES.map(c => c.classId === "c1" ? { ...c, learningMaterials: [{ courseId: LEARNING_COURSE, visibleModuleIds: ["791381-m01", "791381-m02"] }] } : c) },
  catalog: { ok: true, courses: [{ courseId: LEARNING_COURSE, title: "شبكات الاتصال", subject: "أنظمة محوسبة", modules: LEARNING_MODULES }] },
  reading: { ok: true, classId: "c1", courseId: LEARNING_COURSE, generatedAt: NOW, totalPages: 20,
    modules: [{ ...LEARNING_MODULES[0], total: 10, started: 4, completed: 2, averageRead: 58 }, { ...LEARNING_MODULES[1], total: 10, started: 2, completed: 0, averageRead: 12 }],
    students: STUDENTS.slice(0, 4).map((st, i) => ({ userId: st.userId, displayName: st.displayName, code: st.code, modules: { "791381-m01": [10, 7, 3, 0][i], "791381-m02": [4, 1, 0, 0][i] }, readPages: [14, 8, 3, 0][i], totalPages: 20, lastReadAt: i === 3 ? null : NOW })) },
};
let scene = "";
// UX-R16a — the six science simulators as one student exam (scene "sims"): each question carries a plugin's code-owned starter
// config (scripts/ux-r16a-sim-starters.json, pinned to smartSimStarterConfig by src/scienceColours.ux-r16a.test.ts), sanitized by
// the API's own student sanitizer, so the student page renders exactly what a real attempt would.
const SIM_KEYS = ["physicsFreeFall", "physicsMotion", "physicsLab", "chemistryStructure", "chemistryReactions", "chemistryLab"];
const SIM_STARTERS = JSON.parse(fs.readFileSync(path.join(root, "scripts", "ux-r16a-sim-starters.json"), "utf8"));
const SIM_EXAM = createRequire(import.meta.url)("../api/src/lib/student-exam-sanitize.js").sanitizeExamForStudent({ examId: "E-sims", title: "تجارب العلوم", schemaVersion: 2,
  sections: [{ id: "s1", title: "التجارب", gradingPolicy: "all", stimuli: {}, questions: SIM_KEYS.map((k, i) => ({ examQuestionId: "sim-" + k, presentationType: "smartSim", questionTypeVersion: 1, text: "التجربة " + (i + 1), marks: 6,
    smartSim: { schemaVersion: 1, pluginKey: k, pluginVersion: 1, config: SIM_STARTERS[k] }, answer: { scoring: "proportional", checks: [] } })) }] });
const SIM_ASSIGNMENT = { assignmentId: "a1", title: "تجارب العلوم", instructions: "", openAt: "2026-10-01T08:00:00.000Z", dueAt: "2026-10-30T20:00:00.000Z", maxAttempts: 3, questionCount: SIM_KEYS.length, totalMarks: 6 * SIM_KEYS.length, exam: SIM_EXAM };
const SIM_STATE = { attemptsUsed: 0, allowedAttempts: 3, canAttempt: true, dueClosed: false, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [] };
// UX-R8 — the messages pages (the shapes of the AppMessages.5c / StudentPortal.messages / 5D fixtures): a direct conversation over
// two days with consecutive messages, an unread count in the roster, and the student's dedicated view, so a thread, its bubbles,
// the roster rows and both composers are captured, not only the empty start state.
const msg = (n, senderRole, senderDisplayName, body, createdAt) => ({ messageId: String(9000000000000 + n) + "-" + "a".repeat(16), kind: "direct", senderRole, senderDisplayName, body, createdAt });
const directWith = (name, first) => [
  msg(1, "student", name, "أستاذ، هل يمكن تأجيل تسليم واجب الدوال إلى الغد؟", "2026-10-19T17:05:00.000Z"),
  msg(2, "teacher", "أ. محمد", "أهلًا " + first + ". " + "يمكنك التسليم حتى الغد الساعة الثامنة مساءً.", "2026-10-19T17:20:00.000Z"),
  msg(3, "student", name, "شكرًا جزيلًا!", "2026-10-19T17:22:00.000Z"),
  msg(4, "student", name, "أرسلت الحل الآن، هل وصل؟", "2026-10-20T07:58:00.000Z"),
  msg(5, "teacher", "أ. محمد", "وصل، سأراجعه اليوم.", "2026-10-20T08:10:00.000Z"),
  msg(6, "teacher", "أ. محمد", "تذكير: راجع السؤال الثالث قبل الاختبار.", "2026-10-20T08:11:00.000Z"),
];
const DIRECT = directWith("أحمد الحسن", "أحمد");
const threadFor = id => { const st = STUDENTS.find(x => x.userId === id); return { ok: true, canSend: true, readOnlyReason: "", hasMore: false, hasNewer: false, messages: st ? directWith(st.displayName, st.firstName) : [] }; };
const STUDENT_MESSAGES = { ok: true, direct: DIRECT, announcements: [{ ...msg(7, "teacher", "أ. محمد", "اختبار الوحدة الثانية يوم الأحد القادم.", "2026-10-19T09:00:00.000Z"), kind: "announcement" }],
  classroom: { classId: "c1", name: "العاشر – أ", archived: false }, canSend: true, readOnlyReason: "" };
const NO_UNREAD = { unread: 0, capped: false };

// UX-R11a — the bank, the review inbox and the activity log (the shapes of the ExamBankPage.ux6c, ReviewInboxPage.14b and
// AuditHistoryPanel fixtures), so the questions table, the saved exams, the inbox tasks and the log rows are captured.
const bq = (id, over) => ({ id, sourceId: "import-quiz-20260301-abc123", sourceKind: "import", official: false, questionNumber: "1", section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, difficultyLabel: "",
  type: "multipleChoice", presentationType: "multipleChoice", text: "ما هو الراوتر؟", options: [{ value: "a", text: "جهاز توجيه" }, { value: "b", text: "كابل" }], fields: [], wordBank: [],
  answer: { mode: "singleChoice", correctOptionValue: "a", values: ["a"] }, hasImage: false, reviewStatus: "classified", createdAt: NOW, updatedAt: NOW, ...over });
const BANK = [
  bq("791381-2025-exam-q1", { sourceId: "791381-2025-exam", sourceKind: "official", official: true, text: "ما هو عنوان IP؟", topic: "IP_ADDRESSING", difficulty: 1 }),
  bq("import-quiz-20260301-abc123-1", { text: "عرّف شبكة VLAN واذكر فائدتين لها", topic: "SWITCHING", difficulty: 3, presentationType: "open", type: "shortAnswer", options: [], answer: { mode: "manual", values: [] }, reviewStatus: "pending-classification" }),
  bq("manual-x1", { sourceId: "manual", sourceKind: "manual", text: "أكمل: قناع الشبكة الافتراضي للفئة C هو ____", section: "INFRASTRUCTURE", topic: "SUBNETTING", difficulty: null, presentationType: "fillBlank", type: "multiField", options: [], fields: [{ id: "f1", label: "القناع", correct: "255.255.255.0" }], answer: { mode: "exactSequence", values: ["255.255.255.0"] } }),
  bq("manual-x2", { sourceId: "manual", sourceKind: "manual", text: "ما وظيفة بروتوكول DHCP؟", topic: "ROUTING" }),
];
const SAVED_EXAMS = [{ blobName: "exams/e1.json", examId: "e1", title: "امتحان الفصل الأول", savedAt: NOW, questionCount: 12, totalMarks: 100 }, { blobName: "exams/e2.json", examId: "e2", title: "اختبار قصير — الشبكات المحلية", savedAt: NOW, questionCount: 6, totalMarks: 30 }];
const INBOX_TASKS = ["امتحان الشبكات — الفصل الأول", "اختبار التوجيه الديناميكي"].map((title, i) => ({ examId: "EX-" + i, cycleId: "cyc-" + i, revisionId: "rev-" + i, revisionNumber: 3 - i, stage: "review", title, authorId: "teacher-author", submittedAt: NOW, createdAt: NOW, lifecycleState: "in-review", stateVersion: 4, reviewStatus: "pending" }));
const AUDIT_EVENTS = [["class.create", "class", "العاشر – أ", { grade: "10" }], ["student.bulkImport", "class", "الحادي عشر – ب", { createdCount: 5, duplicateCount: 1, failedCount: 0 }], ["student.archive", "student", "رنا سليمان", {}], ["class.create", "class", "الثاني عشر – أ", { grade: "12" }]]
  .map(([action, targetType, targetLabel, details], i) => ({ eventId: "ev" + i, timestamp: NOW, actor: "t", action, targetType, targetId: "x" + i, targetLabel, details }));
// UX-R10 — the projects pages (the shapes of the ProjectWorkspace.ux6 fixtures): two projects in the hub, and project 794589 for
// class c1 with a dashboard, student cards, a student profile, analytics (charts and heatmap) and the stage settings. The sidebar
// totals stay 0 so «المشاريع» keeps its exact accessible name; the per-project badge comes from byProject.
const P_TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }, { trackId: "packetTracer", title: "Packet Tracer", icon: "🖧" }];
const P_CATALOG = [{ projectCode: "794589", title: "مشروع الشبكات 794589", tracks: P_TRACKS }, { projectCode: "899373", title: "مشروع قواعد البيانات 899373", tracks: [P_TRACKS[0], { trackId: "access", title: "Access" }] }];
const P_STAGES = [
  { stageId: "B01", track: "book", groupId: "g1", title: "مقدمة الشبكات", description: "اقرأ الفصل الأول", order: 1, weight: 1, required: true, active: true },
  { stageId: "B02", track: "book", groupId: "g1", title: "طبقات OSI", order: 2, weight: 1, required: false, active: true },
  { stageId: "P01", track: "packetTracer", groupId: "g2", title: "أول طوبولوجيا", order: 1, weight: 1, required: true, active: true },
  { stageId: "P02", track: "packetTracer", groupId: "g2", title: "شبكة VLAN", order: 2, weight: 1, required: true, active: true },
];
const P_GROUPS = [{ groupId: "g1", track: "book", title: "الوحدة الأولى", order: 1 }, { groupId: "g2", track: "packetTracer", title: "مختبرات", order: 1 }];
const P_CARD = (st, i) => ({ studentId: st.userId, displayName: st.displayName, code: st.code, overallProgress: [45, 100, 70, 20, 0, 85][i], trackProgress: { book: [60, 100, 80, 30, 0, 90][i], packetTracer: [30, 100, 60, 10, 0, 80][i] },
  counts: { not_started: [4, 0, 1, 6, 8, 1][i], in_progress: [2, 0, 2, 1, 0, 1][i], ready_for_review: [1, 0, 1, 0, 0, 1][i], approved: [3, 10, 6, 1, 0, 7][i] }, readyForReviewCount: [1, 0, 1, 0, 0, 1][i], complete: i === 1, updatedAt: NOW, stale: i === 4 });
const P_STUDENTS = STUDENTS.slice(0, 6).map(P_CARD);
const P_DETAIL = { ok: true, readOnly: false, projectCode: "794589", student: { studentId: "u1", displayName: STUDENTS[0].displayName, code: STUDENTS[0].code },
  tracks: P_TRACKS, summary: P_STUDENTS[0], stages: P_STAGES, groups: P_GROUPS, trackWeights: { book: 1, packetTracer: 1 }, config: { staleDays: 7, lateThreshold: 40, balanceWarningThreshold: 30 },
  progress: { B01: { status: "ready_for_review", note: "راجع القسم 2", updatedAt: NOW }, B02: { status: "in_progress", updatedAt: NOW }, P01: { status: "approved", updatedAt: NOW } },
  history: [{ eventId: "e1", stageId: "B01", type: "status", fromStatus: "in_progress", toStatus: "ready_for_review", actor: "t", createdAt: NOW }],
  nextStages: { book: P_STAGES[1], packetTracer: P_STAGES[3] }, balance: null };
const P_ANALYTICS = {
  perStudent: P_STUDENTS.map(c => ({ studentId: c.studentId, name: c.displayName, trackProgress: c.trackProgress, overall: c.overallProgress })),
  stageCompletion: P_STAGES.map((st, i) => ({ stageId: st.stageId, title: st.title, track: st.track, groupId: st.groupId, approvedPct: [50, 33, 67, 17][i] })),
  buckets: { "0-25": 2, "26-50": 1, "51-75": 1, "76-99": 1, "100": 1 },
  weeklyTrend: [{ weekStart: "2026-09-27", avgOverall: 28 }, { weekStart: "2026-10-04", avgOverall: 41 }, { weekStart: "2026-10-11", avgOverall: 52 }, { weekStart: "2026-10-18", avgOverall: 53 }],
  heatmap: { students: P_STUDENTS.map(c => ({ studentId: c.studentId, name: c.displayName })), stages: P_STAGES.map(st => ({ stageId: st.stageId, title: st.title, track: st.track, groupId: st.groupId })),
    statuses: P_STUDENTS.map((c, i) => ({ B01: ["ready_for_review", "approved", "approved", "in_progress", "not_started", "approved"][i], B02: ["in_progress", "approved", "ready_for_review", "not_started", "not_started", "approved"][i], P01: ["approved", "approved", "in_progress", "not_started", "not_started", "ready_for_review"][i], P02: ["not_started", "approved", "not_started", "not_started", "not_started", "in_progress"][i] })) },
};
const P_SUMMARY = { studentCount: 6, avgOverall: 53, trackAverages: { book: 60, packetTracer: 47 }, completedCount: 1, studentsReadyForReview: 3, totalReadyStages: 3, staleCount: 1, trackWeights: { book: 1, packetTracer: 1 }, staleDays: 7 };
const P_CLASSES = CLASSES.slice(0, 2).map(c => ({ classId: c.classId, name: c.name, grade: c.grade, schoolYear: c.schoolYear, status: "active", studentCount: c.studentCount }));
function projectTracker(q) {
  const r = q.get("resource");
  if (r === "projects-summary") return { ok: true, totalReadyForReview: 0, byProject: { "794589": 3 }, totalSelfReported: 0, selfReportedByProject: {}, byClass: {} };
  if (r === "projects") return { ok: true, projects: P_CATALOG };
  if (r === "classes") return { ok: true, projectCode: "794589", title: P_CATALOG[0].title, tracks: P_TRACKS, classes: P_CLASSES };
  if (r === "summary") return { ok: true, summary: P_SUMMARY, tracks: P_TRACKS, readOnly: false };
  if (r === "students") return { ok: true, students: P_STUDENTS, tracks: P_TRACKS, config: { lateThreshold: 40 }, readOnly: false };
  if (r === "student") return P_DETAIL;
  if (r === "analytics") return { ok: true, analytics: P_ANALYTICS, tracks: P_TRACKS, groups: P_GROUPS, readOnly: false };
  if (r === "template") return { ok: true, template: { stages: P_STAGES, groups: P_GROUPS, trackWeights: { book: 1, packetTracer: 1 }, config: { staleDays: 7, lateThreshold: 40 } }, tracks: P_TRACKS, readOnly: false };
  return { ok: true, projects: [] };
}

// UX-R12 — the grading workspace (GET /api/assignment-review, the shapes of the reviewWorkspace.ux003 fixtures): a pending attempt
// with a correct and a wrong choice, two open answers waiting for a manual mark, a partial and an unanswered question, so the
// filters, the navigator, every status and the grade rows are captured.
const RQ = (id, n, over) => ({ questionId: id, questionNumber: n, text: "نص السؤال " + n, marks: 4, type: "shortAnswer", studentAnswer: { kind: "text", value: "الراوتر يربط بين شبكتين مختلفتين ويختار أفضل مسار للحزم." }, expectedAnswer: { text: "جهاز يوجّه الحزم بين الشبكات" }, autoGrade: { score: 4, manualReview: false }, manualScore: null, teacherComment: "", ...over });
const REVIEW_ATTEMPT = { attemptNumber: 1, submittedAt: "2026-10-01T09:05:00.000Z", score: 10, totalMarks: 24, percentage: 42, manualReviewMarks: 8, finalized: false, gradingStatus: "pendingReview", startedAt: "2026-10-01T08:30:00.000Z", endedAt: "2026-10-01T09:05:00.000Z", endReason: "submitted", timedOut: false };
const REVIEW = { ok: true, assignment: { assignmentId: "a1", title: ASSIGNMENTS[0].title, totalMarks: 24 }, student: { studentId: STUDENTS[2].userId, studentName: STUDENTS[2].displayName, studentCode: STUDENTS[2].identityNumber }, attempt: { ...REVIEW_ATTEMPT, teacherFeedback: "" }, attempts: [REVIEW_ATTEMPT],
  questions: [
    RQ("q1", 1, { type: "multipleChoice", text: "ما الجهاز الذي يربط بين شبكتين مختلفتين؟", options: [{ text: "الراوتر" }, { text: "السويتش" }, { text: "الهب" }], studentAnswer: { kind: "choice", index: 0 }, expectedAnswer: { correctOptionIndex: 0 } }),
    RQ("q2", 2, { type: "multipleChoice", text: "أي طبقة يعمل عليها السويتش؟", options: [{ text: "الطبقة الأولى" }, { text: "الطبقة الثانية" }], studentAnswer: { kind: "choice", index: 0 }, expectedAnswer: { correctOptionIndex: 1 }, autoGrade: { score: 0, manualReview: false } }),
    RQ("q3", 3, { text: "اشرح وظيفة الراوتر في الشبكة.", autoGrade: { score: 0, manualReview: true } }),
    RQ("q4", 4, { text: "اذكر فائدتين لتقسيم الشبكة.", autoGrade: { score: 2, manualReview: false } }),
    RQ("q5", 5, { text: "ما عنوان الشبكة للعنوان 192.168.1.37/24؟", studentAnswer: null, autoGrade: { score: 0, manualReview: false } }),
    RQ("q6", 6, { text: "قارن بين بروتوكولي TCP وUDP.", autoGrade: { score: 0, manualReview: true } }),
  ] };

const apiCalls = new Map();
let role = "teacher";
function api(req, res) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  apiCalls.set(req.method + " " + p, (apiCalls.get(req.method + " " + p) || 0) + 1);
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  if (p === "/api/platform-session") return role ? send(200, { ok: true, role, displayName: role === "teacher" ? "أ. محمد" : "أحمد الحسن" }) : send(401, { ok: false });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. محمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/teacher-analytics") return send(200, analytics);
  if (p === "/api/reports") return send(REPORTS[u.searchParams.get("type")] ? 200 : 400, REPORTS[u.searchParams.get("type")] || { ok: false, error: "unknown report" });
  if (p === "/api/teacher-today") return send(200, teacherToday);
  if (p === "/api/bank-questions" && req.method === "GET") return send(200, { ok: true, questions: BANK });
  if (p === "/api/saved-exams" && req.method === "GET") return send(200, { ok: true, exams: SAVED_EXAMS });
  if (p === "/api/governance-inbox") return send(200, { items: u.searchParams.get("stage") === "review" ? INBOX_TASKS : [], nextCursor: null, counts: { review: 2, approve: 0, publish: 0 }, actorId: "teacher-reviewer" });
  if (p === "/api/audit-history") return send(200, { ok: true, events: AUDIT_EVENTS, count: AUDIT_EVENTS.length, limit: 100 });
  if (scene === "sims" && p.startsWith("/api/student-assignment/")) return send(200, { ok: true, assignment: SIM_ASSIGNMENT });
  if (scene === "sims" && p.startsWith("/api/student-submission/")) return send(200, req.method === "GET" ? { ok: true, state: SIM_STATE } : { ok: true, savedAt: NOW, state: SIM_STATE });
  if (scene === "learning" && p === "/api/classrooms") return send(200, LEARNING.classes);
  if (scene === "learning" && p === "/api/learning-materials-catalog") return send(200, LEARNING.catalog);
  if (scene === "learning" && p.startsWith("/api/learning-class-progress/")) return send(200, LEARNING.reading);
  // UX-R9b — the reader's module bodies, read from the API's own content data (the shape /api/learning-content returns).
  if (p.startsWith("/api/learning-content/")) {
    const [, , , courseId, moduleId] = p.split("/");
    const file = path.join(root, "api/src/data/learning-content", courseId || "", (moduleId || "") + ".json");
    return /^[\w-]+$/.test(courseId || "") && /^[\w-]+$/.test(moduleId || "") && fs.existsSync(file)
      ? send(200, { ok: true, courseId, module: JSON.parse(fs.readFileSync(file, "utf8")) }) : send(404, { ok: false, error: "not found" });
  }
  if (p === "/api/classrooms") return send(200, { ok: true, classes: CLASSES });
  if (p === "/api/students" && u.searchParams.get("profileUserId")) return send(200, { ok: true, profile: null });
  if (p === "/api/students") return send(200, { ok: true, students: STUDENTS.filter(s => !u.searchParams.get("classId") || s.classId === u.searchParams.get("classId")) });
  if (p === "/api/assignments" && req.method === "GET") return send(200, { ok: true, assignments: ASSIGNMENTS });
  if (p === "/api/assignment-results" && req.method === "GET") return send(200, results);
  if (p === "/api/assignment-review" && req.method === "GET") return send(200, REVIEW);
  if (p === "/api/project-tracker") return send(200, projectTracker(u.searchParams));
  if (p === "/api/messages" && req.method === "POST") return send(200, { ok: true, ...NO_UNREAD });
  // The roster's unread count for class c1 only: the sidebar's own summary stays at 0, so «الرسائل» keeps its exact accessible name.
  if (p === "/api/messages" && u.searchParams.get("kind") === "unread-summary" && u.searchParams.get("classId") === "c1") return send(200, { ok: true, totalUnread: 2, capped: false, byStudent: { u2: { unread: 2, capped: false } } });
  if (p === "/api/messages" && (u.searchParams.get("studentId") || u.searchParams.get("kind") === "announcements")) return send(200, threadFor(u.searchParams.get("studentId") || ""));
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false, threads: [] });
  if (p === "/api/student-messages" && req.method === "POST") return send(200, { ok: true, directUnread: NO_UNREAD, announcementUnread: NO_UNREAD, totalUnread: 0, totalCapped: false });
  if (p === "/api/student-messages" && u.searchParams.get("view")) return send(200, { ok: true, directUnread: NO_UNREAD, announcementUnread: NO_UNREAD, totalUnread: 0, totalCapped: false, items: [] });
  if (p === "/api/student-messages") return send(200, STUDENT_MESSAGES);
  if (p === "/api/student-dashboard") return send(200, studentDashboard);
  if (p === "/api/student-notifications") return send(200, { ok: true, items: [], unread: 0, total: 0 });
  return send(200, { ok: true, items: [], exams: [], templates: [], questions: [], classes: [], students: [], assignments: [], projects: [], posts: [], threads: [] });
}
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
// The gallery is a separate static build (vite, the repository's own config) served from its own root under /gallery/.
const galleryDir = path.join(out, "gallery-build");
if (part === "gallery" || part === "all") {
  const { build } = await import("vite");
  await build({ configFile: path.join(root, "vite.config.ts"), root, base: "/gallery/", logLevel: "warn", publicDir: path.join(root, "public"), build: { outDir: galleryDir, emptyOutDir: true, copyPublicDir: false, rollupOptions: { input: path.join(root, "browser-harness/ux-r-gallery.html") } } });
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) { req.resume(); req.on("end", () => api(req, res)); return; }
  const gallery = u.pathname.startsWith("/gallery/");
  const base = gallery ? galleryDir : u.pathname.startsWith("/fonts/") && part === "gallery" ? path.join(root, "public") : dist;
  let full = path.resolve(base, "." + decodeURIComponent(gallery ? u.pathname.slice("/gallery".length) : u.pathname));
  if (!full.startsWith(base + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = gallery ? path.join(galleryDir, "browser-harness/ux-r-gallery.html") : path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;

// ---- pages: every teacher sidebar destination (by its visible label), the student portal, the login screen ----
const TEACHER_PAGES = [
  ["dashboard", "لوحة المتابعة"], ["learning", "المواد التعليمية"], ["students", "الصفوف والطلاب"], ["assignments", "الواجبات"],
  ["messages", "الرسائل"], ["projects", "المشاريع"], ["reports", "التقارير"], ["games", "الألعاب التعليمية"], ["bank", "بنك الامتحانات"],
  ["import", "استيراد من ملف"], ["reviews", "مراجعات النشر"], ["audit", "سجل النشاط"],
];
// UX-R9a — the learning book page (the section index and an opened «قراءة صفوفي») and the library search with results.
// UX-R9b — the teacher reader on its first content page (after the unit opener): top bar, index, page and page bar.
// UX-R7 — an OPENED report (not only the hub): «التقييمات والواجبات» for the first class, so its KPI strip, chart and tables are
// captured, and the chart container's height is measured (a chart with no height is a blank card).
// UX-R8 — an OPENED conversation (class «العاشر – أ», the SECOND roster row, so the unread student listed first keeps its count and the roster filters stay shown) and the student's dedicated messages view.
const SCRIPTED = [
  // UX-R13 — the games: the teacher's number-conversion preview and live-challenge authoring, and the student's games page.
  { id: "games-conversion", role: "teacher", nav: "الألعاب التعليمية", run: async page => {
    await page.getByRole("button", { name: "معاينة اللعبة" }).first().click({ timeout: 15000 });
    await page.locator(".eb-ncgame").waitFor({ timeout: 15000 });
    // UX-R13 — inside the teacher shell the game view must not paint the student portal's gradient band.
    const band = await page.evaluate(() => getComputedStyle(document.querySelector(".eb-shell-content .eb-games-surface")).backgroundImage);
    if (band !== "none") throw new Error("the teacher game view paints the student background: " + band.slice(0, 60));
  } },
  { id: "games-live", role: "teacher", nav: "الألعاب التعليمية", run: async page => {
    await page.getByRole("button", { name: "إنشاء تحدٍّ" }).first().click({ timeout: 15000 });
    await page.locator(".eb-lc").first().waitFor({ timeout: 15000 });
    // UX-R13 — inside the teacher shell the game view must not paint the student portal's gradient band.
    const band = await page.evaluate(() => getComputedStyle(document.querySelector(".eb-shell-content .eb-games-surface")).backgroundImage);
    if (band !== "none") throw new Error("the teacher game view paints the student background: " + band.slice(0, 60));
  } },
  ...[["student-games", false], ["student-games-join", true]].map(([id, join]) => ({ id, role: "student", run: async page => {
    await page.getByRole("button", { name: /الألعاب/ }).first().click({ timeout: 15000 });
    await page.locator(".eb-games-surface").waitFor({ timeout: 15000 });
    if (!join) return;
    await page.getByRole("button", { name: "انضم إلى غرفة" }).click({ timeout: 15000 });
    await page.locator(".eb-lc-code-input").waitFor({ timeout: 15000 });
    // UX-R13 — the room code is typed in the monospace face (it read an undefined token and fell back to the body font).
    const face = await page.evaluate(() => getComputedStyle(document.querySelector(".eb-lc-code-input")).fontFamily);
    if (!/mono/i.test(face)) throw new Error("the room code field is not monospace: " + face);
  } })),
  // UX-R16a — each science simulator on its own exam page (opened from «ابدأ الحل», then picked in «قائمة الأسئلة»).
  ...SIM_KEYS.map((k, i) => ({ id: "sim-" + k, role: "student", scene: "sims", run: async page => {
    await page.getByRole("button", { name: "ابدأ الحل" }).first().click({ timeout: 15000 });
    await page.locator(".iex-page-heading").first().waitFor({ timeout: 15000 });
    if (i > 0) { await page.locator(".iex-nav-trigger").click({ timeout: 15000 }); await page.locator(".iex-nav-q").nth(i).click({ timeout: 15000 }); }
    await page.locator(".iex-page .iex-card").first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(800);
    if (process.env.PROBE) console.log("PROBE", JSON.stringify(await page.evaluate(new Function(process.env.PROBE))));
    // UX-R16a — every control of the simulator stays inside its own box (a field that spills past its fieldset's edge is
    // drawn over the next box and cut off on a phone).
    const spills = await page.evaluate(() => [...document.querySelectorAll(".iex-page fieldset")].flatMap(fs => {
      const b = fs.getBoundingClientRect();
      return [...fs.querySelectorAll("input:not([type=range]):not([type=checkbox]):not([type=radio]), select, button")].filter(c => c.offsetParent).map(c => {
        const r = c.getBoundingClientRect(); return { box: (fs.querySelector("legend")?.textContent || "").trim().slice(0, 30), by: Math.round(Math.max(b.left - r.left, r.right - b.right)) };
      }).filter(x => x.by > 1);
    }));
    if (spills.length) throw new Error("a control spills out of its box: " + JSON.stringify(spills.slice(0, 3)));
  } })),
  // UX-R12 — the grading workspace, opened from the gradebook's «تصحيح الآن» (the pending student), and its pending filter.
  ...[["review-workspace", null], ["review-pending", /يحتاج إلى تصحيح يدوي/]].map(([id, filter]) => ({ id, role: "teacher", nav: "الواجبات", run: async page => {
    await page.getByRole("button", { name: "فتح", exact: true }).first().click({ timeout: 15000 });
    await page.getByRole("button", { name: "تصحيح الآن" }).first().click({ timeout: 15000 });
    await page.locator(".review-modal.rv-workspace .review-question").first().waitFor({ timeout: 15000 });
    // UX-R12 — a title that wraps must have at least half the header's width (on a phone the student navigation squeezed it to a
    // sliver, three lines tall); a title that fits on one line may be as narrow as its text.
    const squeeze = await page.evaluate(() => {
      const top = document.querySelector(".rv-workspace .review-top"), h = top && top.querySelector("h2"); if (!h) return null;
      const range = document.createRange(); range.selectNodeContents(h);
      const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
      return { lines, title: Math.round(h.getBoundingClientRect().width), header: Math.round(top.getBoundingClientRect().width) };
    });
    if (squeeze && squeeze.lines > 1 && squeeze.title < squeeze.header / 2) throw new Error("the review title is squeezed to " + squeeze.title + " of " + squeeze.header + " px (" + squeeze.lines + " lines)");
    if (filter) await page.locator(".rv-filters").getByRole("button", { name: filter }).click({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  } })),
  // UX-R11b — the Exam Studio: «امتحاناتي» (the builder destination itself), then a blank exam on each of its four steps.
  { id: "studio-home", role: "teacher", nav: "باني الامتحان", run: async page => {
    await page.locator(".st-home").waitFor({ timeout: 15000 });
    // UX-R11b — the create tiles must stay inside «امتحاناتي» (on a phone they ran 20 px past its inline-end edge).
    const spill = await page.evaluate(() => { const home = document.querySelector(".st-home").getBoundingClientRect(); return [...document.querySelectorAll(".st-home-create > li")].reduce((m, li) => { const r = li.getBoundingClientRect(); return Math.max(m, Math.round(home.left - r.left), Math.round(r.right - home.right)); }, 0); });
    if (spill > 0) throw new Error("a create tile spills " + spill + " px out of «امتحاناتي»");
  } },
  ...[["studio-setup", "الإعداد"], ["studio-content", "المحتوى"], ["studio-review", "المراجعة"], ["studio-publish", "النشر"]].map(([id, step]) => ({ id, role: "teacher", nav: "باني الامتحان", run: async page => {
    await page.getByRole("button", { name: /امتحان فارغ/ }).first().click({ timeout: 15000 });
    await page.locator(".sb-builder.st-studio").waitFor({ timeout: 15000 });
    await page.getByRole("navigation", { name: "خطوات العمل" }).getByRole("button", { name: new RegExp(step) }).click({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 0));
  } })),
  // UX-R11a — the bank's questions table and its saved exams (the overview is the sidebar page itself).
  ...[["bank-questions", "بنك الأسئلة"], ["bank-exams", "الامتحانات المحفوظة"]].map(([id, view]) => ({ id, role: "teacher", nav: "بنك الامتحانات", run: async page => {
    await page.locator(".eb-bank .eb-segmented").getByRole("button", { name: view }).click({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  } })),
  // UX-R10 — the project tracker: its dashboard, the student cards, a student profile, the analytics (charts measured like the
  // report chart) and the stage settings.
  ...[["project-dashboard", null], ["project-students", /تقدّم الطلاب/], ["project-profile", /تقدّم الطلاب/], ["project-analytics", /الإحصائيات/], ["project-settings", /إعداد/]].map(([id, view]) => ({
    id, role: "teacher", nav: "المشاريع", chartSel: id === "project-analytics" ? ".eb-project-analytics .eb-chart-canvas" : null, run: async page => {
      await page.getByRole("button", { name: "فتح المشروع" }).first().click({ timeout: 15000 });
      await page.getByRole("group", { name: "أقسام المشروع" }).waitFor({ timeout: 15000 });
      await page.waitForLoadState("networkidle");
      if (view) await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: view }).first().click({ timeout: 15000 });
      if (id === "project-profile") {
        await page.getByRole("button", { name: "فتح ملف الطالب" }).first().click({ timeout: 15000 });
        await page.locator("#eb-student-profile-title").waitFor({ timeout: 15000 });
      }
      if (id === "project-analytics") await page.locator(".eb-heatmap").waitFor({ timeout: 15000 });
      await page.evaluate(() => window.scrollTo(0, 0));
    } })),
  { id: "report-assignments", role: "teacher", nav: "التقارير", open: "فتح التقرير التقييمات والواجبات", pickClass: "c1", chart: true },
  { id: "learning-book", role: "teacher", nav: "المواد التعليمية", scene: "learning", run: async page => {
    await page.getByRole("button", { name: "فتح الكتاب" }).first().click({ timeout: 15000 });
    await page.locator(".eb-lm-batch-details").first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "عرض قراءة الصفوف" }).click({ timeout: 15000 });
    await page.locator(".eb-lm-cr-kpis").waitFor({ timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, 0)); // the full-page shot starts at the top (the top bar is sticky)
  } },
  { id: "learning-search", role: "teacher", nav: "المواد التعليمية", run: async page => {
    await page.getByRole("button", { name: "ابحث في عناوين الدروس والصفحات" }).click({ timeout: 15000 });
    await page.getByRole("searchbox").fill("VLAN", { timeout: 15000 });
    await page.locator("[data-search-hit]").first().waitFor({ timeout: 15000 });
  } },
  { id: "learning-reader", role: "teacher", nav: "المواد التعليمية", run: async page => {
    await page.getByRole("button", { name: "فتح الكتاب" }).first().click({ timeout: 15000 });
    await page.getByRole("button", { name: "بدء القراءة" }).click({ timeout: 15000 });
    await page.locator(".learning-reader-page").waitFor({ timeout: 15000 });
    const first = await page.locator(".learning-reader-navpos").textContent({ timeout: 15000 });
    await page.getByRole("button", { name: /^التالي/ }).click({ timeout: 15000 });
    await page.waitForFunction(t => document.querySelector(".learning-reader-navpos")?.textContent !== t, first, { timeout: 15000 });
    await page.locator(".learning-reader-page-title").waitFor({ timeout: 15000 });
    await page.evaluate(() => window.scrollTo(0, 0));
  } },
  { id: "messages-thread", role: "teacher", nav: "الرسائل", run: async page => {
    await page.getByRole("combobox", { name: "الصف" }).selectOption("c1", { timeout: 15000 });
    await page.getByRole("list", { name: "طلاب الصف" }).getByRole("button").nth(1).click({ timeout: 15000 });
    await page.locator(".eb-msg-conversation:not(.is-offscreen) .eb-msg-bubble").first().waitFor({ timeout: 15000 });
  } },
  { id: "student-messages", role: "student", run: async page => {
    await page.getByRole("button", { name: /الرسائل/ }).first().click({ timeout: 15000 });
    await page.locator(".eb-msg-student-card .eb-msg-bubble").first().waitFor({ timeout: 15000 });
  } },
];
const PAGES = part === "gallery" ? [] : [...TEACHER_PAGES.map(([id, nav]) => ({ id, role: "teacher", nav })), ...SCRIPTED, { id: "student-portal", role: "student" }, { id: "login", role: "" }]
  .filter(pg => !only.length || only.includes(pg.id));
const VIEWPORTS = [["desktop", { width: 1440, height: 900 }, false], ["tablet", { width: 1024, height: 768 }, false], ["phone", { width: 390, height: 844 }, true]]
  .filter(([n]) => !onlyVp.length || onlyVp.includes(n));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const record = { label, dist, generatedAt: new Date().toISOString(), pages: {} }, checks = [];
for (const [vpName, viewport, touch] of VIEWPORTS) {
  fs.mkdirSync(path.join(out, vpName), { recursive: true });
  for (const pg of PAGES) {
    role = pg.role; scene = pg.scene || "";
    const errors = [];
    const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
    if (pg.role) await ctx.addInitScript(r => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "teacher" ? "أ. محمد" : "أحمد الحسن"); }, pg.role);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    let reached = true;
    try {
      await page.goto(origin + "/", { waitUntil: "networkidle" });
      if (pg.nav) {
        const toggle = page.locator(".eb-drawer-toggle");
        if (await toggle.isVisible().catch(() => false)) await toggle.click();
        await page.locator("#eb-sidebar").getByRole("button", { name: pg.nav, exact: true }).first().click({ timeout: 15000 });
        await page.waitForLoadState("networkidle");
      }
      if (pg.open) {
        await page.getByRole("button", { name: pg.open, exact: true }).click({ timeout: 15000 });
        await page.getByRole("combobox", { name: "الصف" }).selectOption(pg.pickClass, { timeout: 15000 });
        await page.locator(".eb-report-result").waitFor({ timeout: 15000 });
        await page.waitForLoadState("networkidle");
      }
      if (pg.run) { await pg.run(page); await page.waitForLoadState("networkidle"); }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
    } catch (e) { reached = false; errors.push("navigation: " + String(e).split("\n")[0]); }
    const file = path.join(out, vpName, pg.id + ".png");
    await page.screenshot({ path: file, fullPage: true });
    const m = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, height: document.documentElement.scrollHeight, h1: document.querySelector("h1")?.textContent?.trim() || "" }));
    const overflow = m.scrollWidth > m.clientWidth;
    if (pg.chartSel) {
      // UX-R10 — a chart with no usable height is a blank card: measure the first chart box and its canvas.
      const chart = await page.evaluate(sel => { const box = document.querySelector(sel); const canvas = box?.querySelector("canvas"); return { box: box ? Math.round(box.getBoundingClientRect().height) : null, canvas: canvas ? Math.round(canvas.getBoundingClientRect().height) : null }; }, pg.chartSel);
      m.chart = chart;
      if (!(chart.box >= 160 && chart.canvas >= 160)) errors.push("project chart has no usable height: " + JSON.stringify(chart));
    }
    if (pg.chart) {
      const chart = await page.evaluate(() => { const box = document.querySelector(".eb-report-result .eb-chart-canvas"); const canvas = box?.querySelector("canvas"); return { box: box ? Math.round(box.getBoundingClientRect().height) : null, canvas: canvas ? Math.round(canvas.getBoundingClientRect().height) : null }; });
      m.chart = chart;
      if (!(chart.box >= 160 && chart.canvas >= 160)) errors.push("report chart has no usable height: " + JSON.stringify(chart));
    }
    (record.pages[pg.id] ||= {})[vpName] = { reached, overflow, ...m, errors, screenshot: path.relative(out, file) };
    checks.push({ ok: reached && !overflow && !errors.length, id: vpName + "/" + pg.id, detail: (reached ? "reached" : "NOT reached") + (overflow ? " · horizontal overflow " + m.scrollWidth + ">" + m.clientWidth : "") + (errors.length ? " · " + errors.length + " error(s)" : "") });
    await ctx.close();
  }
}
if (part === "gallery" || part === "all") {
  fs.mkdirSync(path.join(out, "gallery"), { recursive: true });
  for (const [vpName, viewport, touch] of VIEWPORTS) {
    const errors = [];
    const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    let sections = 0;
    try {
      await page.goto(origin + "/gallery/browser-harness/ux-r-gallery.html", { waitUntil: "networkidle" });
      await page.locator("[data-gallery]").first().waitFor({ timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      sections = await page.locator("[data-gallery]").count();
      await page.screenshot({ path: path.join(out, "gallery", vpName + ".png"), fullPage: true });
      await page.locator("[data-gallery='buttons']").scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: "المزيد من الإجراءات" }).click();
      await page.locator(".eb-menu-panel[data-ready='true']").waitFor({ timeout: 3000 }).catch(() => errors.push("action menu did not open"));
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, "gallery", vpName + "-menu-open.png") });
    } catch (e) { errors.push("gallery: " + String(e).split("\n")[0]); }
    (record.gallery ||= {})[vpName] = { sections, errors };
    checks.push({ ok: sections > 0 && !errors.length, id: vpName + "/gallery", detail: sections + " sections" + (errors.length ? " · " + errors.join(" | ") : "") });
    await ctx.close();
  }
}
await browser.close(); server.close();
record.apiCalls = Object.fromEntries([...apiCalls].sort());
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
for (const c of checks) console.log("CHECK " + (c.ok ? "PASS" : "FAIL") + " " + c.id + " — " + c.detail);
console.log(label + ": " + checks.filter(c => c.ok).length + "/" + checks.length + " page captures clean → " + out);
