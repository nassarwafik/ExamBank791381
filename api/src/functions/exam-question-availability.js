const { app } = require("@azure/functions");
const fs = require("fs");
const path = require("path");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { INDEX_BLOB, filterEligibleCandidates, presentationTypeFromIndex } = require("../lib/exam-question-selection");
const { resolveSectionFromTopic } = require("../lib/section-resolver");

const PREVIEW_LIMIT = 20;

function loadTopicsConfig() {
  const candidates = [
    path.join(process.cwd(), "config", "topics.json"),
    path.join(__dirname, "..", "..", "config", "topics.json")
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  }
  return { topics: [] };
}

app.http("examQuestionAvailability", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "exam-question-availability",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) return auth.response;

      let body = {};
      try { body = await request.json(); } catch { body = {}; }

      const selectedTopics = Array.isArray(body?.selectedTopics) ? body.selectedTopics.map(String).filter(Boolean) : [];
      const allowedDifficulties = Array.isArray(body?.allowedDifficulties) ? body.allowedDifficulties.map(Number) : [];
      const allowedTypes = Array.isArray(body?.allowedTypes) ? body.allowedTypes.map(String) : [];
      const excludeNeedsReview = body?.excludeNeedsReview !== false;
      const wantPreview = body?.preview === true;

      const container = getContainer();
      const index = await downloadJsonOrNull(container, INDEX_BLOB);
      const indexQuestions = Array.isArray(index?.questions) ? index.questions : [];

      // A non-empty selectedTopics restricts candidates the same way generate-exam.js's
      // excludedTopics already does elsewhere in the app: excluding every OTHER known topic.
      // Empty selection = unrestricted, matching the existing excludedTopics semantics (never a
      // second, parallel topic-filtering mechanism).
      const allTopicsInIndex = [...new Set(indexQuestions.map(q => String(q?.topic || "")))]
        .filter(topic => topic && topic !== "UNKNOWN");
      const excludedTopics = selectedTopics.length
        ? allTopicsInIndex.filter(topic => !selectedTopics.includes(topic))
        : [];

      const candidates = filterEligibleCandidates(indexQuestions, {
        excludedTopics,
        allowedDifficulties,
        allowedTypes,
        excludeNeedsReview
      });

      // Topic facets deliberately ignore the topic restriction itself (but keep the
      // difficulty/type restrictions) so the teacher can see where else eligible questions exist
      // before deciding whether to widen their topic selection.
      const facetCandidates = filterEligibleCandidates(indexQuestions, {
        excludedTopics: [],
        allowedDifficulties,
        allowedTypes,
        excludeNeedsReview
      });

      const topicCounts = new Map();
      for (const question of facetCandidates) {
        const topic = String(question.topic || "");
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }

      const difficultyCounts = new Map();
      const typeCounts = new Map();
      for (const question of candidates) {
        const difficulty = Number(question.difficulty);
        difficultyCounts.set(difficulty, (difficultyCounts.get(difficulty) || 0) + 1);
        const type = presentationTypeFromIndex(question);
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }

      // Included unconditionally (cheap local file read) so any caller of this endpoint can render
      // topic display names without needing to have already gone through /api/interpret-exam-request
      // first (e.g. the file-import panel, which has no AI-parsed prompt to derive topics from).
      // defaultSection/sectionConfidence are the same majority-mapping bank-import-action.js uses
      // to VALIDATE a section server-side - exposed here only as a display hint for the frontend;
      // the frontend must never treat sectionConfidence < threshold as anything but "ask the
      // teacher", and the backend independently re-validates on commit regardless of what the
      // frontend sends.
      const topicsConfig = loadTopicsConfig();
      const topicsWithSection = (topicsConfig.topics || []).map(topic => {
        const resolved = resolveSectionFromTopic(topic.code);
        return { ...topic, defaultSection: resolved.section, sectionConfidence: resolved.confidence };
      });

      const result = {
        ok: true,
        availableCount: candidates.length,
        topicFacets: [...topicCounts.entries()].map(([topic, count]) => ({ topic, count })),
        difficultyFacets: [...difficultyCounts.entries()].map(([difficulty, count]) => ({ difficulty, count })),
        typeFacets: [...typeCounts.entries()].map(([type, count]) => ({ type, count })),
        topics: topicsWithSection
      };

      if (wantPreview) {
        const previewCandidates = candidates.slice(0, PREVIEW_LIMIT);
        const sourceIds = [...new Set(previewCandidates.map(question => question.sourceId))];
        const sourceDocuments = new Map();

        await Promise.all(sourceIds.map(async sourceId => {
          const document = await downloadJsonOrNull(container, `sources/${sourceId}.json`);
          sourceDocuments.set(sourceId, document);
        }));

        result.preview = previewCandidates
          .map(indexQuestion => {
            const sourceDocument = sourceDocuments.get(indexQuestion.sourceId);
            const fullQuestion = sourceDocument?.questions?.find(item => item.id === indexQuestion.id);
            return {
              id: String(indexQuestion.id),
              text: String(fullQuestion?.text || ""),
              topic: String(indexQuestion.topic || ""),
              difficulty: Number(indexQuestion.difficulty),
              type: presentationTypeFromIndex(indexQuestion)
            };
          })
          .filter(item => item.text);
      }

      return { status: 200, jsonBody: result };
    } catch {
      return {
        status: 500,
        jsonBody: { ok: false, error: "تعذر حساب عدد الأسئلة المتاحة حاليًا." }
      };
    }
  }
});
