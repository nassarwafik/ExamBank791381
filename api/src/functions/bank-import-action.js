const { app } = require("@azure/functions");
const crypto = require("crypto");
const { BlobServiceClient } = require("@azure/storage-blob");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, listJson, mutateJsonWithRetry } = require("../lib/platform-storage");
const { computeDuplicateCandidates } = require("../lib/duplicate-detection");
const { isValidBankSection } = require("../lib/section-resolver");

const ASSETS_CONTAINER = "assets";
const INDEX_BLOB = "index/questions-index.json";

function getAssetsContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured.");
  }
  return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(ASSETS_CONTAINER);
}

function slugify(value) {
  return String(value || "file")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "file";
}

// Loads every bank question's {sourceId, questionId, text} for duplicate scanning. The lightweight
// index deliberately carries no question text, so this always reads the full sources/*.json
// documents - acceptable given the bank's small size (~1930 questions across ~47 files).
async function loadAllBankQuestionTexts(bankContainer) {
  const sourceDocuments = await listJson(bankContainer, "sources/");
  const flattened = [];
  for (const document of sourceDocuments) {
    for (const question of document.questions || []) {
      if (question?.id && question?.text) {
        flattened.push({ sourceId: question.sourceId, questionId: question.id, text: question.text });
      }
    }
  }
  return flattened;
}

function presentationTypeToBankType(presentationType) {
  if (presentationType === "multipleChoice") return "multipleChoice";
  if (presentationType === "fillBlank" || presentationType === "wordBank") return "multiField";
  return "shortAnswer";
}

async function uploadImageAsset(assetsContainer, sourceId, ordinal, imageAsset) {
  const buffer = Buffer.from(imageAsset.dataUrl.split(",")[1] || "", "base64");
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const extension = (imageAsset.contentType || "image/png").split("/")[1] || "png";
  const blobName = `${sourceId}-img-${hash}.${extension}`;

  await assetsContainer.getBlockBlobClient(blobName).upload(buffer, buffer.length, {
    overwrite: true,
    blobHTTPHeaders: { blobContentType: imageAsset.contentType || "image/png" }
  });

  return {
    id: `${sourceId}-img-${ordinal}`,
    key: blobName,
    container: ASSETS_CONTAINER,
    blobName,
    contentType: imageAsset.contentType || "image/png",
    sizeBytes: buffer.length
  };
}

// Maps one teacher-reviewed ImportedQuestion into the canonical bank question schema (see
// import-html-exam.js/build-bank-2025.js for the schema this mirrors). Caller (the commit handler
// below) has ALREADY validated importedQuestion.section via isValidBankSection - this function
// trusts that and never falls back to a guessed/default value.
async function toBankQuestion(importedQuestion, sourceId, ordinal, assetsContainer) {
  const assets = [];
  for (const imageAsset of importedQuestion.imageAssets || []) {
    if (imageAsset?.dataUrl?.startsWith("data:")) {
      assets.push(await uploadImageAsset(assetsContainer, sourceId, ordinal, imageAsset));
    }
  }

  const requiresManualReview = importedQuestion.requiresManualReview === true || assets.length === 0 && importedQuestion.hasImage;

  return {
    id: `${sourceId}-${ordinal}`,
    sourceId,
    sourceQuestionId: importedQuestion.importedQuestionId,
    questionNumber: importedQuestion.questionNumberGuess || String(ordinal),
    section: importedQuestion.section,
    type: presentationTypeToBankType(importedQuestion.presentationType),
    text: importedQuestion.text || "",
    textHtml: importedQuestion.textHtml || "",
    options: (importedQuestion.options || []).map((option, index) => ({
      value: option.value || String(index),
      label: option.text || "",
      text: option.text || "",
      textHtml: "",
      order: index
    })),
    fields: [],
    parts: [],
    answer: importedQuestion.hasVisibleAnswer && importedQuestion.answerText
      ? { mode: "anyAccepted", values: [importedQuestion.answerText] }
      : { mode: "manual", values: [] },
    assets,
    flags: {
      hasImage: assets.length > 0,
      hasOptions: (importedQuestion.options || []).length > 0,
      isChild: false,
      requiresManualReview
    },
    classification: {
      topic: importedQuestion.topic || null,
      secondaryTopics: [],
      difficulty: importedQuestion.difficulty || null,
      difficultyLabel: "",
      difficultyReason: "AI-detected during file import; not reviewed",
      difficultyConfidence: importedQuestion.confidence ?? null,
      familyKey: null,
      status: "pending-classification"
    },
    reviewStatus: "pending-classification"
  };
}

