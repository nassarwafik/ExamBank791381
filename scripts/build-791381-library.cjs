#!/usr/bin/env node
// Builds the exam-library catalog + item JSONs from a local snapshot of Book791381's HTML files.
//
// Usage:
//   node scripts/build-791381-library.cjs <sourceDir> [dataOutputDir] [assetsOutputDir]
//
// With only <sourceDir>, output goes to the versioned in-repo locations, so the library ships with
// the app (git -> deploy -> available, no manual Azure upload):
//   api/src/data/exam-library/{catalog.json, quality-report.json, items/<code>.json}
//   public/exam-library/assets/<code>/<sha8>.<ext>
// Passing explicit output dirs (as the tests do) writes elsewhere instead.
//
// <sourceDir> must contain index.html plus T01.html..T30.html and F01.html..F06.html, saved locally
// from https://nassarwafik.github.io/Book791381/ - this script never fetches over the network.
// Building the library is a deliberate, reviewable, offline/build-time step: no network or AI call
// ever happens at assignment-creation or student-answer time, only here.
//
// Every T and F file is converted. Conversion status per item is READY (all questions
// auto-gradable), NEEDS_REVIEW (some questions have no certain answer and are flagged for manual
// review - never guessed), or UNSUPPORTED (structural parse failure). Publishing status
// (publishable) is separate and true only for READY. Question images are externalized to standalone
// static files (content-addressed) so item JSON never carries base64. The build is idempotent: same
// source -> identical examQuestionId, asset filenames, and contentHash (only convertedAt varies).

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
const { externalizeSnapshotImages } = require("../api/src/lib/library-assets");

const REPO_DATA_DIR = path.join(__dirname, "..", "api", "src", "data", "exam-library");
const REPO_ASSETS_DIR = path.join(__dirname, "..", "public", "exam-library", "assets");

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

function buildLibrary(sourceDir, dataDir, assetsDir) {
  const outputDir = dataDir || REPO_DATA_DIR;
  const assetsOutputDir = assetsDir || REPO_ASSETS_DIR;
  const indexHtml = fs.readFileSync(path.join(sourceDir, "index.html"), "utf8");
  const catalogMeta = parseBookCatalogIndex(indexHtml);
  const metaById = new Map(catalogMeta.map(item => [item.libraryItemId, item]));

  const files = fs.readdirSync(sourceDir);
  const catalog = [];
  const report = [];
  let assetsWritten = 0;
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
    // Externalize every question image to a static file and replace its base64 with a served URL,
    // so the item JSON (and the Functions bundle) never carries multi-megabyte data: URIs.
    const externalized = externalizeSnapshotImages({ ...snapshot, questions: cleanQuestions }, code, assetsOutputDir);
    const storedSnapshot = externalized;

    const itemJson = JSON.stringify({ schemaVersion: 1, examSnapshot: storedSnapshot }, null, 2);
    // Hard guard: no data: URI may survive into a stored item (that would defeat the whole point).
    if (/data:[\w/+.-]+;base64,/.test(itemJson)) {
      throw new Error(code + ": a base64 data: URI leaked into the stored item JSON after externalization");
    }
    assetsWritten += storedSnapshot.questions.reduce((sum, q) => sum + (q.image && q.image.assets ? q.image.assets.length : 0), 0);

    const publishable = status === "ready";
    const contentHash = sha256(JSON.stringify(storedSnapshot.questions));
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
      conversionStatus: status,
      publishable,
      autoGradableCount: cleanQuestions.length - reviewQuestions.length,
      manualReviewCount: reviewQuestions.length,
      libraryVersion: 1,
      sourceSha: sha256(sourceHtml),
      contentHash,
      convertedAt: now,
      source: { repository: "Book791381", sourceFile: file }
    };

    // catalog.json stays small: metadata only, never the examSnapshot (loaded per-item on demand).
    fs.writeFileSync(
      path.join(outputDir, "items", code + ".json"),
      JSON.stringify({ ...catalogItem, schemaVersion: 1, examSnapshot: storedSnapshot }, null, 2)
    );

    catalog.push(catalogItem);
    report.push({
      file,
      libraryItemId: code,
      conversionStatus: status,
      publishable,
      questionCount: cleanQuestions.length,
      autoGradableCount: cleanQuestions.length - reviewQuestions.length,
      manualReviewCount: reviewQuestions.length,
      manualReviewReasons: [...new Set(reviewQuestions.map(q => q.teacherNote))]
    });
  }

  fs.writeFileSync(path.join(outputDir, "catalog.json"), JSON.stringify(catalog, null, 2));
  fs.writeFileSync(path.join(outputDir, "quality-report.json"), JSON.stringify(report, null, 2));

  return { catalog, report, assetsWritten, dataDir: outputDir, assetsDir: assetsOutputDir };
}

function main() {
  const sourceDir = process.argv[2];
  const dataDir = process.argv[3];
  const assetsDir = process.argv[4];

  if (!sourceDir) {
    console.error("Usage: node scripts/build-791381-library.cjs <sourceDir> [dataOutputDir] [assetsOutputDir]");
    process.exit(1);
  }

  const { catalog, report, assetsWritten, dataDir: usedData, assetsDir: usedAssets } = buildLibrary(sourceDir, dataDir, assetsDir);
  const ready = report.filter(item => item.conversionStatus === "ready").length;
  const needsReview = report.filter(item => item.conversionStatus === "needs_review").length;
  const unsupported = report.filter(item => item.conversionStatus === "unsupported").length;

  console.log("Built " + catalog.length + " library items from " + report.length + " files: " +
    ready + " ready, " + needsReview + " needs_review, " + unsupported + " unsupported.");
  console.log("Assets externalized: " + assetsWritten + " image refs. Data: " + usedData + " | Assets: " + usedAssets);
}

if (require.main === module) {
  main();
}

module.exports = { buildLibrary, validateTExamSnapshot, extractTQuestions };
