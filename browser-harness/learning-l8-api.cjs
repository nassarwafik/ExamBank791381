// Phase L.8 — the REAL API, in process, for the learning reader browser gate (certification only, never shipped).
//
// Every Azure Functions module of api/src/functions is loaded with `app.http` captured, so each route is served by the handler the
// deployment runs. Storage is the in-memory container the API tests use (api/tests/fixtures/memory-container.js) and the sessions
// are real signed tokens: the signing values are random per run and live only in this process. Nothing here talks to Azure.
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");

function createLearningApi({ apiRoot, seed }) {
  // Random, per-run signing values for the session tokens (never a real secret; the process ends with the gate).
  process.env.BUILDER_SESSION_SECRET = crypto.randomBytes(24).toString("base64url");
  process.env.STUDENT_SESSION_SECRET = crypto.randomBytes(24).toString("base64url");
  delete process.env.BUILDER_USERS;
  const { createMemoryContainer } = require(path.join(apiRoot, "tests/fixtures/memory-container.js"));
  const mem = createMemoryContainer(seed);
  // Patch storage BEFORE any handler module destructures it.
  const storage = require(path.join(apiRoot, "src/lib/platform-storage.js"));
  storage.getContainer = () => mem.container;
  const routes = [];
  const azf = require(require.resolve("@azure/functions", { paths: [apiRoot] }));
  azf.app.http = (name, opts) => routes.push({ name, ...opts, pattern: compile(opts.route || name) });
  for (const f of fs.readdirSync(path.join(apiRoot, "src/functions")).filter(f => f.endsWith(".js"))) {
    try { require(path.join(apiRoot, "src/functions", f)); } catch (e) { routes.push({ name: f, failed: String(e && e.message) }); }
  }
  const { createBuilderToken } = require(path.join(apiRoot, "src/lib/builder-auth.js"));
  const { createStudentToken } = require(path.join(apiRoot, "src/lib/student-auth.js"));
  return { mem, routes, handle, teacherToken: () => createBuilderToken("builder"), studentToken: s => createStudentToken(s) };

  function compile(route) {
    const keys = [];
    const re = route.split("/").map(seg => {
      const m = seg.match(/^\{(\*?)([A-Za-z]+)(\?)?\}$/);
      if (!m) return "/" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      keys.push(m[2]);
      if (m[1]) return "/(.*)";
      return m[3] ? "(?:/([^/]+))?" : "/([^/]+)";
    }).join("");
    return { re: new RegExp("^" + re + "$"), keys };
  }

  async function handle(method, url, headers, bodyText) {
    const u = new URL(url, "http://localhost");
    const sub = u.pathname.replace(/^\/api/, "");
    for (const r of routes) {
      if (!r.pattern || (r.methods && !r.methods.includes(method))) continue;
      const m = sub.match(r.pattern.re);
      if (!m) continue;
      const params = {};
      r.pattern.keys.forEach((k, i) => { if (m[i + 1] !== undefined) params[k] = decodeURIComponent(m[i + 1]); });
      const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(",") : String(v)]));
      const request = {
        method, url: u.href, params, query: u.searchParams,
        headers: { get: k => lower[String(k).toLowerCase()] ?? null, has: k => String(k).toLowerCase() in lower },
        json: async () => JSON.parse(bodyText || "null"), text: async () => bodyText || "",
        arrayBuffer: async () => Buffer.from(bodyText || ""),
      };
      const context = { log() {}, error() {}, warn() {}, info() {}, trace() {}, debug() {}, invocationId: crypto.randomUUID() };
      try {
        const res = (await r.handler(request, context)) || {};
        const out = { status: res.status || 200, headers: { ...(res.headers || {}) } };
        if (res.jsonBody !== undefined) { out.body = JSON.stringify(res.jsonBody); out.headers["content-type"] = "application/json"; }
        else if (res.body !== undefined) out.body = res.body;
        return { ...out, route: r.name };
      } catch (e) {
        return { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "harness: " + (e && e.message) }), route: r.name };
      }
    }
    return { status: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: false, error: "no route" }), route: null };
  }
}

module.exports = { createLearningApi };
