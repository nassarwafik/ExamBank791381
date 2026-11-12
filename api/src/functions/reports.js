// Reports Center backend (teacher only). One function, many report types, all returning AGGREGATED
// data (never raw blobs). Project reports reuse the generic Project Tracker engine, so they work for
// every registered project and any future one. Never leaks answer keys, passwords, codes or tokens.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");   // Tadris+ P3-B
// Tadris+ P7-A1 — a report's ACADEMIC part (assignment marks and submissions) needs assignments.assignment.view and its PROJECT part
// projects.tracker.view, on top of the route's reports.widget.view (a learning-only teacher holds only that one). A part the session
// may not see is not read: the class / student report answers it null / [] and names it in `withheld`; a report that is nothing
// but that part (assessments, project reports) is refused (403 CAPABILITY_DENIED).
const { sessionGrants } = require("../lib/access/session-grants");
const { ASSIGNMENTS_CAPABILITY, widgetsOf, widgetDenied } = require("../lib/dashboard-widgets");
const PROJECTS_CAPABILITY = "projects.tracker.view";
const notGranted = capability => ({ status: 403, headers: { "Cache-Control": "no-store" }, jsonBody: { ok: false, code: "CAPABILITY_DENIED", error: "هذه الأداة غير مفعّلة لحسابك. تواصل مع إدارة المنصة.", capability } });
const { getContainer, downloadJsonOrNull, mapConcurrent, getReadConcurrency } = require("../lib/platform-storage");
// Phase R-3 — every listing a report reads (users, classes, assignments, submissions) goes through the shared ETag-verified
// document cache: the listing is still made on every request (so nothing can be stale) and a document is downloaded again only
// when its ETag changed. The authoritative documents still decide everything; the cache only saves unchanged downloads.
const { loadDocs, loadEntries, listEntries } = require("../lib/classes-students-read-cache");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isReportableAssessment } = require("../lib/assignment-lifecycle");
const { isSupportedProject, getProjectDefinition, getStorageNamespace, getProjectMeta, getSupportedProjects } = require("../lib/project-tracker/registry");
const svc = require("../lib/project-tracker/service");
const core = require("../lib/project-tracker/core");
const analytics = require("../lib/project-tracker/analytics");
const agg = require("../lib/reports/aggregate");
// Phase R-5a — the chart series of the class / student reports (`insights`): pure shaping over the SAME outcomes as the KPIs.
const ins = require("../lib/reports/insights");
// Phase R-5c — «طلاب يحتاجون متابعة» (the owner's criteria) and the one «المتأخرون» rule both reports share.
const followUp = require("../lib/reports/follow-up");
const { parseDateRange } = require("../lib/reports/date-range");
const period = require("../lib/reports/period");
const { buildHistoryTimeline } = require("../lib/reports/timeline");
const { getClassProgramCodes, getSupportedClassProgramCodes, classHasProject } = require("../lib/project-tracker/class-programs");

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const ASSIGN_PREFIX = "platform/assignments/";
const SUB_PREFIX = "platform/submissions/";

// Phase 21G.0 — teacher tenancy: reports cover only the teacher's own classes and students.
const { tenantOf, canAccessDocument, classAccessible, studentAccessible } = require("../lib/teacher-tenancy");
const { isStudentInClass, isStudentSharedIn } = require("../lib/class-membership");

