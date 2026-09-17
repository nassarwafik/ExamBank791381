
const { app } = require("@azure/functions");

const {
  BlobServiceClient
} = require("@azure/storage-blob");

const crypto = require("crypto");

const {
  requireBuilderAuth
} = require("../lib/builder-auth");

const BANK_CONTAINER = "bank";
const INDEX_BLOB =
  "index/questions-index.json";

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(
      Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

async function downloadJson(
  containerClient,
  blobName
) {
  const blobClient =
    containerClient.getBlobClient(
      blobName
    );

  const response =
    await blobClient.download();

  if (!response.readableStreamBody) {
    throw new Error(
      "Unable to read blob: " +
      blobName
    );
  }

  const buffer =
    await streamToBuffer(
      response.readableStreamBody
    );

  return JSON.parse(
    buffer.toString("utf8")
  );
}

function candidateScore(
  candidate,
  current,
  desiredDifficulty,
  desiredType,
  usedFamilies
) {
  let score =
    crypto.randomInt(
      0,
      1000
    ) / 1000;

  if (
    candidate.section ===
    current.section
  ) {
    score += 80;
  }

  if (
    candidate.topic ===
    current.topic
  ) {
    score += 65;
  }

  const difficulty =
    Number(
      candidate.difficulty
    );

  const targetDifficulty =
    Number.isInteger(
      desiredDifficulty
    )
      ? desiredDifficulty
      : Number(
          current.difficulty
        );

  if (
    difficulty ===
    targetDifficulty
  ) {
    score += 55;
  }

  if (
    broadlyMatchesType(
      candidate,
      desiredType ||
        current.presentationType
    )
  ) {
    score += 35;
  }

  if (
    candidate.hasCLI ===
    current.hasCLI
  ) {
    score += 8;
  }

  if (
    candidate.requiresCalculation ===
    current.requiresCalculation
  ) {
    score += 8;
  }

  if (
    candidate.hasImage ===
    current.image?.exists
  ) {
    score += 4;
  }

  if (
    isOfficialLikeSource(
      candidate
    )
  ) {
    score += 5;
  }

  const familyKey =
    String(
      candidate.familyKey || ""
    ).trim();

  if (
    familyKey &&
    usedFamilies.has(
      familyKey
    )
  ) {
    score -= 1000;
  }

  return score;
}


// The bank → exam-question conversion (presentation type, type matching, asset signing, buildExamQuestion) lives in
// ../lib/bank-question-exam.js so the Exam Bank management endpoint converts questions through the SAME logic.
const {
  presentationTypeFromFullQuestion,
  broadlyMatchesType,
  isOfficialLikeSource,
  buildExamQuestion
} = require("../lib/bank-question-exam");

// The repository's Azure convention for a blob that does not exist (platform-storage, manage-students, …). ONLY
// this case is a "missing source"; every other read failure (timeout, auth, 5xx, malformed body) is a real error.
function isBlobNotFound(error) {
  return error?.statusCode === 404 || error?.code === "BlobNotFound";
}

function getBankContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
  }
  return BlobServiceClient.fromConnectionString(connectionString).getContainerClient(BANK_CONTAINER);
}

