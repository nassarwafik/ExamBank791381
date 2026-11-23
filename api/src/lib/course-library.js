// The book's own classes for a course whose programs are written against them — «مبنى المعطيات» (899271d): Node, Node<T>,
// BinNode<T>, Stack<T> (Push / Pop / Top / IsEmpty) and Queue<T> (Insert / Remove / Head / IsEmpty), exactly as the book writes them
// (scripts/ds-course/unit4/Unit4.cs, proven with the real C# compiler by scripts/ds-course/prove-dotnet.mjs; the copy in
// api/src/data/course-libraries/ is drift-guarded by api/tests/course-library.test.js).
//
// The student tool bar's C# editor (books only) runs the learner's program WITH these classes, so `new Stack<int>()` is the book's
// stack — not System.Collections.Generic.Stack<T>: a type of the global namespace is found before the implicit usings.
//   • APPENDED after the program, so a compiler line number is still the writer's own line number;
//   • a class the writer declares (same name and number of type parameters — e.g. a «write the Stack class» exercise) is LEFT OUT,
//     so the writer's own version is the one compiled and nothing is declared twice.
const fs = require("fs");
const path = require("path");

const FILES = Object.freeze({ "899271d": "899271d.cs" });
const CACHE = new Map();

/** The library's top-level classes, in file order: [{ key: "Name/arity", code }]. Own properties only; unknown course → []. */
function libraryClasses(courseId) {
  if (!Object.prototype.hasOwnProperty.call(FILES, courseId)) return [];
  if (CACHE.has(courseId)) return CACHE.get(courseId);
  const text = fs.readFileSync(path.join(__dirname, "..", "data", "course-libraries", FILES[courseId]), "utf8");
  const classes = [];
  const head = /^public class ([A-Za-z_]\w*)\s*(<([^>]*)>)?/gm;
  let m;
  while ((m = head.exec(text))) {
    const open = text.indexOf("{", m.index);
    let depth = 0, end = open;
    for (; end < text.length; end++) {
      if (text[end] === "{") depth++;
      else if (text[end] === "}" && --depth === 0) break;
    }
    classes.push({ key: m[1] + "/" + (m[2] ? m[3].split(",").length : 0), code: text.slice(m.index, end + 1) });
    head.lastIndex = end + 1;
  }
  const frozen = Object.freeze(classes.map(c => Object.freeze(c)));
  CACHE.set(courseId, frozen);
  return frozen;
}

/** "Name/arity" of every class / struct / interface / record the writer declares. */
function declaredTypes(source) {
  const out = new Set();
  const decl = /\b(?:class|struct|interface|record)\s+([A-Za-z_]\w*)\s*(<([^>]*)>)?/g;
  let m;
  while ((m = decl.exec(String(source)))) out.add(m[1] + "/" + (m[2] ? m[3].split(",").length : 0));
  return out;
}

/** The program the runner compiles: the (wrapped) program, then the course's classes the writer did not declare. */
function withCourseLibrary(courseId, program, writerSource) {
  const own = declaredTypes(writerSource);
  const parts = libraryClasses(courseId).filter(c => !own.has(c.key)).map(c => c.code);
  return parts.length ? program + "\n" + parts.join("\n\n") + "\n" : program;
}

/** The whole library as one C# file (its classes in file order), for the teacher's in-browser C# lab, which leaves out the writer's
 *  own classes itself with the same rule (tools/csharp-lab/Lab.cs). Unknown course → "". */
function libraryText(courseId) {
  return libraryClasses(courseId).map(c => c.code).join("\n\n");
}

module.exports = { libraryClasses, declaredTypes, withCourseLibrary, libraryText };
