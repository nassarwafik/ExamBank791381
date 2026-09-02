const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { chunkPages } = require("../lib/import-chunking");
const {
  loadTopicCodes,
  buildDetectionSchema,
  DETECTION_INSTRUCTIONS,
  buildDetectionPrompt,
  normalizeDetectedQuestion,
  mergeChunkResults
} = require("../lib/import-ai-detect");
const { callTextJson } = require("../lib/import-ai-client");
const { linkImagesToQuestions } = require("../lib/image-linking");
const pdfExtract = require("../lib/pdf-extract");
const docxExtract = require("../lib/docx-extract");
const htmlExtract = require("../lib/html-extract");

const RAW_CONTAINER = "raw";
const MAX_QUESTIONS_PER_JOB = 300;

// Azure Static Web Apps' managed-Functions proxy has its OWN gateway timeout, confirmed in
// production to be much shorter than the generic ~230s Azure Functions Consumption-plan ceiling
// an earlier version of this budget assumed (a ~30-question HTML file needing a handful of
// sequential chunk calls was enough to hit it, and the platform severed the connection with a raw,
// non-JSON "Backend call failure" response the code below never got a chance to handle).
//
// A single fixed "check elapsed > budget before starting a chunk" guard is NOT enough on its own:
// if chunk 1 takes 22s of a 40s budget, 18s remain, so chunk 2 is allowed to start - but chunk 2's
// own AI call can still take up to its own timeout (e.g. 25s), pushing the real wall-clock total to
// 47s+, past the budget the guard was supposed to enforce. The fix is to make every AI call's own
// timeout DYNAMIC - shrunk to whatever safely fits in what's actually left of the request - so the
// worst case for the whole request is bounded by REQUEST_BUDGET_MS, not by (guard check) +
// (whatever a subsequent call independently decides to take).
//
// REQUEST_BUDGET_MS: hard ceiling for the whole handler invocation, deliberately far under any
// plausible (undocumented) platform gateway timeout.
// SAFETY_MARGIN_MS: reserved AFTER the last AI call finishes, for state.json upload, merge, image
// linking, serialization, and sending the HTTP response - never spent on the AI call itself.
// MAX_AI_TIMEOUT_MS: no single call is ever given more than this even early in the request, when
// remainingMs alone would allow a longer one - keeps any one chunk from dominating the budget.
// MIN_USEFUL_AI_TIMEOUT_MS: below this, a new call isn't even worth starting (too likely to be cut
// off uselessly) - the loop stops and reports status:"partial" instead.
const REQUEST_BUDGET_MS = 35 * 1000;
const SAFETY_MARGIN_MS = 5 * 1000;
const MAX_AI_TIMEOUT_MS = 20 * 1000;
const MIN_USEFUL_AI_TIMEOUT_MS = 5 * 1000;

function getRawContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");
  }
  return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(RAW_CONTAINER);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadBufferOrNull(container, blobName) {
  try {
    const response = await container.getBlobClient(blobName).download();
    if (!response.readableStreamBody) {
      return null;
    }
    return await streamToBuffer(response.readableStreamBody);
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === "BlobNotFound") {
      return null;
    }
    throw error;
  }
}

async function downloadJsonOrNull(container, blobName) {
  const buffer = await downloadBufferOrNull(container, blobName);
  return buffer ? JSON.parse(buffer.toString("utf8")) : null;
}

async function uploadJson(container, blobName, value) {
  const body = JSON.stringify(value, null, 2);
  await container.getBlockBlobClient(blobName).upload(body, Buffer.byteLength(body), {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" }
  });
}

// state.chunks[].images[].buffer holds real Buffer instances in memory, but JSON.stringify would
// silently turn a Buffer into a plain {type:"Buffer",data:[...]} object that no longer has
// .toString("base64") - persisting/reloading state.json across resumed calls must convert
// explicitly at this boundary instead of relying on JSON's default (broken) Buffer round-trip.
function serializeStateForStorage(state) {
  return {
    ...state,
    chunks: state.chunks.map(chunk => ({
      ...chunk,
      images: chunk.images.map(image => ({ ...image, buffer: image.buffer.toString("base64") }))
    }))
  };
}

function deserializeStateFromStorage(state) {
  return {
    ...state,
    chunks: state.chunks.map(chunk => ({
      ...chunk,
      images: chunk.images.map(image => ({ ...image, buffer: Buffer.from(image.buffer, "base64") }))
    }))
  };
}

