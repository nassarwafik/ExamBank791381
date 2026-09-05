#!/usr/bin/env node
// Builds the exam-library catalog + item JSONs from a local snapshot of Book791381's HTML files.
//
// Usage:
//   node scripts/build-791381-library.js <sourceDir> [outputDir]
//
// <sourceDir> must contain index.html plus T01.html..T30.html and (optionally) F01.html..F06.html,
// saved locally from https://nassarwafik.github.io/Book791381/ - this script never fetches over
// the network itself. Building the library is a deliberate, reviewable, offline/build-time step
// (see the Discovery report, Phase M/W): no network or AI call may ever happen at
// assignment-creation or student-answer time, only here.
//
// Only T-series files are converted in this phase - each F-series file uses its own, different
// schema (see the Discovery report, Phase A) and is deliberately reported as "unsupported" rather
// than guessed at (Phase Z). Running this script twice on the same source produces byte-identical
// examQuestionId values and contentHash (no Date.now()/random anywhere in the conversion itself -
// only the informational convertedAt timestamp differs between runs).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseLiteral } = require("../api/src/lib/embedded-quiz-extract");
const { buildTExamSnapshot } = require("../api/src/lib/library-question-map");
const { parseBookCatalogIndex } = require("../api/src/lib/library-catalog-parse");
const { extractQCards } = require("../api/src/lib/qcard-dom-extract");
const { resolveAnswerMap } = require("../api/src/lib/library-answer-resolvers");
const { mapQCard } = require("../api/src/lib/library-fseries-map");
const { mapF03Question, mapF06Question, extractF03ImagesByQid } = require("../api/src/lib/library-json-map");

const T_FILE_REGEX = /^T(\d{2})\.html$/;
const F_FILE_REGEX = /^F(\d{2})\.html$/;

// A ready item has essentially every question auto-gradable; anything with a real share of
// manual-review questions is honestly labeled NEEDS_REVIEW (never silently "ready"). A file that
// fails to parse structurally is UNSUPPORTED.
const READY_REVIEW_RATIO = 0.10;

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

// Extracts a numeric mark from a source label like "2.5 علامة" / "4 درجات"; null when absent.
function parseMarks(marksText) {
  const match = /(\d+(?:\.\d+)?)/.exec(String(marksText || ""));
  return match ? Number(match[1]) : null;
}

function extractTQuestions(html) {
  const match = /\bconst\s+QUESTIONS\s*=\s*(?=\[)/.exec(html);
  if (!match) {
    throw new Error("No 'const QUESTIONS = [...]' array found in this file.");
  }
  return parseLiteral(html.slice(match.index + match[0].length)).value;
}

function grabArray(html, varName) {
  const match = new RegExp("\\bconst\\s+" + varName + "\\s*=\\s*(?=\\[)").exec(html);
  if (!match) throw new Error("array '" + varName + "' not found");
  return parseLiteral(html.slice(match.index + match[0].length)).value;
}

function grabObject(html, varName) {
  const match = new RegExp("\\bconst\\s+" + varName + "\\s*=\\s*(?=\\{)").exec(html);
  if (!match) throw new Error("object '" + varName + "' not found");
  return parseLiteral(html.slice(match.index + match[0].length)).value;
}

function finalizeSnapshot(examId, title, questions) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    examId,
    title,
    questions,
    totalMarks: questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0),
    status: "final",
    createdAt: now,
    updatedAt: now
  };
}

// F01/F02/F04/F05: DOM q-cards + a resolved answer key (AK object or g() calls; empty for F05).
function buildFDomSnapshot(examId, title, html) {
  const cards = extractQCards(html);
  if (!cards.length) throw new Error("no q-card questions found");
  const answerMap = resolveAnswerMap(html);
  const questions = cards.map((card, index) =>
    mapQCard(card, { examId, ordinal: index + 1, marks: parseMarks(card.marksText) || 0, answerMap })
  );
  return finalizeSnapshot(examId, title, questions);
}

