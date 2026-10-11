import type { ChemLabConfigV1 } from "../chemistryLabModel";

// Phase 21D-D.3 — the Arabic chemistryLab@1 authoring templates (teacher editor, the authoring starter, the acceptance exam and the tests).
// Every template is a complete, VALID question: the public config (given data and tasks) and the private weighted checks (task references
// only — every expected answer is derived by the plugin). Each states its educational objective.
export type ChemLabCheckSpec = { id: string; label: string; weight: number; kind: "lab.number" | "lab.choice" | "lab.prepared" | "lab.observed"; taskId: string };
export type ChemLabTemplate = { id: string; title: string; objective: string; config: ChemLabConfigV1; checks: ChemLabCheckSpec[] };

const check = (taskId: string, kind: ChemLabCheckSpec["kind"], label: string, weight = 1): ChemLabCheckSpec => ({ id: "c-" + taskId, label, weight, kind, taskId });

/** Lab A — prepare a standard solution from a solid. */
export const solidPrepareTemplate = (): ChemLabTemplate => ({
  id: "solidPrepare", title: "تحضير محلول قياسي من مادة صلبة", objective: "حساب الكتلة اللازمة m = c·V·M ووزنها وإكمال الحجم إلى العلامة، ثم حساب تركيز المحلول المحضّر.",
  config: {
    v: 1, experiment: { kind: "solutions", solute: "NaCl", source: "solid", stock: null, flasks: [100, 250], pipettes: [] }, view: { readouts: false, graph: false },
    tasks: [
      { id: "prep", label: "حضّر 250 mL من محلول كلوريد الصوديوم تركيزه 0.100 mol/L.", kind: "prepare", concentration: "0.100", volume: 250 },
      { id: "conc", label: "احسب تركيز المحلول الذي حضّرته.", kind: "number", quantity: "preparedConcentration", subject: null, other: null, at: null, unit: "mol/L", precision: { significant: 3 } },
      { id: "moles", label: "احسب عدد مولات NaCl في المحلول الذي حضّرته (بالملي مول).", kind: "number", quantity: "preparedMoles", subject: null, other: null, at: null, unit: "mmol", precision: { significant: 3 } }
    ]
  },
  checks: [check("prep", "lab.prepared", "حضّر المحلول المطلوب", 2), check("conc", "lab.number", "التركيز صحيح", 2), check("moles", "lab.number", "عدد المولات صحيح", 1)]
});
/** Lab A — dilute a stock solution (c₁V₁ = c₂V₂). */
export const dilutionTemplate = (): ChemLabTemplate => ({
  id: "dilution", title: "تخفيف محلول أم (c₁V₁ = c₂V₂)", objective: "اختيار الماصّة المناسبة لتخفيف محلول أم إلى تركيز مطلوب، وفهم أن كمية المادة المذابة لا تتغير بالتخفيف.",
  config: {
    v: 1, experiment: { kind: "solutions", solute: "CuSO4", source: "stock", stock: "0.500", flasks: [100, 250], pipettes: [10, 20, 25] }, view: { readouts: true, graph: true },
    tasks: [
      { id: "prep", label: "حضّر 100 mL من محلول كبريتات النحاس (II) تركيزه 0.0500 mol/L من المحلول الأم.", kind: "prepare", concentration: "0.0500", volume: 100 },
      { id: "conserved", label: "ما الذي يبقى ثابتًا عند التخفيف؟", kind: "choice", question: "conservedOnDilution", subject: null, other: null, mode: "multiple", options: ["moles", "concentration", "volume"] },
      { id: "moles", label: "احسب عدد مولات CuSO₄ في المحلول المخفَّف الذي حضّرته.", kind: "number", quantity: "preparedMoles", subject: null, other: null, at: null, unit: "mol", precision: { significant: 3 } }
    ]
  },
  checks: [check("prep", "lab.prepared", "التخفيف صحيح", 2), check("conserved", "lab.choice", "كمية المادة ثابتة", 1), check("moles", "lab.number", "عدد المولات صحيح", 2)]
});
/** Lab B — compare acidic, neutral and basic solutions with a pH meter. */
export const phCompareTemplate = (): ChemLabTemplate => ({
  id: "phCompare", title: "مقارنة الأحماض والقواعد بجهاز قياس pH", objective: "قياس pH وتصنيف المحاليل، والتمييز بين الحمض القوي والحمض الضعيف عند التركيز نفسه.",
  config: {
    v: 1,
    experiment: { kind: "ph", solutions: [
      { id: "A", label: "المحلول A — HCl ‏0.010 mol/L", species: "HCl", concentration: "0.010" },
      { id: "B", label: "المحلول B — CH₃COOH ‏0.010 mol/L", species: "CH3COOH", concentration: "0.010" },
      { id: "C", label: "المحلول C — NaCl ‏0.10 mol/L", species: "NaCl", concentration: "0.10" },
      { id: "D", label: "المحلول D — NaOH ‏0.0010 mol/L", species: "NaOH", concentration: "0.0010" }
    ], indicators: ["methylOrange", "bromothymolBlue", "phenolphthalein"] },
    view: { readouts: true, graph: true },
    tasks: [
      { id: "phA", label: "ما pH المحلول A؟", kind: "number", quantity: "pH", subject: "A", other: null, at: null, unit: "pH", precision: { decimals: 2 } },
      { id: "phB", label: "ما pH المحلول B؟", kind: "number", quantity: "pH", subject: "B", other: null, at: null, unit: "pH", precision: { decimals: 2 } },
      { id: "classD", label: "صنّف المحلول D.", kind: "choice", question: "phClass", subject: "D", other: null, mode: "single", options: ["acidic", "neutral", "basic"] },
      { id: "lowest", label: "أيّ المحاليل التالية له أقل pH؟", kind: "choice", question: "lowestPh", subject: null, other: null, mode: "single", options: ["A", "B", "C", "D"] },
      { id: "all", label: "قِس pH كل المحاليل وسجّل القراءات.", kind: "observe", requirement: "meterAll", subject: null, count: null }
    ]
  },
  checks: [check("phA", "lab.number", "pH المحلول A", 2), check("phB", "lab.number", "pH المحلول B", 2), check("classD", "lab.choice", "تصنيف D"), check("lowest", "lab.choice", "أقل pH"), check("all", "lab.observed", "قِيست كل المحاليل")]
});
/** Lab B — indicators only (no pH meter). */
export const indicatorTemplate = (): ChemLabTemplate => ({
  id: "indicators", title: "الكواشف وألوانها", objective: "استخدام مدى تغيّر لون الكاشف لتقدير pH وتمييز الأوساط، دون جهاز قياس.",
  config: {
    v: 1,
    experiment: { kind: "ph", solutions: [
      { id: "X", label: "المحلول X — NH₃ ‏0.10 mol/L", species: "NH3", concentration: "0.10" },
      { id: "Y", label: "المحلول Y — HNO₃ ‏0.0010 mol/L", species: "HNO3", concentration: "0.0010" },
      { id: "Z", label: "المحلول Z — ماء نقي", species: "H2O", concentration: "0" }
    ], indicators: ["phenolphthalein", "bromothymolBlue"] },
    view: { readouts: false, graph: false },
    tasks: [
      { id: "ppX", label: "ما لون الفينولفثالين في المحلول X؟", kind: "choice", question: "indicatorColour", subject: "X", other: "phenolphthalein", mode: "single", options: ["acid", "transition", "base"] },
      { id: "btbY", label: "ما لون أزرق البروموثيمول في المحلول Y؟", kind: "choice", question: "indicatorColour", subject: "Y", other: "bromothymolBlue", mode: "single", options: ["acid", "transition", "base"] },
      { id: "phY", label: "احسب pH المحلول Y.", kind: "number", quantity: "pH", subject: "Y", other: null, at: null, unit: "pH", precision: { decimals: 2 } },
      { id: "tested", label: "اختبر كل المحاليل بأزرق البروموثيمول.", kind: "observe", requirement: "indicatorAll", subject: "bromothymolBlue", count: null }
    ]
  },
  checks: [check("ppX", "lab.choice", "لون الفينولفثالين"), check("btbY", "lab.choice", "لون أزرق البروموثيمول"), check("phY", "lab.number", "pH المحلول Y", 2), check("tested", "lab.observed", "اختُبرت كل المحاليل")]
});
/** Lab C — titration with a known analyte (pH meter and curve). */
export const titrationTemplate = (): ChemLabTemplate => ({
  id: "titration", title: "معايرة حمض قوي بقاعدة قوية", objective: "تتبّع منحنى المعايرة، وتحديد نقطة التكافؤ، والتمييز بينها وبين نقطة النهاية، واختيار الكاشف.",
  config: {
    v: 1,
    experiment: { kind: "titration", analyte: { species: "HCl", volume: "25.00", concentration: "0.100", equivalence: null }, titrant: { species: "NaOH", concentration: "0.100" }, indicators: ["methylOrange", "bromothymolBlue", "phenolphthalein"] },
    view: { readouts: true, graph: true },
    tasks: [
      { id: "veq", label: "ما حجم NaOH عند نقطة التكافؤ؟", kind: "number", quantity: "equivalenceVolume", subject: null, other: null, at: null, unit: "mL", precision: { decimals: 2 } },
      { id: "nOH", label: "احسب عدد مولات NaOH المستهلكة حتى نقطة التكافؤ (بالملي مول).", kind: "number", quantity: "titrantMoles", subject: null, other: null, at: null, unit: "mmol", precision: { significant: 3 } },
      { id: "eqph", label: "عند نقطة التكافؤ يكون الرقم الهيدروجيني:", kind: "choice", question: "equivalencePh", subject: null, other: null, mode: "single", options: ["below7", "equal7", "above7"] },
      { id: "bracket", label: "سجّل قراءة قبل نقطة التكافؤ وأخرى بعدها.", kind: "observe", requirement: "bracketEquivalence", subject: null, count: null }
    ]
  },
  checks: [check("veq", "lab.number", "حجم التكافؤ", 2), check("nOH", "lab.number", "مولات القاعدة", 2), check("eqph", "lab.choice", "pH التكافؤ"), check("bracket", "lab.observed", "قراءتان حول التكافؤ")]
});
/** Lab C — titration of an unknown analyte (indicator only; the public datum is the observable equivalence volume). */
export const unknownTitrationTemplate = (): ChemLabTemplate => ({
  id: "unknownTitration", title: "تعيين تركيز حمض مجهول بالمعايرة", objective: "إجراء المعايرة بالكاشف، وقراءة السحاحة، وحساب تركيز الحمض من حجم نقطة النهاية.",
  config: {
    v: 1,
    experiment: { kind: "titration", analyte: { species: "HCl", volume: "20.00", concentration: null, equivalence: "18.60" }, titrant: { species: "NaOH", concentration: "0.0100" }, indicators: ["methylOrange", "phenolphthalein", "bromothymolBlue"] },
    view: { readouts: false, graph: false },
    tasks: [
      { id: "reading", label: "اكتب قراءة السحاحة النهائية (الحجم المضاف).", kind: "number", quantity: "buretteReading", subject: null, other: null, at: null, unit: "mL", precision: { decimals: 2 } },
      { id: "conc", label: "احسب تركيز الحمض.", kind: "number", quantity: "analyteConcentration", subject: null, other: null, at: null, unit: "mol/L", precision: { significant: 3 } },
      { id: "suitable", label: "أيّ الكواشف مناسب لهذه المعايرة (خطأ نقطة النهاية لا يتجاوز 0.10 mL)؟", kind: "choice", question: "suitableIndicators", subject: null, other: null, mode: "multiple", options: ["methylOrange", "phenolphthalein", "bromothymolBlue"] },
      { id: "readings", label: "سجّل ثلاث قراءات على الأقل.", kind: "observe", requirement: "readings", subject: null, count: 3 }
    ]
  },
  checks: [check("reading", "lab.number", "قراءة السحاحة", 1), check("conc", "lab.number", "تركيز الحمض", 3), check("suitable", "lab.choice", "الكواشف المناسبة", 2), check("readings", "lab.observed", "ثلاث قراءات")]
});
/** Lab D — reaction rate: temperature, concentration and a catalyst. */
export const rateTemplate = (): ChemLabTemplate => ({
  id: "rate", title: "سرعة التفاعل: درجة الحرارة والحافز", objective: "تفسير منحنيات التركيز مع الزمن، وحساب عمر النصف، ومقارنة السرعات عند تغيير درجة الحرارة وإضافة حافز.",
  config: {
    v: 1,
    experiment: { kind: "rate", order: 1, k25: "2.0e-3", ea: "75", catalystDrop: "5", duration: 1200, trials: [
      { id: "t1", label: "التجربة 1: ‏25 °C دون حافز", temperature: "25", concentration: "0.100", catalyst: false },
      { id: "t2", label: "التجربة 2: ‏35 °C دون حافز", temperature: "35", concentration: "0.100", catalyst: false },
      { id: "t3", label: "التجربة 3: ‏25 °C مع حافز", temperature: "25", concentration: "0.100", catalyst: true }
    ] },
    view: { readouts: true, graph: true },
    tasks: [
      { id: "half", label: "احسب عمر النصف في التجربة 1.", kind: "number", quantity: "halfLife", subject: "t1", other: null, at: null, unit: "s", precision: { significant: 3 } },
      { id: "ratio", label: "كم مرة تزيد السرعة الابتدائية في التجربة 2 عنها في التجربة 1؟", kind: "number", quantity: "rateRatio", subject: "t2", other: "t1", at: null, unit: "1", precision: { significant: 2 } },
      { id: "fastest", label: "في أيّ تجربة تكون السرعة الابتدائية أكبر؟", kind: "choice", question: "fastestTrial", subject: null, other: null, mode: "single", options: ["t1", "t2", "t3"] },
      { id: "cat", label: "إضافة الحافز تجعل سرعة التفاعل:", kind: "choice", question: "catalystEffect", subject: null, other: null, mode: "single", options: ["increase", "decrease", "none"] },
      { id: "runs", label: "شغّل التجارب الثلاث.", kind: "observe", requirement: "runAll", subject: null, count: null }
    ]
  },
  checks: [check("half", "lab.number", "عمر النصف", 2), check("ratio", "lab.number", "نسبة السرعة", 2), check("fastest", "lab.choice", "أسرع تجربة"), check("cat", "lab.choice", "أثر الحافز"), check("runs", "lab.observed", "شُغّلت كل التجارب")]
});
export const CHEM_LAB_TEMPLATES: readonly (() => ChemLabTemplate)[] = Object.freeze([
  solidPrepareTemplate, dilutionTemplate, phCompareTemplate, indicatorTemplate, titrationTemplate, unknownTitrationTemplate, rateTemplate
]);
