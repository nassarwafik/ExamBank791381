import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { handler as photo, studentPhotoPrefix } from "../src/functions/student-profile-photo.js";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { handler as students } from "../src/functions/manage-students.js";
import { createStudentToken, hashPassword, studentCodeHash } from "../src/lib/student-auth.js";
import { normalizeProfileImage, decodeImageDataUrl, sniffRasterKind, MAX_UPLOAD_BYTES } from "../src/lib/profile-image.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Teacher-managed student profile photo: builder-only writes (student 403, anonymous 401), the ONE safe image
// pipeline (JPEG/PNG/WebP by real bytes, decode, ≤ 512 square, WebP, metadata stripped, 3 MB bound), immutable
// revision blobs + metadata-only user document (avatarId untouched, blobKey internal), versioned replacement,
// HARDENED student retrieval (real signed tokens against the REAL persisted document: revoked / inactive / archived
// denied, own only), removal fallback, delete cleanup, the archived-student lifecycle policy, and no N+1.

process.env.STUDENT_SESSION_SECRET = process.env.STUDENT_SESSION_SECRET || "test-student-secret";
const NOW = "2026-09-20T10:00:00.000Z";
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "S" + id, avatarId: "a3", createdAt: NOW, updatedAt: NOW, ...extra });
// `hooks` is the memory container's concurrency seam: a test can inject a concurrent writer right before a CAS write so
// the REAL mutateJsonWithRetry sees a changed ETag (one injection → one retry; a persistent injection → real exhaustion).
const school = () => { const hooks = {}; return { ...createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, status: "active", studentIds: ["s1", "s2"], programCodes: [] }, "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1") }, hooks), hooks }; };
/** Make every CAS write of `name` conflict for real (exhausts the retry loop → StorageConflictError from platform-storage). */
const exhaustCasOn = (ctx, name) => { ctx.hooks.beforeConditionalUpload = (n, api) => { if (n === name) api.setJson(n, { ...api.getJson(n), concurrentPokes: (api.getJson(n).concurrentPokes || 0) + 1 }); }; };
const stopExhausting = ctx => { delete ctx.hooks.beforeConditionalUpload; };
const audits = [];
const BUILDER = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const NO_BUILDER = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const teacher = ctx => ({ ...BUILDER, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, e) => { audits.push(e); } });
// A REAL signed student token (sv = the session version it was issued with); the route's hardened session helper then
// loads the CURRENT persisted document from the memory container — nothing about the document authority is mocked.
const tokenFor = (id, sv = 1) => createStudentToken({ userId: id, authVersion: sv, code: "S" + id, displayName: "x", classId: "c1" });
const student = (ctx, id, sv = 1) => ({ ...NO_BUILDER, container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, __token: tokenFor(id, sv) });
const anon = ctx => ({ ...NO_BUILDER, container: ctx.container, getContainer: () => ctx.container });
const headersOf = deps => ({ get: h => (h === "x-student-token" && deps.__token ? deps.__token : null) });
const post = (deps, body) => photo({ method: "POST", url: "https://x/api/student-profile-photo", headers: headersOf(deps), json: async () => body }, deps);
const get = (deps, q = "") => photo({ method: "GET", url: "https://x/api/student-profile-photo" + q, headers: headersOf(deps) }, deps);
const dataUrl = (buf, mime) => "data:" + mime + ";base64," + buf.toString("base64");
const png = (w = 900, h = 400, bg = "#3355ff") => sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();
const jpegWithExif = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#ff0000" } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: "secret-owner", Artist: "device-x" } } }).toBuffer();
const webp = () => sharp({ create: { width: 64, height: 64, channels: 3, background: "#00ff00" } }).webp().toBuffer();
const doc = (ctx, id) => ctx.getJson("platform/users/" + id + ".json");
const revisions = (ctx, id) => ctx.names(studentPhotoPrefix(id));
const activeBlob = (ctx, id) => { const d = doc(ctx, id); return d.profilePhoto ? ctx.getBinary(d.profilePhoto.blobKey) : null; };

