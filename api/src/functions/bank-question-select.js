const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { withObservability } = require("../lib/observability");
const { buildExamQuestion } = require("../lib/bank-question-exam");
const { isBlobNotFound } = require("./question-bank-action");

/*
 * Phase 13B — EXACT bank question retrieval for the Structured Builder's "إضافة من بنك الأسئلة" picker.
 *   POST /api/bank-question-select  { ids: string[] }   →  { ok, questions: [canonical exam question, in the REQUESTED order] }
 *
 * A READ path over the EXISTING bank store (bank/index/questions-index.json + bank/sources/<sourceId>.json): no second
 * bank, no second format, no writes. Every question is converted by the ONE canonical converter the Builder's
 * "replace from bank" already uses (../lib/bank-question-exam.js buildExamQuestion — answer keys, metadata, SIGNED image
 * assets). The exam question identity is the CLIENT's to assign (examQuestionId is returned empty; marks 0).
 *
 * All-or-nothing: the SOURCE document is the authority. An index entry whose question is gone, or whose source blob is
 * missing (404 / BlobNotFound only — the repository's Azure convention), or an unknown id → 404 with `missingIds`; an
 * unsupported bank shape (multiPart) → 422 with `unsupportedIds`; ANY other storage failure → 500, never "missing".
 */
const BANK_CONTAINER = "bank";
const INDEX_BLOB = "index/questions-index.json";
const SOURCES_PREFIX = "sources/";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;   // the same id rule bank-questions.js enforces
const MAX_IDS = 50;
const bad = (status, error, extra) => ({ status, jsonBody: { ok: false, error, ...(extra || {}) } });

async function streamToBuffer(stream) { const chunks = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }
async function downloadJson(container, blobName) {
  const response = await container.getBlobClient(blobName).download();
  if (!response.readableStreamBody) throw new Error("Unable to read blob: " + blobName);
  return JSON.parse((await streamToBuffer(response.readableStreamBody)).toString("utf8"));
}
async function listJson(container, prefix) {
  const out = [];
  for await (const blob of container.listBlobsFlat({ prefix })) { if (blob.name.endsWith(".json")) out.push(await downloadJson(container, blob.name)); }
  return out;
}
function getBankContainer() {
  const cs = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
  return BlobServiceClient.fromConnectionString(cs).getContainerClient(BANK_CONTAINER);
}
/** A question with no index entry is still converted: its classification is the stored one (source is the authority). */
function entryFromStored(question, sourceId) {
  const cls = question.classification || {};
  return { id: question.id, sourceId, section: question.section, type: question.type, topic: cls.topic || question.topic || "", difficulty: cls.difficulty ?? question.difficulty ?? null, difficultyLabel: cls.difficultyLabel || "", familyKey: cls.familyKey || "", secondaryTopics: cls.secondaryTopics || [], hasImage: (question.assets || []).length > 0 };
}
const isUnsupported = q => String(q.type || "") === "multiPart" || (Array.isArray(q.parts) && q.parts.length > 0);

async function handler(request, deps = {}, obs = null) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth;
  const getBank = deps.getBankContainer || getBankContainer;
  const readJson = deps.downloadJson || downloadJson;
  const ls = deps.listJson || listJson;
  try {
    const auth = authFn(request);
    if (!auth.ok) return auth.response;
    if (request.method !== "POST") return bad(405, "الطريقة غير مدعومة.");
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    const raw = body?.ids;
    if (!Array.isArray(raw) || raw.length === 0) return bad(400, "حدّد أسئلة البنك المطلوبة.");
    if (raw.length > MAX_IDS) return bad(400, "يمكن إدراج " + MAX_IDS + " سؤالًا كحدّ أقصى في المرة الواحدة.");
    if (!raw.every(id => typeof id === "string" && ID_PATTERN.test(id))) return bad(400, "معرّف سؤال غير صالح.");
    const ids = [...new Set(raw)];

    const bank = getBank();
    const index = await readJson(bank, INDEX_BLOB);
    const entries = new Map((Array.isArray(index?.questions) ? index.questions : []).filter(e => e?.id).map(e => [String(e.id), e]));
    const sourceCache = new Map();
    const readSource = async sourceId => {
      if (sourceCache.has(sourceId)) return sourceCache.get(sourceId);
      let document;
      try { document = await readJson(bank, SOURCES_PREFIX + sourceId + ".json"); }
      catch (error) { if (!isBlobNotFound(error)) throw error; document = { questions: [] }; }   // stale index → missing, never fake
      if (!document || typeof document !== "object") document = { questions: [] };
      sourceCache.set(sourceId, document);
      return document;
    };
    let allSources = null;                                        // only when an id has no index entry
    const findIn = (document, id) => (Array.isArray(document?.questions) ? document.questions.find(q => String(q?.id) === id) : null) || null;

    const missing = [], unsupported = [], questions = [];
    for (const id of ids) {
      const entry = entries.get(id) || null;
      let stored = null, sourceId = "";
      if (entry?.sourceId) { sourceId = String(entry.sourceId); stored = findIn(await readSource(sourceId), id); }
      if (!stored) {
        if (!allSources) allSources = await ls(bank, SOURCES_PREFIX);
        for (const document of allSources) { const hit = findIn(document, id); if (hit) { stored = hit; sourceId = String(hit.sourceId || document.sourceId || ""); break; } }
      }
      if (!stored) { missing.push(id); continue; }
      if (isUnsupported(stored)) { unsupported.push(id); continue; }
      questions.push(buildExamQuestion(stored, entry || entryFromStored(stored, sourceId), { examQuestionId: "", marks: 0 }));
    }
    if (missing.length) return bad(404, "بعض الأسئلة لم تعد موجودة في بنك الأسئلة.", { missingIds: missing });
    if (unsupported.length) return bad(422, "بعض الأسئلة المحددة من نوع غير مدعوم للإدراج المباشر في الامتحان المنظّم.", { unsupportedIds: unsupported });
    obs?.logInfo?.("bank.select.served", { requested: ids.length, sources: sourceCache.size });
    return { status: 200, jsonBody: { ok: true, questions } };
  } catch (e) {
    obs?.logError?.("bank.select.failed", e);
    return bad(500, "تعذر جلب أسئلة بنك الأسئلة حاليًا.");
  }
}

app.http("bankQuestionSelect", { methods: ["POST"], authLevel: "anonymous", route: "bank-question-select", handler: withObservability("bank-question-select", handler) });
module.exports = { handler, MAX_IDS, ID_PATTERN };
