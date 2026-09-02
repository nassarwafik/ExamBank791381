const { app } = require("@azure/functions");
const {
  BlobServiceClient
} = require("@azure/storage-blob");
const crypto = require("crypto");
const {
  requireBuilderAuth,
  createSignedAssetParams
} = require("../lib/builder-auth");
const {
  filterEligibleCandidates
} = require("../lib/exam-question-selection");

const BANK_CONTAINER = "bank";
const ASSETS_CONTAINER = "assets";
const INDEX_BLOB = "index/questions-index.json";

async function streamToBuffer(stream) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function downloadBuffer(containerClient, blobName) {
  const blobClient = containerClient.getBlobClient(blobName);
  const response = await blobClient.download();

  if (!response.readableStreamBody) {
    throw new Error(`Unable to read blob: ${blobName}`);
  }

  return streamToBuffer(response.readableStreamBody);
}

async function downloadJson(containerClient, blobName) {
  const buffer = await downloadBuffer(containerClient, blobName);
  return JSON.parse(buffer.toString("utf8"));
}

function cloneCounts(object, keys) {
  return keys.reduce((result, key) => {
    result[key] = Math.max(
      0,
      Number(object?.[key] || 0)
    );
    return result;
  }, {});
}

function presentationTypeFromIndex(question) {
  switch (question.type) {
    case "multipleChoice":
      return "multipleChoice";
    case "multiField":
      return "fillBlank";
    case "shortAnswer":
    case "multiPart":
    case "other":
    default:
      return "open";
  }
}

function presentationTypeFromFullQuestion(question) {
  if (question.type === "multipleChoice") {
    return "multipleChoice";
  }

  if (question.type === "multiField") {
    const fields = Array.isArray(question.fields)
      ? question.fields
      : [];

    const hasSelect = fields.some(field =>
      String(field.kind || "").toLowerCase() === "select" ||
      (
        Array.isArray(field.options) &&
        field.options.length > 2
      )
    );

    return hasSelect ? "wordBank" : "fillBlank";
  }

  return "open";
}

function isOfficialLikeSource(question) {
  const sourceId = String(question.sourceId || "");
  const examCode = String(question.examCode || "");

  if (/^791381-20\d{2}/.test(sourceId)) {
    return true;
  }

  if (/^791367-20\d{2}/.test(sourceId)) {
    return true;
  }

  return examCode === "791381" || examCode === "791367";
}

function randomJitter() {
  return crypto.randomInt(0, 1000) / 1000;
}

function decrementIfPositive(map, key) {
  if (map[key] > 0) {
    map[key] -= 1;
  }
}

function countSelected(selected, predicate) {
  return selected.reduce(
    (count, item) => count + (predicate(item) ? 1 : 0),
    0
  );
}

function buildSelectionScore(
  question,
  state,
  plan
) {
  let score = randomJitter();

  const section = String(question.section || "");
  const difficulty = String(question.difficulty || "");
  const topic = String(question.topic || "");
  const presentationType = presentationTypeFromIndex(question);

  if (state.remainingSections[section] > 0) {
    score += 55;
  }
  else {
    score -= 35;
  }

  if (state.remainingDifficulty[difficulty] > 0) {
    score += 42;
  }
  else {
    score -= 22;
  }

  if (state.remainingTopics[topic] > 0) {
    score += 70;
  }
  else if (
    Object.prototype.hasOwnProperty.call(
      state.remainingTopics,
      topic
    )
  ) {
    score -= 8;
  }

  if (state.remainingTypes[presentationType] > 0) {
    score += 28;
  }

  if (
    state.imageShortfall > 0 &&
    question.hasImage === true
  ) {
    score += 45;
  }

  if (
    state.cliShortfall > 0 &&
    question.hasCLI === true
  ) {
    score += 40;
  }

  if (
    state.calculationShortfall > 0 &&
    question.requiresCalculation === true
  ) {
    score += 40;
  }

  const familyKey = String(question.familyKey || "").trim();

  if (
    plan.rules?.avoidSameFamily !== false &&
    familyKey &&
    state.usedFamilies.has(familyKey)
  ) {
    score -= 1000;
  }

  if (
    plan.rules?.preferOfficialSources !== false &&
    isOfficialLikeSource(question)
  ) {
    score += 5;
  }

  const sourcePriority = Number(question.sourcePriority);

  if (Number.isFinite(sourcePriority)) {
    score += Math.max(0, 100 - sourcePriority) * 0.03;
  }

  return score;
}