describe("112/59/60/119. the ONE safe image pipeline", () => {
  it("accepts real JPEG / PNG / WebP by bytes → ≤ 512 square WebP with EXIF stripped; rejects SVG / GIF / PDF / HTML / text / fake / oversize", async () => {
    const out = await normalizeProfileImage(await png(2000, 1000));
    expect(out.contentType).toBe("image/webp"); expect(out.width).toBe(512); expect(out.height).toBeLessThanOrEqual(512);
    expect((await sharp(out.buffer).metadata()).format).toBe("webp");
    const jpg = await jpegWithExif();
    expect((await sharp(jpg).metadata()).exif).toBeTruthy();                       // the input really carries EXIF
    const outJpg = await normalizeProfileImage(jpg);
    const meta = await sharp(outJpg.buffer).metadata();
    expect(meta.exif).toBeUndefined(); expect(meta.icc).toBeUndefined(); expect(meta.xmp).toBeUndefined();
    expect(outJpg.buffer.toString("latin1")).not.toContain("secret-owner");
    expect((await normalizeProfileImage(await webp())).width).toBeLessThanOrEqual(512);   // small inputs are never enlarged
    for (const [name, bad] of [
      ["svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
      ["gif", Buffer.from("GIF89a" + "\u0000".repeat(40), "latin1")],
      ["pdf", Buffer.from("%PDF-1.4\n%âãÏÓ\n", "latin1")],
      ["html", Buffer.from("<!doctype html><html><body>x</body></html>")],
      ["text", Buffer.from("hello world, not an image at all")],
      ["binary", Buffer.alloc(300, 0x41)]
    ]) await expect(normalizeProfileImage(bad), name).rejects.toMatchObject({ code: "UNSUPPORTED", httpStatus: 400 });
    // a PNG signature followed by garbage is NOT a decodable raster
    await expect(normalizeProfileImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 7)]))).rejects.toMatchObject({ code: "UNDECODABLE" });
    await expect(normalizeProfileImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_UPLOAD_BYTES, 1)]))).rejects.toMatchObject({ code: "TOO_LARGE", httpStatus: 413 });
    expect(sniffRasterKind(Buffer.from("RIFF....WEBPVP8 "))).toBe("webp");
    expect(() => decodeImageDataUrl("https://evil.example/x.png")).toThrow();          // never a URL
    expect(() => decodeImageDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toThrow();
    expect(() => decodeImageDataUrl("data:image/png;base64," + "A".repeat(Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 100))).toThrow("حجم الصورة كبير جدًا");
  });
});

