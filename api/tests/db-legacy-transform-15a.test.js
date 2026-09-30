import { describe, it, expect, beforeAll } from "vitest";
import { buildLegacyPlatform, TEACHER_CODE } from "./fixtures/db-legacy-fixture.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";
import { readLegacyPlatform } from "../src/lib/db-migration/legacy-reader.js";
import { transformLegacy, validateRowsAgainstCatalog, summarize, TABLES } from "../src/lib/db-migration/legacy-transform.js";
import { planInserts, MAX_PARAMS } from "../src/lib/db-migration/sql-loader.js";
import { loadSchemaCatalog } from "../src/lib/db/schema-catalog.js";
import { studentCodeHash } from "../src/lib/student-auth.js";

// Phase 15A — blob → row transform, driven by documents written by the REAL handlers (fixtures/db-legacy-fixture.js).

const catalog = loadSchemaCatalog();
const OPTIONS = { school: { schoolId: "school-1", name: "البطوف الشاملة" }, teacher: { userId: "teacher-user-1", loginCode: TEACHER_CODE }, now: "2026-09-30T00:00:00.000Z" };
const rowsOf = (result, table) => result.tables[table];

describe("15A transform over real handler output", () => {
  let fixture, legacy, result;
  beforeAll(async () => {
    fixture = await buildLegacyPlatform();
    legacy = await readLegacyPlatform(fixture.ctx.container);
    result = transformLegacy(legacy, OPTIONS);
  });

  it("the reader only reads (no upload, no delete)", async () => {
    const probe = instrumentReadCost(fixture.ctx.container);
    await readLegacyPlatform(fixture.ctx.container);
    expect(probe.ops.uploads).toHaveLength(0);
    expect(probe.ops.deletes).toHaveLength(0);
  });

  it("produces the expected rows, with no blocking anomaly and no catalog violation", () => {
    expect(summarize(result).rows).toEqual({
      schools: 1, users: 3, user_credentials: 2, school_memberships: 4,
      classes: 2, class_teachers: 2, class_programs: 1, class_learning_courses: 0, enrollments: 2,
      assignments: 1, submissions: 1, attempts: 1
    });
    expect(result.anomalies.filter(a => a.severity === "blocking")).toEqual([]);
    expect(validateRowsAgainstCatalog(result.tables, catalog)).toEqual([]);
  });

  it("keeps every legacy id verbatim and links the existing teacher as owner of every class", () => {
    const { ids } = fixture;
    expect(rowsOf(result, "users").map(u => u.user_id).sort()).toEqual([ids.s1, ids.s2, "teacher-user-1"].sort());
    expect(rowsOf(result, "classes").map(c => c.class_id).sort()).toEqual([ids.classId, ids.oldClassId].sort());
    expect(rowsOf(result, "class_teachers").every(t => t.teacher_user_id === "teacher-user-1" && t.role === "owner")).toBe(true);
    expect(rowsOf(result, "assignments")[0].assignment_id).toBe(ids.assignmentId);
    expect(rowsOf(result, "assignments")[0].created_by_user_id).toBe("teacher-user-1");
    expect(rowsOf(result, "class_programs")).toEqual([{ class_id: ids.classId, course_code: "794589" }]);
  });

  it("the teacher becomes a staff user, platform admin, school admin and teacher, named from the legacy profile", () => {
    const teacher = rowsOf(result, "users").find(u => u.user_id === "teacher-user-1");
    // The builder login is an exact match of BUILDER_USER_CODE, so the code is stored unchanged (not upper-cased).
    expect(teacher).toMatchObject({ kind: "staff", login_code: TEACHER_CODE, is_platform_admin: true, display_name: "الأستاذ وفيق", avatar_id: "a3" });
    expect(rowsOf(result, "school_memberships").filter(m => m.user_id === "teacher-user-1").map(m => m.role).sort()).toEqual(["school_admin", "teacher"]);
    expect(rowsOf(result, "user_credentials").some(c => c.user_id === "teacher-user-1")).toBe(false); // password is set in 15B
  });

  it("enrollments come from user.classId (the authority), one per student", () => {
    const { ids } = fixture;
    expect(rowsOf(result, "enrollments").map(e => [e.class_id, e.student_user_id]).sort()).toEqual([[ids.classId, ids.s1], [ids.classId, ids.s2]].sort());
  });

  it("credentials keep the scrypt material and the login code agrees with the auth blob name", () => {
    const users = rowsOf(result, "users");
    for (const cred of rowsOf(result, "user_credentials")) {
      const user = users.find(u => u.user_id === cred.user_id);
      const blob = legacy.auth.find(a => a.doc.userId === cred.user_id);
      expect(blob.name).toBe("platform/auth/" + studentCodeHash(user.login_code) + ".json");
      expect(cred).toMatchObject({ hash_scheme: "scrypt-b64-v1", password_hash: blob.doc.passwordHash, password_salt: blob.doc.salt, auth_version: 1 });
    }
  });

  it("is lossless: unmapped fields land in extra_json, and attempts keep answers and grades as JSON", () => {
    const sub = rowsOf(result, "submissions")[0];
    expect(JSON.parse(sub.extra_json)).toMatchObject({ schemaVersion: 1, draftSavedAt: "" });
    const attempt = rowsOf(result, "attempts")[0];
    expect(attempt).toMatchObject({ attempt_number: 1, total_marks: 10, finalized: false, timed_out: false, end_reason: "submitted" });
    expect(JSON.parse(attempt.answers_json)).toEqual({ q1: "a", q2: "شرح" });
    expect(JSON.parse(attempt.question_grades_json)).toHaveLength(2);
    expect(JSON.parse(attempt.extra_json)).toHaveProperty("extendedEndsAt", "");
    const assignment = rowsOf(result, "assignments")[0];
    expect(JSON.parse(assignment.exam_snapshot_json).questions).toHaveLength(2);
    expect(assignment.status).toBe("published");
  });

  it("every JSON column holds an object or array (what ISJSON accepts)", () => {
    for (const table of TABLES) for (const row of rowsOf(result, table)) for (const [k, v] of Object.entries(row)) {
      if (!k.endsWith("_json") || v === null) continue;
      const parsed = JSON.parse(v);
      expect(typeof parsed === "object" && parsed !== null, table + "." + k).toBe(true);
    }
  });

  it("anomalies never contain names, identity numbers, password material, or the reversible auth blob names", () => {
    const withProblems = {
      ...legacy,
      users: legacy.users.map(u => ({ ...u, doc: { ...u.doc, classId: "gone" } })),
      // every credential problem at once: version drift, a duplicate, and an orphan
      auth: [...legacy.auth.map(a => ({ ...a, doc: { ...a.doc, authVersion: 7 } })), legacy.auth[0], { name: "platform/auth/" + studentCodeHash("999999999") + ".json", doc: { userId: "ghost" } }]
    };
    const r = transformLegacy(withProblems, OPTIONS);
    expect(r.anomalies.map(a => a.code)).toEqual(expect.arrayContaining(["credential-auth-version-differs", "credential-duplicate", "credential-unknown-user", "enrollment-unknown-class"]));
    const text = JSON.stringify(r.anomalies);
    for (const s of [fixture.names.s1, fixture.names.s2, ...fixture.identity, "999999999"]) expect(text).not.toContain(s);
    for (const a of withProblems.auth) {
      expect(text).not.toContain(a.name.slice("platform/auth/".length, -5)); // sha256(identity number) is brute-forceable
      if (a.doc.passwordHash) expect(text).not.toContain(a.doc.passwordHash);
    }
  });
});

