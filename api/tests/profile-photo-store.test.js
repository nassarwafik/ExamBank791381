import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { publishProfilePhoto, removeProfilePhoto, photoResponse, photoMeta, photoRecord, resolveBlobKey, purgeProfilePhotos, LEGACY_BLOB_FILE } from "../src/lib/profile-photo-store.js";
import { StorageConflictError, downloadJsonOrNull } from "../src/lib/platform-storage.js";
import { handler as teacherProfile } from "../src/functions/teacher-profile.js";
import { profileDocName, teacherPhotoPrefix } from "../src/lib/teacher-profile.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// The ONE photo publication / removal authority (shared by the student photo and the teacher photo). Consistency model:
// the ACTIVE photo is exactly the immutable blob the COMMITTED metadata references — publish = new blob → CAS commit →
// cleanup; remove = CAS-clear → cleanup. Concurrency and failure are exercised against the REAL CAS helper on the
// memory container (faithful ETag semantics), never a stub of them.

const PREFIX = "platform/student-profile-images/s1/";
const DOC = "platform/users/s1.json";
const NOW = "2026-09-21T09:00:00.000Z";
const seed = () => createMemoryContainer({ [DOC]: { userId: "s1", role: "student", avatarId: "a3", authVersion: 1, active: true, archived: false, updatedAt: NOW } });
const dataUrl = buf => "data:image/png;base64," + buf.toString("base64");
const png = bg => sharp({ create: { width: 200, height: 120, channels: 3, background: bg } }).png().toBuffer();
const prepare = current => { if (!current) throw Object.assign(new Error("missing"), { httpStatus: 404 }); current.updatedAt = NOW; return current; };
const publish = (ctx, buf, deps = {}) => publishProfilePhoto(ctx.container, { ownerPrefix: PREFIX, docName: DOC, dataUrl: dataUrl(buf), now: NOW, prepareDoc: prepare }, deps);
const remove = (ctx, deps = {}) => removeProfilePhoto(ctx.container, { ownerPrefix: PREFIX, docName: DOC, prepareDoc: prepare }, deps);
const serve = ctx => photoResponse(ctx.container, photoRecord(ctx.getJson(DOC)), PREFIX);
const active = ctx => { const r = photoRecord(ctx.getJson(DOC)); return r ? ctx.getBinary(r.blobKey) : null; };
const revisions = ctx => ctx.names(PREFIX);
/** The invariant every final state must satisfy: metadata ↔ blob agree, and GET serves exactly the referenced blob. */
async function expectConsistent(ctx) {
  const r = photoRecord(ctx.getJson(DOC));
  const res = await serve(ctx);
  if (!r) { expect(res.status).toBe(404); return null; }
  expect(r.blobKey.startsWith(PREFIX)).toBe(true);
  const blob = ctx.getBinary(r.blobKey);
  expect(blob, "metadata references a blob that must exist").not.toBeNull();
  expect(res.status).toBe(200); expect(Buffer.compare(res.body, blob.buffer)).toBe(0); expect(res.headers["x-photo-version"]).toBe(String(r.version));
  return r;
}

