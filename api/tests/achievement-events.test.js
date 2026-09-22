import { describe, it, expect } from "vitest";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { handler as studentFeed } from "../src/functions/achievement-feed.js";
import { handler as teacherFeed } from "../src/functions/teacher-achievement-feed.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as students } from "../src/functions/manage-students.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { FEED_PREFIX, feedBlobName, recordAchievementIfEligible, eventTypeOf, publicPost, aggregateRecognition } from "../src/lib/achievement-feed.js";
import { recognitionDocName } from "../src/lib/achievement-milestones.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Generic achievement EVENTS: schema + legacy normalization, the global rank-up milestone (one event per newly reached
// tier, baseline on first sight, retry-safe), project rank-up / completion milestones from real progress writes
// (per project, idempotent, no event on decrease), privacy (shareWithClass), student/teacher reactions (own event
// refused, one active reaction, toggle/replace), the lifetime recognition summary (received, never sent) shared with
// the roster likesCount, and the invariant that reactions never touch Strength / grade / progress.

const NOW = "2026-09-20T10:00:00.000Z";
const NS = getStorageNamespace("899373");
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "S" + id, firstName: "طالب", familyName: id, createdAt: NOW, updatedAt: NOW, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: ["s1", "s2"], programCodes: ["899373"], createdAt: "2026-01-01", updatedAt: NOW, ...extra });
const finalAttempt = pct => ({ attemptNumber: 1, submittedAt: NOW, score: pct, totalMarks: 100, percentage: pct, manualReviewMarks: 0, finalized: true, teacherFeedback: "" });
const assignment = (id, cid) => ({ assignmentId: id, classId: cid, status: "published", title: "واجب " + id, instructions: "", maxAttempts: 1, durationMinutes: 0, attemptModelVersion: 2, questionCount: 1, totalMarks: 100, openAt: "", dueAt: "", createdAt: NOW });
const school = extra => createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), ...extra });
/** N finalized assignments for s1 (each 100 Strength points) */
const exams = (n, cid = "c1", sid = "s1") => { const out = {}; for (let i = 1; i <= n; i++) { out["platform/assignments/A" + i + ".json"] = assignment("A" + i, cid); out["platform/submissions/A" + i + "/" + sid + ".json"] = { attempts: [finalAttempt(60)] }; } return out; };
function studentDeps(ctx, id = "s1") {
  return {
    requireActiveStudentSession: async () => { const student = ctx.getJson("platform/users/" + id + ".json"); return student ? { ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student } : { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }; },
    downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, prefix) => ctx.names(prefix).map(n => ctx.getJson(n)),
    container: ctx.container, getContainer: () => ctx.container
  };
}
const teacherDeps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const dash = (ctx, id) => dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, studentDeps(ctx, id));
const feedGet = (ctx, id) => studentFeed({ method: "GET", url: "https://x/api/achievement-feed", headers: { get: () => null } }, studentDeps(ctx, id));
const react = (ctx, id, postId, reaction) => studentFeed({ method: "POST", url: "https://x/api/achievement-feed", headers: { get: () => null }, json: async () => ({ action: "react", postId, reaction }) }, studentDeps(ctx, id));
const tFeedGet = ctx => teacherFeed({ method: "GET", url: "https://x/api/teacher-achievement-feed" }, teacherDeps(ctx));
const tReact = (ctx, classId, postId, reaction) => teacherFeed({ method: "POST", url: "https://x/api/teacher-achievement-feed", json: async () => ({ action: "react", classId, postId, reaction }) }, teacherDeps(ctx));
const tNote = (ctx, classId, postId, note) => teacherFeed({ method: "POST", url: "https://x/api/teacher-achievement-feed", json: async () => ({ action: "setNote", classId, postId, note }) }, teacherDeps(ctx));
const update = (ctx, body) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ action: "progress.update", projectCode: "899373", classId: "c1", studentId: "s1", ...body }) }, teacherDeps(ctx));
const feedNames = ctx => ctx.names(FEED_PREFIX).sort();

