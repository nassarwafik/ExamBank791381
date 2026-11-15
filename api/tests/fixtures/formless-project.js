// Phase F1c — every bundled project ships an exam form now, so the «this project has no form» branch of the routes has no
// real example left. That branch stays (a project added later may ship none), and it stays tested: this fixture loads FRESH
// copies of the three routes over a registry that answers «no form» for ONE project, then puts the module cache back exactly
// as it was. Nothing in src/ knows about it, and the copies it returns never replace the real ones.
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "src") + path.sep;
const REGISTRY = require.resolve(path.join(SRC, "lib", "project-tracker", "registry.js"));
const ROUTE = name => require.resolve(path.join(SRC, "functions", name + ".js"));

function routesWithFormlessProject(projectCode) {
  const code = String(projectCode);
  const registry = require(REGISTRY);
  if (!registry.isSupportedProject(code)) throw new Error("formless fixture: unknown project " + code);
  const real = registry.getExamFormTemplate;
  const mine = file => file.startsWith(SRC) && file !== REGISTRY;
  const saved = Object.keys(require.cache).filter(mine).map(file => [file, require.cache[file]]);
  for (const [file] of saved) delete require.cache[file];
  registry.getExamFormTemplate = asked => (String(asked) === code ? null : real(asked));
  try {
    return {
      tracker: require(ROUTE("project-tracker")).handler,
      studentForm: require(ROUTE("student-project-exam-form")).handler,
      studentTracker: require(ROUTE("student-project-tracker")).handler
    };
  } finally {
    registry.getExamFormTemplate = real;
    for (const file of Object.keys(require.cache).filter(mine)) delete require.cache[file];
    for (const [file, cached] of saved) require.cache[file] = cached;
  }
}

module.exports = { routesWithFormlessProject };