function updateSelectionState(state, question, plan) {
  const section = String(question.section || "");
  const difficulty = String(question.difficulty || "");
  const topic = String(question.topic || "");
  const presentationType = presentationTypeFromIndex(question);

  decrementIfPositive(state.remainingSections, section);
  decrementIfPositive(state.remainingDifficulty, difficulty);
  decrementIfPositive(state.remainingTopics, topic);
  decrementIfPositive(state.remainingTypes, presentationType);

  const familyKey = String(question.familyKey || "").trim();

  if (familyKey) {
    state.usedFamilies.add(familyKey);
  }

  if (question.hasImage === true && state.imageShortfall > 0) {
    state.imageShortfall -= 1;
  }

  if (question.hasCLI === true && state.cliShortfall > 0) {
    state.cliShortfall -= 1;
  }

  if (
    question.requiresCalculation === true &&
    state.calculationShortfall > 0
  ) {
    state.calculationShortfall -= 1;
  }
}

function selectQuestions(indexQuestions, plan) {
  // Defense in depth: interpret-exam-request.js already clamps to 40, but generate-exam.js has
  // no cap of its own today, so a direct/manual API call bypassing that step would otherwise be
  // unbounded. 40 is the absolute maximum exam size regardless of what the request claims.
  const totalQuestions = Math.min(
    40,
    Math.max(
      1,
      Number(plan.totalQuestions || 20)
    )
  );

  let candidates = filterEligibleCandidates(indexQuestions, {
    excludedTopics: plan.excludedTopics,
    allowedDifficulties: plan.allowedDifficulties,
    allowedTypes: plan.allowedTypes,
    excludeNeedsReview: plan.rules?.excludeNeedsReview
  });

  if (candidates.length < totalQuestions) {
    throw new Error(
      `Not enough eligible bank questions. Needed ${totalQuestions}, available ${candidates.length}.`
    );
  }

  const remainingTopics = {};

  for (const item of plan.topicTargets || []) {
    const topic = String(item.topic || "");

    if (topic) {
      remainingTopics[topic] =
        (remainingTopics[topic] || 0) +
        Math.max(0, Number(item.count || 0));
    }
  }

  const state = {
    remainingSections: cloneCounts(
      plan.sectionTargets,
      ["BASIC", "INFRASTRUCTURE"]
    ),
    remainingDifficulty: cloneCounts(
      plan.difficultyTargets,
      ["1", "2", "3", "4", "5"]
    ),
    remainingTopics,
    remainingTypes: cloneCounts(
      plan.typeTargets,
      ["multipleChoice", "fillBlank", "wordBank", "open"]
    ),
    imageShortfall: Math.max(0, Number(plan.minimums?.images || 0)),
    cliShortfall: Math.max(0, Number(plan.minimums?.cli || 0)),
    calculationShortfall: Math.max(
      0,
      Number(plan.minimums?.calculations || 0)
    ),
    usedFamilies: new Set()
  };

  const selected = [];
  const selectedIds = new Set();

  while (selected.length < totalQuestions) {
    let best = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      if (selectedIds.has(candidate.id)) {
        continue;
      }

      const score = buildSelectionScore(
        candidate,
        state,
        plan
      );

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best) {
      break;
    }

    selected.push(best);
    selectedIds.add(best.id);
    updateSelectionState(state, best, plan);
  }

  if (selected.length !== totalQuestions) {
    throw new Error(
      `Question selection stopped early at ${selected.length}/${totalQuestions}.`
    );
  }

  return {
    selected,
    remainingState: state
  };
}

function distributeMarks(totalMarks, questionCount) {
  const total = Math.max(1, Number(totalMarks || 100));
  const count = Math.max(1, questionCount);
  const base = Math.floor(total / count);
  let remainder = total - base * count;

  return Array.from({ length: count }, () => {
    const value = base + (remainder > 0 ? 1 : 0);

    if (remainder > 0) {
      remainder -= 1;
    }

    return value;
  });
}