describe("34/33/110. generic event shape + legacy medal posts", () => {
  it("a new medal post carries eventType/medal/shareWithClass and stays create-only; a legacy post normalizes as medal with reactions intact", async () => {
    const ctx = school();
    expect(await recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s1", studentDisplayName: "ليان", assignmentId: "A1", assignmentTitle: "الشبكات", percentage: 92, shareAchievements: false })).toBe(true);
    expect(await recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s1", studentDisplayName: "ليان", assignmentId: "A1", assignmentTitle: "الشبكات", percentage: 92, shareAchievements: false })).toBe(false);   // retry never duplicates
    const stored = ctx.getJson(feedBlobName("c1", "A1_s1"));
    expect(stored).toMatchObject({ schemaVersion: 2, eventType: "medal", postId: "A1_s1", shareWithClass: false, medal: { tier: "gold", assignmentId: "A1", assignmentTitle: "الشبكات" }, tier: "gold", assignmentTitle: "الشبكات", reactions: {} });
    expect(await recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s1", assignmentId: "A2", percentage: 50 })).toBe(false);   // no medal → no event
    const legacy = { schemaVersion: 1, postId: "A9_s2", classId: "c1", studentId: "s2", studentDisplayName: "كريم", assignmentId: "A9", assignmentTitle: "قديم", tier: "silver", createdAt: NOW, reactions: { heart: ["s1"] }, teacherReaction: "clap", teacherNote: "أحسنت" };
    expect(eventTypeOf(legacy)).toBe("medal");
    expect(publicPost(legacy)).toMatchObject({ eventType: "medal", tier: "silver", assignmentTitle: "قديم", medal: { tier: "silver", assignmentTitle: "قديم" }, shareWithClass: true, reactionCounts: { heart: 1, clap: 0, cheer: 0, fire: 0 }, teacherReaction: "clap", teacherNote: "أحسنت", rank: null, project: null });
  });
});

describe("35/103/93. global rank-up milestone (dashboard = the Strength authority point)", () => {
  // The milestone is now STAGE-based (student-strength 25-stage model): it observes strength.stage (1..25), stores
  // lastGlobalStage, and posts a create-only `global_rank_up` event with postId "global_stage_<stage>_<studentId>".
  // Strength is driven ONLY by the LIBRARY (practice trainings, best% × 40 per item) — finalized exams no longer feed
  // it — so the stage is moved here by seeding the student's learning-practice summary. Each T item at 100% = 40 pts,
  // so stage = floor(40·n / 80) + 1 = floor(n/2) + 1 for n items.
  const libFull = n => { const t = {}; for (let i = 1; i <= n; i++) t["T" + i] = { bestPercentage: 100 }; return t; };
  const setLib = (ctx, trainings) => ctx.setJson("platform/learning-practice/s1.json", { trainings });
  const practice = trainings => ({ "platform/learning-practice/s1.json": { trainings } });

  it("first sight records the baseline only; crossing into a NEW stage creates exactly one event; a retry stays one; a jump records the final stage only", async () => {
    const ctx = school({ ...practice(libFull(3)) });                    // 120 pts → stage 2
    let r = await dash(ctx);
    expect(r.jsonBody.strength.stage).toBe(2);
    expect(feedNames(ctx)).toEqual([]);                                 // baseline, no retroactive event
    expect(ctx.getJson(recognitionDocName("s1"))).toMatchObject({ lastGlobalStage: 2, lastGlobalPoints: 120 });
    // +1 library item → 160 pts → stage 3
    setLib(ctx, libFull(4));
    r = await dash(ctx);
    expect(r.jsonBody.strength.stage).toBe(3);
    expect(feedNames(ctx)).toEqual([feedBlobName("c1", "global_stage_3_s1")]);
    expect(ctx.getJson(feedBlobName("c1", "global_stage_3_s1"))).toMatchObject({ eventType: "global_rank_up", rank: { stage: 3, points: 160 }, shareWithClass: true, studentDisplayName: "طالب s1" });
    expect(r.jsonBody.recognition.achievements).toEqual({ total: 1, byType: { global_rank_up: 1, project_rank_up: 0, project_complete: 0 } });
    await dash(ctx); await dash(ctx);                                    // retries / small changes → still one
    expect(feedNames(ctx).length).toBe(1);
    // jump two stages at once (160 → 360 pts, stage 5) → ONE event for the final stage
    setLib(ctx, libFull(9));                                            // 360 pts → stage 5
    r = await dash(ctx);
    expect(r.jsonBody.strength.stage).toBe(5);
    expect(feedNames(ctx)).toEqual([feedBlobName("c1", "global_stage_3_s1"), feedBlobName("c1", "global_stage_5_s1")]);
  });
  it("steady state is write-free: after the first-sight baseline, repeated dashboard reads with an unchanged stage issue no writes; a stage change writes once", async () => {
    const ctx = school({ ...practice(libFull(3)) });                    // stage 2
    const writes = [];
    const d = () => ({ ...studentDeps(ctx), uploadJson: async (_c, n, v) => { writes.push(n); ctx.setJson(n, v); } });
    await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, d());
    expect(writes).toEqual([recognitionDocName("s1")]);
    await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, d());
    await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, d());
    expect(writes.length).toBe(1);
    setLib(ctx, libFull(4));                                            // stage 3 — one recognition write
    await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, d());
    expect(writes.length).toBe(2);
    expect(feedNames(ctx)).toEqual([feedBlobName("c1", "global_stage_3_s1")]);
  });
  it("a within-stage gain creates nothing; a decrease creates nothing and a re-climb to the same stage posts once (a NEW stage vs the last seen)", async () => {
    const ctx = school({ ...practice(libFull(4)) });                    // 160 pts → stage 3 (baseline)
    await dash(ctx);
    expect(feedNames(ctx)).toEqual([]);
    setLib(ctx, { ...libFull(4), T5: { bestPercentage: 50 } });         // 180 pts → still stage 3
    await dash(ctx);
    expect(feedNames(ctx)).toEqual([]);
    setLib(ctx, libFull(3));                                            // drop to 120 pts → stage 2 (decrease → last seen becomes 2)
    expect((await dash(ctx)).jsonBody.strength.stage).toBe(2);
    expect(feedNames(ctx)).toEqual([]);
    setLib(ctx, libFull(4));                                            // back to stage 3 — a NEW stage vs last seen (2) → one event
    await dash(ctx);
    expect(feedNames(ctx)).toEqual([feedBlobName("c1", "global_stage_3_s1")]);
    await dash(ctx);
    expect(feedNames(ctx).length).toBe(1);
  });
});

