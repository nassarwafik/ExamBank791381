// Loads the bundled default Project-794589 template (read-only, versioned in the repo like the exam
// library) and builds the per-class snapshot from it. A class snapshot is frozen at activation time
// so later edits to the default template never change a class that already started.
const fs = require("fs");
const path = require("path");

const PROGRAM_CODE = "794589";

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

module.exports = { PROGRAM_CODE, loadDefaultTemplate, buildClassSnapshotFromDefault, TEMPLATE_CANDIDATES };
