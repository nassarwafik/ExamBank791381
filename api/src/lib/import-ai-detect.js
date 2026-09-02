const fs = require("fs");
const path = require("path");

const KNOWN_PRESENTATION_TYPES = ["multipleChoice", "fillBlank", "wordBank", "open"];

function loadConfig(fileName) {
  const candidates = [
    path.join(process.cwd(), "config", fileName),
    path.join(__dirname, "..", "..", "config", fileName)
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  }
  throw new Error(`Config file not found: ${fileName}`);
}

function loadTopicCodes() {
  const config = loadConfig("topics.json");
  return new Set((config.topics || []).map(topic => topic.code));
}

function buildDetectionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            questionNumberGuess: { type: "string" },
            topic: { type: "string" },
            difficulty: { type: "integer", minimum: 1, maximum: 5 },
            presentationType: { type: "string", enum: [...KNOWN_PRESENTATION_TYPES, ""] },
            text: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: { value: { type: "string" }, text: { type: "string" } },
                required: ["value", "text"]
              }
            },
            hasVisibleAnswer: { type: "boolean" },
            answerText: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          },
          required: [
            "questionNumberGuess", "topic", "difficulty", "presentationType",
            "text", "options", "hasVisibleAnswer", "answerText", "confidence"
          ]
        }
      }
    },
    required: ["questions"]
  };
}

const DETECTION_INSTRUCTIONS =
  "أنت لا تُنشئ أسئلة جديدة إطلاقًا. مهمتك فقط اكتشاف وتنظيم أسئلة موجودة فعليًا في النص المرفق. " +
  "انسخ نص كل سؤال وبدائله كما هو حرفيًا، بدون إعادة صياغة أو تبسيط أو تغيير المستوى أو تصحيح الإجابة. " +
  "المسموح فقط: إصلاح فواصل أسطر متكسرة ناتجة عن استخراج النص. " +
  "إذا لم تكن متأكدًا من الموضوع أو النوع أو الصعوبة أو الإجابة، اترك الحقل فارغًا (سلسلة فارغة أو 0) بدلًا من التخمين أو اختراع قيمة جديدة. " +
  "قد يحتوي النص على رموز بالشكل [[IMG:...]] تمثل موضع صورة داخل السؤال - إذا وجدت أحد هذه الرموز ضمن نص سؤال معيّن، انسخه حرفيًا حرفًا بحرف كما هو (بما في ذلك القوسين المربعين المزدوجين) داخل حقل text لهذا السؤال بالضبط في نفس موضعه، ولا تحذفه ولا تُغيّره ولا تُعده لسؤال آخر.";

function buildDetectionPrompt(chunk, topicCodes) {
  const topicList = Array.from(topicCodes).join(", ");
  return (
    "المواضيع المسموحة فقط (لا تخترع موضوعًا آخر): " + topicList + "\n" +
    "أنواع العرض المسموحة فقط: multipleChoice, fillBlank, wordBank, open\n\n" +
    "استخرج كل الأسئلة الموجودة في النص التالي (رقم الصفحة/القسم: " + chunk.pageNumbers.join(",") + "):\n\n" +
    chunk.text
  );
}

// Validates and clamps one raw AI-returned question object. Unknown/invalid values become null
// (never invented, never silently defaulted to a fabricated value) - mirrors the established
// "never invent a value" pattern from interpret-exam-request.js/analyze-global-exam-instruction.js,
// except difficulty/topic/presentationType here fall back to null (meaning "AI wasn't sure") rather
// than a default, since preserving "unknown" as a real signal matters for the review UI.
function normalizeDetectedQuestion(raw, { topicCodes }) {
  const topic = topicCodes.has(String(raw?.topic || "")) ? String(raw.topic) : null;

  const presentationType = KNOWN_PRESENTATION_TYPES.includes(String(raw?.presentationType || ""))
    ? String(raw.presentationType)
    : null;

  const difficultyNumber = Number(raw?.difficulty);
  const difficulty = Number.isInteger(difficultyNumber) && difficultyNumber >= 1 && difficultyNumber <= 5
    ? difficultyNumber
    : null;

  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence) || 0));

  const text = String(raw?.text || "").trim();

  const options = Array.isArray(raw?.options)
    ? raw.options
      .map(option => ({ value: String(option?.value || "").trim(), text: String(option?.text || "").trim() }))
      .filter(option => option.text)
    : [];

  const hasVisibleAnswer = raw?.hasVisibleAnswer === true;
  const answerText = hasVisibleAnswer ? String(raw?.answerText || "").trim() : "";

  return {
    questionNumberGuess: String(raw?.questionNumberGuess || "").trim(),
    topic,
    difficulty,
    presentationType,
    text,
    options,
    hasVisibleAnswer,
    answerText,
    confidence
  };
}

// Merges the validated questions of every processed chunk into one ordered list, assigning stable
// ids and carrying page/section metadata, and flags anything low-confidence or ambiguous for
// manual review rather than silently accepting it.
function mergeChunkResults(importJobId, chunkResults) {
  const questions = [];
  let runningIndex = 0;

  for (const chunkResult of chunkResults) {
    for (const rawQuestion of chunkResult.questions || []) {
      if (!rawQuestion.text) {
        continue;
      }
      runningIndex += 1;
      const requiresManualReview =
        rawQuestion.topic === null ||
        rawQuestion.presentationType === null ||
        rawQuestion.confidence < 0.6;

      questions.push({
        importedQuestionId: `${importJobId}-${runningIndex}`,
        pageNumbers: chunkResult.pageNumbers,
        requiresManualReview,
        ...rawQuestion
      });
    }
  }

  return questions;
}

module.exports = {
  KNOWN_PRESENTATION_TYPES,
  loadTopicCodes,
  buildDetectionSchema,
  DETECTION_INSTRUCTIONS,
  buildDetectionPrompt,
  normalizeDetectedQuestion,
  mergeChunkResults
};