describe("publication semantics", () => {
  it("publish: a NEW immutable blob, metadata pointing at exactly it (internal blobKey, public {version, updatedAt}); replace never overwrites — new key, old key cleaned after the commit", async () => {
    const ctx = seed();
    const p1 = await publish(ctx, await png("#101010"));
    expect(p1.meta).toEqual({ version: 1, updatedAt: NOW }); expect(p1.record.blobKey).toMatch(new RegExp("^" + PREFIX + "[a-z0-9]+-[0-9a-f]{24}\\.webp$"));
    expect(p1.previousBlobKey).toBe(""); expect(p1.cleanedPrevious).toBe(false);
    expect(revisions(ctx)).toEqual([p1.record.blobKey]);
    expect(Object.keys(photoMeta(ctx.getJson(DOC)))).toEqual(["version", "updatedAt"]);
    const p2 = await publish(ctx, await png("#f0f0f0"));
    expect(p2.record.version).toBe(2); expect(p2.record.blobKey).not.toBe(p1.record.blobKey);
    expect(p2.previousBlobKey).toBe(p1.record.blobKey); expect(p2.cleanedPrevious).toBe(true);
    expect(revisions(ctx)).toEqual([p2.record.blobKey]);
    expect(ctx.getJson(DOC).avatarId).toBe("a3");
    await expectConsistent(ctx);
  });
  it("metadata CAS failure AFTER the bytes were stored → the error propagates, the previously published metadata + bytes remain the active photo, the orphan is deleted best-effort", async () => {
    const ctx = seed();
    const p1 = await publish(ctx, await png("#222222")); const bytes1 = Buffer.from(active(ctx).buffer);
    let attempted = 0;
    const exhausted = { mutateJsonWithRetry: async () => { attempted += 1; throw new StorageConflictError("exhausted"); } };
    await expect(publish(ctx, await png("#dddddd"), exhausted)).rejects.toBeInstanceOf(StorageConflictError);
    expect(attempted).toBe(1);
    expect(photoRecord(ctx.getJson(DOC))).toEqual(p1.record);
    expect(revisions(ctx)).toEqual([p1.record.blobKey]);                                  // orphan gone, v1 blob intact
    expect(Buffer.compare(active(ctx).buffer, bytes1)).toBe(0);
    // a domain failure at commit time (document vanished) behaves the same way: nothing published, orphan cleaned
    const ctx2 = createMemoryContainer({});
    await expect(publishProfilePhoto(ctx2.container, { ownerPrefix: PREFIX, docName: DOC, dataUrl: dataUrl(await png("#333333")), prepareDoc: prepare })).rejects.toMatchObject({ httpStatus: 404 });
    expect(ctx2.names(PREFIX)).toEqual([]);
    // a FAILED orphan cleanup never corrupts the active photo
    const ctx3 = seed(); const p3 = await publish(ctx3, await png("#444444"));
    await expect(publish(ctx3, await png("#555555"), { ...exhausted, deleteBlob: async () => { throw new Error("delete down"); } })).rejects.toBeInstanceOf(StorageConflictError);
    expect(photoRecord(ctx3.getJson(DOC))).toEqual(p3.record); expect(revisions(ctx3)).toHaveLength(2);   // orphan left behind…
    const served = await serve(ctx3); expect(Buffer.compare(served.body, ctx3.getBinary(p3.record.blobKey).buffer)).toBe(0);   // …but never served
  });
  it("remove: CAS-clear first, then delete the referenced blob; a CAS failure leaves metadata + blob usable; a failed blob delete leaves metadata authoritative (photo gone)", async () => {
    const ctx = seed();
    const p1 = await publish(ctx, await png("#666666"));
    await expect(remove(ctx, { mutateJsonWithRetry: async () => { throw new StorageConflictError("exhausted"); } })).rejects.toBeInstanceOf(StorageConflictError);
    expect(photoRecord(ctx.getJson(DOC))).toEqual(p1.record); expect(revisions(ctx)).toEqual([p1.record.blobKey]); expect((await serve(ctx)).status).toBe(200);
    const rm = await remove(ctx, { deleteBlob: async () => { throw new Error("delete down"); } });
    expect(rm.previousBlobKey).toBe(p1.record.blobKey); expect(rm.cleanedPrevious).toBe(false);
    expect(ctx.getJson(DOC).profilePhoto).toBeNull(); expect(ctx.getJson(DOC).avatarId).toBe("a3");
    expect((await serve(ctx)).status).toBe(404);                                             // metadata decides — the leftover is never served
    expect(await purgeProfilePhotos(ctx.container, PREFIX)).toBe(1); expect(revisions(ctx)).toEqual([]);
    const ok = await publish(ctx, await png("#777777")); const rm2 = await remove(ctx);
    expect(rm2.cleanedPrevious).toBe(true); expect(revisions(ctx)).toEqual([]);
    expect(ok.record.version).toBe(2);                                                         // monotonic across the removal — a re-published photo never reuses v1 (cache busting)
    expect(ctx.getJson(DOC)).toMatchObject({ profilePhoto: null, profilePhotoSeq: 2 });
  });
  it("a stale / orphan blob is never the active photo; a legacy record without blobKey resolves to the old current.webp; a referenced-but-missing blob is a 404, never another blob", async () => {
    const ctx = seed();
    ctx.store.set(PREFIX + "orphan.webp", { content: Buffer.from("orphan"), etag: "e1", contentType: "image/webp" });
    expect((await serve(ctx)).status).toBe(404);
    ctx.store.set(PREFIX + LEGACY_BLOB_FILE, { content: Buffer.from("legacy-bytes"), etag: "e2", contentType: "image/webp" });
    ctx.setJson(DOC, { ...ctx.getJson(DOC), profilePhoto: { version: 3, updatedAt: NOW } });                    // pre-fix shape
    expect(resolveBlobKey(photoRecord(ctx.getJson(DOC)), PREFIX)).toBe(PREFIX + LEGACY_BLOB_FILE);
    const legacy = await serve(ctx); expect(legacy.status).toBe(200); expect(legacy.body.toString()).toBe("legacy-bytes"); expect(legacy.headers.etag).toBe('"v3"');
    const p = await publish(ctx, await png("#888888"));                                                       // migrates forward: v4, new key, legacy blob cleaned
    expect(p.record.version).toBe(4); expect(p.previousBlobKey).toBe(PREFIX + LEGACY_BLOB_FILE); expect(revisions(ctx).sort()).toEqual([PREFIX + "orphan.webp", p.record.blobKey].sort());
    ctx.store.delete(p.record.blobKey);                                                                          // referenced blob lost
    expect((await serve(ctx)).status).toBe(404);
  });
});

