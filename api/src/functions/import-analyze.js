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

// Azure Functions HTTP triggers are hard-capped well under 300s on the plans this app can run on;
// stop starting new chunks once this much wall-clock time has elapsed and report status:"partial"
// instead of letting the platform kill the request mid-flight with no persisted progress.
const TIME_BUDGET_MS = 170 * 1000;

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
async function detectQuestionsInChunk(chunk, { provider, topicCodes }) {
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
    schemaName: "detected_questions"
  });

  const questions = Array.isArray(response.result?.questions)
    ? response.result.questions.map(item => normalizeDetectedQuestion(item, { topicCodes }))
    : [];

  return { pageNumbers: chunk.pageNumbers, questions };
}

// Mutates state.results/processedChunks in place, calling `detector` (the AI-calling function)
// exactly once per remaining chunk, up to the time budget. CRITICALLY: if state.processedChunks
// is already >= state.totalChunks (a previously "done" job), the loop body never runs at all -
// detector is called zero times, so re-opening an already-analyzed import session never re-calls
// the AI provider. Extracted as its own function (with the AI call injected as `detector`) so this
// guarantee is directly unit-testable with a spy, instead of only being provable by code reading.
async function runRemainingChunks(state, { detector, onChunkDone, warnings, timeBudgetMs, now }) {
  const startedAt = now();

  while (state.processedChunks < state.totalChunks) {
    if (now() - startedAt > timeBudgetMs) {
      break;
    }

    const chunk = state.chunks[state.processedChunks];
    try {
      const chunkResult = await detector(chunk);
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
        detector: chunk => detectQuestionsInChunk(chunk, { provider, topicCodes }),
        onChunkDone: async () => uploadJson(container, blobPrefix + "state.json", serializeStateForStorage(state)),
        warnings,
        timeBudgetMs: TIME_BUDGET_MS,
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
