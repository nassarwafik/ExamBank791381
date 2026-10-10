// Phase 21D-B.1 — the browser loader of mesh assets (lazy). Every step fails CLOSED with a meaningful, student-safe Arabic message:
//   1. the URL is DERIVED by code from the pinned hash (meshAssetUrl) — same-origin, never from exam text; redirects are refused;
//   2. the body is streamed with progress and a hard byte cap (the pinned byteLength for uploads, the global limit otherwise);
//   3. the bytes are hashed (SHA-256, WebCrypto) and must equal the pinned hash — a changed or substituted file is never parsed;
//   4. the GLB authority (the same code the server ran at upload) validates and normalises the document;
//   5. every labelled part of the model must exist in the file (otherwise the question needs teacher review — nothing is guessed).
// Parsed documents are cached by hash in a byte-bounded LRU (shared by every viewer of the page: several questions on the same model
// download and parse it once), and concurrent loads of one hash share one download that is aborted when its last waiter leaves.
import { inspectGlbAsset, MESH_ASSET_LIMITS, type MeshAssetSummary, type MeshDocument } from "./glbAsset";
import { meshAssetUrl, meshModelMissingParts, type MeshModelSpecV1 } from "./meshModelSpec";

export type MeshLoadCode = "MESH_LOAD_NETWORK" | "MESH_LOAD_HTTP" | "MESH_LOAD_TOO_LARGE" | "MESH_LOAD_INTEGRITY" | "MESH_LOAD_INVALID" | "MESH_LOAD_PARTS" | "MESH_LOAD_ABORTED" | "MESH_LOAD_UNSUPPORTED";
export type MeshLoadError = { code: MeshLoadCode; message: string; detail?: string };
export type MeshLoaded = { sha256: string; document: MeshDocument; summary: MeshAssetSummary };
export type MeshLoadResult = { ok: true; value: MeshLoaded } | { ok: false; error: MeshLoadError };
export type MeshLoadOptions = {
  signal?: AbortSignal;
  onProgress?: (loaded: number, total: number | null) => void;
  fetchImpl?: typeof fetch;
  digest?: (bytes: Uint8Array) => Promise<string>;
};
export const MESH_LOADER_LIMITS = Object.freeze({ cacheBytes: 160 * 1024 * 1024 });

const MESSAGES: Record<MeshLoadCode, string> = {
  MESH_LOAD_NETWORK: "تعذر تحميل النموذج ثلاثي الأبعاد. تحقّق من الاتصال ثم أعد المحاولة.",
  MESH_LOAD_HTTP: "ملف النموذج غير متاح حاليًا على الخادم.",
  MESH_LOAD_TOO_LARGE: "ملف النموذج أكبر من الحد المسموح، فلم يُحمَّل.",
  MESH_LOAD_INTEGRITY: "بصمة ملف النموذج لا تطابق النسخة المعتمدة، فلم يُعرض الملف.",
  MESH_LOAD_INVALID: "ملف النموذج لم يجتز فحوص السلامة، فلم يُعرض.",
  MESH_LOAD_PARTS: "النموذج لا يحتوي كل الأجزاء المحددة في السؤال؛ يحتاج مراجعة المعلم.",
  MESH_LOAD_ABORTED: "أُلغي تحميل النموذج.",
  MESH_LOAD_UNSUPPORTED: "هذا المتصفح لا يدعم التحقق من سلامة ملف النموذج."
};
const fail = (code: MeshLoadCode, detail?: string): MeshLoadResult => ({ ok: false, error: { code, message: MESSAGES[code], ...(detail ? { detail } : {}) } });
/** The same meaningful error the loader reports — for checks the viewer makes against an already loaded document. */
export const meshLoadError = (code: MeshLoadCode, detail?: string): MeshLoadError => (fail(code, detail) as { ok: false; error: MeshLoadError }).error;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("MESH_LOAD_UNSUPPORTED");
  const digest = await subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── byte-bounded LRU of parsed documents ────────────────────────────────────────────────────────────────────────────────────────────
type Entry = { value: MeshLoaded; bytes: number };
const cache = new Map<string, Entry>();
let cacheBytes = 0;
const documentBytes = (d: MeshDocument) => d.parts.reduce((n, p) => n + p.primitives.reduce((m, q) => m + q.positions.byteLength + (q.normals?.byteLength ?? 0) + (q.uvs?.byteLength ?? 0) + q.indices.byteLength, 0), 0) + d.images.reduce((n, i) => n + i.bytes.byteLength, 0);
function remember(value: MeshLoaded) {
  const bytes = documentBytes(value.document);
  if (bytes > MESH_LOADER_LIMITS.cacheBytes) return;
  const old = cache.get(value.sha256);
  if (old) { cacheBytes -= old.bytes; cache.delete(value.sha256); }
  cache.set(value.sha256, { value, bytes });
  cacheBytes += bytes;
  for (const [k, e] of cache) { if (cacheBytes <= MESH_LOADER_LIMITS.cacheBytes) break; cache.delete(k); cacheBytes -= e.bytes; }
}
export const meshAssetCacheStats = () => ({ entries: cache.size, bytes: cacheBytes });
export const clearMeshAssetCache = () => { cache.clear(); cacheBytes = 0; };