async function loadClass(container, classId) { return downloadJsonOrNull(container, CLASS_PREFIX + classId + ".json"); }
function classMeta(c) {
  return { classId: c.classId, name: c.name, grade: c.grade || "", schoolYear: c.schoolYear || "", status: normalizeClassStatus(c), programCodes: getClassProgramCodes(c), studentCount: Array.isArray(c.studentIds) ? c.studentIds.length : 0 };
}
// Phase R-3 — the platform's user documents, read ONCE per request (memoized on the request's `reads`) and shared by the
// report's roster and every project-tracker roster of the same request (a class in two projects used to scan them 3 times).
function requestReads(container) {
  let users = null;
  return { users: () => (users = users || loadDocs(container, USER_PREFIX)) };
}
// Same population predicate as the project tracker (single source), so class reports and project
// analytics always count the exact same students: exclude only archived; keep login-disabled.
function rosterFrom(all, classId) {
  return all.filter(u => svc.studentBelongsToClass(u, classId))
    .map(u => ({ studentId: u.userId, displayName: u.displayName || ((u.firstName || "") + " " + (u.familyName || "")).trim(), code: u.code }))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), "ar"));
}
async function classStudents(container, classId, reads = requestReads(container)) {
  return rosterFrom(await reads.users(), classId);
}
// Phase R-5a — the roster of a class for a request that ALREADY read one of its user documents by name (the student report read
// its student): the listing is made as always, every other document comes through the cache, and the one in hand is used as
// read — so no user document is downloaded twice in one request.
async function classStudentsWith(container, classId, knownUser, knownId) {
  const entries = (await listEntries(container, USER_PREFIX)).filter(e => e.name !== USER_PREFIX + knownId + ".json");
  return rosterFrom([...(await loadEntries(container, entries)).filter(Boolean), knownUser], classId);
}
// Roadmap #26: the class's REPORTABLE assessments — published, or archived after being published — through the
// ONE canonical predicate. Drafts and archived-from-draft ("deleted") drafts were never takeable and must not
// count as unsubmitted assessments (they inflated the assessment count and deflated the submission rate).
function reportableOf(allAssignments, classId) {
  return allAssignments
    .filter(a => a && String(a.classId || "") === String(classId) && isReportableAssessment(a))
    .sort(period.byAssessmentDate);                               // Reports R-6: oldest PUBLICATION first (creation for older documents)
}
async function classAssignments(container, classId) {
  return reportableOf(await loadDocs(container, ASSIGN_PREFIX), classId);
}
// One prefix scan per assignment -> Map studentId -> submission.
async function submissionsFor(container, assignmentId) {
  const blobs = await loadDocs(container, SUB_PREFIX + assignmentId + "/");
  return new Map(blobs.filter(Boolean).map(s => [String(s.studentId), s]));
}
// Phase R-5a — the student report's scan of ONE assignment: the class's submissions (keyed by the document's studentId, exactly
// like submissionsFor) AND the named student's own document, picked BY BLOB NAME — the document this report has always read —
// from the same listing, so it is never downloaded twice.
async function submissionsWithOwn(container, assignmentId, studentId) {
  const entries = await listEntries(container, SUB_PREFIX + assignmentId + "/");
  const docs = await loadEntries(container, entries);
  const own = entries.findIndex(e => e.name === SUB_PREFIX + assignmentId + "/" + studentId + ".json");
  return { all: new Map(docs.filter(Boolean).map(s => [String(s.studentId), s])), own: own >= 0 ? docs[own] : null };
}
// Roadmap #27: the per-assignment submission scans are independent, so run a few at a time (each scan already
// downloads its blobs concurrently). Results stay aligned with `assignments` so every aggregation is unchanged.
const ASSIGNMENT_SCAN_CONCURRENCY = 4;
async function submissionsForAll(container, assignments) {
  return mapConcurrent(assignments, Math.min(ASSIGNMENT_SCAN_CONCURRENCY, getReadConcurrency()), a => submissionsFor(container, a.assignmentId));
}

