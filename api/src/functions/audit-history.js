const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, listBlobNames } = require("../lib/platform-storage");
const { AUDIT_PREFIX } = require("../lib/audit-log");
const { toPublicAuditEvent } = require("../lib/audit-redact");

// Roadmap #19 — builder-only reader over the append-only audit history written by audit-log.js.
//
// Storage is unchanged: one immutable blob per event under AUDIT_PREFIX, named with an ISO-derived
// timestamp stamp, so lexicographic blob-name order EQUALS chronological order. We therefore sort by
// NAME (no download) to find the newest events, then download only a BOUNDED window of them — never a
// full-history scan. This is deliberately NOT generalized pagination (Roadmap #29 owns that): the reader
// reads at most HARD_MAX newest events, maps each to the safe redacted public model, applies optional
// filters IN that window, and returns at most `limit` (default DEFAULT_LIMIT). Because filters run inside
// the newest-HARD_MAX window, a filter can only surface matches within recent history — an accepted,
// documented bound for this phase.
const DEFAULT_LIMIT = 50;
const HARD_MAX = 100;

function eventIdFromName(name) {
  const base = String(name || "").slice(AUDIT_PREFIX.length);
  return base.endsWith(".json") ? base.slice(0, -".json".length) : base;
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(HARD_MAX, Math.floor(n));
}

// Parse the query filters. All optional; a filter that is absent/empty never narrows the result.
function parseFilters(url) {
  const p = url.searchParams;
  const s = k => String(p.get(k) || "").trim();
  const fromRaw = s("from"), toRaw = s("to");
  const fromMs = fromRaw ? new Date(fromRaw).getTime() : NaN;
  const toMs = toRaw ? new Date(toRaw).getTime() : NaN;
  return {
    action: s("action").toLowerCase(),
    targetType: s("targetType").toLowerCase(),
    targetId: s("targetId"),
    q: s("q").toLowerCase(),
    fromMs: Number.isFinite(fromMs) ? fromMs : null,
    toMs: Number.isFinite(toMs) ? toMs : null
  };
}

function matchesFilters(ev, f) {
  if (f.action && String(ev.action || "").toLowerCase() !== f.action) return false;
  if (f.targetType && String(ev.targetType || "").toLowerCase() !== f.targetType) return false;
  if (f.targetId && String(ev.targetId || "") !== f.targetId) return false;
  if (f.q) {
    const hay = [ev.targetLabel, ev.targetId, ev.action, ev.actor].join(" ").toLowerCase();
    if (!hay.includes(f.q)) return false;
  }
  if (f.fromMs !== null || f.toMs !== null) {
    const t = new Date(ev.timestamp || "").getTime();
    if (!Number.isFinite(t)) return false;
    if (f.fromMs !== null && t < f.fromMs) return false;
    if (f.toMs !== null && t > f.toMs) return false;
  }
  return true;
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used). It does not change runtime behavior.
async function handler(request, deps = {}, obs = null) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth;
  const getC = deps.getContainer || getContainer;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const lbn = deps.listBlobNames || listBlobNames;
  try {
    const auth = authFn(request);
    if (!auth.ok) return auth.response;               // 401, no student access
    const container = deps.container || getC();

    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"));
    const filters = parseFilters(url);

    // Newest-first by blob name (ISO stamp) WITHOUT downloading; then download only the newest window.
    const names = (await lbn(container, AUDIT_PREFIX)).sort((a, b) => String(b).localeCompare(String(a)));
    const window = names.slice(0, HARD_MAX);

    const events = [];
    for (const name of window) {
      const stored = await dl(container, name);
      if (!stored) continue;
      const ev = toPublicAuditEvent(stored, eventIdFromName(name));
      if (matchesFilters(ev, filters)) events.push(ev);
      if (events.length >= limit) break;
    }

    return {
      status: 200,
      headers: { "Cache-Control": "no-store" },
      jsonBody: { ok: true, events, count: events.length, limit, hardMax: HARD_MAX }
    };
  } catch (e) {
    obs?.logError("audit.history.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل سجل النشاط حاليًا." } };
  }
}

app.http("auditHistory", { methods: ["GET"], authLevel: "anonymous", route: "audit-history", handler: withObservability("audit-history", handler) });

module.exports = { handler, DEFAULT_LIMIT, HARD_MAX };
