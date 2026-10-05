// Phase 19F — the coding LANGUAGE registry + the pure UTF-8 byte counter, moved VERBATIM from codingQuestion.ts (which re-exports
// every name unchanged) so the coding@3 locked-template module can depend on them without an import cycle. Pure: no React / DOM / I/O.
// (Comments below are the original Phase 17A / 17E-A text.)

export type CodingLanguageCapabilities = { compile: boolean; run: boolean; stdin: boolean; tests: boolean };
/** A language CONTRACT (not a runtime): `capabilities` say what the stdin/stdout program model can mean for this language —
 *  whether an execution provider actually offers it is a separate, provider-reported fact. */
export type CodingLanguageDefinition = { key: string; version: number; label: string; extension: string; editorLanguage: string; indentUnit: string; capabilities: CodingLanguageCapabilities; starterTemplate: string };

const lang = (key: string, label: string, extension: string, indentUnit: string, flags: string, starterTemplate = ""): CodingLanguageDefinition =>
  Object.freeze({ key, version: 1, label, extension, editorLanguage: key, indentUnit, capabilities: Object.freeze({ compile: flags.includes("c"), run: flags.includes("r"), stdin: flags.includes("r"), tests: flags.includes("r") }), starterTemplate });
// Phase 17E-A — the MINIMAL, pedagogically neutral starter shell of a language (registry data, one place): what the trusted
// runner needs to compile an empty stdin/stdout program and nothing else (no solution, no I/O idiom, no test material). Java
// must be `public class Main` (the runner compiles Main.java and runs Main); C# any class with a static Main (Program.cs).
// A Python script needs no shell, so its template is empty. Templates are offered to the teacher, never imposed on stored code.
const JAVA_TEMPLATE = "public class Main {\n    public static void main(String[] args) {\n    }\n}\n";
const CSHARP_TEMPLATE = "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n    }\n}\n";
/** Coding Assessment V1 intentionally supports exactly Python, Java and C# (stable order). No JavaScript, TypeScript, C++ or
 *  SQL in V1: an unregistered key fails closed everywhere (finalization, student projection, server answer ingestion). The
 *  registry stays data-driven so a language can be ADDED later through a reviewed change — never by branching on a key. */
export const CODING_LANGUAGES: readonly CodingLanguageDefinition[] = Object.freeze([
  lang("python", "Python", ".py", "    ", "r"),
  lang("java", "Java", ".java", "    ", "cr", JAVA_TEMPLATE),
  lang("csharp", "C#", ".cs", "    ", "cr", CSHARP_TEMPLATE)
]);
const LANGUAGE_INDEX = new Map(CODING_LANGUAGES.map(l => [l.key, l]));
export const codingLanguage = (key: unknown): CodingLanguageDefinition | undefined => (typeof key === "string" ? LANGUAGE_INDEX.get(key) : undefined);
export const isCodingLanguage = (key: unknown): boolean => codingLanguage(key) !== undefined;
/** The registry starter template of a language ("" for an unknown language or one that needs no shell). */
export const codingStarterTemplate = (key: unknown): string => codingLanguage(key)?.starterTemplate ?? "";
export const CODING_LANGUAGE_KEY_PATTERN = /^[a-z][a-z0-9]{0,31}$/;
/** The absolute ceiling of a stored source (UTF-8 bytes) — enforced by the client editor AND by the server on every ingest. */
export const CODE_SOURCE_MAX_BYTES = 65536;

/** UTF-8 byte length without TextEncoder (pure; same result in the browser and the server). */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