describe("15A transform: anomalies on hand-made legacy shapes", () => {
  const user = (id, extra = {}) => ({ name: "platform/users/" + id + ".json", doc: { userId: id, role: "student", code: "C-" + id, displayName: "x", classId: "c1", active: true, archived: false, authVersion: 1, ...extra } });
  const auth = (id, code, extra = {}) => ({ name: "platform/auth/" + studentCodeHash(code) + ".json", doc: { userId: id, salt: "s", passwordHash: "h", authVersion: 1, active: true, ...extra } });
  const cls = (id, extra = {}) => ({ name: "platform/classes/" + id + ".json", doc: { classId: id, name: "صف", active: true, studentIds: [], ...extra } });
  const codes = r => r.anomalies.map(a => a.severity + ":" + a.code);

  it("duplicate login codes and a code colliding with the teacher are blocking", () => {
    const r = transformLegacy({ users: [user("u1"), user("u2", { code: "C-u1" }), user("u3", { code: TEACHER_CODE.toUpperCase() })], classes: [cls("c1")] }, OPTIONS);
    expect(codes(r)).toContain("blocking:login-code-duplicate");
    expect(codes(r)).toContain("blocking:login-code-collides-with-teacher");
  });

  it("an auth document whose name does not hash the user's code is blocking (the student would lose access)", () => {
    const r = transformLegacy({ users: [user("u1")], auth: [auth("u1", "SOMETHING-ELSE")], classes: [cls("c1")] }, OPTIONS);
    expect(codes(r)).toContain("blocking:credential-code-mismatch");
  });

  it("documents whose parent is gone are skipped and listed; roster drift and missing class are warnings", () => {
    const r = transformLegacy({
      users: [user("u1"), user("u2", { classId: "" }), user("u3", { classId: "deleted-class" })],
      auth: [auth("u1", "C-u1"), auth("ghost", "C-ghost")],
      classes: [cls("c1", { studentIds: ["u1", "ghost"] })],
      assignments: [{ name: "platform/assignments/a1.json", doc: { assignmentId: "a1", classId: "c1", status: "published", title: "t", examSnapshot: { questions: [] } } },
                    { name: "platform/assignments/a2.json", doc: { assignmentId: "a2", classId: "deleted-class", status: "draft", title: "t" } }],
      submissions: [{ name: "platform/submissions/a1/ghost.json", doc: { assignmentId: "a1", studentId: "ghost", attempts: [] } },
                    { name: "platform/submissions/a2/u1.json", doc: { assignmentId: "a2", studentId: "u1", attempts: [] } }]
    }, OPTIONS);
    expect(codes(r)).toEqual(expect.arrayContaining([
      "skipped:credential-unknown-user", "skipped:enrollment-unknown-class", "skipped:assignment-unknown-class",
      "skipped:submission-unknown-student", "skipped:submission-unknown-assignment",
      "warning:student-without-class", "warning:roster-index-drift", "warning:student-without-credential"
    ]));
    expect(r.anomalies.filter(a => a.severity === "blocking")).toEqual([]);
    expect(r.tables.enrollments).toHaveLength(1);
    expect(r.tables.submissions).toHaveLength(0);
  });

  it("invalid timestamps, duplicate attempt numbers and a legacy scalar programCode are handled explicitly", () => {
    const r = transformLegacy({
      users: [user("u1", { createdAt: "not-a-date" })], auth: [auth("u1", "C-u1")],
      classes: [cls("c1", { programCode: "794589" })],
      assignments: [{ name: "platform/assignments/a1.json", doc: { assignmentId: "a1", classId: "c1", status: "published", title: "t", examSnapshot: {} } }],
      submissions: [{ name: "platform/submissions/a1/u1.json", doc: { assignmentId: "a1", studentId: "u1", attempts: [{ attemptNumber: 1, answers: {} }, { attemptNumber: 1, answers: {} }] } }]
    }, OPTIONS);
    expect(codes(r)).toContain("blocking:invalid-timestamp");
    expect(codes(r)).toContain("blocking:attempt-duplicate-number");
    expect(r.tables.class_programs).toEqual([{ class_id: "c1", course_code: "794589" }]);
    expect(JSON.parse(r.tables.classes[0].extra_json)).toEqual({ programCode: "794589" }); // raw legacy value kept
  });

  it("identity follows the app: a 9-digit code is the identity number, and a missing code falls back to it", () => {
    const r = transformLegacy({
      users: [user("u1", { code: "123456782", identityNumber: undefined }), user("u2", { code: undefined, identityNumber: "23456789" })],
      auth: [auth("u1", "123456782"), auth("u2", "023456789")], classes: [cls("c1")]
    }, OPTIONS);
    const byId = Object.fromEntries(r.tables.users.map(u => [u.user_id, u]));
    expect(byId.u1).toMatchObject({ login_code: "123456782", identity_number: "123456782" });
    expect(byId.u2).toMatchObject({ login_code: "023456789", identity_number: "023456789" });
    expect(JSON.parse(byId.u2.extra_json)).toEqual({ identityNumber: "23456789" }); // raw (unpadded) value kept
    expect(r.anomalies.filter(a => a.severity === "blocking")).toEqual([]);
  });

  it("a repeated program code is stored once (the PK would reject the load) and the raw list is kept", () => {
    const r = transformLegacy({ users: [user("u1")], auth: [auth("u1", "C-u1")], classes: [cls("c1", { programCodes: ["899373", "899373", "883589"] })] }, OPTIONS);
    expect(r.tables.class_programs).toEqual([{ class_id: "c1", course_code: "899373" }, { class_id: "c1", course_code: "883589" }]);
    expect(JSON.parse(r.tables.classes[0].extra_json)).toEqual({ programCodes: ["899373", "899373", "883589"] });
    expect(validateRowsAgainstCatalog(r.tables, catalog)).toEqual([]);
  });

  it("raw values changed by normalization are kept: statuses, flags, trimmed names, a dangling classId", () => {
    const r = transformLegacy({
      users: [user("u1", { displayName: "  علي  ", classId: "deleted" })], auth: [auth("u1", "C-u1")],
      classes: [cls("c1", { status: "archived", active: true })],
      assignments: [{ name: "platform/assignments/a1.json", doc: { assignmentId: "a1", classId: "c1", status: "weird", title: "t", examSnapshot: {} } }]
    }, OPTIONS);
    expect(JSON.parse(r.tables.users.find(u => u.user_id === "u1").extra_json)).toEqual({ code: "C-u1", displayName: "  علي  ", classId: "deleted" }); // code: stored upper-cased
    expect(r.tables.classes[0].status).toBe("archived");
    expect(JSON.parse(r.tables.classes[0].extra_json)).toEqual({ active: true });
    expect(r.tables.assignments[0].status).toBe("draft");
    expect(JSON.parse(r.tables.assignments[0].extra_json)).toEqual({ status: "weird" });
  });

  it("the dry-run catches key collisions the way SQL Server compares them (case-insensitive, trailing spaces)", () => {
    const r = transformLegacy({ users: [user("u1")], auth: [auth("u1", "C-u1")], classes: [cls("c1"), cls("C1")] }, OPTIONS);
    const found = validateRowsAgainstCatalog(r.tables, catalog).filter(a => a.code === "duplicate-key").map(a => a.detail);
    expect(found.some(d => d.startsWith("classes primary key"))).toBe(true);
  });

  it("the dry-run blocks non-Latin-1 text in varchar columns and wrong value types", () => {
    const tables = { users: [{ user_id: "u", kind: "student", login_code: "c", display_name: "x", identity_number: "١٢٣", auth_version: "1" }] };
    const codes2 = validateRowsAgainstCatalog(tables, catalog).map(a => a.code);
    expect(codes2).toEqual(expect.arrayContaining(["non-latin1-in-varchar", "wrong-value-type"]));
  });

  it("a scalar where JSON is expected is preserved in extra_json instead of being dropped", () => {
    const r = transformLegacy({
      users: [user("u1")], auth: [auth("u1", "C-u1")], classes: [cls("c1")],
      assignments: [{ name: "platform/assignments/a1.json", doc: { assignmentId: "a1", classId: "c1", status: "published", title: "t", examSnapshot: {} } }],
      submissions: [{ name: "platform/submissions/a1/u1.json", doc: { assignmentId: "a1", studentId: "u1", draftAnswers: "oops", attempts: [] } }]
    }, OPTIONS);
    const sub = r.tables.submissions[0];
    expect(sub.draft_answers_json).toBe("{}");
    expect(JSON.parse(sub.extra_json)).toEqual({ draftAnswers: "oops" });
  });

  it("the catalog check blocks values that would not fit their column", () => {
    const longId = "x".repeat(65);
    const r = transformLegacy({ users: [user(longId)], classes: [cls("c1")] }, OPTIONS);
    const found = validateRowsAgainstCatalog(r.tables, catalog).map(a => a.code);
    expect(found).toContain("value-too-long");
  });

  it("missing school or teacher options are blocking", () => {
    const r = transformLegacy({}, { school: {}, teacher: {} });
    expect(codes(r)).toEqual(expect.arrayContaining(["blocking:school-options-missing", "blocking:teacher-options-missing"]));
  });
});