// Testable seam (same convention as the other functions): deps override auth / container / blob reads so the
// selection can run against an in-memory index + source documents. Behaviour is unchanged for production callers.
async function handler(request, deps = {}) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth;
  const getBank = deps.getBankContainer || getBankContainer;
  const readJson = deps.downloadJson || downloadJson;
  try {
    const auth = authFn(request);
    if (!auth.ok) {
      return auth.response;
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const currentQuestion = body?.question;
    if (!currentQuestion?.examQuestionId) {
      return { status: 400, jsonBody: { ok: false, error: "Current question is required." } };
    }

    const desiredDifficulty = body?.difficulty === undefined || body?.difficulty === null ? null : Number(body.difficulty);
    const desiredType = body?.presentationType ? String(body.presentationType) : null;
    const desiredTopic = body?.topic ? String(body.topic).trim() : null;

    if (desiredDifficulty !== null && ![1, 2, 3, 4, 5].includes(desiredDifficulty)) {
      return { status: 400, jsonBody: { ok: false, error: "Invalid difficulty." } };
    }
    if (desiredType && !["multipleChoice", "fillBlank", "wordBank", "open"].includes(desiredType)) {
      return { status: 400, jsonBody: { ok: false, error: "Invalid presentation type." } };
    }

    const bankContainer = getBank();
    const index = await readJson(bankContainer, INDEX_BLOB);

    const usedIds = new Set(Array.isArray(body?.usedBankQuestionIds) ? body.usedBankQuestionIds.map(String) : []);
    if (currentQuestion.bankQuestionId) {
      usedIds.add(String(currentQuestion.bankQuestionId));
    }
    const usedFamilies = new Set(Array.isArray(body?.usedFamilyKeys) ? body.usedFamilyKeys.map(String).filter(Boolean) : []);

    const allQuestions = Array.isArray(index?.questions) ? index.questions : [];
    const candidates = allQuestions.filter(candidate => {
      if (!candidate?.id || !candidate?.sourceId) {
        return false;
      }
      if (usedIds.has(String(candidate.id))) {
        return false;
      }
      if (!["BASIC", "INFRASTRUCTURE"].includes(candidate.section)) {
        return false;
      }
      if (!candidate.topic || candidate.topic === "UNKNOWN") {
        return false;
      }
      if (candidate.needsReview === true) {
        return false;
      }
      if (candidate.reviewStatus === "needs-review") {
        return false;
      }
      if (desiredDifficulty !== null && Number(candidate.difficulty) !== desiredDifficulty) {
        return false;
      }
      if (desiredTopic && String(candidate.topic) !== desiredTopic) {
        return false;
      }
      if (!broadlyMatchesType(candidate, desiredType)) {
        return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      throw new Error("No eligible replacement question was found.");
    }

    candidates.sort((a, b) =>
      candidateScore(b, currentQuestion, desiredDifficulty, desiredType, usedFamilies) -
      candidateScore(a, currentQuestion, desiredDifficulty, desiredType, usedFamilies));

    const sourceCache = new Map();
    let chosen = null;

    for (const candidate of candidates.slice(0, 100)) {
      let sourceDocument = sourceCache.get(candidate.sourceId);
      if (!sourceDocument) {
        // Defensive (stale index): an index entry whose source blob genuinely does not exist (404 / BlobNotFound)
        // must never become a candidate nor fail the whole selection — it is skipped exactly like an entry whose
        // question is gone. Any OTHER storage failure is rethrown and reaches the generic 500 below: a real outage
        // must not silently make a valid source disappear and pick a different question.
        try {
          sourceDocument = await readJson(bankContainer, "sources/" + candidate.sourceId + ".json");
        } catch (error) {
          if (!isBlobNotFound(error)) {
            throw error;
          }
          sourceDocument = { questions: [] };
        }
        if (!sourceDocument || typeof sourceDocument !== "object") {
          sourceDocument = { questions: [] };
        }
        sourceCache.set(candidate.sourceId, sourceDocument);
      }

      // The SOURCE document is the authority: an index entry with no stored question (deleted, or an index write
      // that outlived its source) is not a usable candidate.
      const fullQuestion = Array.isArray(sourceDocument.questions) ? sourceDocument.questions.find(item => item.id === candidate.id) : null;
      if (!fullQuestion) {
        continue;
      }

      const actualType = presentationTypeFromFullQuestion(fullQuestion);
      if (desiredType && actualType !== desiredType) {
        continue;
      }

      chosen = { indexQuestion: candidate, fullQuestion };
      break;
    }

    if (!chosen) {
      throw new Error("No replacement question matched the requested controls.");
    }

    return {
      status: 200,
      jsonBody: { ok: true, question: buildExamQuestion(chosen.fullQuestion, chosen.indexQuestion, currentQuestion) }
    };
  } catch {
    return { status: 500, jsonBody: { ok: false, error: "تعذر تنفيذ إجراء بنك الأسئلة حاليًا." } };
  }
}

app.http("questionBankAction", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "question-bank-action",
  handler: request => handler(request)
});

module.exports = { handler, isBlobNotFound, presentationTypeFromFullQuestion, broadlyMatchesType, isOfficialLikeSource, buildExamQuestion };