describe("concurrency (real CAS on the memory container)", () => {
  it("two overlapping replacements: both commit in some order, the final metadata references ONE exact blob, GET serves it, version reflects the committed publication, the loser's revision is cleaned", async () => {
    const ctx = seed();
    await publish(ctx, await png("#000000"));
    const [a, b] = await Promise.all([publish(ctx, await png("#aa0000")), publish(ctx, await png("#0000aa"))]);
    const final = await expectConsistent(ctx);
    expect(final.version).toBe(3);                                                            // v1 + two committed publications
    expect([a.record.blobKey, b.record.blobKey]).toContain(final.blobKey);
    expect(revisions(ctx)).toEqual([final.blobKey]);                                          // no unreferenced revision left
    expect(new Set([a.record.version, b.record.version])).toEqual(new Set([2, 3]));
    // deterministic conflict: a concurrent writer lands between the read and the CAS of THIS publication → the real
    // retry loop re-reads, the version is computed from the freshest document, exactly one blob referenced
    let fired = false;
    const hooked = createMemoryContainer({ [DOC]: ctx.getJson(DOC) }, { beforeConditionalUpload: (name, api) => { if (fired || name !== DOC) return; fired = true; api.setJson(name, { ...api.getJson(name), displayName: "renamed concurrently" }); } });
    hooked.store.set(final.blobKey, { content: Buffer.from(active(ctx).buffer), etag: "e-copy", contentType: "image/webp" });
    const p = await publishProfilePhoto(hooked.container, { ownerPrefix: PREFIX, docName: DOC, dataUrl: dataUrl(await png("#00aa00")), now: NOW, prepareDoc: prepare });
    expect(fired).toBe(true); expect(p.record.version).toBe(4);
    expect(hooked.getJson(DOC)).toMatchObject({ displayName: "renamed concurrently", profilePhoto: { version: 4, blobKey: p.record.blobKey } });
    expect(hooked.names(PREFIX)).toEqual([p.record.blobKey]);
  });
  it("upload vs remove: the final state is either (metadata → existing blob) or (no metadata, nothing served) — never a dangling reference, never hidden byte changes", async () => {
    for (const order of ["upload-first", "remove-first"]) {
      const ctx = seed();
      const first = await publish(ctx, await png("#123456")); const bytes1 = Buffer.from(active(ctx).buffer);
      const up = publish(ctx, await png("#654321"));
      const rm = order === "upload-first" ? up.then(() => remove(ctx)) : remove(ctx).then(() => up);
      await Promise.all([up, rm]);
      const final = await expectConsistent(ctx);
      if (final) { expect(final.version).toBe(2); expect(final.blobKey).not.toBe(first.record.blobKey); expect(Buffer.compare(active(ctx).buffer, bytes1)).not.toBe(0); expect(revisions(ctx)).toEqual([final.blobKey]); }
      else expect(revisions(ctx)).toEqual([]);
    }
    // genuinely interleaved (no imposed order) — still consistent
    const ctx = seed(); await publish(ctx, await png("#abcdef"));
    await Promise.all([publish(ctx, await png("#fedcba")), remove(ctx)]);
    const final = await expectConsistent(ctx);
    expect(revisions(ctx)).toEqual(final ? [final.blobKey] : []);
  });
});

