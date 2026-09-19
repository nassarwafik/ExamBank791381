import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { handler as photo, studentPhotoBlobName } from "../src/functions/student-profile-photo.js";
import { handler as dashboard } from "../src/functions/student-dashboard.js";
import { handler as students } from "../src/functions/manage-students.js";
import { normalizeProfileImage, decodeImageDataUrl, sniffRasterKind, MAX_UPLOAD_BYTES } from "../src/lib/profile-image.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Teacher-managed student profile photo: builder-only writes (student 403, anonymous 401), the ONE safe image
// pipeline (JPEG/PNG/WebP by real bytes, decode, ≤ 512 square, WebP, metadata stripped, 3 MB bound), dedicated blob
// namespace + metadata-only user document (avatarId untouched), versioned replacement, authenticated retrieval
// (teacher any student, student own only), removal fallback, delete cleanup, and no N+1 in the roster.

const NOW = "2026-09-20T10:00:00.000Z";
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "S" + id, avatarId: "a3", createdAt: NOW, updatedAt: NOW, ...extra });
const school = () => createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, status: "active", studentIds: ["s1", "s2"], programCodes: [] }, "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1") });
const audits = [];
const BUILDER = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const NO_BUILDER = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }) };
const teacher = ctx => ({ ...BUILDER, requireStudentAuth: () => ({ ok: false }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, e) => { audits.push(e); } });
const student = (ctx, id) => ({ ...NO_BUILDER, requireStudentAuth: () => ({ ok: true, user: { sub: id, role: "student" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const anon = ctx => ({ ...NO_BUILDER, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }), container: ctx.container, getContainer: () => ctx.container });
const post = (deps, body) => photo({ method: "POST", url: "https://x/api/student-profile-photo", headers: { get: () => null }, json: async () => body }, deps);
const get = (deps, q = "") => photo({ method: "GET", url: "https://x/api/student-profile-photo" + q, headers: { get: () => null } }, deps);
const dataUrl = (buf, mime) => "data:" + mime + ";base64," + buf.toString("base64");
const png = (w = 900, h = 400) => sharp({ create: { width: w, height: h, channels: 3, background: "#3355ff" } }).png().toBuffer();
const jpegWithExif = () => sharp({ create: { width: 300, height: 300, channels: 3, background: "#ff0000" } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: "secret-owner", Artist: "device-x" } } }).toBuffer();
const webp = () => sharp({ create: { width: 64, height: 64, channels: 3, background: "#00ff00" } }).webp().toBuffer();

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
  it("builder upload succeeds (blob in the dedicated namespace, metadata-only user doc, avatarId untouched, audit); student and anonymous are denied", async () => {
    const ctx = school(); audits.length = 0;
    const image = dataUrl(await png(), "image/png");
    const denied = await post(student(ctx, "s1"), { action: "upload", studentId: "s1", dataUrl: image });
    expect(denied.status).toBe(403);
    expect((await post(anon(ctx), { action: "upload", studentId: "s1", dataUrl: image })).status).toBe(401);
    expect(ctx.has(studentPhotoBlobName("s1"))).toBe(false);
    const r = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: image });
    expect(r.status).toBe(200); expect(r.jsonBody.profilePhoto).toMatchObject({ version: 1 });
    const stored = ctx.getBinary(studentPhotoBlobName("s1"));
    expect(stored.contentType).toBe("image/webp"); expect((await sharp(stored.buffer).metadata()).format).toBe("webp");
    const doc = ctx.getJson("platform/users/s1.json");
    expect(doc.profilePhoto).toMatchObject({ version: 1 }); expect(doc.avatarId).toBe("a3");
    expect(JSON.stringify(doc)).not.toContain("base64");
    expect(audits.map(a => a.action)).toEqual(["student.photo.upload"]);
    expect(audits[0].details).toMatchObject({ version: 1, source: "png" });
    // replacement increments the version (cache-busting); an invalid file leaves the current photo intact
    const r2 = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await jpegWithExif(), "image/jpeg") });
    expect(r2.jsonBody.profilePhoto.version).toBe(2);
    const bad = await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(Buffer.from("<svg/>"), "image/png") });
    expect(bad.status).toBe(400); expect(bad.jsonBody.error).toContain("نوع الملف غير مدعوم");
    expect(ctx.getJson("platform/users/s1.json").profilePhoto.version).toBe(2);
    expect((await post(teacher(ctx), { action: "upload", studentId: "ghost", dataUrl: image })).status).toBe(404);
  });
  it("retrieval: teacher any student; student OWN only (naming another id → 403); anonymous 401; no photo → 404", async () => {
    const ctx = school();
    expect((await get(student(ctx, "s1"))).status).toBe(404);
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    const own = await get(student(ctx, "s1"), "?v=1");
    expect(own.status).toBe(200); expect(own.headers["content-type"]).toBe("image/webp"); expect(own.headers["cache-control"]).toContain("private"); expect(Buffer.isBuffer(own.body)).toBe(true);
    expect((await get(student(ctx, "s2"), "?studentId=s1")).status).toBe(403);           // student A cannot fetch B
    expect((await get(student(ctx, "s2"))).status).toBe(404);                              // s2 has none
    expect((await get(teacher(ctx), "?studentId=s1")).status).toBe(200);
    expect((await get(anon(ctx), "?studentId=s1")).status).toBe(401);
  });
  it("remove is teacher-only, clears the metadata and the blob and keeps avatarId (the fallback); dashboard and roster expose metadata only", async () => {
    const ctx = school(); audits.length = 0;
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    const dashDeps = { requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1" }, student: ctx.getJson("platform/users/s1.json") }), downloadJsonOrNull: async (_c, n) => ctx.getJson(n), listJson: async (_c, p) => ctx.names(p).map(n => ctx.getJson(n)), uploadJson: async (_c, n, v) => ctx.setJson(n, v) };
    let d = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, dashDeps);
    expect(d.jsonBody.student.profilePhoto).toMatchObject({ version: 1 }); expect(d.jsonBody.student.avatarId).toBe("a3");
    const roster = await students({ method: "GET", url: "https://x/api/students?classId=c1", headers: { get: () => null } }, teacher(ctx));
    const row = roster.jsonBody.students.find(s => s.userId === "s1");
    expect(row.profilePhoto).toMatchObject({ version: 1 }); expect(row.avatarId).toBe("a3");
    expect(JSON.stringify(roster.jsonBody)).not.toContain("base64");
    expect((await post(student(ctx, "s1"), { action: "remove", studentId: "s1" })).status).toBe(403);
    const r = await post(teacher(ctx), { action: "remove", studentId: "s1" });
    expect(r.status).toBe(200); expect(r.jsonBody.profilePhoto).toBeNull();
    expect(ctx.has(studentPhotoBlobName("s1"))).toBe(false);
    const doc = ctx.getJson("platform/users/s1.json");
    expect(doc.profilePhoto).toBeNull(); expect(doc.avatarId).toBe("a3");
    expect(audits.map(a => a.action)).toEqual(["student.photo.upload", "student.photo.remove"]);
    d = await dashboard({ method: "GET", url: "https://x/api/student-dashboard", headers: { get: () => null } }, dashDeps);
    expect(d.jsonBody.student.profilePhoto).toBeNull();
    expect((await get(student(ctx, "s1"))).status).toBe(404);
  });
  it("permanent delete cleans the photo blob (secondary; core delete unaffected)", async () => {
    const ctx = school();
    await post(teacher(ctx), { action: "upload", studentId: "s1", dataUrl: dataUrl(await png(), "image/png") });
    expect(ctx.has(studentPhotoBlobName("s1"))).toBe(true);
    const r = await students({ method: "POST", url: "https://x/api/students", headers: { get: () => null }, json: async () => ({ action: "delete", userId: "s1" }) }, teacher(ctx));
    expect(r.status).toBe(200);
    expect(ctx.has("platform/users/s1.json")).toBe(false);
    expect(ctx.has(studentPhotoBlobName("s1"))).toBe(false);
  });
});