// F03: const EXAM = {s1,s2}, images linked to questions by data-qid in the rendered q-cards.
function buildF03Snapshot(examId, title, html) {
  const exam = grabObject(html, "EXAM");
  const imagesByQid = extractF03ImagesByQid(html);
  const raw = Object.keys(exam).flatMap(section => exam[section]);
  if (!raw.length) throw new Error("EXAM object has no questions");
  const questions = raw.map((item, index) =>
    mapF03Question(item, { examId, ordinal: index + 1, marks: 4, imagesByQid })
  );
  return finalizeSnapshot(examId, title, questions);
}

// F06: const baseQ/infraQ/graphicQ arrays + a const images = {key:base64} map; marks are per-question.
function buildF06Snapshot(examId, title, html) {
  const imagesMap = grabObject(html, "images");
  const raw = [...grabArray(html, "baseQ"), ...grabArray(html, "infraQ"), ...grabArray(html, "graphicQ")];
  if (!raw.length) throw new Error("no baseQ/infraQ/graphicQ questions found");
  const questions = raw.map((item, index) =>
    mapF06Question(item, { examId, ordinal: index + 1, marks: Number(item.mark) || 0, imagesMap })
  );
  return finalizeSnapshot(examId, title, questions);
}

function buildFSnapshot(code, examId, title, html) {
  if (/\bconst\s+EXAM\s*=/.test(html)) return { snapshot: buildF03Snapshot(examId, title, html), parserFamily: "f-json-exam-v1" };
  if (/\bconst\s+baseQ\s*=/.test(html)) return { snapshot: buildF06Snapshot(examId, title, html), parserFamily: "f-json-sections-v1" };
  return { snapshot: buildFDomSnapshot(examId, title, html), parserFamily: "f-dom-qcard-v1" };
}

function classifyStatus(snapshot) {
  const total = snapshot.questions.length;
  if (!total) return "unsupported";
  const review = snapshot.questions.filter(q => q.requiresManualReview).length;
  return review / total <= READY_REVIEW_RATIO ? "ready" : "needs_review";
}

// Quality Gate for a T-series conversion: never let a question with a broken/out-of-range answer,
// missing text, or too few options reach the catalog silently - it must fail loudly here instead.
function validateTExamSnapshot(snapshot, expectedQuestionCount) {
  const issues = [];

  if (typeof expectedQuestionCount === "number" && snapshot.questions.length !== expectedQuestionCount) {
    issues.push("questionCount mismatch: index.html says " + expectedQuestionCount + ", parsed " + snapshot.questions.length);
  }

  if (Math.abs(snapshot.totalMarks - 100) > 1e-6) {
    issues.push("totalMarks is " + snapshot.totalMarks + ", expected 100");
  }

  for (const question of snapshot.questions) {
    if (!question.text || !question.text.trim()) {
      issues.push(question.examQuestionId + ": empty question text");
    }
    if (!Array.isArray(question.options) || question.options.length < 2) {
      issues.push(question.examQuestionId + ": fewer than 2 options");
    }
    const correctIndex = question.answer && question.answer.correctOptionIndex;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= question.options.length) {
      issues.push(question.examQuestionId + ": correctOptionIndex out of range");
    }
  }

  return issues;
}