function buildAssetData(asset) {
  if (!asset?.blobName) {
    return null;
  }

  const { exp, sig } = createSignedAssetParams(
    asset.blobName,
    8 * 60 * 60
  );

  const imageUrl =
    "/api/question-image" +
    `?blob=${encodeURIComponent(asset.blobName)}` +
    `&exp=${encodeURIComponent(String(exp))}` +
    `&sig=${encodeURIComponent(sig)}`;

  return {
    id: asset.id || asset.key || asset.blobName,
    origin: "bank",
    blobName: asset.blobName,
    contentType: asset.contentType || "image/png",
    dataUrl: imageUrl
  };
}

function buildSummary(questions) {
  const sections = {};
  const difficulty = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0
  };
  const topics = {};
  const types = {};
  let images = 0;
  let cli = 0;
  let calculations = 0;

  for (const question of questions) {
    sections[question.section] =
      (sections[question.section] || 0) + 1;

    const difficultyKey = String(question.difficulty || "");
    if (difficulty[difficultyKey] !== undefined) {
      difficulty[difficultyKey] += 1;
    }

    topics[question.topic] =
      (topics[question.topic] || 0) + 1;

    types[question.presentationType] =
      (types[question.presentationType] || 0) + 1;

    if (question.image?.exists) {
      images += 1;
    }

    if (question.hasCLI) {
      cli += 1;
    }

    if (question.requiresCalculation) {
      calculations += 1;
    }
  }

  return {
    sections,
    difficulty,
    topics,
    types,
    images,
    cli,
    calculations
  };
}

function buildWarnings(plan, summary, remainingState) {
  const warnings = [];

  for (const section of ["BASIC", "INFRASTRUCTURE"]) {
    const requested = Number(plan.sectionTargets?.[section] || 0);
    const actual = Number(summary.sections?.[section] || 0);

    if (requested !== actual) {
      warnings.push(
        `طلبت ${requested} من ${section} وتم اختيار ${actual}.`
      );
    }
  }

  for (const level of ["1", "2", "3", "4", "5"]) {
    const requested = Number(plan.difficultyTargets?.[level] || 0);
    const actual = Number(summary.difficulty?.[level] || 0);

    if (requested !== actual) {
      warnings.push(
        `الصعوبة ${level}: المطلوب ${requested} والمتاح في الاختيار ${actual}.`
      );
    }
  }

  if (
    summary.images < Number(plan.minimums?.images || 0)
  ) {
    warnings.push(
      `لم يتوفر العدد المطلوب من أسئلة الصور: ${summary.images}/${plan.minimums.images}.`
    );
  }

  if (summary.cli < Number(plan.minimums?.cli || 0)) {
    warnings.push(
      `لم يتوفر العدد المطلوب من أسئلة CLI: ${summary.cli}/${plan.minimums.cli}.`
    );
  }

  if (
    summary.calculations <
    Number(plan.minimums?.calculations || 0)
  ) {
    warnings.push(
      `لم يتوفر العدد المطلوب من أسئلة الحساب: ${summary.calculations}/${plan.minimums.calculations}.`
    );
  }

  const remainingTopicCount = Object.values(
    remainingState.remainingTopics || {}
  ).reduce((sum, value) => sum + Number(value || 0), 0);

  if (remainingTopicCount > 0) {
    warnings.push(
      "بعض حصص المواضيع المطلوبة لم تتحقق بالكامل؛ تم إكمال الامتحان بأقرب أسئلة مناسبة."
    );
  }

  return warnings;
}

