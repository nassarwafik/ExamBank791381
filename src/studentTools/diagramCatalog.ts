// «محرّر المخططات» (docs/enterprise-diagram-editor-design.md) — the catalog: the diagram kinds, the components (node types) each kind
// offers, the fields the learner fills in, and the arrows (edge types). Pure data: no React, no DOM, no I/O.
//
// The editor is generic: a diagram is a list of components and a list of arrows between them. A kind only chooses WHICH components and
// arrows its palette shows, so one canvas, one inspector and one file format serve every kind. A file names its kind, and the strict
// reader (diagramDoc.ts) accepts only the components and arrows of that kind.

export const DIAGRAM_KINDS = ["useCase", "class", "sequence", "activity", "state", "object", "deployment", "erd", "dsd", "dfd", "topology", "flowchart"] as const;
export type DiagramKind = (typeof DIAGRAM_KINDS)[number];

/** How a component is drawn (diagramShapes.tsx). */
export type ShapeForm =
  | "rect" | "round" | "ellipse" | "diamond" | "circle" | "actor" | "compartments" | "container" | "note" | "lifeline" | "start" | "end"
  | "bar" | "store" | "cylinder" | "doubleRect" | "doubleEllipse" | "dashedEllipse" | "doubleDiamond" | "component" | "node3d" | "device"
  | "frame" | "processGS"
  // DG6 — the flowchart's own symbols: the start / end oval (a stadium), input / output (a parallelogram), a predefined process
  | "terminal" | "parallelogram" | "subroutine";

/** A field the learner fills in. `lines`: one item per line (a class's attributes, a table's fields). */
export type FieldSpec = { key: string; label: string; lines?: true; hint?: string; dir?: "ltr" };

export type DeviceIcon = "router" | "switch" | "hub" | "pc" | "laptop" | "server" | "ap" | "printer" | "firewall" | "cloud" | "phone";

export type NodeSpec = {
  type: string;
  label: string;
  form: ShapeForm;
  fields: readonly FieldSpec[];
  /** The text a new component starts with. */
  defaults: Readonly<Record<string, string>>;
  /** The smallest size (and the size a container starts with). */
  minW: number;
  minH: number;
  /** A fixed stereotype line drawn above the name («interface»). */
  stereotype?: string;
  /** Underline the name (an object, a key attribute). */
  underline?: true;
  icon?: DeviceIcon;
  /** Can be resized by the learner (containers, frames, lanes). */
  resizable?: true;
  /** A lane is tall and narrow by default. */
  vertical?: true;
};

export type MarkerKind = "none" | "arrow" | "open" | "triangle" | "diamond" | "diamondFilled" | "crow" | "bar";

export type EdgeSpec = {
  type: string;
  label: string;
  dash?: "dashed" | "dotted";
  start: MarkerKind;
  end: MarkerKind;
  /** A double line (total participation in an ERD). */
  double?: true;
  color?: string;
  /** A zig-zag in the middle (a serial WAN cable). */
  zigzag?: true;
  /** The text a new arrow starts with (in its middle, and at its two ends). */
  defaultLabel?: string;
  defaultFromLabel?: string;
  defaultToLabel?: string;
  /** The arrow has a text at each end (multiplicity, cardinality). */
  endLabels?: true;
  /** A short explanation shown under the arrow buttons. */
  hint?: string;
};

export type KindSpec = {
  kind: DiagramKind;
  label: string;
  group: "UML" | "قواعد البيانات" | "تحليل النظم" | "الشبكات" | "البرمجة";
  hint: string;
  nodes: readonly NodeSpec[];
  edges: readonly EdgeSpec[];
};

const NAME: FieldSpec = { key: "name", label: "الاسم" };
const note: NodeSpec = { type: "note", label: "ملاحظة", form: "note", fields: [{ key: "name", label: "النص", lines: true }], defaults: { name: "ملاحظة" }, minW: 110, minH: 50 };

const device = (icon: DeviceIcon, label: string, name: string): NodeSpec => ({
  type: icon, label, form: "device", icon, minW: 70, minH: 70,
  fields: [NAME, { key: "details", label: "تفاصيل تظهر تحته (IP، المنفذ …)", lines: true, dir: "ltr", hint: "سطر لكل معلومة، مثل: 192.168.1.10/24" }],
  defaults: { name, details: "" }
});

