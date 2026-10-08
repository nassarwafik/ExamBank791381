import { MATH_FEATURES, type MathFeatureGroup } from "./mathFeatures";

// Phase 21A — the Scientific Math v2 SNIPPET PALETTE (builder only; a lazy chunk of the lazy rich-content editor). Every snippet is a
// code-owned feature example from mathFeatures.ts — proven by test to be accepted by the ONE parser — so the palette can only insert
// supported syntax. It is a syntax helper, not a WYSIWYG formula editor: the source field remains the authority.
const GROUPS: readonly [MathFeatureGroup, string][] = [
  ["basic", "أساسيات"], ["calculus", "التفاضل والتكامل"], ["linearAlgebra", "المصفوفات والأنظمة"],
  ["complex", "الأعداد المركبة والمجموعات"], ["science", "العلوم والوحدات"], ["geometry", "المتجهات والهندسة"]
];
/** The Arabic label of every feature (a missing label is a test failure, so a new feature can never appear unlabeled). */
export const MATH_FEATURE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  fractions: "كسر", roots: "جذر", scripts: "أس ودليل", greek: "حروف يونانية", relations: "علاقات ومقارنات", text: "نص داخل الصيغة", fences: "أقواس متمددة",
  derivatives: "مشتقة", secondDerivatives: "مشتقة ثانية", partialDerivatives: "مشتقة جزئية", integrals: "تكامل محدد", multipleIntegrals: "تكامل ثنائي",
  largeOperators: "مجموع", limits: "نهاية", matrices: "مصفوفة 2×2", determinants: "محدد", cases: "دالة متعددة القواعد / نظام", aligned: "معادلات متحاذية",
  complex: "عدد مركب ومرافقه", complexParts: "الجزء الحقيقي والتخيلي", numberSets: "مجموعات الأعداد", scientificNotation: "ترميز علمي", units: "وحدات SI",
  chemistry: "صيغة كيميائية وشحنة", chemicalEquations: "معادلة كيميائية", equilibrium: "اتزان كيميائي", ohmsLaw: "قانون أوم", electricity: "مفاعلة كهربائية",
  vectors: "متجهات", geometry: "زوايا وتعامد"
});

export default function MathSnippetPalette({ onInsert, disabled }: { onInsert: (snippet: string) => void; disabled?: boolean }) {
  return (
    <div className="rc-math-palette" role="group" aria-label="نماذج الصيغ الرياضية">
      {GROUPS.map(([group, title]) => (
        <div className="rc-math-group" key={group}>
          <p className="rc-math-group-title">{title}</p>
          <div className="rc-math-snippets">
            {MATH_FEATURES.filter(f => f.group === group).map(f => (
              <button type="button" className="sb-mini-btn rc-math-snippet" key={f.id} data-feature={f.id} title={f.example} onClick={() => onInsert(f.example)} disabled={disabled}>
                {MATH_FEATURE_LABELS[f.id]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
