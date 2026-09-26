// Shared analytics test school (Roadmap #28 / Phase 8E-3) — a store with every population case teacher analytics
// has to get right, plus an operation-count instrument over the in-memory container. Used by
// analytics-scoped-reads-r28.test.js and analytics-scope-reads-8e3.test.js so both prove the SAME data.
//
//   c1 (active): 4 members incl. one login-disabled (active:false) + one ARCHIVED student (not a member) + a
//      user of another class c2; c3 is an archived class.
//   assignments of c1: P1/P2 published now, P_old published a year ago (outside the range), D draft,
//      AP archived-from-published, AD archived-from-draft, LA legacy archived (no archivedFromStatus);
//      c2: P3 published; c3: P4 published (archived class — still "active:false" in the class list).
//   submissions exist for EVERY assignment (the archived ones carry real history), incl. pending/manual-review,
//   legacy documents without classId, an archived student's submission and a mismatch blob (see mismatch()).
export const SUB = "platform/submissions/";
export const NOW = "2026-03-10T10:00:00.000Z", OLD = "2025-03-10T10:00:00.000Z";
export const FROM = Date.parse("2026-02-01T00:00:00.000Z"), TO = Date.parse("2026-04-01T00:00:00.000Z");

export function user(uid, cid, extra = {}) {
  return { userId: uid, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + uid, firstName: "ط", familyName: uid, code: "1000000" + uid.slice(-2).padStart(2, "0"), identityNumber: "1000000" + uid.slice(-2).padStart(2, "0"), lastLoginAt: NOW, ...extra };
}
export function assignment(aid, cid, status, date, extra = {}) {
  return { assignmentId: aid, classId: cid, status, title: "واجب " + aid, createdAt: date, dueAt: date, maxAttempts: 1, totalMarks: 10, examSnapshot: { questions: [{ id: "q1", text: "س", marks: 6, topic: "جبر" }, { id: "q2", text: "ص", marks: 4, topic: "هندسة" }] }, ...extra };
}
export function submission(aid, sid, cid, pct, { pending = false, legacy = false } = {}, date = NOW) {
  const doc = { assignmentId: aid, studentId: sid, attempts: [{ attemptNumber: 1, submittedAt: date, score: pct / 10, totalMarks: 10, percentage: pct, manualReviewMarks: pending ? 2 : 0, finalized: !pending, questionGrades: [{ questionId: "q1", score: pct >= 60 ? 6 : 3, maxMarks: 6, correct: pct >= 60, manualReview: false }, { questionId: "q2", score: pending ? 0 : 4, maxMarks: 4, correct: !pending, manualReview: pending }] }], activeAttempt: null };
  if (!legacy) doc.classId = cid;
  return doc;
}

