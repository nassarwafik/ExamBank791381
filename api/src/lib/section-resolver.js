const fs = require("fs");
const path = require("path");

const VALID_SECTIONS = ["BASIC", "INFRASTRUCTURE"];

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

let cachedMap = null;
function loadTopicSectionMap() {
  if (!cachedMap) {
    cachedMap = loadConfig("topic-section-map.json");
  }
  return cachedMap;
}

// Resolves a section for a topic using the empirically-derived topic-section-map.json (majority
// section per topic in the live bank, see that file's description). Below the configured
// confidence threshold, or for an unknown/null topic, returns section:null so the caller can fall
// back to asking the teacher explicitly rather than guessing - some topics (CISCO_CLI, DHCP,
// ROUTING, SWITCHING) are genuinely used in both sections and a name-based guess would be wrong
// often enough to matter.
function resolveSectionFromTopic(topic) {
  const config = loadTopicSectionMap();
  const entry = topic ? config.mapping[topic] : null;

  if (!entry) {
    return { section: null, confidence: 0, reason: "unknown-topic" };
  }

  if (entry.confidence < config.confidenceThreshold) {
    return { section: null, confidence: entry.confidence, reason: "low-confidence" };
  }

  return { section: entry.section, confidence: entry.confidence, reason: "topic-majority" };
}

// Strict validation used both server-side (bank-import-action.js, mandatory) and mirrored
// client-side: exactly "BASIC" or "INFRASTRUCTURE" - never "LEGACY", null, undefined, or anything
// else. This is the single source of truth both sides must agree with.
function isValidBankSection(value) {
  return VALID_SECTIONS.includes(value);
}

module.exports = { VALID_SECTIONS, resolveSectionFromTopic, isValidBankSection };