describe("the teacher photo uses the SAME path", () => {
  const teacher = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), requireStudentAuth: () => ({ ok: false }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
  const post = (deps, body) => teacherProfile({ method: "POST", url: "https://x/api/teacher-profile", headers: { get: () => null }, json: async () => body }, deps);
  const photoGet = deps => teacherProfile({ method: "GET", url: "https://x/api/teacher-profile-photo?v=1", headers: { get: () => null } }, deps);
  it("CAS failure after the bytes were stored → 503 and the previous teacher photo stays published; remove failure keeps it; concurrent replacements stay consistent", async () => {
    const hooks = {}; const ctx = createMemoryContainer({}, hooks); const PFX = teacherPhotoPrefix("builder-1"); const D = profileDocName("builder-1");
    expect((await post(teacher(ctx), { action: "uploadPhoto", dataUrl: dataUrl(await png("#010101")) })).status).toBe(200);
    const before = photoRecord(ctx.getJson(D)); const bytes = Buffer.from(ctx.getBinary(before.blobKey).buffer);
    // REAL CAS exhaustion: a concurrent writer lands before every conditional write of the profile document
    hooks.beforeConditionalUpload = (n, api) => { if (n === D) api.setJson(n, { ...api.getJson(n), concurrentPokes: (api.getJson(n).concurrentPokes || 0) + 1 }); };
    const r = await post(teacher(ctx), { action: "uploadPhoto", dataUrl: dataUrl(await png("#fefefe")) });
    expect(r.status).toBe(503); expect(photoRecord(ctx.getJson(D))).toEqual(before); expect(ctx.names(PFX)).toEqual([before.blobKey]);
    expect((await post(teacher(ctx), { action: "removePhoto" })).status).toBe(503); expect(photoRecord(ctx.getJson(D))).toEqual(before);
    delete hooks.beforeConditionalUpload;
    const g = await photoGet(teacher(ctx)); expect(g.status).toBe(200); expect(Buffer.compare(g.body, bytes)).toBe(0);
    await Promise.all([post(teacher(ctx), { action: "uploadPhoto", dataUrl: dataUrl(await png("#0a0a0a")) }), post(teacher(ctx), { action: "uploadPhoto", dataUrl: dataUrl(await png("#a0a0a0")) })]);
    const final = photoRecord(ctx.getJson(D));
    expect(final.version).toBe(3); expect(ctx.names(PFX)).toEqual([final.blobKey]);
    const served = await photoGet(teacher(ctx)); expect(Buffer.compare(served.body, ctx.getBinary(final.blobKey).buffer)).toBe(0);
    expect(JSON.stringify((await teacherProfile({ method: "GET", url: "https://x/api/teacher-profile", headers: { get: () => null } }, teacher(ctx))).jsonBody)).not.toContain("blobKey");
    expect(await downloadJsonOrNull(ctx.container, D)).toMatchObject({ profilePhoto: { blobKey: final.blobKey } });   // internal only
  });
});
