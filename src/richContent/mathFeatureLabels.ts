// Phase 21A — the Arabic label of every Scientific Math feature (builder palette only). A separate module so the palette file exports only its
// component (fast refresh) and the labels can be tested without rendering.
/** The Arabic label of every feature (a missing label is a test failure, so a new feature can never appear unlabeled). */
export const MATH_FEATURE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  fractions: "كسر", roots: "جذر", scripts: "أس ودليل", greek: "حروف يونانية", relations: "علاقات ومقارنات", text: "نص داخل الصيغة", fences: "أقواس متمددة",
  derivatives: "مشتقة", secondDerivatives: "مشتقة ثانية", partialDerivatives: "مشتقة جزئية", integrals: "تكامل محدد", multipleIntegrals: "تكامل ثنائي",
  largeOperators: "مجموع", limits: "نهاية", matrices: "مصفوفة 2×2", determinants: "محدد", cases: "دالة متعددة القواعد / نظام", aligned: "معادلات متحاذية",
  complex: "عدد مركب ومرافقه", complexParts: "الجزء الحقيقي والتخيلي", numberSets: "مجموعات الأعداد", scientificNotation: "ترميز علمي", units: "وحدات SI",
  chemistry: "صيغة كيميائية وشحنة", chemicalEquations: "معادلة كيميائية", equilibrium: "اتزان كيميائي", ohmsLaw: "قانون أوم", electricity: "مفاعلة كهربائية",
  vectors: "متجهات", geometry: "زوايا وتعامد"
});
