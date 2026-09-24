import { describe, it, expect } from "vitest";
import {
  teacherActorKey, teacherDirectStateName, studentDirectStateName, studentAnnouncementStateName, READ_STATE_PREFIX,
  messageIdMs, isReadBy, advanceBoundary, markStreamRead, countUnread, loadMarker, teacherDirectUnread, MarkReadError, UNREAD_DISPLAY_CAP
} from "../src/lib/message-read-state.js";
import { directPrefix, announcementPrefix } from "../src/lib/message-store.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 5D — read-state store: separate marker docs, same-millisecond-safe boundary, existence-validated monotonic CAS,
// candidate-only capped counting. Message blobs are written here directly with CHOSEN ids so same-ms cases are exact.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const C1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const id = (ms, hex) => String(ms) + "-" + hex.repeat(16).slice(0, 16);
function putDirect(ctx, studentId, messageId, senderRole = "student") {
  ctx.setJson(directPrefix(studentId) + messageId + ".json", { schemaVersion: 1, messageId, kind: "direct", studentId, senderRole, senderId: senderRole === "student" ? studentId : "t1", senderDisplayName: "x", body: "b-" + messageId, createdAt: "", classIdAtSend: C1 });
}
function putAnn(ctx, classId, messageId) {
  ctx.setJson(announcementPrefix(classId) + messageId + ".json", { schemaVersion: 1, messageId, kind: "announcement", classId, senderRole: "teacher", senderId: "t1", senderDisplayName: "x", body: "a-" + messageId, createdAt: "" });
}
const teacherStream = sid => ({ streamPrefix: directPrefix(sid), expected: { kind: "direct", studentId: sid } });
// A snapshot acknowledgement: `seen` = the relevant ids at X's millisecond that were in the viewed snapshot.
const markTeacher = (ctx, sid, through, seen = [through]) => markStreamRead(ctx.container, { stateName: teacherDirectStateName("builder-1", sid), ...teacherStream(sid), include: d => d.senderRole === "student", throughMessageId: through, seenIdsAtBoundary: seen, meta: { principalRole: "teacher", streamKind: "direct", streamId: sid } });
const teacherCount = async (ctx, sid) => countUnread(ctx.container, { ...teacherStream(sid), marker: await loadMarker(ctx.container, teacherDirectStateName("builder-1", sid)), include: d => d.senderRole === "student" });

describe("paths", () => {
  it("teacher key is a deterministic sha256 hex (raw id never in the path); student/class paths reject traversal", () => {
    expect(teacherActorKey("builder-1")).toMatch(/^[a-f0-9]{64}$/);
    expect(teacherActorKey("builder-1")).toBe(teacherActorKey("builder-1"));
    expect(teacherActorKey("builder-1")).not.toBe(teacherActorKey("builder-2"));
    const weird = "a/../b%2F c";
    expect(teacherDirectStateName(weird, S1)).not.toContain(weird);
    expect(teacherDirectStateName(weird, S1).startsWith(READ_STATE_PREFIX + "teacher/")).toBe(true);
    expect(studentDirectStateName(S1)).toBe(READ_STATE_PREFIX + "student/" + S1 + "/direct.json");
    expect(studentAnnouncementStateName(S1, C1)).toBe(READ_STATE_PREFIX + "student/" + S1 + "/announcements/" + C1 + ".json");
    for (const bad of ["../x", "a/b", "", "a.b"]) {
      expect(() => teacherDirectStateName("t", bad)).toThrow();
      expect(() => studentDirectStateName(bad)).toThrow();
      expect(() => studentAnnouncementStateName(S1, bad)).toThrow();
    }
    expect(() => teacherActorKey("")).toThrow();
  });
});