describe("36/37/104/105/92. project milestones from real progress writes", () => {
  const def = getProjectDefinition("899373");
  const book = def.stages.filter(s => s.track === "book" && s.required && s.active);
  const access = def.stages.filter(s => s.track === "access" && s.required && s.active);
  it("AquaSense-style rank-up (190 → 205) creates ONE project_rank_up for that project; a second write in the same tier adds nothing; other projects untouched", async () => {
    const ctx = school();
    // approve 8/20 book stages with score 100 → progress 20, grade 20 → strength 120 (bronze)
    for (const s of book.slice(0, 8)) await update(ctx, { stageId: s.stageId, status: "approved", score: 100 });
    expect(feedNames(ctx)).toEqual([feedBlobName("c1", "project_899373_rank_bronze_s1")]);        // beginner → bronze once
    const ev = ctx.getJson(feedBlobName("c1", "project_899373_rank_bronze_s1"));
    expect(ev).toMatchObject({ eventType: "project_rank_up", project: { projectCode: "899373", title: "مشروع 899373", tier: "bronze", level: 2 }, shareWithClass: true });
    expect(ev.postId.endsWith("_s1")).toBe(true);
    // keep approving to cross 200 (silver): 14/20 book → progress 35, grade 35 → 210
    for (const s of book.slice(8, 14)) await update(ctx, { stageId: s.stageId, status: "approved", score: 100 });
    expect(feedNames(ctx)).toEqual([feedBlobName("c1", "project_899373_rank_bronze_s1"), feedBlobName("c1", "project_899373_rank_silver_s1")]);
    expect(ctx.getJson(feedBlobName("c1", "project_899373_rank_silver_s1")).project.projectStrength).toBe(210);
    expect(feedNames(ctx).some(n => n.includes("883589"))).toBe(false);
  });
  it("a score correction that LOWERS the tier creates no event; completion creates ONE idempotent project_complete", async () => {
    const ctx = school();
    for (const s of [...book, ...access]) await update(ctx, { stageId: s.stageId, status: "approved", score: 100 });
    const names = feedNames(ctx);
    expect(names).toContain(feedBlobName("c1", "project_899373_complete_s1"));
    expect(names.filter(n => n.includes("_complete_")).length).toBe(1);
    expect(ctx.getJson(feedBlobName("c1", "project_899373_complete_s1"))).toMatchObject({ eventType: "project_complete", project: { projectCode: "899373", tier: "legendary", projectStrength: 600 } });
    const countBefore = names.length;
    await update(ctx, { stageId: book[0].stageId, score: 0 });            // grade drops (600 → 598) — no negative event
    await update(ctx, { stageId: book[0].stageId, status: "in_progress" }); // not complete anymore, tier may drop — nothing
    await update(ctx, { stageId: book[0].stageId, status: "approved" });    // complete again → the same id → not re-posted
    expect(feedNames(ctx).length).toBe(countBefore);
  });
});

