// Class gradebook GB6 (docs/enterprise-class-gradebook-gb.md §4.8) — «علاماتي»: what a student may see of the gradebooks of their classes.
//
//   GET /api/student-gradebook      the APPROVED parts of each class of the student (their own items and part mark) and the approved final
//
// Owner decision (GB6, 2026-11-18): students see approved parts only. The values are the snapshot frozen at approval (lib/gradebook/
// approval.js) — never a live value, never another student's row, never a part still open. A part whose assignment's results are no
// longer released to students NOW is withheld (and with it the final mark): the results-release policy is checked at every read, fail
// closed (a read error withholds). The student's session is the hardened one (an archived / disabled account or a revoked session is
// 401); the classes are the student's own (home + shared, lib/class-membership.js). A storage error is a 503, never an empty page.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const storage = require("../lib/platform-storage");
const { studentClassIds } = require("../lib/class-membership");
const { withheldAssignmentIds } = require("../lib/results-release");
const { readApprovals, studentApprovedView } = require("../lib/gradebook/approval");

const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, body) => ({ status, headers: NO_STORE, jsonBody: body });
const unavailable = () => reply(503, { ok: false, code: "GRADEBOOK_UNAVAILABLE", error: "تعذّر قراءة العلامات الآن. أعد المحاولة بعد قليل." });
const MAX_CLASSES = 20;

async function handler(request, deps = {}, obs = null) {
  try {
    const session = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!session.ok) return { ...session.response, headers: { ...(session.response.headers || {}), ...NO_STORE } };
    if (request.method !== "GET") return reply(405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "طريقة غير مدعومة." });
    const c = session.container, student = session.student;
    const dl = deps.downloadJsonOrNull || storage.downloadJsonOrNull;
    const studentId = String(student.userId || "");
    const nowMs = deps.now ? Number(deps.now()) : Date.now();
    const classes = [];
    for (const classId of studentClassIds(student).slice(0, MAX_CLASSES)) {
      const [classroom, rawApprovals] = await Promise.all([dl(c, "platform/classes/" + classId + ".json"), dl(c, "platform/gradebooks/" + classId + "/approvals.json")]);
      if (!classroom || !rawApprovals) continue;
      const approvals = readApprovals(rawApprovals, classId);
      if (!approvals) return unavailable();                       // a corrupt document is never read as «nothing approved»
      if (!Object.keys(approvals.parts).length) continue;
      // The results-release policy, NOW: an assignment of an approved part whose results are hidden again withholds that part.
      const byItem = new Map();
      for (const part of Object.values(approvals.parts)) for (const i of part.snapshot.items) if (i.source && i.source.kind === "assignment") byItem.set(i.itemId, String(i.source.assignmentId || ""));
      const hidden = await withheldAssignmentIds([...byItem.values()], id => dl(c, "platform/assignments/" + id + ".json"), nowMs);
      const withheldItems = new Set([...byItem].filter(([, id]) => hidden.has(id)).map(([itemId]) => itemId));
      const view = studentApprovedView(approvals, studentId, withheldItems);
      if (!view.parts.length) continue;
      classes.push({ classId, className: String(classroom.name || ""), parts: view.parts, final: view.final });
    }
    return reply(200, { ok: true, classes });
  } catch (e) {
    obs?.logWarn?.("student.gradebook.unavailable", { reason: e && e.code ? String(e.code) : "error" });
    return unavailable();
  }
}

app.http("studentGradebook", { methods: ["GET"], authLevel: "anonymous", route: "student-gradebook", handler: withObservability("student-gradebook", handler) });
module.exports = { handler };
