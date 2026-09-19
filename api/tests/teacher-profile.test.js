import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { handler as teacherProfile } from "../src/functions/teacher-profile.js";
import { handler as session } from "../src/functions/platform-session.js";
import { profileDocName, teacherPhotoPrefix, publicTeacherProfile, normalizeDisplayName, resolveTeacherDisplayName } from "../src/lib/teacher-profile.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Teacher identity: the audited model has ONE builder identity (token sub = configured user code) and no editable
// profile — this API adds the minimal self-profile (platform/teacher-profiles/<sub>.json). Builder self only: the
// subject is the token's, a body teacherId is ignored; student 403; anonymous 401. Preset avatars validated; the
// own photo uses the SAME safe pipeline; replace increments the version; remove → preset fallback; display name is
// optional with the "المعلم" fallback and flows into platform-session.

const audits = [];
const BUILDER = sub => ({ requireBuilderAuth: () => ({ ok: true, user: { sub } }) });
const NO_BUILDER = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const teacher = (ctx, sub = "builder-1") => ({ ...BUILDER(sub), requireStudentAuth: () => ({ ok: false }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, e) => { audits.push(e); } });
const student = ctx => ({ ...NO_BUILDER, requireStudentAuth: () => ({ ok: true, user: { sub: "s1", role: "student" } }), container: ctx.container, getContainer: () => ctx.container });
const anon = ctx => ({ ...NO_BUILDER, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }), container: ctx.container, getContainer: () => ctx.container });
const post = (deps, body) => teacherProfile({ method: "POST", url: "https://x/api/teacher-profile", headers: { get: () => null }, json: async () => body }, deps);
const get = (deps, route = "teacher-profile", q = "") => teacherProfile({ method: "GET", url: "https://x/api/" + route + q, headers: { get: () => null } }, deps);
const dataUrl = (buf, mime) => "data:" + mime + ";base64," + buf.toString("base64");
const png = () => sharp({ create: { width: 640, height: 640, channels: 3, background: "#123456" } }).png().toBuffer();

describe("118/120/84. authority — builder self only", () => {
  it("student token is denied on every action and the photo route; anonymous is 401; a body teacherId never changes the target", async () => {
    const ctx = createMemoryContainer({});
    for (const body of [{ action: "setAvatar", avatarId: "a1" }, { action: "uploadPhoto", dataUrl: "x" }, { action: "removePhoto" }, { action: "setDisplayName", displayName: "x" }]) {
      expect((await post(student(ctx), body)).status, body.action).toBe(403);
      expect((await post(anon(ctx), body)).status, body.action).toBe(401);
    }
    expect((await get(student(ctx))).status).toBe(403);
    expect((await get(student(ctx), "teacher-profile-photo")).status).toBe(403);
    expect((await get(anon(ctx))).status).toBe(401);
    expect(ctx.names("platform/teacher-profiles/")).toEqual([]);
    const r = await post(teacher(ctx, "builder-1"), { action: "setAvatar", avatarId: "a4", teacherId: "someone-else", targetTeacherId: "victim" });
    expect(r.status).toBe(200); expect(r.jsonBody.profile.teacherId).toBe("builder-1");
    expect(ctx.names("platform/teacher-profiles/")).toEqual([profileDocName("builder-1")]);
  });
});

