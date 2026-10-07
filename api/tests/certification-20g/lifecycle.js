// Phase 20G — CORE ENTERPRISE CERTIFICATION: the reusable LIFECYCLE drivers on top of the platform harness. Every step goes through the real
// handlers; every helper returns what it observed so the tests assert on the production outcome, never on a helper's opinion.
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");

/** Teacher: save the working copy → reload it → governance (enable / review with server finalization / approve / publish) → assignment. */
export async function publishAndAssign(p, exam, assignOver = {}) {
  const saved = await p.teacher.saveExam(exam);
  if (saved.status !== 200) throw new Error("save " + saved.status + " " + JSON.stringify(saved.jsonBody));
  const loaded = await p.teacher.loadExam(saved.jsonBody.blobName);
  if (loaded.status !== 200) throw new Error("load " + loaded.status);
  const pub = await p.teacher.publish(loaded.jsonBody.exam);
  if (!pub.ok) throw new Error("publish refused " + JSON.stringify(pub.steps.map(s => [s.status, s.jsonBody && (s.jsonBody.code || s.jsonBody.error), s.jsonBody && s.jsonBody.details])));
  const a = await p.teacher.assign(exam.examId, assignOver);
  if (a.status !== 200) throw new Error("assign " + a.status + " " + JSON.stringify(a.jsonBody));
  return { aid: a.jsonBody.assignment.assignmentId, saved, loaded: loaded.jsonBody.exam, pub, assignment: a.jsonBody.assignment };
}

/** The canonical form the server stores for a set of answers (what a restore must give back, byte for byte). */
export const normalizedAnswers = (answers, snapshot) => normalizeDraftAnswers(answers, snapshot);

/** Student: start → (pre-start delivery hides the body) → sanitized delivery → autosave in chunks with a RELOAD (GET state) after each chunk
 *  that must restore exactly what the server normalized → continue → submit. Returns every observation. */
export async function takeExam(p, aid, sid, answers, { chunks = 2 } = {}) {
  const s = p.student(sid);
  const obs = { preStart: await s.deliver(aid) };
  obs.start = await s.start(aid);
  obs.startAgain = await s.start(aid);                                   // idempotent (double click / refresh)
  obs.delivery = await s.deliver(aid);
  // a persona may need what it SEES (a parametric instance is generated per attempt from the server-owned identity)
  if (typeof answers === "function") answers = answers(obs.delivery.jsonBody.assignment.exam);
  obs.answers = answers;
  const snapshot = p.assignmentOf(aid).examSnapshot;
  const ids = Object.keys(answers);
  const size = Math.max(1, Math.ceil(ids.length / chunks));
  obs.restores = [];
  let acc = {};
  for (let i = 0; i < ids.length; i += size) {
    for (const id of ids.slice(i, i + size)) acc[id] = answers[id];
    const d = await s.draft(aid, acc);
    const reload = await s.state(aid);                                   // "destroy the page, come back": the server state is the only truth
    obs.restores.push({ status: d.status, expected: normalizedAnswers(acc, snapshot), restored: reload.jsonBody.state.draftAnswers, savedAt: reload.jsonBody.state.draftSavedAt });
    acc = JSON.parse(JSON.stringify(reload.jsonBody.state.draftAnswers));  // continue FROM the restored state (never from client memory)
  }
  obs.submit = await s.submit(aid, answers);
  obs.duplicateSubmit = await s.submit(aid, answers);
  obs.attempt = s.attempt(aid, 1);
  obs.doc = s.doc(aid);
  return obs;
}