describe("boundary", () => {
  it("no marker → unread; mark through X → X and earlier read, a newer Y stays unread", async () => {
    const ctx = createMemoryContainer({});
    const [a, b, y] = [id(1800000000001, "a"), id(1800000000002, "b"), id(1800000000009, "c")];
    putDirect(ctx, S1, a); putDirect(ctx, S1, b);
    expect(await teacherCount(ctx, S1)).toEqual({ unread: 2, capped: false });
    await markTeacher(ctx, S1, b);
    putDirect(ctx, S1, y);                                               // arrives after the mark
    expect(await teacherCount(ctx, S1)).toEqual({ unread: 1, capped: false });
    const m = await loadMarker(ctx.container, teacherDirectStateName("builder-1", S1));
    expect(isReadBy(m, a) && isReadBy(m, b) && !isReadBy(m, y)).toBe(true);
  });

  it("SAME MILLISECOND: a message created later at the boundary ms is NOT read even though its suffix sorts lower", async () => {
    const ctx = createMemoryContainer({});
    const T = 1800000000500;
    const A = id(T, "5"), B = id(T, "9");                                // exist when the reader loads + marks
    putDirect(ctx, S1, A); putDirect(ctx, S1, B);
    await markTeacher(ctx, S1, B, [A, B]);                               // the viewed snapshot held A and B
    const C = id(T, "1");                                                // later, same ms, sorts BELOW A and B
    putDirect(ctx, S1, C);
    const m = await loadMarker(ctx.container, teacherDirectStateName("builder-1", S1));
    expect(m.legacy.boundaryMs).toBe(T);
    expect(m.legacy.seenIdsAtBoundary).toEqual([A, B]);
    expect(isReadBy(m, C)).toBe(false);
    expect(await teacherCount(ctx, S1)).toEqual({ unread: 1, capped: false });
    // a naive "last read id" would have hidden C:
    expect(C < B).toBe(true);
  });

  it("the boundary never moves backwards; an equal boundary unions its ids", () => {
    const t = 1800000000000;
    const cur = { boundaryMs: t + 5, seenIdsAtBoundary: [id(t + 5, "a")] };
    expect(advanceBoundary(cur, { boundaryMs: t + 1, seenIdsAtBoundary: [id(t + 1, "b")] })).toEqual({ changed: false, marker: cur });
    expect(advanceBoundary(cur, { boundaryMs: t + 5, seenIdsAtBoundary: [id(t + 5, "a")] }).changed).toBe(false);
    expect(advanceBoundary(cur, { boundaryMs: t + 5, seenIdsAtBoundary: [id(t + 5, "c")] }).marker.seenIdsAtBoundary).toEqual([id(t + 5, "a"), id(t + 5, "c")]);
    expect(advanceBoundary(cur, { boundaryMs: t + 9, seenIdsAtBoundary: [id(t + 9, "d")] }).marker).toEqual({ boundaryMs: t + 9, seenIdsAtBoundary: [id(t + 9, "d")] });
    expect(messageIdMs("nope")).toBeNaN();
  });

  it("an older mark after a newer one cannot regress the stored marker", async () => {
    const ctx = createMemoryContainer({});
    const X = id(1800000000001, "a"), Z = id(1800000000003, "b");
    putDirect(ctx, S1, X); putDirect(ctx, S1, Z);
    await markTeacher(ctx, S1, Z);
    const r = await markTeacher(ctx, S1, X);
    expect(r.marker.legacy.boundaryMs).toBe(1800000000003);
    expect((await loadMarker(ctx.container, teacherDirectStateName("builder-1", S1))).legacy.boundaryMs).toBe(1800000000003);
  });

  it("CAS: a concurrent NEWER marker written between read and write wins; the retry re-evaluates the freshest state", async () => {
    const X = id(1800000000001, "a"), Z = id(1800000000003, "b");
    const name = teacherDirectStateName("builder-1", S1);
    let fired = false;
    const ctx = createMemoryContainer({}, {
      beforeConditionalUpload(n, api) {
        if (fired || n !== name) return;
        fired = true;
        api.setJson(name, { schemaVersion: 1, boundaryMs: 1800000000003, seenIdsAtBoundary: [Z] });   // concurrent newer mark
      }
    });
    putDirect(ctx, S1, X); putDirect(ctx, S1, Z);
    ctx.setJson(name, { schemaVersion: 1, boundaryMs: 1700000000000, seenIdsAtBoundary: [] });         // existing older marker → CAS path
    await markTeacher(ctx, S1, X);
    expect(fired).toBe(true);
    expect((await loadMarker(ctx.container, name)).legacy.boundaryMs).toBe(1800000000003);
  });
});

describe("mark validation", () => {
  it("a forged future id, another student's id, or a malformed doc → MarkReadError and ZERO marker change", async () => {
    const ctx = createMemoryContainer({});
    const own = id(1800000000001, "a"), other = id(1800000000002, "b");
    putDirect(ctx, S1, own); putDirect(ctx, S2, other);
    const bad = id(1800000000003, "c");
    ctx.setJson(directPrefix(S1) + bad + ".json", { kind: "direct", messageId: bad, studentId: S2, senderRole: "student", body: "x" });   // wrong owner
    for (const through of ["9999999999999-ffffffffffffffff", other, bad, "../x", "", null]) {
      await expect(markTeacher(ctx, S1, through)).rejects.toBeInstanceOf(MarkReadError);
    }
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
  });

  it("marking never rewrites message blobs", async () => {
    const ctx = createMemoryContainer({});
    const a = id(1800000000001, "a"), b = id(1800000000002, "b");
    putDirect(ctx, S1, a); putDirect(ctx, S1, b);
    const before = Object.fromEntries(ctx.names(directPrefix(S1)).map(n => [n, ctx.store.get(n).content.toString("utf8") + "|" + ctx.store.get(n).etag]));
    await markTeacher(ctx, S1, a); await markTeacher(ctx, S1, b);
    const after = Object.fromEntries(ctx.names(directPrefix(S1)).map(n => [n, ctx.store.get(n).content.toString("utf8") + "|" + ctx.store.get(n).etag]));
    expect(after).toEqual(before);
    expect(ctx.names(READ_STATE_PREFIX).length).toBe(1);
  });
});

