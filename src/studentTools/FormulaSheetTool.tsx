import type { FormulaSheetToolV1 } from "./studentToolsSpec";
import RichContentRenderer from "../richContent/RichContentRenderer";

// Phase T5 — the teacher's formula sheet, read-only. The content is the canonical rich-content document the spec validated (text, maths,
// tables only); it is drawn by the platform's one rich-content renderer. Its own lazy chunk (the maths renderer stays off the dock).
export default function FormulaSheetTool({ config }: { config: FormulaSheetToolV1 }) {
  return (
    <div className="stt-sheet" data-testid="tool-formulaSheet">
      <p className="stt-hint">{config.title} — من إعداد المعلم.</p>
      <RichContentRenderer content={config.content} />
    </div>
  );
}
