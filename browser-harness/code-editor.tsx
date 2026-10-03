import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import CodingEditor from "../src/coding/CodingEditor";
import { CODING_LANGUAGES } from "../src/codingQuestion";

// Phase 17F-C1 — the real-browser harness: mounts the ONE CodingEditor exactly as CodingResponse / CodingQuestionEditor do (value /
// onChange / language / label / readOnly / maxBytes) inside an RTL page, with the three validation sources of the phase. Driven by
// scripts/check-code-editor-browser.mjs; never shipped (only index.html is a production entry).
const SAMPLES: Record<string, string> = {
  python: "def main():\n    x = 5\n    print(x)\n",
  java: "public class Main {\n    public static void main(String[] args) {\n        int x = 5;\n        System.out.println(x);\n    }\n}\n",
  csharp: "public class Program {\n    public static void Main() {\n        int x = 5;\n        System.Console.WriteLine(x);\n    }\n}\n"
};
declare global { interface Window { __harness: { value: () => string; language: () => string; changes: string[] } } }

function Harness() {
  const [language, setLanguage] = useState("python");
  const [source, setSource] = useState(SAMPLES.python);
  const [changes] = useState<string[]>([]);
  const [limited, setLimited] = useState("abc");
  window.__harness = { value: () => source, language: () => language, changes };
  return <>
    <h1 style={{ fontSize: 18, margin: 0 }}>محرر الكود — صفحة التحقق</h1>
    <div data-testid="language-bar" style={{ display: "flex", gap: 8 }}>
      {CODING_LANGUAGES.map(l => <button key={l.key} type="button" data-language={l.key} aria-pressed={l.key === language} onClick={() => { setLanguage(l.key); setSource(SAMPLES[l.key]); }}>{l.label}</button>)}
      <button type="button" data-action="switch-keep" onClick={() => setLanguage(language === "python" ? "java" : "python")}>تبديل اللغة مع إبقاء الكود</button>
    </div>
    <section data-testid="main-editor">
      <CodingEditor value={source} onChange={next => { changes.push(next); setSource(next); }} language={language} label="محرر الكود" maxBytes={65536} />
    </section>
    <section data-testid="limited-editor">
      <CodingEditor value={limited} onChange={setLimited} language="python" label="محرر محدود" maxBytes={8} />
    </section>
    <section data-testid="readonly-editor">
      <CodingEditor value={"x = 1\n"} onChange={() => {}} language="python" label="محرر للقراءة" readOnly />
    </section>
    <button type="button" data-action="after">زر بعد المحرر</button>
  </>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