describe("role filter + cap", () => {
  it("teacher counts student replies only; student counts teacher messages only; announcements all count", async () => {
    const ctx = createMemoryContainer({});
    putDirect(ctx, S1, id(1800000000001, "a"), "teacher");
    putDirect(ctx, S1, id(1800000000002, "b"), "student");
    putDirect(ctx, S1, id(1800000000003, "c"), "teacher");
    putAnn(ctx, C1, id(1800000000004, "d")); putAnn(ctx, C1, id(1800000000005, "e"));
    expect(await teacherCount(ctx, S1)).toEqual({ unread: 1, capped: false });
    expect(await countUnread(ctx.container, { ...teacherStream(S1), marker: null, include: d => d.senderRole === "teacher" })).toEqual({ unread: 2, capped: false });
    expect(await countUnread(ctx.container, { streamPrefix: announcementPrefix(C1), expected: { kind: "announcement", classId: C1 }, marker: null, include: () => true })).toEqual({ unread: 2, capped: false });
  });

  it("99 → exact; more → 99+ (capped) while downloading only a bounded number of candidates", async () => {
    const ctx = createMemoryContainer({});
    for (let i = 0; i < 99; i++) putDirect(ctx, S1, id(1800000000000 + i, "a"));
    expect(await teacherCount(ctx, S1)).toEqual({ unread: 99, capped: false });
    for (let i = 0; i < 400; i++) putDirect(ctx, S2, id(1800000000000 + i, "b"));
    let downloaded = 0;
    const r = await countUnread(ctx.container, { ...teacherStream(S2), marker: null, include: d => d.senderRole === "student" }, {
      downloadManyJson: async (_c, names) => { downloaded += names.length; return names.map(n => ctx.getJson(n)); }
    });
    expect(r).toEqual({ unread: UNREAD_DISPLAY_CAP, capped: true });
    expect(downloaded).toBeLessThan(150);
    // read messages are never downloaded (a marker covering all 400 — written directly: acknowledging 400 unread legacy
    // ids at once is refused by the legacy frontier, since no page can show them all)
    ctx.setJson(teacherDirectStateName("builder-1", S2), { schemaVersion: 2, legacy: { boundaryMs: 1800000000000 + 399, seenIdsAtBoundary: [id(1800000000000 + 399, "b")] }, sequenced: null });
    downloaded = 0;
    const r2 = await countUnread(ctx.container, { ...teacherStream(S2), marker: await loadMarker(ctx.container, teacherDirectStateName("builder-1", S2)), include: () => true }, {
      downloadManyJson: async (_c, names) => { downloaded += names.length; return names.map(n => ctx.getJson(n)); }
    });
    expect(r2).toEqual({ unread: 0, capped: false });
    expect(downloaded).toBe(0);
  });
});

describe("teacher summary authority", () => {
  it("class filter uses CURRENT student documents (not classroom.studentIds); deleted students never count; archived/disabled do", async () => {
    const S3 = "33333333-3333-3333-3333-333333333333", S4 = "44444444-4444-4444-4444-444444444444";
    const ctx = createMemoryContainer({
      ["platform/users/" + S1 + ".json"]: { role: "student", userId: S1, classId: C1, active: true, archived: false },
      ["platform/users/" + S2 + ".json"]: { role: "student", userId: S2, classId: "other-class", active: true, archived: false },
      ["platform/users/" + S3 + ".json"]: { role: "student", userId: S3, classId: C1, active: false, archived: true },
      ["platform/classes/" + C1 + ".json"]: { classId: C1, studentIds: [S2] }        // stale index — must be ignored
    });
    putDirect(ctx, S1, id(1800000000001, "a")); putDirect(ctx, S1, id(1800000000002, "b"));
    putDirect(ctx, S2, id(1800000000003, "c"));
    putDirect(ctx, S3, id(1800000000004, "d"));
    putDirect(ctx, S4, id(1800000000005, "e"));                          // no user document (deleted)
    const cls = await teacherDirectUnread(ctx.container, "builder-1", { classId: C1 });
    expect(cls).toEqual({ totalUnread: 3, capped: false, byStudent: { [S1]: { unread: 2, capped: false }, [S3]: { unread: 1, capped: false } } });
    expect(await teacherDirectUnread(ctx.container, "builder-1")).toEqual({ totalUnread: 4, capped: false });
    // another teacher's markers are separate
    await markTeacher(ctx, S1, id(1800000000002, "b"));
    expect((await teacherDirectUnread(ctx.container, "builder-1")).totalUnread).toBe(2);
    expect((await teacherDirectUnread(ctx.container, "builder-2")).totalUnread).toBe(4);
  });
});

