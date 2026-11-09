// Tadris+ P3-B — the capability every teacher route and action needs (blueprint §4.4 rule 5: «كل مسار، وكل action داخل المسارات
// متعددة الأفعال، يصرح بقدرته. مسار بلا تصريح يُسقط CI»). This map is the ONE declaration; each route asks it with its own file name
// and key at its dispatch point (requireCapability). api/tests/route-capabilities-p3b.test.js fails when a teacher route is missing
// here, when a route does not ask, or when a capability is unknown / owner-only.
//
// Keys: "GET" / "POST" for single-purpose methods, the action name for multi-action routes, and "*" for any other action of that
// route (the route then answers its own 400 for an action it does not know). A list means "any one of these".
//
// Exempt teacher routes (no capability): the teacher's own session (platform-session, teacher-session-end, qr-login-approve, session-devices), their own profile
// (teacher-profile) and a content-free diagnostic report (client-error-report).

const GOV_ANY = ["examGovernance.exam.author", "examGovernance.exam.review", "examGovernance.exam.approve", "examGovernance.exam.publish"];

const ROUTE_CAPABILITIES = Object.freeze({
  // Classes and students (owner decision D18: the owner creates classes; a removed student is archived).
  "manage-classrooms.js": {
    GET: "classes.class.view", create: "classes.class.create", update: "classes.class.manage", archive: "classes.class.manage",
    unarchive: "classes.class.manage", graduateandarchive: "classes.class.manage",
    // Tadris+ P10-J (O10, owner decision §19.47) — enrolling a class in a project is the PROJECTS capability, not course assignment.
    setprograms: "projects.tracker.manage", setprogram: "projects.tracker.manage", setlearningcoursemodules: "learning.module.release", removelearningcourse: "learning.course.assign",
    reconcileroster: "students.student.edit", "*": "classes.class.manage"
  },
  "manage-students.js": {
    GET: "students.student.view", create: "students.student.create", previewimport: "students.student.import", bulkimport: "students.student.import",
    update: "students.student.edit", resetpassword: "students.credential.reset", toggleactive: "students.student.edit",
    archive: "students.student.archive", unarchive: "students.student.restore", delete: "students.student.delete",
    "bulk:activate": "students.student.edit", "bulk:deactivate": "students.student.edit", "bulk:archive": "students.student.archive",
    "bulk:unarchive": "students.student.restore", "bulk:move": "students.student.move", "bulk:resetpasswords": "students.credential.reset",
    "bulk:delete": "students.student.delete", "*": "students.student.edit"
  },
  "student-profile-photo.js": { GET: "students.student.view", "*": "students.student.edit" },
  "teacher-achievement-feed.js": { GET: "students.student.view", "*": "students.student.edit" },
  "teacher-today.js": { "*": "classes.class.view" },

  // Learning.
  "learning-materials-catalog.js": { "*": "learning.course.view" },
  "learning-content.js": { "*": "learning.course.view" },
  "learning-study.js": { "*": "learning.course.view" },
  "learning-training.js": { "*": "learning.course.view" },
  "learning-exam-item.js": { "*": "learning.course.view" },
  "learning-run.js": { "*": "learning.course.view" },   // 899371 P8 — «جرّب الكود»: a teacher previewing a course may run its programs
  "learning-class-progress.js": { "*": "learning.progress.view" },

  // Exam library, question bank, imports.
  "exam-library.js": { "*": "examLibrary.item.view" },
  "bank-summary.js": { "*": "examBank.collection.view" },
  "bank-questions.js": { GET: "examBank.collection.view", create: "examBank.question.create", update: "examBank.question.edit", "*": "examBank.question.edit" },
  "bank-question-select.js": { "*": "examBank.question.select" },
  "question-bank-action.js": { "*": "examBank.question.edit" },
  "bank-import-action.js": { "*": "examBank.import.use" },
  "import-upload.js": { "*": "examBank.import.use" },
  "import-fetch-url.js": { "*": "examBank.import.use" },
  "import-analyze.js": { "*": "examBank.import.use" },

  // Exam builder.
  "generate-exam.js": { "*": "examBuilder.exam.create" },
  "exam-question-availability.js": { "*": "examBuilder.exam.edit" },
  "manage-saved-exams.js": { GET: "examBuilder.exam.edit", load: "examBuilder.exam.edit", "*": "examBuilder.exam.save" },
  "save-exam-artifact.js": { "*": "examBuilder.exam.save" },
  "manage-templates.js": { GET: "examBuilder.exam.edit", load: "examBuilder.exam.edit", "*": "examBuilder.exam.save" },
  "assessment-presets.js": { list: "examBuilder.exam.edit", load: "examBuilder.exam.edit", "*": "examBuilder.exam.save" },
  "simulators.js": { "*": "examBuilder.exam.edit" },
  "mesh-assets.js": { "*": "examBuilder.exam.edit" },
  "ai-exam-composer.js": { "*": "examBuilder.ai.use" },
  "ai-question-author.js": { "*": "examBuilder.ai.use" },
  "ai-scenario-author.js": { "*": "examBuilder.ai.use" },
  "analyze-global-exam-instruction.js": { "*": "examBuilder.ai.use" },
  "interpret-exam-request.js": { "*": "examBuilder.ai.use" },
  "exam-quality-fix.js": { "*": "examBuilder.ai.use" },
  "structured-exam-ai-fix.js": { "*": "examBuilder.ai.use" },
  "question-ai-action.js": { "*": "examBuilder.ai.use" },
  "generate-question-image.js": { "*": "examBuilder.ai.use" },

  // Exam governance (the existing 14A/14B roles still decide WHO may act; this is the coarse "is the module on" layer).
  "exam-governance.js": {
    directory: GOV_ANY, status: GOV_ANY, revisions: GOV_ANY, revision: GOV_ANY, events: GOV_ANY, decisions: GOV_ANY, decision: GOV_ANY, published: GOV_ANY,
    enable: "examGovernance.exam.author", "create-revision": "examGovernance.exam.author", "submit-review": "examGovernance.exam.author",
    "return-to-draft": "examGovernance.exam.author", "complete-review": "examGovernance.exam.review", "request-changes": "examGovernance.exam.review",
    "withdraw-review": "examGovernance.exam.review", approve: "examGovernance.exam.approve", "reject-approval": "examGovernance.exam.approve",
    publish: "examGovernance.exam.publish", "reject-publication": "examGovernance.exam.publish", "*": GOV_ANY
  },
  "governance-inbox.js": { "*": GOV_ANY },

  // Assignments, grading, results.
  "manage-assignments.js": {
    GET: "assignments.assignment.view", create: ["assignments.assignment.create", "assignments.ready.assign"], deleteimpact: "assignments.assignment.view",
    setmaxattempts: "assignments.schedule.set", setstatus: "assignments.schedule.set", updatetiming: "assignments.schedule.set", setlatepolicy: "assignments.schedule.set",
    updatedetails: "assignments.content.edit", setresultsrelease: "assignments.results.release", releaseresults: "assignments.results.release",
    archive: "assignments.schedule.set", restore: "assignments.schedule.set", delete: "assignments.assignment.create", purge: "assignments.assignment.create",
    "*": "assignments.assignment.create"
  },
  "assignment-progress.js": { "*": "assignments.assignment.view" },
  "assignment-item-analysis.js": { "*": "assignments.assignment.view" },
  "assignment-results.js": { GET: "assignments.assignment.view", "*": "assignments.schedule.set" },
  "assignment-review.js": { "*": "assignments.grading.grade" },
  "coding-grading.js": { "*": "assignments.grading.grade" },
  "coding-grading-recovery.js": { "*": "assignments.grading.grade" },

  // Games.
  "game-live-challenge.js": { "*": "games.challenge.create" },
  "game-live-session.js": { "*": "games.session.run" },
  "game-number-conversion-preview.js": { "*": "games.catalog.view" },

  // Messages, reports, projects, audit.
  "messages.js": {
    GET: "messages.inbox.read", markDirectRead: "messages.inbox.read", sendDirect: "messages.direct.send", sendAnnouncement: "messages.announcement.send",
    editMessage: ["messages.direct.send", "messages.announcement.send"], deleteMessage: ["messages.direct.send", "messages.announcement.send"],
    "*": "messages.direct.send"
  },
  "reports.js": { "*": "reports.widget.view" },
  "teacher-analytics.js": { "*": "reports.widget.view" },
  "teacher-analytics-ai.js": { "*": "reports.ai.use" },
  "project-tracker.js": { GET: "projects.tracker.view", "*": "projects.tracker.manage" },
  "audit-history.js": { "*": "audit.self.view" }
});

const EXEMPT = Object.freeze({
  "platform-session.js": "the teacher's own session probe",
  "teacher-session-end.js": "the teacher's own sign-out",
  "qr-login-approve.js": "the caller approving a sign-in of ANOTHER device as themselves (QR-1; only the verified session identity is bound)",
  "session-devices.js": "the caller's OWN signed-in devices («الأجهزة المرتبطة», QR-3): list / end one of the verified subject's own sessions",
  "teacher-profile.js": "the teacher's own display name / avatar / photo",
  "school-logo.js": "the logo of the caller's own school (P4-C, presentation only)",
  "client-error-report.js": "a content-free diagnostic report (one log line, nothing stored is read)"
});

/** The capability (or any-of list) a route needs for `key`, falling back to the route's "*". Throws for an undeclared route. */
function capabilityFor(file, key) {
  const route = ROUTE_CAPABILITIES[file];
  if (!route) throw new Error("No capability declared for route " + file);
  const v = Object.prototype.hasOwnProperty.call(route, key) ? route[key] : route["*"];
  if (!v) throw new Error("No capability declared for " + file + " / " + key);
  return v;
}

module.exports = { ROUTE_CAPABILITIES, EXEMPT, capabilityFor };
