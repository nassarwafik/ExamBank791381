import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import CodingEditor from "../src/coding/CodingEditor";
import CodingWorkspace from "../src/coding/workspace/CodingWorkspace";
import { CODING_LANGUAGES } from "../src/codingQuestion";

// Phase 17F-C1 — the real-browser harness: mounts the ONE CodingEditor exactly as CodingResponse / CodingQuestionEditor do (value /
// onChange / language / label / readOnly / maxBytes) inside an RTL page, with the three validation sources of the phase. Driven by
// scripts/check-code-editor-browser.mjs; never shipped (only index.html is a production entry).
// Phase 18B (RF1-2) adds the enterprise WORKSPACE surface (CodingWorkspace: toolbar, language / contract-version badge, editor
// preferences, focus mode) mounted exactly as CodingResponse mounts it, with its own value / onChange record and a re-render
// control, so the real-browser check can prove the 18B behaviour (focus mode keeps the instance, preferences are computed style only
// and never an onChange, phone font size follows the preference, preference survives re-render and reload).
const SAMPLES: Record<string, string> = {
  python: "def main():\n    x = 5\n    print(x)\n",
  java: "public class Main {\n    public static void main(String[] args) {\n        int x = 5;\n        System.out.println(x);\n    }\n}\n",
  csharp: "public class Program {\n    public static void Main() {\n        int x = 5;\n        System.Console.WriteLine(x);\n    }\n}\n"
};
declare global { interface Window { __harness: { value: () => string; language: () => string; changes: string[]; workspace: { value: () => string; changes: string[]; renders: number } } } }

function Harness() {
  const [language, setLanguage] = useState("python");
  const [source, setSource] = useState(SAMPLES.python);
  const [changes] = useState<string[]>([]);
  const [limited, setLimited] = useState("abc");
  const [wsSource, setWsSource] = useState(SAMPLES.python);
  const [wsChanges] = useState<string[]>([]);
  const [renders, setRenders] = useState(0);
  useEffect(() => { window.__harness = { value: () => source, language: () => language, changes, workspace: { value: () => wsSource, changes: wsChanges, renders } }; });   // read by the driver
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
    <section data-testid="workspace-section" data-renders={renders}>
      <CodingWorkspace value={wsSource} onChange={next => { wsChanges.push(next); setWsSource(next); }} language="python" languageVersion={1} label="محرر مساحة العمل" title="السؤال 1" testId="workspace" maxBytes={65536}
        toolbarStart={<button type="button" data-action="rerender" onClick={() => setRenders(n => n + 1)}>إعادة التصيير</button>}>
        <button type="button" data-action="ws-after">زر داخل المساحة</button>
      </CodingWorkspace>
    </section>
  </>;
}
export default Harness;
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
