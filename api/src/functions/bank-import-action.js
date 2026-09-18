const { app } = require("@azure/functions");
const crypto = require("crypto");
const { BlobServiceClient } = require("@azure/storage-blob");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, listJson, mutateJsonWithRetry } = require("../lib/platform-storage");
const { computeDuplicateCandidates } = require("../lib/duplicate-detection");
const { isValidBankSection } = require("../lib/section-resolver");
// The canonical multiField builder (fields / wordBank / exactSequence answer) is the one the Exam Bank editor
// writes with — reused here so an imported blank question is stored in exactly the shape a hand-edited one has.
const { validateQuestionInput, normalizeInput } = require("./bank-questions");

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

const BLANK_TYPES = ["fillBlank", "wordBank"];
const optionText = option => String(option?.text ?? option?.label ?? option?.value ?? "").trim();

function presentationTypeToBankType(presentationType) {
  if (presentationType === "multipleChoice") return "multipleChoice";
  if (BLANK_TYPES.includes(presentationType)) return "multiField";
  return "shortAnswer";
}

// ---- Explicit blank targets in the SOURCE text --------------------------------------------------------------
// The import contract gives one `answerText` string and nothing about how many blanks the question has, so a
// structure may only be derived when the source text itself shows exactly ONE blank target. These rules mirror
// the frontend's proven table handling (src/questionContent.tsx parseTable + ImportQuestionsPanel.tsx
// isBlankPlaceholderCell, which builds ONE field PER table row) rather than inventing new heuristics:
//   - a markdown table is the run of lines shaped "| … |" (≥ 2 lines: header + rows); its separator rows
//     ("| --- | --- |": every cell ^:?-{3,}:?$) are layout, never blanks; a data-row cell made only of
//     underscores / dashes / tatweel (or empty) is one blank target;
//   - outside the table, a prose run of two or more underscores / tatweel ("____", "ــــ") is one blank target.
// Anything else (dotted blanks, a lone "_" inside an identifier, a row with several blank cells) is not
// recognised — a conservative false negative is acceptable, a silent wrong conversion is not.
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;
const PROSE_BLANK = /[_ـ]{2,}/g;
const isBlankPlaceholderCell = cell => cell.trim() === "" || /^[_\-ـ\s]*$/.test(cell.trim());

// Pure, unit-testable. Returns the number of explicit blank targets in the source text, or null when the shape is
// ambiguous (a table row carrying more than one blank cell — which blank the answer belongs to is undecidable).
function countExplicitBlanks(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim());
  const tableLines = lines.filter(line => line.startsWith("|") && line.endsWith("|"));
  const isTable = tableLines.length >= 2;
  let count = 0;
  if (isTable) {
    const cells = line => line.slice(1, -1).split("|").map(cell => cell.trim());
    const rows = tableLines.slice(1).map(cells).filter(row => !row.every(cell => TABLE_SEPARATOR_CELL.test(cell.replace(/\s/g, ""))));
    for (const row of rows) {
      const blanks = row.filter(isBlankPlaceholderCell).length;
      if (blanks > 1) return null;
      count += blanks;
    }
  }
  const prose = (isTable ? lines.filter(line => !(line.startsWith("|") && line.endsWith("|"))) : lines).join("\n");
  count += (prose.match(PROSE_BLANK) || []).length;
  return count;
}

// Transient classification values used ONLY so the canonical validator can exercise the blank structure of a
// candidate (it also checks topic/difficulty). They are NEVER persisted: toBankQuestion stores the imported
// classification exactly as before (see `classification` below).
const TRANSIENT_VALIDATION_TOPIC = "import";
const TRANSIENT_VALIDATION_DIFFICULTY = 3;

