// Central registry for all Project Tracker projects. This is the SINGLE SOURCE OF TRUTH that maps a
// projectCode to its definition (title, tracks, default template) and to its storage namespace.
// Adding a new project = one entry here + one default-template.json data file. No `if (code===...)`
// scattered across the codebase.
//
// CRITICAL COMPATIBILITY: project 794589 already has production data under its original, un-namespaced
// blob paths. Its storage namespace below returns those exact legacy paths. New projects get their own
// isolated namespaces, so data can never collide or leak between projects.
const fs = require("fs");
const path = require("path");
const { loadDefaultTemplate: load794589Template, TEMPLATE_VERSION: V794589, buildUpgradedSnapshot: buildUpgraded794589 } = require("../project-794589-template");

// Track metadata is owned here (the source of truth for track ids/titles/icons), independent of any
// class snapshot, so the UI and reports can label tracks without hard-coding "book"/"packetTracer".
const DEFINITIONS = {
  "794589": {
    projectCode: "794589",
    title: "مشروع 794589",
    tracks: [
      { trackId: "book", title: "الكتاب", icon: "📘" },
      { trackId: "packetTracer", title: "Packet Tracer", icon: "🖧" }
    ],
    legacyStorage: true,
    loadTemplate: () => load794589Template(),
    // 794589 keeps its original version-aware snapshot upgrade (a progress-free active class on an
    // older template is upgraded to the current version, audited, never reset). New projects declare
    // no policy (no migration needed).
    snapshotUpgrade: { currentVersion: V794589, buildUpgraded: buildUpgraded794589 }
  },
  "899373": {
    projectCode: "899373",
    title: "مشروع 899373",
    tracks: [
      { trackId: "book", title: "الكتاب", icon: "📘" },
      { trackId: "access", title: "Access", icon: "🗄️" }
    ],
    loadTemplate: () => loadTemplateFile("899373")
  },
  "883589": {
    projectCode: "883589",
    title: "مشروع 883589",
    tracks: [
      { trackId: "book", title: "الكتاب", icon: "📘" },
      { trackId: "visualStudio", title: "Visual Studio", icon: "🧩" }
    ],
    loadTemplate: () => loadTemplateFile("883589")
  }
};

const templateCache = {};
function templateCandidates(projectCode) {
  const rel = ["data", "project-" + projectCode, "default-template.json"];
  return [
    path.join(process.cwd(), "src", ...rel),
    path.join(__dirname, "..", "..", ...rel)
  ];
}
function loadTemplateFile(projectCode) {
  if (templateCache[projectCode]) return templateCache[projectCode];
  for (const candidate of templateCandidates(projectCode)) {
    if (fs.existsSync(candidate)) {
      templateCache[projectCode] = JSON.parse(fs.readFileSync(candidate, "utf8"));
      return templateCache[projectCode];
    }
  }
  throw new Error("Default template not found for project " + projectCode);
}

function getSupportedProjects() {
  return Object.keys(DEFINITIONS);
}
function isSupportedProject(projectCode) {
  return Object.prototype.hasOwnProperty.call(DEFINITIONS, String(projectCode || ""));
}

// Returns the full definition merged with its template (tracks/trackWeights/config/groups/stages).
function getProjectDefinition(projectCode) {
  const def = DEFINITIONS[String(projectCode || "")];
  if (!def) throw new Error("Unknown project code: " + projectCode);
  const tpl = def.loadTemplate();
  return {
    projectCode: def.projectCode,
    title: def.title,
    tracks: def.tracks,
    templateVersion: tpl.templateVersion,
    trackWeights: tpl.trackWeights,
    config: tpl.config,
    groups: tpl.groups,
    stages: tpl.stages
  };
}

// Lightweight metadata for the projects hub / registry listing (no heavy template payload).
function getProjectMeta(projectCode) {
  const def = DEFINITIONS[String(projectCode || "")];
  if (!def) throw new Error("Unknown project code: " + projectCode);
  return { projectCode: def.projectCode, title: def.title, tracks: def.tracks };
}

// The snapshot-upgrade policy for a project, or null when the project needs no version migration.
function getSnapshotUpgradePolicy(projectCode) {
  const def = DEFINITIONS[String(projectCode || "")];
  return def && def.snapshotUpgrade ? def.snapshotUpgrade : null;
}

// Storage namespace. 794589 => exact legacy paths (production data preserved). Others => isolated,
// project-scoped paths so no two projects ever touch the same blob.
function getStorageNamespace(projectCode) {
  const code = String(projectCode || "");
  if (!isSupportedProject(code)) throw new Error("Unknown project code: " + code);
  if (DEFINITIONS[code].legacyStorage) {
    return {
      projectCode: code,
      configName: classId => "platform/project-trackers/classes/" + classId + ".json",
      progressPrefix: classId => "platform/project-progress/" + classId + "/",
      progressName: (classId, studentId) => "platform/project-progress/" + classId + "/" + studentId + ".json"
    };
  }
  return {
    projectCode: code,
    configName: classId => "platform/project-trackers/" + code + "/classes/" + classId + ".json",
    progressPrefix: classId => "platform/project-progress/" + code + "/" + classId + "/",
    progressName: (classId, studentId) => "platform/project-progress/" + code + "/" + classId + "/" + studentId + ".json"
  };
}

module.exports = {
  getSupportedProjects,
  isSupportedProject,
  getProjectDefinition,
  getProjectMeta,
  getSnapshotUpgradePolicy,
  getStorageNamespace
};