// Pure, unit-testable: splits a batch of teacher-reviewed questions into ones that may be
// committed to the Question Bank and ones that must be rejected because their section isn't
// exactly "BASIC" or "INFRASTRUCTURE" (never "LEGACY", null, undefined, or anything else).
function partitionQuestionsBySectionValidity(questions) {
  const accepted = [];
  const skipped = [];
  for (const question of questions) {
    if (isValidBankSection(question?.section)) {
      accepted.push(question);
    } else {
      skipped.push({ importedQuestionId: question?.importedQuestionId, reason: "invalid-section", section: question?.section ?? null });
    }
  }
  return { accepted, skipped };
}

function toIndexEntry(bankQuestion, sourceId) {
  return {
    id: bankQuestion.id,
    sourceId,
    sourcePriority: 0,
    questionNumber: bankQuestion.questionNumber,
    section: bankQuestion.section,
    type: bankQuestion.type,
    originalType: bankQuestion.type,
    topic: bankQuestion.classification.topic || "UNKNOWN",
    difficulty: bankQuestion.classification.difficulty,
    familyKey: bankQuestion.classification.familyKey || "",
    hasImage: bankQuestion.flags.hasImage,
    assetCount: bankQuestion.assets.length,
    reviewStatus: bankQuestion.reviewStatus,
    secondaryTopics: [],
    difficultyLabel: "",
    hasCLI: false,
    requiresCalculation: false,
    needsReview: bankQuestion.flags.requiresManualReview,
    classificationConfidence: bankQuestion.classification.difficultyConfidence
  };
}

app.http("bankImportAction", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "bank-import-action",
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

      const action = String(body?.action || "").trim();
      const bankContainer = getContainer();

      if (action === "check") {
        const questions = Array.isArray(body?.questions) ? body.questions : [];
        if (questions.length === 0) {
          return { status: 400, jsonBody: { ok: false, error: "questions[] is required for action=check." } };
        }

        const bankQuestions = await loadAllBankQuestionTexts(bankContainer);
        const results = questions.map(question => ({
          importedQuestionId: question.importedQuestionId,
          duplicates: computeDuplicateCandidates(question.text || "", bankQuestions)
        }));

        return { status: 200, jsonBody: { ok: true, results } };
      }

      if (action === "commit") {
        const importJobId = String(body?.importJobId || "").trim();
        const fileName = String(body?.fileName || "").trim();
        const questions = Array.isArray(body?.questions) ? body.questions : [];

        if (!importJobId || questions.length === 0) {
          return { status: 400, jsonBody: { ok: false, error: "importJobId and a non-empty questions[] are required for action=commit." } };
        }

        // Mandatory server-side gate, independent of whatever the frontend already enforces:
        // a question is only ever written to the Question Bank with section exactly "BASIC" or
        // "INFRASTRUCTURE" - never "LEGACY", null, undefined, or any other value. Rejected
        // questions are skipped (not committed) and reported back with a reason, never silently
        // coerced to a guessed section.
        const { accepted, skipped } = partitionQuestionsBySectionValidity(questions);

        if (accepted.length === 0) {
          return {
            status: 400,
            jsonBody: { ok: false, error: "No question had a valid section (BASIC/INFRASTRUCTURE). Nothing was saved.", skipped }
          };
        }

        const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const shortHash = crypto.randomBytes(3).toString("hex");
        const sourceId = `import-${slugify(fileName)}-${dateStamp}-${shortHash}`;

        const assetsContainer = getAssetsContainer();
        const bankQuestions = [];
        for (let index = 0; index < accepted.length; index += 1) {
          bankQuestions.push(await toBankQuestion(accepted[index], sourceId, index + 1, assetsContainer));
        }

        const sourceDocumentBody = JSON.stringify({ questions: bankQuestions, original: { importJobId, fileName } }, null, 2);
        await bankContainer.getBlockBlobClient(`sources/${sourceId}.json`).upload(
          sourceDocumentBody,
          Buffer.byteLength(sourceDocumentBody),
          { overwrite: true, blobHTTPHeaders: { blobContentType: "application/json; charset=utf-8" } }
        );

        await mutateJsonWithRetry(bankContainer, INDEX_BLOB, current => {
          const existingQuestions = Array.isArray(current?.questions) ? current.questions : [];
          const withoutThisSource = existingQuestions.filter(entry => entry.sourceId !== sourceId);
          const newEntries = bankQuestions.map(question => toIndexEntry(question, sourceId));
          return { ...(current || {}), questions: [...withoutThisSource, ...newEntries] };
        });

        return {
          status: 200,
          jsonBody: { ok: true, sourceId, addedCount: bankQuestions.length, skippedCount: skipped.length, skipped }
        };
      }

      return { status: 400, jsonBody: { ok: false, error: "action must be 'check' or 'commit'." } };
    } catch {
      return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ العملية على بنك الأسئلة حاليًا." } };
    }
  }
});

// Exported only for unit testing the section-validation gate (app.http's own route registration
// above is unaffected).
module.exports = { partitionQuestionsBySectionValidity };
