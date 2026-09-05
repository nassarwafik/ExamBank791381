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

const T_FILE_REGEX = /^T(\d{2})\.html$/;
const F_FILE_REGEX = /^F(\d{2})\.html$/;

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function extractTQuestions(html) {
  const match = /\bconst\s+QUESTIONS\s*=\s*(?=\[)/.exec(html);
  if (!match) {
    throw new Error("No 'const QUESTIONS = [...]' array found in this file.");
  }
  return parseLiteral(html.slice(match.index + match[0].length)).value;
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

    if (fMatch) {
      report.push({
        file,
        libraryItemId: code,
        status: "unsupported",
        reason: "F-series schema not yet reverse-engineered in this phase (see Discovery report, Phase A/Z) - needs its own dedicated converter."
      });
      continue;
    }

    const sourceHtml = fs.readFileSync(path.join(sourceDir, file), "utf8");
    const examId = "LIB-" + code;
    const meta = metaById.get(code) || null;

    let snapshot = null;
    let issues = [];
    try {
      const rawQuestions = extractTQuestions(sourceHtml);
      const title = meta ? meta.title : code;
      snapshot = buildTExamSnapshot(examId, title, rawQuestions);
      issues = validateTExamSnapshot(snapshot, meta ? meta.questionCount : undefined);
    }
    catch (error) {
      issues = ["parse error: " + error.message];
    }

    if (issues.length || !snapshot) {
      report.push({ file, libraryItemId: code, status: "unsupported", reason: issues.join("; ") || "unknown parse failure" });
      continue;
    }

    const contentHash = sha256(JSON.stringify(snapshot.questions));
    const catalogItem = {
      libraryItemId: code,
      title: snapshot.title,
      category: meta ? meta.category : "",
      description: meta ? meta.description : "",
      tags: meta ? meta.tags : [],
      questionCount: snapshot.questions.length,
      totalMarks: snapshot.totalMarks,
      pageRange: meta ? meta.pageRange : "",
      parserFamily: "t-series-v1",
      libraryVersion: 1,
      sourceSha: sha256(sourceHtml),
      contentHash,
      convertedAt: now,
      source: { repository: "Book791381", sourceFile: file }
    };

    fs.writeFileSync(
      path.join(outputDir, "items", code + ".json"),
      JSON.stringify({ ...catalogItem, schemaVersion: 1, examSnapshot: snapshot }, null, 2)
    );

    catalog.push(catalogItem);
    report.push({ file, libraryItemId: code, status: "ready", questionCount: snapshot.questions.length });
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
  const readyCount = report.filter(item => item.status === "ready").length;
  const unsupportedCount = report.filter(item => item.status === "unsupported").length;

  console.log("Built " + catalog.length + " library items (" + readyCount + " ready, " + unsupportedCount + " unsupported). Output: " + outputDir);
}

if (require.main === module) {
  main();
}

module.exports = { buildLibrary, validateTExamSnapshot, extractTQuestions };
