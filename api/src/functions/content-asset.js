const { app } = require("@azure/functions");
const { verifyContentAssetSignature, readContentAsset } = require("../lib/content-assets");

// Tadris+ P5-C (risk S7, D10) — GET /api/content-asset?p=<protected path>&exp=<unix>&sig=<hmac>: ONE course drawing or library
// question image. The URL is a short-lived credential the server put inside a payload whose own gate passed (a course module, a
// library item, an exam / assignment snapshot — lib/content-assets.js); it is verified BEFORE anything is read. A missing, expired,
// tampered or foreign signature → 401; an unknown file → 404. The answer may be kept privately until the URL expires, never longer.
async function handler(request, deps = {}) {
  try {
    if (String(request.method || "GET").toUpperCase() !== "GET") return { status: 405, body: "Method not allowed" };
    const url = new URL(request.url);
    const rel = String(url.searchParams.get("p") || "");
    const exp = String(url.searchParams.get("exp") || "");
    const sig = String(url.searchParams.get("sig") || "");
    const now = (deps.nowMs || Date.now)();
    if (!verifyContentAssetSignature(rel, exp, sig, now)) return { status: 401, body: "Unauthorized", headers: { "cache-control": "no-store" } };
    const asset = (deps.readContentAsset || readContentAsset)(rel);
    if (!asset) return { status: 404, body: "Image not found", headers: { "cache-control": "no-store" } };
    const maxAge = Math.max(0, Number(exp) - Math.floor(now / 1000));
    return {
      status: 200,
      body: asset.buffer,
      headers: { "content-type": asset.contentType, "cache-control": "private, max-age=" + maxAge, "x-content-type-options": "nosniff" }
    };
  } catch {
    return { status: 500, body: "تعذر تحميل الصورة حاليًا.", headers: { "cache-control": "no-store" } };
  }
}

app.http("contentAsset", { methods: ["GET"], authLevel: "anonymous", route: "content-asset", handler: request => handler(request) });

module.exports = { handler };