describe("116/117/81/74. preset avatar, own photo, fallback precedence", () => {
  it("GET without a document → fallback name, no avatar, no photo; a valid preset persists, an arbitrary id is rejected", async () => {
    const ctx = createMemoryContainer({}); audits.length = 0;
    expect((await get(teacher(ctx))).jsonBody.profile).toEqual({ teacherId: "builder-1", displayName: "المعلم", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" });
    expect((await post(teacher(ctx), { action: "setAvatar", avatarId: "https://evil/x.png" })).status).toBe(400);
    expect((await post(teacher(ctx), { action: "setAvatar", avatarId: "a99" })).status).toBe(400);
    const r = await post(teacher(ctx), { action: "setAvatar", avatarId: "a7" });
    expect(r.jsonBody.profile).toMatchObject({ avatarId: "a7", profilePhoto: null });
    expect(ctx.getJson(profileDocName("builder-1"))).toMatchObject({ teacherId: "builder-1", avatarId: "a7" });
    expect(audits.map(a => a.action)).toEqual(["teacher.profile.setAvatar"]);
  });
  it("upload → photo becomes primary (version 1, webp, metadata-only doc, avatar kept); replace → version 2; remove → preset fallback; own-photo GET", async () => {
    const ctx = createMemoryContainer({}); audits.length = 0;
    await post(teacher(ctx), { action: "setAvatar", avatarId: "a2" });
    expect((await get(teacher(ctx), "teacher-profile-photo")).status).toBe(404);
    const bad = await post(teacher(ctx), { action: "uploadPhoto", dataUrl: dataUrl(Buffer.from("<svg/>"), "image/svg+xml") });
    expect(bad.status).toBe(400);
    const r1 = await post(teacher(ctx), { action: "uploadPhoto", dataUrl: dataUrl(await png(), "image/png") });
    expect(r1.status).toBe(200); expect(r1.jsonBody.profile).toMatchObject({ avatarId: "a2", profilePhoto: { version: 1 } });
    const rec1 = ctx.getJson(profileDocName("builder-1")).profilePhoto;                       // internal: { version, updatedAt, blobKey }
    expect(rec1.blobKey.startsWith(teacherPhotoPrefix("builder-1"))).toBe(true); expect(ctx.names(teacherPhotoPrefix("builder-1"))).toEqual([rec1.blobKey]);
    expect(r1.jsonBody.profile.profilePhoto).toEqual({ version: 1, updatedAt: expect.any(String) });   // public: never the key
    const stored = ctx.getBinary(rec1.blobKey);
    expect(stored.contentType).toBe("image/webp"); const meta = await sharp(stored.buffer).metadata(); expect(meta.format).toBe("webp"); expect(meta.width).toBeLessThanOrEqual(512); expect(meta.exif).toBeUndefined();
    expect(JSON.stringify(ctx.getJson(profileDocName("builder-1")))).not.toContain("base64");
    const r2 = await post(teacher(ctx), { action: "uploadPhoto", dataUrl: dataUrl(await png(), "image/png") });
    expect(r2.jsonBody.profile.profilePhoto.version).toBe(2);
    const rec2 = ctx.getJson(profileDocName("builder-1")).profilePhoto;
    expect(rec2.blobKey).not.toBe(rec1.blobKey); expect(ctx.names(teacherPhotoPrefix("builder-1"))).toEqual([rec2.blobKey]);   // new revision, old one cleaned
    const photo = await get(teacher(ctx), "teacher-profile-photo", "?v=2");
    expect(photo.status).toBe(200); expect(photo.headers["content-type"]).toBe("image/webp"); expect(photo.headers["cache-control"]).toContain("private");
    expect(Buffer.compare(photo.body, ctx.getBinary(rec2.blobKey).buffer)).toBe(0);                 // exactly the referenced blob
    // another builder identity never sees this photo (its own document is separate)
    expect((await get(teacher(ctx, "other-builder"), "teacher-profile-photo")).status).toBe(404);
    const r3 = await post(teacher(ctx), { action: "removePhoto" });
    expect(r3.jsonBody.profile).toMatchObject({ avatarId: "a2", profilePhoto: null });
    expect(ctx.names(teacherPhotoPrefix("builder-1"))).toEqual([]);
    expect((await get(teacher(ctx), "teacher-profile-photo")).status).toBe(404);
    expect(audits.map(a => a.action)).toEqual(["teacher.profile.setAvatar", "teacher.profile.photo.upload", "teacher.profile.photo.upload", "teacher.profile.photo.remove"]);
  });
});

describe("70/79/115. display name authority", () => {
  it("setDisplayName validates (1–60, single line); the session reports the profile name, else the fallback", async () => {
    const ctx = createMemoryContainer({});
    expect(normalizeDisplayName("  أ.  سامر   ")).toBe("أ. سامر"); expect(normalizeDisplayName("")).toBeNull(); expect(normalizeDisplayName("x".repeat(61))).toBeNull(); expect(normalizeDisplayName("a\nb")).toBe("a b");
    const sessionDeps = { verifyBuilderToken: () => ({ sub: "builder-1", exp: Math.floor(Date.now() / 1000) + 600 }), container: ctx.container, getContainer: () => ctx.container, downloadJsonOrNull: async (_c, n) => ctx.getJson(n) };
    const before = await session({ method: "GET", url: "https://x/api/platform-session", headers: { get: h => (h === "x-builder-token" ? "tok" : null) } }, sessionDeps);
    expect(before.jsonBody).toMatchObject({ role: "teacher", displayName: "المعلم" });
    expect((await post(teacher(ctx), { action: "setDisplayName", displayName: " " })).status).toBe(400);
    expect((await post(teacher(ctx), { action: "setDisplayName", displayName: "x".repeat(61) })).status).toBe(400);
    const r = await post(teacher(ctx), { action: "setDisplayName", displayName: "أ. سامر" });
    expect(r.jsonBody.profile).toMatchObject({ displayName: "أ. سامر", hasCustomName: true });
    const after = await session({ method: "GET", url: "https://x/api/platform-session", headers: { get: h => (h === "x-builder-token" ? "tok" : null) } }, sessionDeps);
    expect(after.jsonBody).toMatchObject({ role: "teacher", displayName: "أ. سامر" });
    expect(await resolveTeacherDisplayName(() => { throw new Error("storage down"); }, "builder-1")).toBe("المعلم");   // failure → fallback, never 500
    expect(publicTeacherProfile("b", { displayName: "   " }).displayName).toBe("المعلم");
  });
});
