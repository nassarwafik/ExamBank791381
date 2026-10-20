// Phase 21G.2 — the progress of ONE published assignment, for the assignments home. Exactly the gradebook's own figures
// (assignment-results.js GET stats), from the same documents and the same rules, so the home card and the gradebook can never
// disagree:
//   expected       class members (isStudentClassMember)
//   submitted      members whose submission has at least one completed attempt
//   notSubmitted   members without a completed attempt
//   pendingReview  members whose LATEST attempt still needs manual review (deriveGradingStatus)
//   graded         members whose latest attempt is final
//   active         members with a live attempt right now (independent of grading, as in the gradebook)
//   average        the mean percentage of the FINAL latest results (1 decimal), else null — a result still awaiting the teacher
//                  is never averaged (Phase R-1, owner decision D-1: its provisional score is not an academic mark)
//   lastSubmittedAt the newest completed-attempt timestamp
const { activeAttemptOf } = require("./assignment-availability");
const { deriveGradingStatus } = require("./grading-status");

const ms = v => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : 0; };

function deriveAssignmentProgress(members, submissionsByStudent) {
  let submitted = 0, pendingReview = 0, graded = 0, notSubmitted = 0, active = 0, sum = 0, last = 0;
  for (const u of members) {
    const s = submissionsByStudent.get(String(u.userId)) || null;
    const attempts = Array.isArray(s?.attempts) ? s.attempts : [], latest = attempts.length ? attempts[attempts.length - 1] : null;
    if (latest) {
      submitted++;
      const g = deriveGradingStatus(latest);
      if (g === "pendingReview") pendingReview++; else if (g === "final") { graded++; sum += Number(latest.percentage || 0); }
      for (const at of attempts) last = Math.max(last, ms(at && at.submittedAt));
    } else notSubmitted++;
    if (activeAttemptOf(s)) active++;
  }
  return { expected: members.length, submitted, notSubmitted, pendingReview, graded, active, average: graded ? Number((sum / graded).toFixed(1)) : null, lastSubmittedAt: last ? new Date(last).toISOString() : "" };
}

module.exports = { deriveAssignmentProgress };