// ── download (shared per hash, aborted when the last waiter leaves) ─────────────────────────────────────────────────────────────────
type Flight = { promise: Promise<{ ok: true; bytes: Uint8Array } | MeshLoadResult>; controller: AbortController; waiters: number; listeners: Set<(l: number, t: number | null) => void> };
const flights = new Map<string, Flight>();

async function download(url: string, cap: number, fetchImpl: typeof fetch, controller: AbortController, progress: (l: number, t: number | null) => void): Promise<{ ok: true; bytes: Uint8Array } | MeshLoadResult> {
  let res: Response;
  try { res = await fetchImpl(url, { signal: controller.signal, credentials: "same-origin", redirect: "error", cache: "default" }); }
  catch { return controller.signal.aborted ? fail("MESH_LOAD_ABORTED") : fail("MESH_LOAD_NETWORK"); }
  if (!res.ok) return fail("MESH_LOAD_HTTP", "HTTP " + res.status);
  const declared = Number(res.headers.get("content-length"));
  const total = Number.isFinite(declared) && declared > 0 ? declared : null;
  if (total !== null && total > cap) { controller.abort(); return fail("MESH_LOAD_TOO_LARGE"); }
  try {
    if (!res.body || typeof res.body.getReader !== "function") {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > cap) return fail("MESH_LOAD_TOO_LARGE");
      progress(buf.length, total ?? buf.length);
      return { ok: true, bytes: buf };
    }
    const reader = res.body.getReader(), chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.length;
      if (loaded > cap) { controller.abort(); return fail("MESH_LOAD_TOO_LARGE"); }
      chunks.push(value);
      progress(loaded, total);
    }
    const bytes = new Uint8Array(loaded);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
    return { ok: true, bytes };
  } catch { return controller.signal.aborted ? fail("MESH_LOAD_ABORTED") : fail("MESH_LOAD_NETWORK"); }
}

/** Loads, verifies and parses the asset of a validated model. Resolves (never rejects). */
export async function loadMeshModelAsset(model: MeshModelSpecV1, options: MeshLoadOptions = {}): Promise<MeshLoadResult> {
  const ref = model.asset, sha = ref.sha256, url = meshAssetUrl(ref);
  if (!url) return fail("MESH_LOAD_INVALID");
  const check = (v: MeshLoaded): MeshLoadResult => {
    const missing = meshModelMissingParts(model, v.summary.parts.map(p => p.id));
    return missing.length ? fail("MESH_LOAD_PARTS", missing.slice(0, 5).join(", ")) : { ok: true, value: v };
  };
  const hit = cache.get(sha);
  if (hit) { cache.delete(sha); cache.set(sha, hit); options.onProgress?.(1, 1); return check(hit.value); }
  if (options.signal?.aborted) return fail("MESH_LOAD_ABORTED");
  const cap = ref.source === "upload" ? Math.min(ref.byteLength, MESH_ASSET_LIMITS.maxBytes) : MESH_ASSET_LIMITS.maxBytes;
  let flight = flights.get(sha);
  if (!flight || flight.controller.signal.aborted) {
    const controller = new AbortController(), listeners = new Set<(l: number, t: number | null) => void>();
    const promise = download(url, cap, options.fetchImpl ?? fetch, controller, (l, t) => listeners.forEach(f => f(l, t)));
    flight = { promise, controller, waiters: 0, listeners };
    flights.set(sha, flight);
    void promise.finally(() => { if (flights.get(sha) === flight) flights.delete(sha); });
  }
  const f = flight;
  f.waiters++;
  if (options.onProgress) f.listeners.add(options.onProgress);
  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    f.waiters--;
    if (options.onProgress) f.listeners.delete(options.onProgress);
    if (f.waiters <= 0) f.controller.abort();
  };
  const aborted = new Promise<MeshLoadResult>(resolve => {
    if (!options.signal) return;
    options.signal.addEventListener("abort", () => { leave(); resolve(fail("MESH_LOAD_ABORTED")); }, { once: true });
  });
  const got = await Promise.race([f.promise, aborted]);
  if (options.signal?.aborted) return fail("MESH_LOAD_ABORTED");
  left = true; f.waiters--;
  if (options.onProgress) f.listeners.delete(options.onProgress);
  if (!got.ok) return got as MeshLoadResult;
  if (!("bytes" in got)) return got as MeshLoadResult;
  const bytes = got.bytes;
  if (ref.source === "upload" && bytes.length !== ref.byteLength) return fail("MESH_LOAD_INTEGRITY", "length");
  let hex: string;
  try { hex = await (options.digest ?? sha256Hex)(bytes); }
  catch { return fail("MESH_LOAD_UNSUPPORTED"); }
  if (hex !== sha) return fail("MESH_LOAD_INTEGRITY");
  const already = cache.get(sha);
  if (already) return check(already.value);
  const report = inspectGlbAsset(bytes);
  if (!report.ok) return fail("MESH_LOAD_INVALID", report.issues[0]?.message);
  const value: MeshLoaded = { sha256: sha, document: report.document, summary: report.summary };
  remember(value);
  return check(value);
}