export const DIAGRAM_CATALOG: readonly KindSpec[] = Object.freeze([
  {
    kind: "useCase", label: "حالات الاستخدام (Use Case)", group: "UML",
    hint: "من يستعمل النظام، وماذا يفعل كل واحد فيه.",
    nodes: [
      { type: "actor", label: "فاعل", form: "actor", fields: [NAME], defaults: { name: "المستخدم" }, minW: 60, minH: 90 },
      { type: "usecase", label: "حالة استخدام", form: "ellipse", fields: [NAME], defaults: { name: "تسجيل الدخول" }, minW: 140, minH: 56 },
      { type: "system", label: "حدود النظام", form: "container", fields: [NAME], defaults: { name: "النظام" }, minW: 280, minH: 320, resizable: true },
      note
    ],
    edges: [
      { type: "assoc", label: "ارتباط", start: "none", end: "none", hint: "بين الفاعل وحالة الاستخدام" },
      { type: "include", label: "«include»", dash: "dashed", start: "none", end: "open", defaultLabel: "«include»", hint: "الحالة تتضمّن الحالة الأخرى دائمًا" },
      { type: "extend", label: "«extend»", dash: "dashed", start: "none", end: "open", defaultLabel: "«extend»", hint: "الحالة توسّع حالة أخرى أحيانًا" },
      { type: "generalize", label: "تعميم", start: "none", end: "triangle", hint: "من الخاص إلى العام" }
    ]
  },
  {
    kind: "class", label: "الأصناف (Class)", group: "UML",
    hint: "الأصناف بخصائصها ودوالها، والعلاقات بينها.",
    nodes: [
      { type: "class", label: "صنف", form: "compartments", minW: 140, minH: 70,
        fields: [NAME, { key: "attrs", label: "الخصائص", lines: true, dir: "ltr", hint: "سطر لكل خاصية، مثل: - name : string" },
          { key: "ops", label: "الدوال", lines: true, dir: "ltr", hint: "سطر لكل دالة، مثل: + GetAverage() : double" }],
        defaults: { name: "Student", attrs: "- id : int\n- name : string", ops: "+ GetAverage() : double" } },
      { type: "abstract", label: "صنف مجرّد", form: "compartments", stereotype: "«abstract»", minW: 140, minH: 70,
        fields: [NAME, { key: "attrs", label: "الخصائص", lines: true, dir: "ltr" }, { key: "ops", label: "الدوال", lines: true, dir: "ltr" }],
        defaults: { name: "Person", attrs: "# name : string", ops: "+ Describe() : string" } },
      { type: "interface", label: "واجهة", form: "compartments", stereotype: "«interface»", minW: 140, minH: 60,
        fields: [NAME, { key: "ops", label: "الدوال", lines: true, dir: "ltr" }], defaults: { name: "IPrintable", ops: "+ Print() : void" } },
      { type: "enum", label: "تعداد (enum)", form: "compartments", stereotype: "«enumeration»", minW: 120, minH: 60,
        fields: [NAME, { key: "values", label: "القيم", lines: true, dir: "ltr" }], defaults: { name: "Grade", values: "Excellent\nGood\nPass" } },
      note
    ],
    edges: [
      { type: "assoc", label: "ارتباط", start: "none", end: "none", endLabels: true, defaultFromLabel: "1", defaultToLabel: "*", hint: "اكتب التعدّدية على الطرفين: 1، *، 0..1، 1..*" },
      { type: "directed", label: "ارتباط باتجاه", start: "none", end: "open", endLabels: true },
      { type: "inherit", label: "وراثة", start: "none", end: "triangle", hint: "من الصنف الابن إلى الصنف الأب" },
      { type: "realize", label: "تنفيذ واجهة", dash: "dashed", start: "none", end: "triangle", hint: "من الصنف إلى الواجهة" },
      { type: "aggregation", label: "تجميع", start: "diamond", end: "none", endLabels: true, hint: "يبدأ من الكلّ (المعيّن عنده)" },
      { type: "composition", label: "تركيب", start: "diamondFilled", end: "none", endLabels: true, hint: "الجزء لا يعيش بلا الكلّ" },
      { type: "dependency", label: "اعتماد", dash: "dashed", start: "none", end: "open" }
    ]
  },
  {
    kind: "sequence", label: "التسلسل (Sequence)", group: "UML",
    hint: "الرسائل بين الكائنات بالترتيب من أعلى إلى أسفل.",
    nodes: [
      { type: "actorLifeline", label: "فاعل", form: "lifeline", fields: [NAME], defaults: { name: "المستخدم" }, minW: 90, minH: 60 },
      { type: "lifeline", label: "كائن", form: "lifeline", fields: [{ ...NAME, hint: "مثل: :LoginPage أو db : Database" }], defaults: { name: ":LoginPage" }, minW: 110, minH: 40 },
      { type: "fragment", label: "إطار (alt / loop / opt)", form: "frame", resizable: true, minW: 260, minH: 120,
        fields: [{ key: "name", label: "النوع", hint: "alt أو opt أو loop", dir: "ltr" }, { key: "guard", label: "الشرط", hint: "مثل: [كلمة السر صحيحة]" }],
        defaults: { name: "alt", guard: "[البيانات صحيحة]" } },
      note
    ],
    edges: [
      { type: "sync", label: "رسالة", start: "none", end: "arrow", defaultLabel: "login()", hint: "تُرتَّب الرسائل وحدها من أعلى إلى أسفل" },
      { type: "async", label: "رسالة غير متزامنة", start: "none", end: "open", defaultLabel: "notify()" },
      { type: "return", label: "رجوع", dash: "dashed", start: "none", end: "open", defaultLabel: "النتيجة" }
    ]
  },
  {
    kind: "activity", label: "النشاط (Activity)", group: "UML",
    hint: "سير العمل خطوة خطوة، بالقرارات والتفرّعات.",
    nodes: [
      { type: "start", label: "بداية", form: "start", fields: [], defaults: {}, minW: 30, minH: 30 },
      { type: "action", label: "نشاط", form: "round", fields: [NAME], defaults: { name: "إدخال البيانات" }, minW: 120, minH: 44 },
      { type: "decision", label: "قرار / دمج", form: "diamond", fields: [{ ...NAME, label: "السؤال (اختياري)" }], defaults: { name: "" }, minW: 50, minH: 50 },
      { type: "fork", label: "تفرّع / تجميع", form: "bar", fields: [], defaults: {}, minW: 140, minH: 8, resizable: true },
      { type: "end", label: "نهاية", form: "end", fields: [], defaults: {}, minW: 32, minH: 32 },
      { type: "lane", label: "مسار (Swimlane)", form: "container", fields: [NAME], defaults: { name: "الموظف" }, minW: 240, minH: 420, resizable: true, vertical: true },
      note
    ],
    edges: [
      { type: "flow", label: "انتقال", start: "none", end: "arrow", hint: "اكتب الشرط بعد القرار، مثل: [نعم]" }
    ]
  },
  {
    kind: "state", label: "الحالة (State Machine)", group: "UML",
    hint: "الحالات التي يمرّ بها كائن واحد، وما ينقله من حالة إلى أخرى.",
    nodes: [
      { type: "initial", label: "حالة ابتدائية", form: "start", fields: [], defaults: {}, minW: 30, minH: 30 },
      { type: "state", label: "حالة", form: "round", fields: [NAME, { key: "body", label: "داخل الحالة (اختياري)", lines: true, hint: "مثل: entry / فتح السجل" }], defaults: { name: "قيد المعالجة", body: "" }, minW: 120, minH: 46 },
      { type: "composite", label: "حالة مركّبة", form: "container", fields: [NAME], defaults: { name: "نشط" }, minW: 300, minH: 200, resizable: true },
      { type: "choice", label: "اختيار", form: "diamond", fields: [], defaults: {}, minW: 36, minH: 36 },
      { type: "final", label: "حالة نهائية", form: "end", fields: [], defaults: {}, minW: 32, minH: 32 },
      note
    ],
    edges: [
      { type: "transition", label: "انتقال", start: "none", end: "arrow", defaultLabel: "حدث", hint: "الصيغة: حدث [شرط] / فعل" }
    ]
  },
  {
    kind: "object", label: "الكائنات (Object)", group: "UML",
    hint: "لقطة لكائنات حقيقية بقيمها في لحظة معيّنة.",
    nodes: [
      { type: "object", label: "كائن", form: "compartments", underline: true, minW: 140, minH: 60,
        fields: [{ ...NAME, label: "الاسم : الصنف", dir: "ltr", hint: "مثل: s1 : Student" }, { key: "values", label: "القيم", lines: true, dir: "ltr", hint: "سطر لكل قيمة، مثل: name = \"Ahmad\"" }],
        defaults: { name: "s1 : Student", values: "id = 1\nname = \"Ahmad\"" } },
      note
    ],
    edges: [
      { type: "link", label: "رابط", start: "none", end: "none" },
      { type: "directedLink", label: "رابط باتجاه", start: "none", end: "open" }
    ]
  },
  {
    kind: "deployment", label: "المكوّنات والنشر (Component / Deployment)", group: "UML",
    hint: "أجزاء النظام، وعلى أي جهاز أو خادم يعمل كل جزء.",
    nodes: [
      { type: "node", label: "عقدة (جهاز / خادم)", form: "node3d", fields: [NAME], defaults: { name: "خادم الويب" }, minW: 220, minH: 150, resizable: true },
      { type: "component", label: "مكوّن", form: "component", fields: [NAME], defaults: { name: "WebSite" }, minW: 130, minH: 50 },
      { type: "artifact", label: "ملف نشر (Artifact)", form: "compartments", stereotype: "«artifact»", fields: [NAME], defaults: { name: "app.dll" }, minW: 120, minH: 50 },
      { type: "database", label: "قاعدة بيانات", form: "cylinder", fields: [NAME], defaults: { name: "SchoolDB" }, minW: 100, minH: 70 },
      note
    ],
    edges: [
      { type: "path", label: "اتصال", start: "none", end: "none", defaultLabel: "", hint: "اكتب البروتوكول عليه، مثل: HTTPS" },
      { type: "dependency", label: "اعتماد", dash: "dashed", start: "none", end: "open" }
    ]
  },
  {
    kind: "erd", label: "الكيانات والعلاقات (ERD)", group: "قواعد البيانات",
    hint: "الكيانات وصفاتها والعلاقات بينها (رموز تشن).",
    nodes: [
      { type: "entity", label: "كيان", form: "rect", fields: [NAME], defaults: { name: "الطالب" }, minW: 110, minH: 46 },
      { type: "weakEntity", label: "كيان ضعيف", form: "doubleRect", fields: [NAME], defaults: { name: "التابع" }, minW: 110, minH: 46 },
      { type: "attribute", label: "صفة", form: "ellipse", fields: [NAME], defaults: { name: "الاسم" }, minW: 90, minH: 40 },
      { type: "keyAttribute", label: "صفة مفتاح", form: "ellipse", underline: true, fields: [NAME], defaults: { name: "رقم الطالب" }, minW: 100, minH: 40 },
      { type: "multiAttribute", label: "صفة متعدّدة القيم", form: "doubleEllipse", fields: [NAME], defaults: { name: "الهاتف" }, minW: 90, minH: 40 },
      { type: "derivedAttribute", label: "صفة مشتقّة", form: "dashedEllipse", fields: [NAME], defaults: { name: "العمر" }, minW: 90, minH: 40 },
      { type: "relationship", label: "علاقة", form: "diamond", fields: [NAME], defaults: { name: "يسجّل" }, minW: 110, minH: 60 },
      { type: "identifyingRel", label: "علاقة معرِّفة", form: "doubleDiamond", fields: [NAME], defaults: { name: "يملك" }, minW: 110, minH: 60 },
      note
    ],
    edges: [
      { type: "line", label: "خط", start: "none", end: "none", endLabels: true, hint: "اكتب التعدّدية على طرف الكيان: 1 أو N أو M" },
      { type: "total", label: "مشاركة كاملة", start: "none", end: "none", double: true, endLabels: true, hint: "كل كيان يجب أن يشارك في العلاقة" }
    ]
  },
  {
    kind: "dsd", label: "علاقات الجداول (DSD)", group: "قواعد البيانات",
    hint: "الجداول بحقولها ومفاتيحها، والعلاقات بينها كما في نافذة العلاقات في Access.",
    nodes: [
      { type: "table", label: "جدول", form: "compartments", minW: 150, minH: 70,
        fields: [{ ...NAME, label: "اسم الجدول" }, { key: "fields", label: "الحقول", lines: true, dir: "ltr",
          hint: "سطر لكل حقل. ابدأ بـ PK للمفتاح الأساسي و FK للمفتاح الأجنبي، مثل: PK StudentID : INT" }],
        defaults: { name: "Students", fields: "PK StudentID : INT\nName : VARCHAR(50)\nFK ClassID : INT" } },
      note
    ],
    edges: [
      { type: "oneMany", label: "واحد ← متعدّد (1 — ∞)", start: "none", end: "none", endLabels: true, defaultFromLabel: "1", defaultToLabel: "∞", hint: "من المفتاح الأساسي إلى المفتاح الأجنبي" },
      { type: "oneOne", label: "واحد ← واحد (1 — 1)", start: "none", end: "none", endLabels: true, defaultFromLabel: "1", defaultToLabel: "1" },
      { type: "crow", label: "قدم الغراب", start: "bar", end: "crow", hint: "الطرف المتشعّب عند جهة «متعدّد»" }
    ]
  },
  {
    kind: "dfd", label: "تدفّق البيانات (DFD)", group: "تحليل النظم",
    hint: "كيف تنتقل البيانات بين الكيانات الخارجية والعمليات ومخازن البيانات.",
    nodes: [
      { type: "process", label: "عملية (دائرة)", form: "circle", fields: [{ key: "number", label: "الرقم", dir: "ltr" }, NAME], defaults: { number: "1.0", name: "تسجيل طالب" }, minW: 100, minH: 100 },
      { type: "processGS", label: "عملية (مستطيل)", form: "processGS", fields: [{ key: "number", label: "الرقم", dir: "ltr" }, NAME], defaults: { number: "1.0", name: "تسجيل طالب" }, minW: 120, minH: 80 },
      { type: "external", label: "كيان خارجي", form: "rect", fields: [NAME], defaults: { name: "الطالب" }, minW: 110, minH: 50 },
      { type: "store", label: "مخزن بيانات", form: "store", fields: [{ key: "number", label: "الرمز", dir: "ltr" }, NAME], defaults: { number: "D1", name: "ملف الطلاب" }, minW: 150, minH: 40 },
      note
    ],
    edges: [
      { type: "flow", label: "تدفّق بيانات", start: "none", end: "arrow", defaultLabel: "بيانات", hint: "اكتب اسم البيانات على السهم" }
    ]
  },
  {
    kind: "topology", label: "طوبولوجيا الشبكة", group: "الشبكات",
    hint: "أجهزة الشبكة والكوابل بينها، مع العناوين والمنافذ.",
    nodes: [
      device("router", "راوتر", "R1"), device("switch", "سويتش", "SW1"), device("hub", "Hub", "Hub1"), device("pc", "حاسوب", "PC1"),
      device("laptop", "لابتوب", "Laptop1"), device("server", "سيرفر", "Server1"), device("ap", "نقطة وصول", "AP1"), device("printer", "طابعة", "Printer1"),
      device("phone", "هاتف", "Phone1"), device("firewall", "جدار ناري", "FW1"), device("cloud", "الإنترنت", "Internet"),
      { type: "zone", label: "منطقة (LAN / VLAN)", form: "container", fields: [NAME], defaults: { name: "VLAN 10" }, minW: 280, minH: 200, resizable: true },
      note
    ],
    edges: [
      { type: "copper", label: "كابل نحاسي", start: "none", end: "none", endLabels: true, hint: "اكتب المنفذ على كل طرف، مثل: Fa0/1" },
      { type: "cross", label: "كابل متقاطع", dash: "dashed", start: "none", end: "none", endLabels: true },
      { type: "fiber", label: "ألياف ضوئية", start: "none", end: "none", endLabels: true, color: "#d97706" },
      { type: "serial", label: "تسلسلي (WAN)", start: "none", end: "none", endLabels: true, color: "#dc2626", zigzag: true },
      { type: "wireless", label: "لاسلكي", dash: "dotted", start: "none", end: "none", color: "#2563eb" }
    ]
  },
  {
    // DG6 — the flowchart of a program (the symbols taught with algorithms): start, input, process, decision, output, end
    kind: "flowchart", label: "مخطط التدفّق (Flowchart)", group: "البرمجة",
    hint: "خطوات الخوارزمية بالترتيب: ابدأ، أدخل، عالج، قرّر، أخرج، انتهِ.",
    nodes: [
      { type: "start", label: "بداية", form: "terminal", fields: [NAME], defaults: { name: "ابدأ" }, minW: 100, minH: 44 },
      { type: "io", label: "إدخال / إخراج", form: "parallelogram", fields: [{ ...NAME, label: "النص", hint: "مثل: أدخل a, b — أو: اطبع المعدل" }], defaults: { name: "أدخل a, b" }, minW: 130, minH: 46 },
      { type: "process", label: "معالجة", form: "rect", fields: [{ ...NAME, label: "العملية", hint: "مثل: avg = (a + b) / 2" }], defaults: { name: "avg = (a + b) / 2" }, minW: 130, minH: 46 },
      { type: "decision", label: "قرار", form: "diamond", fields: [{ ...NAME, label: "السؤال", hint: "سؤال جوابه نعم أو لا، مثل: avg >= 50 ؟" }], defaults: { name: "avg >= 50 ؟" }, minW: 120, minH: 70 },
      { type: "subroutine", label: "دالة جاهزة", form: "subroutine", fields: [{ ...NAME, label: "الدالة", hint: "عملية مشروحة في مخطط آخر، مثل: Sort(list)" }], defaults: { name: "Sort(list)" }, minW: 130, minH: 46 },
      { type: "connector", label: "موصل", form: "ellipse", fields: [{ ...NAME, label: "الرمز", hint: "حرف أو رقم يصل جزأين من المخطط، مثل: A" }], defaults: { name: "A" }, minW: 40, minH: 40 },
      { type: "end", label: "نهاية", form: "terminal", fields: [NAME], defaults: { name: "انتهِ" }, minW: 100, minH: 44 },
      note
    ],
    edges: [
      { type: "flow", label: "خط اتجاه", start: "none", end: "arrow", hint: "بعد القرار اكتب على كل سهم: نعم أو لا" }
    ]
  }
] satisfies KindSpec[]);

