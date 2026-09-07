// Loads the bundled default Project-794589 template (read-only, versioned in the repo like the exam
// library) and builds the per-class snapshot from it. A class snapshot is frozen at activation time
// so later edits to the default template never change a class that already started.
const fs = require("fs");
const path = require("path");

const PROGRAM_CODE = "794589";

// The current default-template version. Bumped to 2 when the stage set/semantics changed (the old
// 50-book/62-PT set was replaced by the approved 54-book/51-PT set). Class snapshots created before
// this carry a lower templateVersion and are upgraded version-aware (see project-794589-migration).
const TEMPLATE_VERSION = 2;

const TEMPLATE_CANDIDATES = [
  path.join(process.cwd(), "src", "data", "project-794589", "default-template.json"),
  path.join(__dirname, "..", "data", "project-794589", "default-template.json")
];

let cached = null;
function loadDefaultTemplate() {
  if (cached) return cached;
  for (const candidate of TEMPLATE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      cached = JSON.parse(fs.readFileSync(candidate, "utf8"));
      return cached;
    }
  }
  throw new Error("Project 794589 default template not found.");
}

// Deep-clones the default template into a class snapshot. classId/timestamps are the caller's; the
// snapshot carries its own copy of groups/stages/weights/config so it evolves independently.
function buildClassSnapshotFromDefault(classId, now) {
  const template = loadDefaultTemplate();
  const clone = JSON.parse(JSON.stringify(template));
  return {
    schemaVersion: 1,
    programCode: PROGRAM_CODE,
    classId,
    templateVersion: clone.templateVersion,
    trackWeights: clone.trackWeights,
    config: clone.config,
    groups: clone.groups,
    stages: clone.stages,
    createdAt: now,
    updatedAt: now
  };
}

// Builds a fresh V2 snapshot to replace an outdated one, preserving the original createdAt so the
// class keeps its activation date. Used only for the safe (progress-free) auto-upgrade path.
function buildUpgradedSnapshot(existing, classId, now) {
  const fresh = buildClassSnapshotFromDefault(classId, now);
  fresh.createdAt = (existing && existing.createdAt) || now;
  fresh.upgradedAt = now;
  fresh.upgradedFromVersion = existing ? (Number(existing.templateVersion) || 1) : null;
  return fresh;
}

module.exports = { PROGRAM_CODE, TEMPLATE_VERSION, loadDefaultTemplate, buildClassSnapshotFromDefault, buildUpgradedSnapshot, TEMPLATE_CANDIDATES };
