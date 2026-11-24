import { useRef, useState } from "react";
import { backgroundOf, saveDrawing } from "./drawingExport";

/** Visual lab V13 (§23) — «حفظ صورة» above a drawing: saves the drawing next to it (the SVG in the same `.lab-drawing`) as a picture. */
const SAID = { saving: "جارٍ حفظ الصورة…", png: "حُفظت الصورة (PNG) في مجلد التنزيلات.", svg: "حُفظت الصورة بصيغة SVG في مجلد التنزيلات.", failed: "تعذّر حفظ الصورة." } as const;

export default function SaveDrawing({ fileName }: { fileName: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"" | keyof typeof SAID>("");
  const save = async () => {
    const svg = ref.current?.parentElement?.querySelector<SVGSVGElement>("svg");
    if (!svg) return;
    setState("saving");
    try { setState(await saveDrawing(svg, fileName, backgroundOf(svg))); }
    catch { setState("failed"); }
  };
  return (
    <div ref={ref} className="lab-drawing-tools">
      <button type="button" className="stt-btn lab-save-btn" onClick={save} disabled={state === "saving"} data-testid="save-drawing">حفظ صورة</button>
      <span className="stt-hint" role="status">{state ? SAID[state] : ""}</span>
    </div>
  );
}
