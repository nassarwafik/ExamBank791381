import { codeStimulusLanguageLabel, projectCodeStimulusForStudent } from "../codeStimulus";

// Phase 19F — the ONE read-only presentation of a question's code stimulus (student exam, teacher preview, compound questions). It
// renders ONLY the strict projection (a malformed stimulus renders nothing) as a TEXT child of <pre><code> — never HTML, never
// highlighted by a library, never executed — left-to-right inside the RTL page, focusable so a keyboard user can scroll it, and
// named for assistive technology by its caption (or «كود السؤال بلغة …»).
export default function CodeStimulusView({ stimulus, testId = "code-stimulus" }: { stimulus: unknown; testId?: string }) {
  if (stimulus === undefined || stimulus === null) return null;
  const s = projectCodeStimulusForStudent(stimulus);
  if (!s) return null;
  const lang = codeStimulusLanguageLabel(s.language);
  const name = s.label ? s.label + " (" + lang + ")" : "كود السؤال بلغة " + lang;
  return (
    <figure className="iex-code-stimulus" data-testid={testId}>
      <figcaption><span>{s.label || "الكود"}</span> <bdi dir="ltr">{lang}</bdi></figcaption>
      <pre dir="ltr" lang="en" tabIndex={0} aria-label={name}><code>{s.source}</code></pre>
    </figure>
  );
}