describe("111/118/61/63/64. authority, storage, versioning, removal", () => {
  it("builder upload succeeds (immutable revision in the dedicated namespace, metadata-only user doc with an internal blobKey, avatarId untouched, audit); student and anonymous are denied", async () => {
    const ctx = school(); audits.length = 0;
    const image = dataUrl(await png(), "image/png");
    const denied = await post(student(ctx, "s1"), { action: "upload", studentId: "s1", dataUrl: image });
    expect(denied.status).toBe(403); expect(denied.jsonBody.error).toBe("الصورة الشخصية للطالب يحددها المعلم فقط.");
    expect((await post(anon(ctx), { action: "upload", studentId: "s1", dataUrl: image })).status).toBe(401);
    expect(revisions(ctx, "s1")).toEqual([]);
    const r = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: image });
    expect(r.status).toBe(200); expect(r.jsonBody.profilePhoto).toEqual({ version: 1, updatedAt: expect.any(String) });   // public shape only
    const d = doc(ctx, "s1");
    expect(d.profilePhoto).toMatchObject({ version: 1, blobKey: expect.stringMatching(/^platform\/student-profile-images\/s1\/[a-z0-9]+-[0-9a-f]{24}\.webp$/) });
    expect(d.avatarId).toBe("a3");
    expect(revisions(ctx, "s1")).toEqual([d.profilePhoto.blobKey]);
    const stored = activeBlob(ctx, "s1");
    expect(stored.contentType).toBe("image/webp"); expect((await sharp(stored.buffer).metadata()).format).toBe("webp");
    expect(JSON.stringify(d)).not.toContain("base64");
    expect(audits.map(a => a.action)).toEqual(["student.photo.upload"]);
    expect(audits[0].details).toMatchObject({ version: 1, source: "png" });
    // replacement: a NEW revision, version 2, the old revision cleaned up; an invalid file leaves the current photo intact
    const r2 = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await jpegWithExif(), "image/jpeg") });
    expect(r2.jsonBody.profilePhoto.version).toBe(2);
    const d2 = doc(ctx, "s1");
    expect(d2.profilePhoto.blobKey).not.toBe(d.profilePhoto.blobKey);
    expect(revisions(ctx, "s1")).toEqual([d2.profilePhoto.blobKey]);
    const bad = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(Buffer.from("<svg/>"), "image/png") });
    expect(bad.status).toBe(400); expect(bad.jsonBody.error).toContain("نوع الملف غير مدعوم");
    expect(doc(ctx, "s1").profilePhoto).toEqual(d2.profilePhoto); expect(revisions(ctx, "s1")).toEqual([d2.profilePhoto.blobKey]);
    expect((await post(teacher(ctx), { action: "upload", studentId: "ghost", dataUrl: image })).status).toBe(404);
  });
  it("retrieval: teacher any student; student OWN only (naming another id → 403); anonymous 401; no photo → 404; the committed record selects the blob, never `?v=`", async () => {
    const ctx = school();
    expect((await get(student(ctx, "s1"))).status).toBe(404);
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    const own = await get(student(ctx, "s1"), "?v=1");
    expect(own.status).toBe(200); expect(own.headers["content-type"]).toBe("image/webp"); expect(own.headers["cache-control"]).toContain("private"); expect(own.headers.etag).toBe('"v1"');
    expect(Buffer.compare(own.body, activeBlob(ctx, "s1").buffer)).toBe(0);
    const stale = await get(student(ctx, "s1"), "?v=999");                                  // cache context only — same committed blob
    expect(stale.status).toBe(200); expect(stale.headers["x-photo-version"]).toBe("1"); expect(Buffer.compare(stale.body, own.body)).toBe(0);
    expect((await get(student(ctx, "s2"), "?studentId=s1")).status).toBe(403);           // student A cannot fetch B
    expect((await get(student(ctx, "s2"))).status).toBe(404);                              // s2 has none
    expect((await get(teacher(ctx), "?studentId=s1")).status).toBe(200);
    expect((await get(anon(ctx), "?studentId=s1")).status).toBe(401);
  });
  it("remove is teacher-only, clears the metadata first and then the revision, keeps avatarId (the fallback); dashboard and roster expose public metadata only", async () => {
    const ctx = school(); audits.length = 0;
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    const dashDeps = { requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1" }, student: doc(ctx, "s1") }), downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, p) => ctx.names(p).map(n => ctx.getJson(n)), uploadJson: async (_c, n, v) => ctx.setJson(n, v) };
    let d = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, dashDeps);
    expect(d.jsonBody.student.profilePhoto).toEqual({ version: 1, updatedAt: expect.any(String) }); expect(d.jsonBody.student.avatarId).toBe("a3");
    const roster = await students({ method: "GET", url: "https://x/api/students?classId=c1", headers: { get: () => null } }, teacher(ctx));
    const row = roster.jsonBody.students.find(s => s.userId === "s1");
    expect(row.profilePhoto).toEqual({ version: 1, updatedAt: expect.any(String) }); expect(row.avatarId).toBe("a3");
    for (const payload of [roster.jsonBody, d.jsonBody]) { const text = JSON.stringify(payload); expect(text).not.toContain("base64"); expect(text).not.toContain("blobKey"); expect(text).not.toContain("student-profile-images"); }
    expect((await post(student(ctx, "s1"), { action: "remove", studentId: "s1" })).status).toBe(403);
    const r = await post(teacher(ctx), { action: "remove", studentId: "s1" });
    expect(r.status).toBe(200); expect(r.jsonBody.profilePhoto).toBeNull();
    expect(revisions(ctx, "s1")).toEqual([]);
    const after = doc(ctx, "s1");
    expect(after.profilePhoto).toBeNull(); expect(after.avatarId).toBe("a3");
    expect(audits.map(a => a.action)).toEqual(["student.photo.upload", "student.photo.remove"]);
    d = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, dashDeps);
    expect(d.jsonBody.student.profilePhoto).toBeNull();
    expect((await get(student(ctx, "s1"))).status).toBe(404);
  });
  it("permanent delete purges the current revision AND older orphans under the student's photo prefix (secondary; core delete unaffected)", async () => {
    const ctx = school();
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    ctx.store.set(studentPhotoPrefix("s1") + "orphan-old.webp", { content: Buffer.from("old"), etag: "e-orphan", contentType: "image/webp" });   // a leftover from a failed cleanup
    expect(revisions(ctx, "s1")).toHaveLength(2);
    const r = await students({ method: "POST", url: "https://x/api/students", headers: { get: () => null }, json: async () => ({ action: "delete", userId: "s1" }) }, teacher(ctx));
    expect(r.status).toBe(200);
    expect(ctx.has("platform/users/s1.json")).toBe(false);
    expect(revisions(ctx, "s1")).toEqual([]);
    expect(ctx.has("platform/users/s2.json")).toBe(true);
  });
});