describe("15A loader: statement planning", () => {
  it("never exceeds the SQL Server parameter limit and keeps catalog column order", () => {
    const spec = catalog.tables.attempts;
    const rows = Array.from({ length: 500 }, (_, i) => ({ assignment_id: "a", student_user_id: "s", attempt_number: i + 1, answers_json: "{}", timed_out: false, teacher_feedback: "" }));
    const stmts = planInserts("attempts", spec, rows);
    expect(stmts.reduce((n, s) => n + s.rows.length, 0)).toBe(500);
    for (const s of stmts) expect(s.rows.length * s.columns.length).toBeLessThanOrEqual(MAX_PARAMS);
    // A narrow table is capped by the 1000-rows-per-VALUES limit, not only by the parameter limit.
    const narrow = planInserts("class_programs", catalog.tables.class_programs, Array.from({ length: 2500 }, (_, i) => ({ class_id: "c" + i, course_code: "791381" })));
    expect(narrow.map(s => s.rows.length)).toEqual([1000, 1000, 500]);
    expect(stmts[0].columns).toEqual(["assignment_id", "student_user_id", "attempt_number", "timed_out", "teacher_feedback", "answers_json"]);
    expect(planInserts("attempts", spec, [])).toEqual([]);
  });
});

describe("15A reader on an empty container", () => {
  it("returns empty arrays for every prefix", async () => {
    const legacy = await readLegacyPlatform(createMemoryContainer().container);
    expect(Object.values(legacy).every(v => Array.isArray(v) && v.length === 0)).toBe(true);
  });
});