export const isDiagramKind = (v: unknown): v is DiagramKind => typeof v === "string" && (DIAGRAM_KINDS as readonly string[]).includes(v);

export function kindSpec(kind: DiagramKind): KindSpec {
  const k = DIAGRAM_CATALOG.find(c => c.kind === kind);
  if (!k) throw new Error("diagram kind without a catalog entry: " + kind);
  return k;
}
export const nodeSpec = (kind: DiagramKind, type: string): NodeSpec | undefined => kindSpec(kind).nodes.find(n => n.type === type);
export const edgeSpec = (kind: DiagramKind, type: string): EdgeSpec | undefined => kindSpec(kind).edges.find(e => e.type === type);

/** The fill colours a learner may give a component (pastel, readable on paper, the same in a light or a dark app). */
export const DIAGRAM_COLORS = Object.freeze({
  none: { label: "بلا لون", fill: "#ffffff" },
  blue: { label: "أزرق", fill: "#dbeafe" },
  green: { label: "أخضر", fill: "#dcfce7" },
  yellow: { label: "أصفر", fill: "#fef9c3" },
  orange: { label: "برتقالي", fill: "#ffedd5" },
  rose: { label: "وردي", fill: "#ffe4e6" },
  violet: { label: "بنفسجي", fill: "#ede9fe" },
  gray: { label: "رمادي", fill: "#f1f5f9" }
} as const);
export type DiagramColor = keyof typeof DIAGRAM_COLORS;
export const DIAGRAM_COLOR_IDS = Object.keys(DIAGRAM_COLORS) as DiagramColor[];
