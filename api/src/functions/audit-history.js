const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");   // Tadris+ P3-B
const { tenantOf } = require("../lib/teacher-tenancy");
const { getContainer, downloadJsonOrNull, listBlobNames, listBlobNamesPage } = require("../lib/platform-storage");
const { AUDIT_PREFIX, AUDIT_INDEX_PREFIX, indexableId, eventKeyFromIndexName } = require("../lib/audit-log");
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
  const authFn = requireTeacherSession;
  const getC = deps.getContainer || getContainer;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const lbn = deps.listBlobNames || listBlobNames;
  const lbnp = deps.listBlobNamesPage || listBlobNamesPage;
  try {
    const auth = await authFn(request, deps);
    if (!auth.ok) return auth.response;               // 401, no student access
    const capabilityDenial = await requireCapability(auth, "audit-history.js", "*", deps, obs);   // Tadris+ P3-B
    if (capabilityDenial) return capabilityDenial;
    const container = deps.container || getC();
    const tenant = tenantOf(auth.user);

    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"));
    const filters = parseFilters(url);

    // Tadris+ P7-B1 / 21G.0 — whose event this is: the actor, or the teacher it is about (forTeacher, D14).
    const mine = stored => !tenant || String(stored.actor || "") === tenant || String(stored.forTeacher || "") === tenant;
    const events = [];
    const seen = new Set();
    const take = (stored, key) => {
      seen.add(key);
      const ev = toPublicAuditEvent(stored, key);
      if (matchesFilters(ev, filters)) events.push(ev);
    };

    // Tadris+ O4 (docs/enterprise-teacher-activity-log-o4.md) — a teacher reads ONE page of their own index first (newest first,
    // at most HARD_MAX pointers). The pointer only leads to the event; ownership is checked again on the event itself, so a pointer
    // in the wrong place reveals nothing. A pointer whose event is missing is skipped.
    if (tenant && indexableId(tenant)) {
      const page = await lbnp(container, AUDIT_INDEX_PREFIX + tenant + "/", { maxPageSize: HARD_MAX });
      for (const pointer of page.names) {
        if (events.length >= limit) break;
        const key = eventKeyFromIndexName(tenant, pointer);
        if (!key || seen.has(key)) continue;
        const stored = await dl(container, AUDIT_PREFIX + key + ".json");
        if (!stored || !mine(stored)) continue;
        take(stored, key);
      }
    }

    // Today's window — the only source for a user without a tenant, and for a teacher only while their index holds fewer than
    // `limit` matches (events written before the index existed). Newest-first by blob name (ISO stamp) WITHOUT downloading; then
    // download only the newest window.
    if (events.length < limit) {
      const names = (await lbn(container, AUDIT_PREFIX)).sort((a, b) => String(b).localeCompare(String(a)));
      const window = names.slice(0, HARD_MAX);
      for (const name of window) {
        if (events.length >= limit) break;
        const key = eventIdFromName(name);
        if (seen.has(key)) continue;
        const stored = await dl(container, name);
        if (!stored) continue;
        // Phase 21G.0 — teacher tenancy: a teacher reads only the record of their own actions — and, Tadris+ P7-B1 (D14), the events
        // about them that they did not perform (`forTeacher`: the platform's administration read one of their students' conversations).
        if (!mine(stored)) continue;
        take(stored, key);
      }
    }
    // One order for both sources: the event key starts with its ISO stamp, so it sorts chronologically.
    events.sort((x, y) => String(y.eventId || "").localeCompare(String(x.eventId || "")));

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