describe("40/106/42/43/44. privacy + reactions", () => {
  async function seeded() {
    const ctx = school();
    await recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s1", studentDisplayName: "ليان", assignmentId: "A1", assignmentTitle: "الشبكات", percentage: 92, shareAchievements: false });   // private
    await recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s1", studentDisplayName: "ليان", assignmentId: "A2", assignmentTitle: "الأعداد", percentage: 85, shareAchievements: true });    // shared
    ctx.setJson(feedBlobName("c1", "A9_s2"), { schemaVersion: 1, postId: "A9_s2", classId: "c1", studentId: "s2", studentDisplayName: "كريم", assignmentId: "A9", assignmentTitle: "قديم", tier: "silver", createdAt: "2026-01-01T00:00:00.000Z", reactions: {} });   // legacy → visible
    return ctx;
  }
  it("shareWithClass=false: owner sees it, teacher sees it, a classmate does not (and cannot react); true: classmate sees and reacts", async () => {
    const ctx = await seeded();
    expect((await feedGet(ctx, "s1")).jsonBody.posts.map(p => p.postId).sort()).toEqual(["A1_s1", "A2_s1", "A9_s2"]);
    expect((await feedGet(ctx, "s2")).jsonBody.posts.map(p => p.postId).sort()).toEqual(["A2_s1", "A9_s2"]);
    expect((await tFeedGet(ctx)).jsonBody.posts.map(p => p.postId).sort()).toEqual(["A1_s1", "A2_s1", "A9_s2"]);
    expect((await react(ctx, "s2", "A1_s1", "heart")).status).toBe(404);
    expect((await react(ctx, "s2", "A2_s1", "heart")).status).toBe(200);
    expect((await react(ctx, "s1", "A2_s1", "heart")).status).toBe(403);   // never your own
  });
  it("one active student reaction: same toggles off, another replaces; the teacher reacts to any event type and keeps the note", async () => {
    const ctx = await seeded();
    expect((await react(ctx, "s2", "A2_s1", "heart")).jsonBody).toMatchObject({ reactionCounts: { heart: 1 }, myReaction: "heart" });
    expect((await react(ctx, "s2", "A2_s1", "clap")).jsonBody).toMatchObject({ reactionCounts: { heart: 0, clap: 1 }, myReaction: "clap" });
    expect((await react(ctx, "s2", "A2_s1", "clap")).jsonBody).toMatchObject({ reactionCounts: { clap: 0 }, myReaction: null });
    ctx.setJson(feedBlobName("c1", "global_stage_3_s1"), { schemaVersion: 2, eventType: "global_rank_up", postId: "global_stage_3_s1", classId: "c1", studentId: "s1", studentDisplayName: "ليان", createdAt: NOW, shareWithClass: true, reactions: {}, rank: { stage: 3, points: 160 } });
    expect((await tReact(ctx, "c1", "global_stage_3_s1", "fire")).jsonBody).toMatchObject({ ok: true, teacherReaction: "fire" });
    expect((await tNote(ctx, "c1", "global_stage_3_s1", "  رائع جدًا  ")).jsonBody).toMatchObject({ ok: true, teacherNote: "رائع جدًا" });
    const post = (await tFeedGet(ctx)).jsonBody.posts.find(p => p.postId === "global_stage_3_s1");
    expect(post).toMatchObject({ eventType: "global_rank_up", rank: { stage: 3, points: 160 }, teacherReaction: "fire", teacherNote: "رائع جدًا", className: "صف c1" });
    expect((await react(ctx, "s2", "global_stage_3_s1", "cheer")).status).toBe(200);
  });
});