// Pure, unit-testable. Derives the canonical multiField structure for an imported fillBlank / wordBank question
// from SOURCE-PRESENT data only, so the question lands in the Bank usable instead of the previous `fields: []`
// that the editor rejects until a teacher rebuilds it by hand:
//   - only when the source text shows exactly ONE explicit blank target (countExplicitBlanks === 1) — a
//     multi-blank or ambiguous question is never collapsed into one field;
//   - the visible answer (hasVisibleAnswer + answerText — the same value the import already stored as the
//     accepted answer) becomes that blank's expected value; for wordBank the detected options are the word
//     bank and the blank is a select over them.
// The candidate is gated by the Exam Bank's canonical validateQuestionInput (answer length, word-bank size and
// membership, text length, every other blank rule — nothing re-implemented here) and only then built by its
// normalizeInput, so a derived question is exactly what a hand-edited one would be. Any refusal → null; the
// caller keeps the question unchanged and flags it for teacher review.
function deriveImportedBlankStructure(importedQuestion) {
  const presentationType = importedQuestion?.presentationType;
  if (!BLANK_TYPES.includes(presentationType)) return null;
  const answer = importedQuestion.hasVisibleAnswer === true ? String(importedQuestion.answerText || "").trim() : "";
  if (!answer) return null;
  if (countExplicitBlanks(importedQuestion.text) !== 1) return null;
  const words = presentationType === "wordBank"
    ? Array.from(new Set((Array.isArray(importedQuestion.options) ? importedQuestion.options : []).map(optionText).filter(Boolean)))
    : [];
  const candidate = {
    section: importedQuestion.section, presentationType, text: String(importedQuestion.text || ""),
    topic: TRANSIENT_VALIDATION_TOPIC, difficulty: TRANSIENT_VALIDATION_DIFFICULTY,
    options: [], fields: [{ id: "f1", label: "", correct: answer }], wordBank: words, answer: {}
  };
  if (!validateQuestionInput(candidate).ok) return null;
  const normalized = normalizeInput(candidate);
  return { fields: normalized.fields, wordBank: normalized.wordBank, answer: normalized.answer };
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

  // A blank-style question that could not be given a usable structure from the source stays as before but is
  // flagged: the Bank already tells the teacher to add its blanks before use, so it genuinely needs review.
  const blank = deriveImportedBlankStructure(importedQuestion);
  const requiresManualReview = importedQuestion.requiresManualReview === true || assets.length === 0 && importedQuestion.hasImage
    || (BLANK_TYPES.includes(importedQuestion.presentationType) && !blank);

  return {
    id: `${sourceId}-${ordinal}`,
    sourceId,
    sourceQuestionId: importedQuestion.importedQuestionId,
    questionNumber: importedQuestion.questionNumberGuess || String(ordinal),
    section: importedQuestion.section,
    type: presentationTypeToBankType(importedQuestion.presentationType),
    text: importedQuestion.text || "",
    textHtml: importedQuestion.textHtml || "",
    // A derived blank question takes the editor's canonical shape whole (choices live on the fields / wordBank,
    // options stay empty, answer is the exactSequence of expected values); everything else is unchanged.
    options: blank ? [] : (importedQuestion.options || []).map((option, index) => ({
      value: option.value || String(index),
      label: option.text || "",
      text: option.text || "",
      textHtml: "",
      order: index
    })),
    fields: blank ? blank.fields : [],
    ...(blank ? { wordBank: blank.wordBank } : {}),
    parts: [],
    answer: blank ? blank.answer : (importedQuestion.hasVisibleAnswer && importedQuestion.answerText
      ? { mode: "anyAccepted", values: [importedQuestion.answerText] }
      : { mode: "manual", values: [] }),
    assets,
    flags: {
      hasImage: assets.length > 0,
      hasOptions: blank ? false : (importedQuestion.options || []).length > 0,
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

// Exported only for unit testing (the section-validation gate, the blank-structure derivation and the
// pure question mapping); app.http's own route registration above is unaffected.
module.exports = { partitionQuestionsBySectionValidity, countExplicitBlanks, deriveImportedBlankStructure, toBankQuestion };