function buildLibrary(sourceDir, outputDir) {
  const indexHtml = fs.readFileSync(path.join(sourceDir, "index.html"), "utf8");
  const catalogMeta = parseBookCatalogIndex(indexHtml);
  const metaById = new Map(catalogMeta.map(item => [item.libraryItemId, item]));

  const files = fs.readdirSync(sourceDir);
  const catalog = [];
  const report = [];
  const now = new Date().toISOString();

  fs.mkdirSync(path.join(outputDir, "items"), { recursive: true });

  for (const file of files.sort()) {
    const tMatch = T_FILE_REGEX.exec(file);
    const fMatch = F_FILE_REGEX.exec(file);
    if (!tMatch && !fMatch) continue;

    const code = (tMatch ? "T" : "F") + (tMatch ? tMatch[1] : fMatch[1]);
    const sourceHtml = fs.readFileSync(path.join(sourceDir, file), "utf8");
    const examId = "LIB-" + code;
    const meta = metaById.get(code) || null;
    const title = meta ? meta.title : code;

    let snapshot = null;
    let parserFamily = "";
    let status = "unsupported";
    let issues = [];
    try {
      if (tMatch) {
        snapshot = buildTExamSnapshot(examId, title, extractTQuestions(sourceHtml));
        parserFamily = "t-series-v1";
        issues = validateTExamSnapshot(snapshot, meta ? meta.questionCount : undefined);
        status = issues.length ? "unsupported" : "ready";
      }
      else {
        const built = buildFSnapshot(code, examId, title, sourceHtml);
        snapshot = built.snapshot;
        parserFamily = built.parserFamily;
        status = classifyStatus(snapshot);
      }
    }
    catch (error) {
      issues = ["parse error: " + error.message];
      status = "unsupported";
    }

    if (!snapshot || status === "unsupported") {
      report.push({ file, libraryItemId: code, status: "unsupported", reason: issues.join("; ") || "structural parse failure - schema not recognized" });
      continue;
    }

    const reviewQuestions = snapshot.questions.filter(q => q.requiresManualReview);
    // Strip the build-only requiresManualReview flag out of the stored ExamQuestion (it isn't part
    // of the ExamQuestion type); its intent is preserved in each question's teacherNote and
    // surfaced in aggregate in the quality report.
    const cleanQuestions = snapshot.questions.map(q => { const { requiresManualReview, ...rest } = q; return rest; });
    const storedSnapshot = { ...snapshot, questions: cleanQuestions };

    const contentHash = sha256(JSON.stringify(cleanQuestions));
    const catalogItem = {
      libraryItemId: code,
      title: snapshot.title,
      category: meta ? meta.category : "",
      description: meta ? meta.description : "",
      tags: meta ? meta.tags : [],
      questionCount: cleanQuestions.length,
      totalMarks: storedSnapshot.totalMarks,
      pageRange: meta ? meta.pageRange : "",
      parserFamily,
      status,
      autoGradableCount: cleanQuestions.length - reviewQuestions.length,
      manualReviewCount: reviewQuestions.length,
      libraryVersion: 1,
      sourceSha: sha256(sourceHtml),
      contentHash,
      convertedAt: now,
      source: { repository: "Book791381", sourceFile: file }
    };

    fs.writeFileSync(
      path.join(outputDir, "items", code + ".json"),
      JSON.stringify({ ...catalogItem, schemaVersion: 1, examSnapshot: storedSnapshot }, null, 2)
    );

    catalog.push(catalogItem);
    report.push({
      file,
      libraryItemId: code,
      status,
      questionCount: cleanQuestions.length,
      autoGradableCount: cleanQuestions.length - reviewQuestions.length,
      manualReviewCount: reviewQuestions.length,
      manualReviewReasons: [...new Set(reviewQuestions.map(q => q.teacherNote))]
    });
  }

  fs.writeFileSync(path.join(outputDir, "catalog.json"), JSON.stringify(catalog, null, 2));
  fs.writeFileSync(path.join(outputDir, "quality-report.json"), JSON.stringify(report, null, 2));

  return { catalog, report };
}

function main() {
  const sourceDir = process.argv[2];
  const outputDir = process.argv[3] || path.join(__dirname, "output");

  if (!sourceDir) {
    console.error("Usage: node scripts/build-791381-library.js <sourceDir> [outputDir]");
    process.exit(1);
  }

  const { catalog, report } = buildLibrary(sourceDir, outputDir);
  const ready = report.filter(item => item.status === "ready").length;
  const needsReview = report.filter(item => item.status === "needs_review").length;
  const unsupported = report.filter(item => item.status === "unsupported").length;

  console.log("Built " + catalog.length + " library items from " + report.length + " files: " +
    ready + " ready, " + needsReview + " needs_review, " + unsupported + " unsupported. Output: " + outputDir);
}

if (require.main === module) {
  main();
}

module.exports = { buildLibrary, validateTExamSnapshot, extractTQuestions };