describe("snapshot acknowledgement (review follow-up) — the viewed snapshot, never a fresh listing", () => {
  const T = 1800000000777;
  it("EXACT RESIDUAL: GET shows only A; C (same ms, sorts below A) is created BEFORE the mark POST → A read, C unread", async () => {
    const ctx = createMemoryContainer({});
    const A = String(T) + "-8888888888888888";
    putDirect(ctx, S1, A);
    const snapshotBoundary = [A];                                        // 2. what the GET returned/showed
    const C = String(T) + "-2222222222222222";
    putDirect(ctx, S1, C);                                               // 3. arrives after the snapshot, C < A
    expect(C < A).toBe(true);
    await markTeacher(ctx, S1, A, snapshotBoundary);                      // 4. mark with the snapshot
    const m = await loadMarker(ctx.container, teacherDirectStateName("builder-1", S1));
    expect(isReadBy(m, A)).toBe(true);                                   // 5. A read
    expect(isReadBy(m, C)).toBe(false);                                  //    C unread
    expect(await teacherCount(ctx, S1)).toEqual({ unread: 1, capped: false });
  });

  it("MULTIPLE same-ms ids: snapshot [A=T-1111, B=T-8888], later C=T-2222 → A and B read, C unread (suffix order irrelevant)", async () => {
    const ctx = createMemoryContainer({});
    const A = String(T) + "-1111111111111111", B = String(T) + "-8888888888888888", C = String(T) + "-2222222222222222";
    putDirect(ctx, S1, A); putDirect(ctx, S1, B);
    putDirect(ctx, S1, C);                                               // after the snapshot, between A and B by suffix
    await markTeacher(ctx, S1, B, [B, A, A]);                            // order + duplicates don't matter
    const m = await loadMarker(ctx.container, teacherDirectStateName("builder-1", S1));
    expect(m.legacy.seenIdsAtBoundary).toEqual([A, B]);
    expect([isReadBy(m, A), isReadBy(m, B), isReadBy(m, C)]).toEqual([true, true, false]);
  });

  it("FORGED boundary lists are rejected with ZERO marker mutation", async () => {
    const ctx = createMemoryContainer({});
    const X = String(T) + "-8888888888888888";
    putDirect(ctx, S1, X);
    const otherStudents = String(T) + "-3333333333333333"; putDirect(ctx, S2, otherStudents);
    const ann = String(T) + "-4444444444444444"; putAnn(ctx, C1, ann);
    const teacherOwn = String(T) + "-5555555555555555"; putDirect(ctx, S1, teacherOwn, "teacher");
    const cases = [
      [X, [X, otherStudents]],                                           // another student's thread
      [X, [X, ann]],                                                     // announcement id for a direct stream
      [X, [X, String(T + 1) + "-1111111111111111"]],                     // different millisecond
      [X, [X, String(T) + "-9999999999999999"]],                         // nonexistent
      [X, [X, "not-an-id"]],                                             // malformed
      [X, [X, 42]],                                                      // not a string
      [X, []],                                                           // empty
      [X, [String(T) + "-1111111111111111"]],                           // through absent from the list
      [X, Array.from({ length: 201 }, () => X)],                         // oversized
      [X, [X, teacherOwn]],                                              // not unread-relevant for the teacher
      [teacherOwn, [teacherOwn]],                                        // through is the teacher's own message
      [X, "not-an-array"]
    ];
    for (const [through, seen] of cases) {
      await expect(markTeacher(ctx, S1, through, seen)).rejects.toBeInstanceOf(MarkReadError);
    }
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
  });

  it("the store also rejects an announcement acknowledgement that names a direct id", async () => {
    const ctx = createMemoryContainer({});
    const ann = String(T) + "-4444444444444444", dm = String(T) + "-6666666666666666";
    putAnn(ctx, C1, ann); putDirect(ctx, S1, dm, "teacher");
    const stateName = studentAnnouncementStateName(S1, C1);
    const mark = seen => markStreamRead(ctx.container, { stateName, streamPrefix: announcementPrefix(C1), expected: { kind: "announcement", classId: C1 }, include: () => true, throughMessageId: ann, seenIdsAtBoundary: seen });
    await expect(mark([ann, dm])).rejects.toBeInstanceOf(MarkReadError);
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([]);
    await mark([ann]);
    expect(ctx.names(READ_STATE_PREFIX)).toEqual([stateName]);
  });
});