function extractorForKind(kind) {
  if (kind === "pdf") return pdfExtract.extractPages;
  if (kind === "docx") return docxExtract.extractPages;
  return htmlExtract.extractPages;
}

// PDF Scan (scanned pages with no extractable text): NOT implemented in this phase. pdf-extract.js
// deliberately never extracts embedded page images (avoiding a fragile pdfjs-dist+canvas native
// dependency right after a production outage caused by a fragile dependency chain - see
// pdf-extract.js's own comment), so a chunk built purely from scanned PDF pages always has empty
// text AND empty images. There is therefore no working Vision/OCR fallback path here - a scanned
// page is reported as a warning and simply produces zero questions, never a guessed transcription.
async function detectQuestionsInChunk(chunk, { provider, topicCodes, aiTimeoutMs }) {
  if (!chunk.text.trim()) {
    return {
      pageNumbers: chunk.pageNumbers,
      questions: [],
      warning: `Pages ${chunk.pageNumbers.join(",")} had no extractable text (likely a scanned PDF page) - skipped, no OCR/Vision attempted. Mark for manual review.`
    };
  }

  const schema = buildDetectionSchema();
  const prompt = buildDetectionPrompt(chunk, topicCodes);
  const response = await callTextJson({
    provider,
    instructions: DETECTION_INSTRUCTIONS,
    prompt,
    schema,
    schemaName: "detected_questions",
    timeoutMs: aiTimeoutMs
  });

  const questions = Array.isArray(response.result?.questions)
    ? response.result.questions.map(item => normalizeDetectedQuestion(item, { topicCodes }))
    : [];

  return { pageNumbers: chunk.pageNumbers, questions };
}

// Mutates state.results/processedChunks in place, calling `detector(chunk, aiTimeoutMs)` at most
// once per remaining chunk. CRITICALLY: if state.processedChunks is already >= state.totalChunks
// (a previously "done" job), the loop body never runs at all - detector is called zero times, so
// re-opening an already-analyzed import session never re-calls the AI provider.
//
// Deadline-aware by construction, not just by a pre-loop guard: `startedAt` is the moment the
// WHOLE request began (passed in by the caller, not captured here), so elapsed time already
// includes file download/extraction, not just chunk processing. Before every chunk, remainingMs is
// recomputed from the real clock, and the AI call's own timeout is capped to
// min(maxAiTimeoutMs, remainingMs - safetyMarginMs) - never more than what's actually left after
// reserving room for the post-loop work (merge, image linking, serialization, response). If that
// computed timeout would be too small to be useful, the loop stops immediately (no call started)
// and the request returns status:"partial" well inside the budget, instead of gambling that "we
// were under budget when we started" is enough - which is exactly what let a slow first chunk push
// a second chunk's call past the real deadline before this fix.
async function runRemainingChunks(state, {
  detector, onChunkDone, warnings, startedAt, requestBudgetMs, safetyMarginMs, maxAiTimeoutMs, minUsefulAiTimeoutMs, now
}) {
  while (state.processedChunks < state.totalChunks) {
    const elapsed = now() - startedAt;
    const remainingMs = requestBudgetMs - elapsed;
    const aiTimeoutMs = Math.min(maxAiTimeoutMs, remainingMs - safetyMarginMs);

    if (aiTimeoutMs < minUsefulAiTimeoutMs) {
      break;
    }

    const chunk = state.chunks[state.processedChunks];
    try {
      const chunkResult = await detector(chunk, aiTimeoutMs);
      if (chunkResult.warning) {
        warnings.push(chunkResult.warning);
      }
      state.results.push(chunkResult);
    } catch (error) {
      warnings.push(`Chunk ${chunk.chunkIndex} (pages ${chunk.pageNumbers.join(",")}) failed: ${error.message}`);
      state.results.push({ pageNumbers: chunk.pageNumbers, questions: [] });
    }

    state.processedChunks += 1;
    await onChunkDone();
  }
}