describe("review fix — hardened student photo authority (real tokens against the REAL persisted document)", () => {
  it("A. a valid token whose sv matches the persisted authVersion serves the OWN photo", async () => {
    const ctx = school();
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    const r = await get(student(ctx, "s1", 1));
    expect(r.status).toBe(200); expect(Buffer.compare(r.body, activeBlob(ctx, "s1").buffer)).toBe(0);
  });
  it("B. the persisted authVersion changes after the token was issued (password reset) → the same old token is denied (401)", async () => {
    const ctx = school();
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    const old = student(ctx, "s1", 1);
    expect((await get(old)).status).toBe(200);
    ctx.setJson("platform/users/s1.json", { ...doc(ctx, "s1"), authVersion: 2 });     // reset happened after issuance
    expect((await get(old)).status).toBe(401);
    expect((await get(student(ctx, "s1", 2))).status).toBe(200);                      // a freshly issued session works
    expect((await post(old, { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") })).status).toBe(401);   // no useful write access either
  });
  it("C. persisted active=false → denied; D. persisted archived=true → denied (GET and every POST)", async () => {
    const ctx = school();
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    const s = student(ctx, "s1", 1);
    ctx.setJson("platform/users/s1.json", { ...doc(ctx, "s1"), active: false });
    expect((await get(s)).status).toBe(401);
    expect((await post(s, { action: "remove", studentId: "s1" })).status).toBe(401);
    ctx.setJson("platform/users/s1.json", { ...doc(ctx, "s1"), active: true, archived: true });
    expect((await get(s)).status).toBe(401);
    expect((await post(s, { action: "upload", studentId: "s1", dataUrl: "x" })).status).toBe(401);
    expect(doc(ctx, "s1").profilePhoto.version).toBe(1);                              // nothing changed
    ctx.setJson("platform/users/s1.json", { ...doc(ctx, "s1"), archived: false });
    expect((await get(s)).status).toBe(200);
    // an ACTIVE session attempting a write still gets the explicit product refusal (403), never a write
    expect((await post(s, { action: "remove", studentId: "s1" })).jsonBody.error).toBe("الصورة الشخصية للطالب يحددها المعلم فقط.");
  });
  it("E. student A naming student B is denied (403) even with a fully valid session; a deleted document is 401", async () => {
    const ctx = school();
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    expect((await get(student(ctx, "s2", 1), "?studentId=s1")).status).toBe(403);
    ctx.store.delete("platform/users/s2.json");
    expect((await get(student(ctx, "s2", 1), "?studentId=s1")).status).toBe(401);
    expect((await get(student(ctx, "s2", 1))).status).toBe(401);
  });
});

describe("review fix — publication consistency at the student route", () => {
  it("REAL metadata CAS exhaustion after the bytes were stored → 503, the previous photo (metadata AND bytes) stays published, the orphan is cleaned; then the retry succeeds", async () => {
    const ctx = school();
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(900, 400, "#111111"), "image/png") });
    const before = doc(ctx, "s1").profilePhoto; const beforeBytes = Buffer.from(activeBlob(ctx, "s1").buffer);
    exhaustCasOn(ctx, "platform/users/s1.json");                                            // a concurrent writer wins EVERY attempt
    const r = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(900, 400, "#eeeeee"), "image/png") });
    expect(r.status).toBe(503); expect(r.jsonBody.error).toBe("حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.");
    expect(doc(ctx, "s1").profilePhoto).toEqual(before);
    expect(revisions(ctx, "s1")).toEqual([before.blobKey]);
    expect(Buffer.compare(activeBlob(ctx, "s1").buffer, beforeBytes)).toBe(0);
    const served = await get(teacher(ctx), "?studentId=s1"); expect(Buffer.compare(served.body, beforeBytes)).toBe(0);
    // remove under the same failure: metadata is NOT cleared and the blob is NOT deleted
    const rr = await post(teacher(ctx), { action: "remove", studentId: "s1" });
    expect(rr.status).toBe(503); expect(doc(ctx, "s1").profilePhoto).toEqual(before); expect(revisions(ctx, "s1")).toEqual([before.blobKey]);
    stopExhausting(ctx);
    const ok = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(900, 400, "#eeeeee"), "image/png") });
    expect(ok.status).toBe(200); expect(ok.jsonBody.profilePhoto.version).toBe(2); expect(revisions(ctx, "s1")).toEqual([doc(ctx, "s1").profilePhoto.blobKey]);
  });
  it("lifecycle policy: an ARCHIVED student's identity stays editable by the teacher (existing «تعديل» policy) — photo upload / remove follow the same policy; only account activation is blocked", async () => {
    const ctx = school();
    const { salt, passwordHash } = hashPassword("secret-123");
    ctx.setJson("platform/users/s1.json", { ...doc(ctx, "s1"), code: "123456789", identityNumber: "123456789", active: false, archived: true, archivedAt: NOW });
    ctx.setJson("platform/auth/" + studentCodeHash("123456789") + ".json", { schemaVersion: 3, userId: "s1", codeHash: studentCodeHash("123456789"), salt, passwordHash, active: false, authVersion: 1 });
    const req = body => students({ method: "POST", url: "https://x/api/students", headers: { get: () => null }, json: async () => body }, teacher(ctx));
    expect((await req({ action: "toggleactive", userId: "s1", active: true })).status).toBe(409);                       // the ONE archived restriction
    const edit = await req({ action: "update", userId: "s1", firstName: "سامي", familyName: "خالد", identityNumber: "123456789", classId: "c1" });
    expect(edit.status).toBe(200); expect(doc(ctx, "s1").archived).toBe(true);                                          // identity editing allowed while archived
    const up = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    expect(up.status).toBe(200); expect(doc(ctx, "s1")).toMatchObject({ archived: true, active: false, profilePhoto: { version: 1 } });
    expect((await post(teacher(ctx), { action: "remove", studentId: "s1" })).status).toBe(200);
    expect(doc(ctx, "s1")).toMatchObject({ archived: true, active: false, profilePhoto: null, avatarId: "a3" });
  });
});