// `history`: archived-from-published c1 assignments × 4 submissions each (prior years).
// `foreign`: extra ACTIVE classes (cF1..cFn) each with one member and one published assignment with one submission —
//            a large unrelated-class population (Phase 8E-3 CLASS/STUDENT scopes must never read it).
// `mismatch`: hand-edited blobs stored outside their document's assignment folder (see the R28 H tests).
// `published`: extra CURRENT published c1 assignments (PX1..PXn) with one submission per member — a wide student scope.
export function school({ history = 0, foreign = 0, published = 0, mismatch = false } = {}) {
  const s = {};
  s["platform/classes/c1.json"] = { classId: "c1", name: "صف 1", grade: "7", schoolYear: "2025-2026", active: true, status: "active", studentIds: ["s01", "s02", "s03", "s04"] };
  s["platform/classes/c2.json"] = { classId: "c2", name: "صف 2", grade: "8", schoolYear: "2025-2026", active: true, status: "active", studentIds: ["s11", "s12"] };
  s["platform/classes/c3.json"] = { classId: "c3", name: "صف 3", grade: "9", schoolYear: "2024-2025", active: false, status: "archived", studentIds: ["s21"] };
  for (const [uid, cid, extra] of [["s01", "c1"], ["s02", "c1"], ["s03", "c1", { active: false }], ["s04", "c1"], ["s05", "c1", { archived: true, active: false }], ["s11", "c2"], ["s12", "c2", { lastLoginAt: "" }], ["s21", "c3"]]) s["platform/users/" + uid + ".json"] = user(uid, cid, extra || {});
  s["platform/users/teacher.json"] = { userId: "teacher", role: "teacher", displayName: "معلم" };
  const A = {
    P1: assignment("P1", "c1", "published", NOW), P2: assignment("P2", "c1", "published", "2026-03-12T10:00:00.000Z"),
    P_old: assignment("P_old", "c1", "published", OLD), D: assignment("D", "c1", "draft", NOW),
    AP: assignment("AP", "c1", "archived", NOW, { archivedFromStatus: "published", archivedAt: NOW }),
    AD: assignment("AD", "c1", "archived", NOW, { archivedFromStatus: "draft", archivedAt: NOW }),
    LA: assignment("LA", "c1", "archived", NOW), P3: assignment("P3", "c2", "published", NOW), P4: assignment("P4", "c3", "published", NOW)
  };
  for (const a of Object.values(A)) s["platform/assignments/" + a.assignmentId + ".json"] = a;
  const put = (aid, sid, cid, pct, o, date) => { s[SUB + aid + "/" + sid + ".json"] = submission(aid, sid, cid, pct, o, date); };
  put("P1", "s01", "c1", 92); put("P1", "s02", "c1", 55, { pending: true }); put("P1", "s03", "c1", 71, { legacy: true }); put("P1", "s05", "c1", 40);
  put("P2", "s01", "c1", 88); put("P2", "s04", "c1", 61, { pending: true }); put("P2", "s11", "c2", 99);   // s11 is not a member of c1
  put("P_old", "s01", "c1", 30, {}, OLD); put("P_old", "s02", "c1", 35, {}, OLD);
  put("D", "s01", "c1", 100); put("AP", "s01", "c1", 77, {}, OLD); put("AP", "s02", "c1", 64, { legacy: true }, OLD);
  put("AD", "s01", "c1", 50); put("LA", "s01", "c1", 81, {}, OLD); put("P3", "s11", "c2", 90); put("P3", "s12", "c2", 45, { pending: true }); put("P4", "s21", "c3", 70);
  for (let i = 1; i <= history; i++) {
    const aid = "H" + i;
    s["platform/assignments/" + aid + ".json"] = assignment(aid, "c1", "archived", OLD, { archivedFromStatus: "published", archivedAt: OLD });
    for (const sid of ["s01", "s02", "s03", "s04"]) put(aid, sid, "c1", 50 + i % 40, {}, OLD);
  }
  for (let i = 1; i <= published; i++) {
    const aid = "PX" + i;
    s["platform/assignments/" + aid + ".json"] = assignment(aid, "c1", "published", NOW);
    for (const sid of ["s01", "s02", "s03", "s04"]) put(aid, sid, "c1", 55 + i % 40);
  }
  for (let i = 1; i <= foreign; i++) {
    const cid = "cF" + i, sid = "f" + String(i).padStart(3, "0"), aid = "PF" + i;
    s["platform/classes/" + cid + ".json"] = { classId: cid, name: "صف خارجي " + i, grade: "10", schoolYear: "2025-2026", active: true, status: "active", studentIds: [sid] };
    s["platform/users/" + sid + ".json"] = user(sid, cid);
    s["platform/assignments/" + aid + ".json"] = assignment(aid, cid, "published", NOW);
    put(aid, sid, cid, 60 + i % 30);
  }
  if (mismatch) {
    // (a) blob under a CANDIDATE folder whose document belongs to an archived assignment: downloaded, keyed by
    //     the document (never consulted) → harmless over-inclusion.
    s[SUB + "P1/hand-edited-a.json"] = submission("AP", "s04", "c1", 15);
    // (b) blob under a NON-candidate folder whose document claims a candidate assignment: the documented
    //     boundary — not downloaded (see R28 test H2).
    s[SUB + "AP/hand-edited-b.json"] = submission("P2", "s02", "c1", 13);
  }
  return s;
}

// Operation-count instrument over a memory container: every listBlobsFlat prefix, every blob download (in request
// order, counted even when the blob is missing → 404), uploads, in-flight ceilings, and an injectable failure map.
export function instrument(ctx) {
  const c = ctx.container, st = { lists: [], downloads: [], uploads: 0, inflight: 0, maxInflight: 0, subInflight: 0, maxSubInflight: 0, fail: new Map() };
  const ol = c.listBlobsFlat.bind(c);
  c.listBlobsFlat = o => { st.lists.push(o.prefix); return ol(o); };
  const og = c.getBlobClient.bind(c);
  c.getBlobClient = name => {
    const cl = og(name); const od = cl.download.bind(cl);
    cl.download = async () => {
      if (st.fail.has(name)) { const e = new Error("storage failure " + name); e.statusCode = st.fail.get(name); throw e; }
      const sub = name.startsWith(SUB);
      st.inflight++; st.maxInflight = Math.max(st.maxInflight, st.inflight);
      if (sub) { st.subInflight++; st.maxSubInflight = Math.max(st.maxSubInflight, st.subInflight); }
      st.downloads.push(name); await new Promise(r => setTimeout(r, 1));
      st.inflight--; if (sub) st.subInflight--;
      return od();
    };
    return cl;
  };
  const ob = c.getBlockBlobClient.bind(c);
  c.getBlockBlobClient = name => { const b = ob(name); const ou = b.upload.bind(b); b.upload = async (...a) => { st.uploads++; return ou(...a); }; return b; };
  st.subs = () => st.downloads.filter(n => n.startsWith(SUB)).sort();
  st.subLists = () => st.lists.filter(p => p.startsWith(SUB));
  st.dups = () => { const m = new Map(); for (const n of st.downloads) m.set(n, (m.get(n) || 0) + 1); return [...m.values()].filter(v => v > 1).length; };
  return st;
}
export const strip = body => JSON.parse(JSON.stringify(body, (k, v) => (k === "generatedAt" ? undefined : v)));
export const folders = names => [...new Set(names.map(n => n.slice(SUB.length).split("/")[0]))].sort();