app.http("importAnalyze", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "import-analyze",
  handler: async request => {
    // Captured before ANY work (auth, download, extraction) so the deadline covers the whole
    // request's real wall-clock time, not just chunk-processing - a slow extraction step eating
    // into the budget is exactly as dangerous to the gateway timeout as a slow AI call.
    const requestStartedAt = Date.now();

    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) {
        return auth.response;
      }

      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const importJobId = String(body?.importJobId || "").trim();
      const provider = String(body?.provider || "glm").trim().toLowerCase();

      if (!importJobId || !/^imp-[a-z0-9-]+$/i.test(importJobId)) {
        return { status: 400, jsonBody: { ok: false, error: "Valid importJobId is required." } };
      }

      const container = getRawContainer();
      const blobPrefix = `imports/${importJobId}/`;

      const manifest = await downloadJsonOrNull(container, blobPrefix + "manifest.json");
      if (!manifest) {
        return { status: 404, jsonBody: { ok: false, error: "Import job not found. Please re-upload the file." } };
      }

      const storedState = await downloadJsonOrNull(container, blobPrefix + "state.json");
      let state = storedState ? deserializeStateFromStorage(storedState) : null;

      if (!state) {
        const originalExtension = manifest.detectedKind === "docx" ? ".docx" : manifest.detectedKind === "pdf" ? ".pdf" : ".html";
        const originalBuffer = await downloadBufferOrNull(container, blobPrefix + "original" + originalExtension);
        if (!originalBuffer) {
          return { status: 404, jsonBody: { ok: false, error: "Import job not found. Please re-upload the file." } };
        }

        const extractor = extractorForKind(manifest.detectedKind);
        const extraction = await extractor(originalBuffer);
        const chunks = chunkPages(extraction.pages);

        state = {
          importJobId,
          totalChunks: chunks.length,
          processedChunks: 0,
          chunks,
          results: [],
          extractionWarnings: extraction.warnings || []
        };
      }

      const topicCodes = loadTopicCodes();
      const warnings = [...(state.extractionWarnings || [])];

      await runRemainingChunks(state, {
        detector: (chunk, aiTimeoutMs) => detectQuestionsInChunk(chunk, { provider, topicCodes, aiTimeoutMs }),
        onChunkDone: async () => uploadJson(container, blobPrefix + "state.json", serializeStateForStorage(state)),
        warnings,
        startedAt: requestStartedAt,
        requestBudgetMs: REQUEST_BUDGET_MS,
        safetyMarginMs: SAFETY_MARGIN_MS,
        maxAiTimeoutMs: MAX_AI_TIMEOUT_MS,
        minUsefulAiTimeoutMs: MIN_USEFUL_AI_TIMEOUT_MS,
        now: () => Date.now()
      });

      const allMerged = mergeChunkResults(importJobId, state.results);
      const merged = allMerged.slice(0, MAX_QUESTIONS_PER_JOB);
      if (allMerged.length > MAX_QUESTIONS_PER_JOB) {
        warnings.push(`More than ${MAX_QUESTIONS_PER_JOB} questions were detected; only the first ${MAX_QUESTIONS_PER_JOB} are shown.`);
      }

      // Deterministic image-to-question linking (see image-linking.js): an image is attached to a
      // question only when its literal token survived, intact, inside that question's own
      // verbatim-copied text. Anything left over becomes unassignedAssets - never guessed, never
      // silently dropped.
      const allImages = state.chunks.flatMap(chunk => chunk.images);
      const { questions: linkedQuestions, unassignedImageIds } = linkImagesToQuestions(merged, allImages);
      const imageById = new Map(allImages.map(image => [image.id, image]));
      const toDataUrl = image => `data:${image.contentType};base64,${image.buffer.toString("base64")}`;

      const questionsWithImages = linkedQuestions.map(question => ({
        ...question,
        images: question.imageIds.map(id => {
          const image = imageById.get(id);
          return { id, contentType: image.contentType, dataUrl: toDataUrl(image) };
        })
      }));

      const unassignedAssets = unassignedImageIds.map(id => {
        const image = imageById.get(id);
        return { id, contentType: image.contentType, dataUrl: toDataUrl(image) };
      });

      const status = state.processedChunks >= state.totalChunks ? "done" : "partial";

      return {
        status: 200,
        jsonBody: {
          ok: true,
          importJobId,
          status,
          processedChunks: state.processedChunks,
          totalChunks: state.totalChunks,
          questions: questionsWithImages,
          unassignedAssets,
          warnings
        }
      };
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر تحليل الملف حاليًا." } };
    }
  }
});

// Exported only for unit testing the Buffer<->base64 state-persistence boundary and the
// already-done-job-never-recalls-AI guarantee (app.http's own route registration above is
// unaffected).
module.exports = { serializeStateForStorage, deserializeStateFromStorage, runRemainingChunks };