describe("47/107/108/96. recognition summary — received (never sent), shared with the roster likesCount, never Strength", () => {
  it("dashboard recognition: medals from the finalized authority, reactions received by type + total, achievements by type; sent reactions excluded", async () => {
    const ctx = school({ ...exams(2) });
    ctx.setJson("platform/submissions/A1/s1.json", { attempts: [finalAttempt(95)] });   // gold medal for s1
    await recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s1", studentDisplayName: "ليان", assignmentId: "A1", assignmentTitle: "x", percentage: 95, shareAchievements: true });
    await recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s2", studentDisplayName: "كريم", assignmentId: "A1", assignmentTitle: "x", percentage: 95, shareAchievements: true });
    ctx.setJson(feedBlobName("c1", "project_899373_rank_bronze_s1"), { schemaVersion: 2, eventType: "project_rank_up", postId: "project_899373_rank_bronze_s1", classId: "c1", studentId: "s1", studentDisplayName: "ليان", createdAt: NOW, shareWithClass: true, reactions: {}, project: { projectCode: "899373", tier: "bronze", level: 2 } });
    // received by s1: s2 hearts the medal, s2 claps the project event, teacher fires the project event; s1 SENDS a cheer to s2 (must not count)
    await react(ctx, "s2", "A1_s1", "heart"); await react(ctx, "s2", "project_899373_rank_bronze_s1", "clap"); await tReact(ctx, "c1", "project_899373_rank_bronze_s1", "fire"); await react(ctx, "s1", "A1_s2", "cheer");
    const before = await dash(ctx);
    expect(before.jsonBody.recognition).toEqual({ medals: { total: 1, gold: 1, silver: 0, bronze: 0 }, reactionsReceived: { total: 3, byType: { heart: 1, clap: 1, cheer: 0, fire: 1 } }, achievements: { total: 1, byType: { global_rank_up: 0, project_rank_up: 1, project_complete: 0 } } });
    // the roster likesCount is the SAME aggregation (s1 = 3 received; s2 = 1 received)
    const roster = await students({ method: "GET", url: "https://x/api/students?classId=c1", headers: { get: () => null } }, teacherDeps(ctx));
    const byId = Object.fromEntries((roster.jsonBody.students || []).map(s => [s.userId, s.likesCount]));
    expect(byId).toEqual({ s1: 3, s2: 1 });
    const agg = await aggregateRecognition(ctx.container, ["s1", "s2", "ghost"]);
    expect(agg.get("s1").receivedReactionCount).toBe(3); expect(agg.get("ghost").receivedReactionCount).toBe(0);
    // reactions / notes never alter academic metrics
    const strengthBefore = before.jsonBody.strength, statsBefore = before.jsonBody.stats;
    await react(ctx, "s2", "A1_s1", "fire"); await tNote(ctx, "c1", "A1_s1", "ممتاز");
    const after = await dash(ctx);
    expect(after.jsonBody.strength).toEqual(strengthBefore); expect(after.jsonBody.stats).toEqual(statsBefore);
    expect(after.jsonBody.recognition.reactionsReceived.total).toBe(3);
  });
});

describe("49. teacher student profile — concise Strength + recognition + project summaries (same authorities)", () => {
  it("GET /api/students?profileUserId returns the 25-stage strength (library + module sources), recognition and projectSummaries", async () => {
    // Medals stay exam-only (A1 at 95% → gold), but Strength is now the 25-stage model: it reads the library practice
    // summary + module completion, NOT finalized exams or projects. Two library items at 100% = 80 pts → stage 2.
    const ctx = school({ ...exams(4), "platform/learning-practice/s1.json": { trainings: { T01: { bestPercentage: 100 }, T02: { bestPercentage: 100 } } } });
    ctx.setJson("platform/submissions/A1/s1.json", { attempts: [finalAttempt(95)] });
    await recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s1", studentDisplayName: "ليان", assignmentId: "A1", assignmentTitle: "x", percentage: 95, shareAchievements: true });
    await react(ctx, "s2", "A1_s1", "heart");
    const r = await students({ method: "GET", url: "https://x/api/students?profileUserId=s1", headers: { get: () => null } }, teacherDeps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody.profile.strength).toMatchObject({ totalPoints: 80, libraryPoints: 80, modulePoints: 0, stage: 2, stageCount: 25, nextStage: 3, totalMax: 2000 });
    expect(r.jsonBody.profile.strength.examPoints).toBeUndefined();   // finalized exams no longer feed Strength
    expect(r.jsonBody.profile.recognition).toEqual({ medals: { total: 1, gold: 1, silver: 0, bronze: 0 }, reactionsReceived: { total: 1, byType: { heart: 1, clap: 0, cheer: 0, fire: 0 } }, achievements: { total: 0, byType: { global_rank_up: 0, project_rank_up: 0, project_complete: 0 } } });
    expect(r.jsonBody.profile.projectSummaries).toEqual([{ projectCode: "899373", title: "مشروع 899373", overallProgress: 0, complete: false }]);
  });
});