// Project working definition + progress entries for a class (reused by every project report).
// Phase P-9 — a report is a read: the snapshot as the next write will see it, never written (svc.readClassConfig).
// Phase R-3 — the roster comes from the request's single users read: classStudents applies the SAME membership predicate,
// mapping and Arabic order as svc.listClassStudents (classStudentsFrom), so the entries are identical.
async function projectContext(container, projectCode, classroom, reads = requestReads(container)) {
  const { config, view } = await svc.readClassView(container, projectCode, classroom);
  const workDef = svc.workingDefinition(projectCode, config);
  const students = await classStudents(container, classroom.classId, reads);
  const entries = await svc.loadProgressEntries(container, projectCode, classroom.classId, students, view);
  return { config, workDef, students, entries };
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request, deps = {}, obs = null) {
    try {
      const auth = (await requireTeacherSession(request, deps));
      if (!auth.ok) return auth.response;
      const capabilityDenial = await requireCapability(auth, "reports.js", "*", deps, obs);   // Tadris+ P3-B
      if (capabilityDenial) return capabilityDenial;
      const grants = await sessionGrants(auth.user, deps, obs);   // Tadris+ P7-A1
      if (!grants.ok) return grants.response;
      // Tadris+ P7-A2 — and the owner's widget choice: the academic part is «ملخص العلامات», the project part «تقييم المشاريع» (a widget
      // left out for this teacher is not read through a report either — blueprint acceptance test 7).
      const academicWidget = widgetsOf("analytics", grants).includes("scores.overview"), projectsWidget = widgetsOf("today", grants).includes("projects.evaluation");
      const academic = grants.has(ASSIGNMENTS_CAPABILITY) && academicWidget, projectsAllowed = grants.has(PROJECTS_CAPABILITY) && projectsWidget;
      const refuse = (capability, widgetId) => (grants.has(capability) ? widgetDenied(widgetId) : notGranted(capability));
      const withheld = [...(academic ? [] : ["academic"]), ...(projectsAllowed ? [] : ["projects"])];
      const container = deps.container || (deps.getContainer || getContainer)();
      const reads = requestReads(container);
      const now = new Date().toISOString();
      const url = new URL(request.url);
      const type = String(url.searchParams.get("type") || "").trim();
      const classId = String(url.searchParams.get("classId") || "").trim();
      const studentId = String(url.searchParams.get("studentId") || "").trim();
      const projectCode = String(url.searchParams.get("projectCode") || "").trim();
      const track = String(url.searchParams.get("track") || "").trim();
      const groupId = String(url.searchParams.get("groupId") || "").trim();
      // Date range applies ONLY to time-meaningful data (assessments by their PUBLICATION date — Reports R-6, owner decision D-2;
      // an assessment published before the stamp existed keeps its creation date — and the timeline by week).
      // It never touches current project progress snapshots.
      let range;
      try { range = parseDateRange(url.searchParams.get("from"), url.searchParams.get("to")); }
      catch (e) { return { status: e.httpStatus || 400, jsonBody: { ok: false, error: e.message } }; }

      // Phase 21G.0 — every class / student a report names must be the teacher's own; another teacher's answers like a missing one.
      const tenant = tenantOf(auth.user);
      if (tenant) {
        const load = name => downloadJsonOrNull(container, name);
        if (classId && !(await classAccessible(load, classId, tenant))) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        if (studentId) {
          const named = await load(USER_PREFIX + studentId + ".json");
          // Tadris+ P11-C — a student the owner added to a class of THIS teacher (the class just passed the check above) is reportable
          // IN THAT CLASS; every other student must be the teacher's own, as before.
          const sharedHere = !!classId && !!named && named.role === "student" && isStudentSharedIn(named, classId);
          if (!sharedHere && !(await studentAccessible(load, named, tenant))) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        }
      }

      // Filter options for the global filter bar (school years incl. archived, classes, projects).
      if (type === "filters") {
        const classes = (await loadDocs(container, CLASS_PREFIX)).filter(c => c && canAccessDocument(c, tenant)).map(classMeta)
          .sort((a, b) => String(b.schoolYear).localeCompare(String(a.schoolYear)) || String(a.name).localeCompare(String(b.name), "ar"));
        const schoolYears = [...new Set(classes.map(c => c.schoolYear).filter(Boolean))].sort((a, b) => String(b).localeCompare(String(a)));
        const projects = projectsAllowed ? getSupportedProjects().map(getProjectMeta) : [];
        // Tadris+ P8-B1 — `available`: which report families this teacher may open (the SAME rule that refuses them below), so the
        // Reports Center offers only those cards. Presentation only: every report is still decided here on its own request.
        return { status: 200, jsonBody: { ok: true, schoolYears, classes, projects, available: { academic, projects: projectsAllowed } } };
      }

      // Phase R-5a — the hub overview: every ACTIVE class of this teacher side by side (average, submission rate, awaiting
      // correction), the totals and a month-by-month trend. It is the academic part and nothing else: withheld → `overview: null`
      // and nothing read. Archived classes stay out (their reports still open from the cards); the classes are filtered by the
      // SAME tenancy predicate as the filter options, so another teacher's class is never read. Each class reads what its own
      // class report reads, through the same ETag-verified cache; the assignments are listed once for all of them.
      if (type === "overview") {
        if (!academic) return { status: 200, jsonBody: { ok: true, type, overview: null, withheld } };
        const schoolYear = String(url.searchParams.get("schoolYear") || "").trim();
        const metas = (await loadDocs(container, CLASS_PREFIX)).filter(c => c && canAccessDocument(c, tenant)).map(classMeta)
          .filter(c => c.status !== "archived" && (!schoolYear || c.schoolYear === schoolYear))
          .sort((a, b) => String(b.schoolYear).localeCompare(String(a.schoolYear)) || String(a.name).localeCompare(String(b.name), "ar"));
        const allAssignments = metas.length ? await loadDocs(container, ASSIGN_PREFIX) : [];
        const inputs = [];
        for (const meta of metas) {
          const assignments = period.inPeriod(reportableOf(allAssignments, meta.classId), range);
          // the roster comes from the request's single users read (a class with no assessment in the range still shows its students)
          inputs.push({ meta, students: await classStudents(container, meta.classId, reads), assignments, subsByAssignment: await submissionsForAll(container, assignments) });
        }
        // Phase R-5c — how many students of each class need follow-up IN THE ASSESSMENTS (missing / below the class; the overview
        // reads no project), by the same criteria and the same class average as the class report.
        const overview = ins.overviewRollup(inputs);
        let total = 0;
        overview.classes = overview.classes.map((row, i) => {
          const needsFollowUp = followUp.academicFollowUpCount(ins.studentStandings(inputs[i].students, inputs[i].subsByAssignment), row.average);
          total += needsFollowUp;
          return { ...row, needsFollowUp };
        });
        overview.followUp = { criteria: { ...followUp.FOLLOW_UP_CRITERIA }, total };
        overview.periodBasis = period.periodBasis(inputs.flatMap(i => i.assignments));   // Reports R-6 — what the dates of this reply are
        return { status: 200, jsonBody: { ok: true, type, overview, withheld } };
      }

      // Students of one class, for the student/timeline filter dropdowns.
      if (type === "classStudents") {
        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        return { status: 200, jsonBody: { ok: true, students: await classStudents(container, classId, reads) } };
      }

      // ---------- Academic reports ----------
      if (type === "class") {
        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const c = await loadClass(container, classId);
        if (!c) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        const students = academic ? await classStudents(container, classId, reads) : [];
        const assignments = academic ? period.inPeriod(await classAssignments(container, classId), range) : [];
        const allPcts = [];
        let submittedCells = 0, pendingCells = 0;
        const subsByAssignment = await submissionsForAll(container, assignments);
        for (let i = 0; i < assignments.length; i++) {
          const subs = subsByAssignment[i];
          for (const s of students) {
            const o = agg.studentOutcome(subs.get(String(s.studentId)));
            if (o.state === "missing") continue;
            submittedCells += 1;                                       // handed in — a pending result included (R-1 / D-1)
            if (o.state === "pending") pendingCells += 1; else allPcts.push(o.percentage);
          }
        }
        const totalCells = students.length * assignments.length;
        const meta = classMeta(c);
        // A class may be in several projects — report each independently (never combine their %).
        const projects = [];
        const projectDelays = [];   // Phase R-5c — who is late in each project, by the «المتأخرون» rule (from the same entries)
        if (projectsAllowed) for (const pCode of getSupportedClassProgramCodes(c)) {
          const ctx = await projectContext(container, pCode, c, reads);
          const sum = analytics.buildClassSummary(ctx.workDef, ctx.entries, now);
          const byStudent = new Map();
          for (const e of ctx.entries) {
            const late = followUp.projectDelayReasons(core.buildStudentSummary(ctx.workDef, e.progress, now), ctx.config.config || {}).reasons;
            if (late.length) byStudent.set(String(e.studentId), late);
          }
          projectDelays.push({ projectCode: pCode, title: getProjectDefinition(pCode).title, byStudent });
          // Phase P-5d — «لم يبدأوا» (P-5c count) only when some students have not started; every other section is unchanged.
          projects.push({ projectCode: pCode, title: getProjectDefinition(pCode).title, tracks: getProjectDefinition(pCode).tracks, avgOverall: sum.avgOverall, trackAverages: sum.trackAverages, completedCount: sum.completedCount, ...(sum.notStartedCount ? { notStartedCount: sum.notStartedCount } : {}),
            studentCount: sum.studentCount });   // Phase R-5a — the population the two counts are out of (the students-by-state bar)
        }
        // Phase R-5a — `insights`: the series the class report charts (per-assessment trend, each student's standing, the cells by
        // state). Part of the ACADEMIC part: null when it is withheld (nothing of it was read), exactly like `kpis`.
        let insights = null;
        if (academic) {
          const standings = ins.studentStandings(students, subsByAssignment);
          // Phase R-5b — `summary`: the spread of the students' averages and who holds the highest / the lowest.
          // Each assessment point also carries the highest / lowest / median of its final results.
          const points = ins.assessmentSeries(assignments, students, subsByAssignment).map((p, i) => ({ ...p, ...ins.assessmentSpread(students, subsByAssignment[i]) }));
          insights = { assessments: points, students: standings, submission: ins.submissionSplit(standings), summary: ins.standingsSummary(standings),
            // Phase R-5c — «طلاب يحتاجون متابعة»: against the report's own «متوسط النتائج»; project lateness only for the projects
            // this session may see (projectDelays is empty otherwise).
            followUp: followUp.followUpList(standings, agg.average(allPcts), projectDelays) };
        }
        return { status: 200, jsonBody: { ok: true, type, class: meta, kpis: academic ? {
          assignments: assignments.length,
          averageScore: agg.average(allPcts),
          submissionRate: totalCells ? Math.round((submittedCells / totalCells) * 100) : 0,
          pendingReview: pendingCells
        } : null, insights, periodBasis: academic ? period.periodBasis(assignments) : null, projects, withheld } };
      }

      if (type === "student") {
        if (!studentId) return { status: 400, jsonBody: { ok: false, error: "studentId مطلوب." } };
        const u = await downloadJsonOrNull(container, USER_PREFIX + studentId + ".json");
        if (!u || u.role !== "student") return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود." } };
        // Tadris+ P10-H (closes security review O13; owner decision §19.45) — the student passed the student check (possibly through
        // their own owner stamp), but their CURRENT class must be this teacher's too before anything of it is read: another
        // teacher's class is treated as no class at all — no id, name, school year, assignments, results or projects.
        // Tadris+ P11-C — the report is of ONE class: the requested class when the student is a member of it (home or shared, and
        // the class passed the teacher's check above), otherwise the student's home class as before.
        const rawClassId = classId && isStudentInClass(u, classId) ? classId : String(u.classId || "");
        const classOk = !tenant || !rawClassId || await classAccessible(name => downloadJsonOrNull(container, name), rawClassId, tenant);
        const sClassId = classOk ? rawClassId : "";
        const c = sClassId ? await loadClass(container, sClassId) : null;
        const assignments = c && academic ? period.inPeriod(await classAssignments(container, sClassId), range) : [];
        // Roadmap #27: the per-assignment scans are independent reads → bounded concurrency, aligned with `assignments`.
        // Phase R-5a — each scan also yields the class's submissions (for the class average beside the student's result); the
        // student's own document is still the one named after them. `assignments` is empty without the academic part.
        const scans = await mapConcurrent(assignments, Math.min(ASSIGNMENT_SCAN_CONCURRENCY, getReadConcurrency()), a => submissionsWithOwn(container, a.assignmentId, studentId));
        const mySubs = scans.map(s => s.own);
        const acad = agg.studentAcademicAverage(mySubs);
        const submittedCount = acad.submittedCount;                    // handed in — a pending result included (R-1 / D-1)
        // Phase R-5a — `insights`: the student's result in each assessment beside that assessment's class average (the roster's
        // FINAL results — the assessments report's «المتوسط»). Academic part only, and only of the class that passed the P10-H
        // check above (`assignments` is empty otherwise, so nothing of another teacher's class is read here either).
        let insights = null;
        if (academic) {
          const roster = assignments.length ? await classStudentsWith(container, sClassId, u, studentId) : [];
          const series = ins.studentSeries(assignments, mySubs, ins.classAverages(roster, scans.map(s => s.all)));
          insights = { assessments: series, submission: ins.studentSplit(series) };
        }
        // One entry per project of the student's class — each independent.
        const projects = [];
        if (c && projectsAllowed) for (const pCode of getSupportedClassProgramCodes(c)) {
          const ns = getStorageNamespace(pCode);
          const { config, view } = await svc.readClassView(container, pCode, c);
          const workDef = svc.workingDefinition(pCode, config);
          const stored = await downloadJsonOrNull(container, ns.progressName(sClassId, studentId));
          const progress = stored ? view(stored) : stored;
          const summary = core.buildStudentSummary(workDef, progress, now);
          projects.push({
            projectCode: pCode, title: getProjectDefinition(pCode).title, tracks: getProjectDefinition(pCode).tracks,
            summary, nextStages: core.getNextStages(workDef, progress),
            balance: core.getBalanceInsight(summary.trackProgress, workDef),
            lastActivity: progress ? (progress.updatedAt || "") : ""
          });
        }
        return { status: 200, jsonBody: { ok: true, type,
          student: { studentId, displayName: u.displayName || "", classId: sClassId, className: c ? c.name : "", schoolYear: c ? c.schoolYear : "" },
          // Single assessments average — the schema has no exam/assignment distinction, so no duplicate metrics.
          academic: academic ? { average: acad.average, submittedCount, assessmentCount: assignments.length, submissionRate: assignments.length ? Math.round((submittedCount / assignments.length) * 100) : 0, pendingCount: acad.pendingCount } : null,
          insights, periodBasis: academic ? period.periodBasis(assignments) : null, projects, withheld } };
      }

      // Unified assessments report. The schema has no field distinguishing exam vs assignment, so a
      // single report covers every published assessment (no duplicate exam/assignment reports).
      if (type === "assignments") {
        if (!academic) return refuse(ASSIGNMENTS_CAPABILITY, "scores.overview");
        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const c = await loadClass(container, classId);
        if (!c) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        const students = await classStudents(container, classId, reads);
        const assignments = period.inPeriod(await classAssignments(container, classId), range);
        const perAssignment = [];
        const pooledPcts = [];
        const matrix = [];
        let submittedCells = 0, pendingCells = 0;
        const subsByAssignment = await submissionsForAll(container, assignments);
        for (let i = 0; i < assignments.length; i++) {
          const a = assignments[i];
          const subs = subsByAssignment[i];
          const entries = students.map(s => ({ studentId: s.studentId, submission: subs.get(String(s.studentId)) }));
          const st = agg.assignmentStats(entries);
          // Phase R-5b — the row also carries its day and the highest / lowest / median of its final results (additive).
          // Reports R-6 — that day is the PUBLICATION day (period.assessmentDate), the same date the period is applied to.
          perAssignment.push({ assignmentId: a.assignmentId, title: a.title, ...st, date: ins.isoDay(period.assessmentDate(a)), ...ins.assessmentSpread(students, subs) });
          const outcomes = entries.map(e => ({ studentId: e.studentId, o: agg.studentOutcome(e.submission) }));
          // `zero` is the same rule as assignmentStats.zeroScores (a FINAL score of 0), so the cell and the count never disagree.
          matrix.push({ assignmentId: a.assignmentId, title: a.title, cells: outcomes.map(({ studentId, o }) => ({ studentId, state: o.state, percentage: o.percentage, zero: o.state === "submitted" && o.score === 0 })) });
          for (const { o } of outcomes) {
            if (o.state === "missing") continue;
            submittedCells += 1;                                       // handed in — a pending result included (R-1 / D-1)
            if (o.state === "pending") pendingCells += 1; else pooledPcts.push(o.percentage);
          }
        }
        const totalCells = students.length * assignments.length;
        return { status: 200, jsonBody: { ok: true, type, class: classMeta(c),
          students: students.map(s => ({ studentId: s.studentId, displayName: s.displayName })),
          overall: { assessmentCount: assignments.length, participants: submittedCells, pendingReview: pendingCells, average: agg.average(pooledPcts), submissionRate: totalCells ? Math.round((submittedCells / totalCells) * 100) : 0, distribution: agg.gradeDistribution(pooledPcts) },
          perAssignment, matrix, periodBasis: period.periodBasis(assignments) } };
      }

      // ---------- Project reports (generic) ----------
      if (["project", "track", "ready", "delayed", "timeline"].includes(type)) {
        if (!projectsAllowed) return refuse(PROJECTS_CAPABILITY, "projects.evaluation");
        if (!isSupportedProject(projectCode)) return { status: 400, jsonBody: { ok: false, error: "مشروع غير مدعوم." } };
        if (!classId) return { status: 400, jsonBody: { ok: false, error: "classId مطلوب." } };
        const c = await loadClass(container, classId);
        if (!c) return { status: 404, jsonBody: { ok: false, error: "الصف غير موجود." } };
        if (!classHasProject(c, projectCode)) return { status: 400, jsonBody: { ok: false, error: "الصف غير مسجَّل في هذا المشروع." } };
        const { config, workDef, entries } = await projectContext(container, projectCode, c, reads);
        const tracks = getProjectDefinition(projectCode).tracks;

        if (type === "project") {
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, class: classMeta(c),
            summary: analytics.buildClassSummary(workDef, entries, now), analytics: analytics.buildAnalytics(workDef, entries, now) } };
        }
        if (type === "track") {
          const activeTrack = track || (tracks[0] && tracks[0].trackId);
          const stages = (config.stages || []).filter(s => s.active === true && s.track === activeTrack && (!groupId || s.groupId === groupId));
          const rows = stages.map(stage => {
            const counts = { approved: 0, ready_for_review: 0, in_progress: 0, not_started: 0 };
            for (const e of entries) counts[core.stageStatus(e.progress, stage.stageId)] += 1;
            const n = entries.length;
            return { stageId: stage.stageId, title: stage.title, groupId: stage.groupId, ...counts, approvedPct: n ? Math.round((counts.approved / n) * 100) : 0 };
          });
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, track: activeTrack, groups: config.groups.filter(g => g.track === activeTrack), class: classMeta(c), rows } };
        }
        if (type === "ready") {
          const byStudent = entries.map(e => {
            const stages = (config.stages || []).filter(s => s.active === true && core.stageStatus(e.progress, s.stageId) === "ready_for_review")
              .map(s => ({ stageId: s.stageId, title: s.title, track: s.track }));
            return { studentId: e.studentId, displayName: e.displayName, stages };
          }).filter(s => s.stages.length);
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, class: classMeta(c), students: byStudent, totalReady: byStudent.reduce((a, s) => a + s.stages.length, 0) } };
        }
        if (type === "delayed") {
          const cfg = config.config || {};
          // Phase P-5b — a never-started student has one reason, «لم يبدأ بعد» (never «بلا تحديث», and its 0 % is implied).
          // Phase R-5c — the rule now lives in follow-up.projectDelayReasons (same wording, same order), shared with the class report.
          const lateThreshold = followUp.projectDelayReasons({}, cfg).lateThreshold;
          const rows = entries.map(e => {
            const summary = core.buildStudentSummary(workDef, e.progress, now);
            const reasons = followUp.projectDelayReasons(summary, cfg).reasons;
            return { studentId: e.studentId, displayName: e.displayName, overall: summary.overallProgress, trackProgress: summary.trackProgress, updatedAt: summary.updatedAt, complete: summary.complete, reasons };
          }).filter(r => r.reasons.length);
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, lateThreshold, class: classMeta(c), students: rows } };
        }
        if (type === "timeline") {
          // Built from REAL recorded status history (handles later un-approvals); range-clipped; no
          // invented points when there is no history.
          if (studentId) {
            const membership = await svc.requireStudentInClass(container, studentId, classId);
            if (!membership.ok) return { status: 404, jsonBody: { ok: false, error: "الطالب غير موجود في هذا الصف." } };
            const ns = getStorageNamespace(projectCode);
            const progress = await downloadJsonOrNull(container, ns.progressName(classId, studentId));
            const trend = buildHistoryTimeline(workDef, [{ studentId, progress }], range, now);
            return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, class: classMeta(c), scope: "student", studentId, trend } };
          }
          return { status: 200, jsonBody: { ok: true, type, projectCode, tracks, class: classMeta(c), scope: "class", trend: buildHistoryTimeline(workDef, entries, range, now) } };
        }
      }

      return { status: 400, jsonBody: { ok: false, error: "نوع تقرير غير معروف." } };
    } catch (e) {
      obs?.logError("reports.error", e);
      return { status: 500, jsonBody: { ok: false, error: "تعذر تجهيز التقرير حاليًا." } };
    }
}

app.http("reports", { methods: ["GET"], authLevel: "anonymous", route: "reports", handler: withObservability("reports", handler) });
module.exports = { handler };