app.http("generateExam", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "generate-exam",

  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);

      if (!auth.ok) {
        return auth.response;
      }

      let body = {};

      try {
        body = await request.json();
      }
      catch {
        body = {};
      }

      const plan = body?.plan;

      if (!plan || !plan.totalQuestions) {
        return {
          status: 400,
          jsonBody: {
            ok: false,
            error: "Exam plan is required."
          }
        };
      }

      const connectionString =
        process.env.AZURE_STORAGE_CONNECTION_STRING;

      if (!connectionString) {
        throw new Error(
          "AZURE_STORAGE_CONNECTION_STRING is not configured"
        );
      }

      const blobServiceClient =
        BlobServiceClient.fromConnectionString(
          connectionString
        );

      const bankContainer =
        blobServiceClient.getContainerClient(BANK_CONTAINER);

      const index = await downloadJson(
        bankContainer,
        INDEX_BLOB
      );

      const indexQuestions = Array.isArray(index.questions)
        ? index.questions
        : [];

      const selection = selectQuestions(
        indexQuestions,
        plan
      );

      const selected = selection.selected;
      const sourceIds = [
        ...new Set(selected.map(item => item.sourceId))
      ];

      const sourceDocuments = new Map();

      await Promise.all(
        sourceIds.map(async sourceId => {
          const document = await downloadJson(
            bankContainer,
            `sources/${sourceId}.json`
          );
          sourceDocuments.set(sourceId, document);
        })
      );

      const marks = distributeMarks(
        plan.totalMarks,
        selected.length
      );

      const questions = [];

      for (let indexPosition = 0;
        indexPosition < selected.length;
        indexPosition += 1) {
        const indexQuestion = selected[indexPosition];
        const sourceDocument = sourceDocuments.get(
          indexQuestion.sourceId
        );

        const fullQuestion = sourceDocument?.questions?.find(
          item => item.id === indexQuestion.id
        );

        if (!fullQuestion) {
          throw new Error(
            `Question content not found: ${indexQuestion.id}`
          );
        }

        const rawAssets = Array.isArray(fullQuestion.assets)
          ? fullQuestion.assets
          : [];

        const renderedAssets = rawAssets
          .map(asset => buildAssetData(asset))
          .filter(Boolean);

        const presentationType =
          presentationTypeFromFullQuestion(fullQuestion);

        questions.push({
          examQuestionId: `EQ-${String(indexPosition + 1).padStart(3, "0")}`,
          origin: "bank",
          bankQuestionId: fullQuestion.id,
          sourceId: fullQuestion.sourceId,
          sourceQuestionId: fullQuestion.sourceQuestionId,
          questionNumber: fullQuestion.questionNumber,
          section: indexQuestion.section,
          topic: indexQuestion.topic,
          secondaryTopics: indexQuestion.secondaryTopics || [],
          difficulty: Number(indexQuestion.difficulty),
          difficultyLabel: indexQuestion.difficultyLabel || "",
          familyKey: indexQuestion.familyKey || "",
          hasCLI: indexQuestion.hasCLI === true,
          requiresCalculation:
            indexQuestion.requiresCalculation === true,
          presentationType,
          bankType: fullQuestion.type,
          marks: marks[indexPosition],
          locked: false,
          text: fullQuestion.text || "",
          textHtml: fullQuestion.textHtml || "",
          options: fullQuestion.options || [],
          fields: fullQuestion.fields || [],
          parts: fullQuestion.parts || [],
          answer: fullQuestion.answer || {},
          hint: fullQuestion.hint || "",
          teacherNote: "",
          aiInstruction: "",
          wasModified: false,
          image: {
            exists: renderedAssets.length > 0,
            visible: renderedAssets.length > 0,
            origin:
              renderedAssets.length > 0
                ? "bank"
                : null,
            assets: renderedAssets,
            prompt: null
          },
          history: [],
          redoStack: []
        });
      }

      const summary = buildSummary(questions);
      const warnings = buildWarnings(
        plan,
        summary,
        selection.remainingState
      );

      const examId =
        `DRAFT-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

      return {
        status: 200,
        jsonBody: {
          ok: true,
          exam: {
            schemaVersion: 1,
            examId,
            title: plan.title || "امتحان شبكات",
            originalRequest: plan.originalRequest || "",
            plan,
            totalMarks: Number(plan.totalMarks || 100),
            status: "draft",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            questions,
            summary,
            warnings,
            revisionHistory: []
          }
        }
      };
    }
    catch {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "تعذر توليد الامتحان حاليًا."
        }
      };
    }
  }
});

// Exported only for unit testing the 40-question cap and strict topic/difficulty/type
// enforcement in selectQuestions (app.http's own route registration above is unaffected).
module.exports = { selectQuestions };
