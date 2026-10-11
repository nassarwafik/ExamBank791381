// Phase 21D-D.2 — deterministic Arabic acceptance exam for chemistryReactions@1: balancing (water, iron with a given coefficient, a teacher's
// own equation), an ionic redox equation where charge must be conserved (dichromate / iron(II)), reaction families (decomposition, precipitation,
// neutralization) with role selections, and a shared composite context (methane combustion) graded by several linked parts. Plain data written
// the way a teacher's saved exam looks; the templates are the ones the teacher editor offers. The JSON fixture is generated from this source
// (drift-tested) and every decision about it is made by the production authorities.
import * as K from "../certification-20g/kit.js";
import { calciumCarbonateTemplate, customAluminiumTemplate, dichromateTemplate, ironTemplate, methaneTemplate, neutralizationTemplate, precipitationTemplate, waterTemplate } from "../../../src/chemistryReactions/rxnTemplates.ts";

export const REACTIONS_ACCEPTANCE_PATH = "docs/fixtures/chemistry-reactions-21dd2/ExamBank_21DD2_Chemistry_Reactions_Acceptance.json";
export const serializeExam = exam => JSON.stringify(exam, null, 2) + "\n";

/** Methane combustion shared by a composite question (exam mode: no live conservation table). */
export const methaneContext = () => ({ ...methaneTemplate().config, view: { conservation: false, particles: true, states: true, names: true } });

export function buildReactionsAcceptanceExam() {
  const sim = (id, text, marks, t) => K.smartSim(id, text, marks, "chemistryReactions", 1, t.config, t.checks);
  return K.exam("EXAMBANK-21DD2-CHEMISTRY-REACTIONS", "ExamBank 21D-D.2 — اختبار القبول لمحاكاة التفاعلات والمعادلات الكيميائية", [
    K.section("sec-a", "أ — وزن المعادلات", [
      sim("a1", "زِن معادلة تكوين الماء بأصغر أعداد صحيحة، ثم صنّف التفاعل.", 4, waterTemplate()),
      sim("a2", "معامل أكسيد الحديد (III) معطى. أكمل وزن المعادلة وحدّد المادة التي تتأكسد.", 5, ironTemplate()),
      sim("a3", "زِن معادلة تفاعل الألومنيوم مع الأكسجين، وحدّد المواد التي هي عناصر.", 5, customAluminiumTemplate())
    ]),
    K.section("sec-b", "ب — المعادلات الأيونية وحفظ الشحنة", [
      sim("b1", "معامل أيون الدايكرومات معطى. زِن المعادلة الأيونية بحيث تُحفظ الذرات والشحنة، وحدّد العامل المؤكسد والعامل المختزل.", 7, dichromateTemplate())
    ]),
    K.section("sec-c", "ج — أنواع التفاعلات", [
      sim("c1", "زِن معادلة التفكك الحراري لكربونات الكالسيوم، واختر كل الأنواع التي ينتمي إليها التفاعل.", 3, calciumCarbonateTemplate()),
      sim("c2", "زِن معادلة ترسيب كربونات الكالسيوم، واختر كل الأنواع التي ينتمي إليها التفاعل، وحدّد الراسب.", 4, precipitationTemplate()),
      sim("c3", "زِن معادلة تعادل هيدروكسيد المغنيسيوم مع حمض الهيدروكلوريك، وصنّف التفاعل، وحدّد الحمض والقاعدة.", 6, neutralizationTemplate())
    ]),
    K.section("sec-d", "د — سياق مشترك", [
      K.composite("d1", "استخدم معادلة احتراق الميثان المشتركة للإجابة.", 7,
        [K.simContext("ctxMethane", "احتراق الميثان", "chemistryReactions", 1, methaneContext())],
        [K.group("gA", "مرتبط بالمعادلة", [
          K.linkedSim("p1", "أ", "زِن معادلة احتراق الميثان بأصغر أعداد صحيحة.", 3, "ctxMethane", [
            { id: "balanced", label: "المعادلة موزونة", weight: 2, kind: "rxn.balanced" },
            { id: "lowest", label: "أصغر معاملات صحيحة", weight: 1, kind: "rxn.lowest" }
          ]),
          K.linkedSim("p2", "ب", "صنّف التفاعل وحدّد الوقود.", 2, "ctxMethane", [
            { id: "family", label: "تفاعل احتراق", weight: 1, kind: "rxn.classification", taskId: "family" },
            { id: "fuel", label: "الوقود هو الميثان", weight: 1, kind: "rxn.selection", taskId: "fuel" }
          ]),
          K.part("p3", "ج", K.mcq("x", "ماذا يعني أن المعادلة الكيميائية موزونة؟", 2, ["عدد ذرات كل عنصر (والشحنة الكلية) متساوٍ في الجهتين", "أن التفاعل يحدث بالتأكيد عند خلط المواد", "أن عدد الجزيئات في الجهتين متساوٍ"], 0))
        ])])
    ])
  ], { coverPage: K.cover("وزن المعادلات، حفظ الذرات والشحنة، أنواع التفاعلات", "اكتب أصغر أعداد صحيحة أمام المواد ولا تغيّر الأرقام الصغيرة داخل الصيغ. الوزن يحقق حفظ الذرات والشحنة ولا يثبت وحده أن التفاعل يحدث."), presentation: { schemaVersion: 1, preset: "modernAcademic" } });
}
