// «محرّر المخططات» — one worked example per kind («مثال»): a small, complete diagram from a school system, so the learner sees what a
// finished diagram of that kind looks like and can start from it. Data only; a test reads every example back through the strict reader.

import { edgeSpec, nodeSpec, type DiagramKind } from "./diagramCatalog";
import { SEQ_FIRST, SEQ_STEP, SEQ_TOP, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";
import { layoutNode } from "./diagramLayout";
import { treeLayout } from "./orgChart";

/** [type, x, y, text, w?, h?] */
type N = [string, number, number, Record<string, string>?, number?, number?];
/** [from (1-based), to, type, label?, fromLabel?, toLabel?] */
type E = [number, number, string, string?, string?, string?];

function build(kind: DiagramKind, ns: N[], es: E[]): DiagramDoc {
  const nodes: DNode[] = ns.map(([type, x, y, text, w, h], i) => {
    const spec = nodeSpec(kind, type);
    if (!spec) throw new Error("example: unknown component " + type);
    return { id: "n" + (i + 1), type, x, y: spec.form === "lifeline" ? SEQ_TOP : y, w: w ?? spec.minW, h: h ?? spec.minH, text: { ...spec.defaults, ...text }, color: "none" };
  });
  const edges: DEdge[] = es.map(([a, b, type, label, fromLabel, toLabel], i) => {
    const spec = edgeSpec(kind, type);
    if (!spec) throw new Error("example: unknown arrow " + type);
    return { id: "e" + (i + 1), type, from: "n" + a, to: "n" + b, label: label ?? spec.defaultLabel ?? "", fromLabel: fromLabel ?? spec.defaultFromLabel ?? "",
      toLabel: toLabel ?? spec.defaultToLabel ?? "", y: kind === "sequence" ? SEQ_FIRST + i * SEQ_STEP : 0 };
  });
  return { kind, nodes, edges };
}

const EXAMPLES: Record<DiagramKind, () => DiagramDoc> = {
  useCase: () => build("useCase", [
    ["system", 240, 40, { name: "نظام المكتبة" }, 480, 400],
    ["actor", 80, 130, { name: "الطالب" }], ["actor", 820, 190, { name: "أمين المكتبة" }],
    ["usecase", 300, 90, { name: "البحث عن كتاب" }, 180], ["usecase", 400, 200, { name: "استعارة كتاب" }, 180],
    ["usecase", 280, 320, { name: "تسجيل الدخول" }, 180], ["usecase", 510, 320, { name: "دفع غرامة" }, 180]
  ], [[2, 4, "assoc"], [2, 5, "assoc"], [3, 5, "assoc"], [5, 6, "include"], [7, 5, "extend"]]),
  class: () => build("class", [
    ["abstract", 380, 40, { name: "Person", attrs: "# id : int\n# name : string", ops: "+ Describe() : string" }],
    ["class", 200, 260, { name: "Student", attrs: "- grade : int", ops: "+ GetAverage() : double" }],
    ["class", 560, 260, { name: "Teacher", attrs: "- subject : string", ops: "+ AddMark() : void" }],
    ["class", 200, 470, { name: "Course", attrs: "- code : string\n- title : string", ops: "" }],
    ["interface", 820, 60, { name: "IPrintable", ops: "+ Print() : void" }]
  ], [[2, 1, "inherit"], [3, 1, "inherit"], [2, 4, "assoc", "يسجّل", "*", "1..*"], [3, 5, "realize"]]),
  sequence: () => build("sequence", [
    ["actorLifeline", 60, 0, { name: "المستخدم" }], ["lifeline", 230, 0, { name: ":LoginPage" }], ["lifeline", 430, 0, { name: ":AuthService" }],
    ["lifeline", 640, 0, { name: ":Database" }], ["fragment", 200, 300, { name: "alt", guard: "[البيانات صحيحة]" }, 380, 120]
  ], [[1, 2, "sync", "login(user, pass)"], [2, 3, "sync", "check(user, pass)"], [3, 4, "sync", "SELECT user"], [4, 3, "return", "الصف"],
    [3, 2, "return", "true"], [2, 1, "return", "الصفحة الرئيسية"]]),
  activity: () => build("activity", [
    ["start", 345, 30], ["action", 300, 100, { name: "إدخال البيانات" }], ["decision", 335, 200, { name: "" }],
    ["action", 120, 300, { name: "عرض رسالة خطأ" }], ["action", 480, 300, { name: "حفظ البيانات" }], ["end", 524, 410]
  ], [[1, 2, "flow"], [2, 3, "flow"], [3, 4, "flow", "[لا]"], [3, 5, "flow", "[نعم]"], [4, 2, "flow"], [5, 6, "flow"]]),
  state: () => build("state", [
    ["initial", 40, 140], ["state", 140, 120, { name: "جديد" }], ["state", 400, 120, { name: "قيد المعالجة" }], ["state", 760, 120, { name: "مكتمل" }],
    ["state", 400, 290, { name: "ملغى" }], ["final", 980, 140]
  ], [[1, 2, "transition", ""], [2, 3, "transition", "دفع"], [3, 4, "transition", "شحن [العنوان صحيح]"], [2, 5, "transition", "إلغاء"],
    [4, 6, "transition", ""], [5, 6, "transition", ""]]),
  object: () => build("object", [
    ["object", 100, 80, { name: "s1 : Student", values: "id = 1\nname = \"Ahmad\"\ngrade = 11" }],
    ["object", 440, 80, { name: "c1 : Course", values: "code = \"791381\"\ntitle = \"Networks\"" }],
    ["object", 440, 260, { name: "c2 : Course", values: "code = \"899371\"\ntitle = \"CS Basics\"" }]
  ], [[1, 2, "link", "يسجّل"], [1, 3, "link", "يسجّل"]]),
  deployment: () => build("deployment", [
    ["node", 40, 80, { name: "جهاز المستخدم" }, 220, 160], ["node", 340, 60, { name: "خادم الويب" }, 260, 220], ["node", 700, 80, { name: "خادم قاعدة البيانات" }, 240, 170],
    ["component", 75, 150, { name: "المتصفح" }], ["component", 380, 120, { name: "WebSite" }], ["component", 380, 200, { name: "WebService" }],
    ["database", 760, 140, { name: "SchoolDB" }]
  ], [[4, 5, "path", "HTTPS"], [5, 6, "dependency"], [6, 7, "path", "SQL"]]),
  erd: () => build("erd", [
    ["entity", 100, 200, { name: "الطالب" }], ["relationship", 330, 190, { name: "يسجّل" }], ["entity", 560, 200, { name: "المادة" }],
    ["keyAttribute", 40, 80, { name: "رقم الطالب" }], ["attribute", 180, 80, { name: "الاسم" }], ["multiAttribute", 60, 320, { name: "الهاتف" }],
    ["keyAttribute", 520, 80, { name: "رمز المادة" }], ["attribute", 660, 80, { name: "اسم المادة" }], ["attribute", 330, 320, { name: "العلامة" }]
  ], [[1, 2, "line", "", "M", ""], [2, 3, "line", "", "", "N"], [4, 1, "line"], [5, 1, "line"], [6, 1, "line"], [7, 3, "line"], [8, 3, "line"], [9, 2, "line"]]),
  dsd: () => build("dsd", [
    ["table", 60, 80, { name: "Classes", fields: "PK ClassID : INT\nClassName : VARCHAR(30)" }],
    ["table", 360, 80, { name: "Students", fields: "PK StudentID : INT\nName : VARCHAR(50)\nFK ClassID : INT" }],
    ["table", 360, 300, { name: "Marks", fields: "PK MarkID : INT\nFK StudentID : INT\nFK CourseID : INT\nMark : DECIMAL(5,2)" }],
    ["table", 660, 300, { name: "Courses", fields: "PK CourseID : INT\nTitle : VARCHAR(60)" }]
  ], [[1, 2, "oneMany"], [2, 3, "oneMany"], [4, 3, "oneMany"]]),
  // DG11 — a small company: the general manager, two managers, and their teams; arranged by «رتّب الشجرة», drawn with right angles
  orgChart: () => {
    const d = build("orgChart", [
      ["person", 400, 40, { icon: "manager", name: "سامي خليل", details: "المدير العام" }],
      // in Arabic order: the first of each team on the right
      ["person", 600, 200, { icon: "manager", name: "أحمد ناصر", details: "مدير المبيعات" }],
      ["person", 200, 200, { icon: "managerF", name: "ليلى حسن", details: "مديرة الموارد البشرية" }],
      ["person", 700, 360, { icon: "sales", name: "يوسف علي", details: "مندوب مبيعات" }],
      ["person", 500, 360, { icon: "employeeF", name: "منى سعيد", details: "مندوبة مبيعات" }],
      ["person", 200, 360, { icon: "employee", name: "خالد عمر", details: "شؤون الموظفين" }],
    ], [[1, 2, "reports"], [1, 3, "reports"], [2, 4, "reports"], [2, 5, "reports"], [3, 6, "reports"]]);
    const ortho = { ...d, edges: d.edges.map(e => ({ ...e, route: "ortho" as const })) };
    const sizes = new Map(ortho.nodes.map(n => { const b = layoutNode(ortho, n)!; return [n.id, { w: b.w, h: b.h }]; }));
    return treeLayout(ortho, sizes).doc;
  },
  dfd: () => build("dfd", [
    ["external", 40, 160, { name: "الطالب" }], ["process", 280, 130, { number: "1.0", name: "تسجيل طالب" }], ["store", 520, 60, { number: "D1", name: "ملف الطلاب" }],
    ["process", 520, 220, { number: "2.0", name: "إصدار كشف العلامات" }], ["external", 780, 250, { name: "المعلّم" }]
  ], [[1, 2, "flow", "بيانات الطالب"], [2, 3, "flow", "سجل جديد"], [3, 4, "flow", "العلامات"], [4, 5, "flow", "كشف العلامات"], [4, 1, "flow", "الشهادة"]]),
  topology: () => build("topology", [
    ["zone", 120, 330, { name: "LAN 192.168.1.0/24" }, 640, 330],
    ["cloud", 400, 20, { name: "Internet" }], ["router", 400, 180, { name: "R1", details: "G0/0: 192.168.1.1" }], ["switch", 400, 390, { name: "SW1" }],
    ["pc", 170, 540, { name: "PC1", details: "192.168.1.10" }], ["laptop", 400, 540, { name: "Laptop1", details: "192.168.1.11" }],
    ["server", 630, 540, { name: "Server1", details: "192.168.1.100" }]
  ], [[2, 3, "serial"], [3, 4, "copper", "", "G0/0", "G0/1"], [4, 5, "copper", "", "Fa0/1", ""], [4, 6, "copper", "", "Fa0/2", ""], [4, 7, "fiber", "", "G0/2", ""]]),
  // DG6 — a program that reads two marks, finds their average and prints the result; drawn with right angles, as flowcharts are
  flowchart: () => {
    const d = build("flowchart", [
      ["start", 330, 30], ["io", 290, 110, { name: "أدخل a, b" }, 180], ["process", 290, 200, { name: "avg = (a + b) / 2" }, 180],
      ["decision", 310, 290, { name: "avg >= 50 ؟" }, 140, 76], ["io", 90, 420, { name: "اطبع «ناجح»" }, 170], ["io", 500, 420, { name: "اطبع «راسب»" }, 170],
      ["end", 330, 530]
    ], [[1, 2, "flow"], [2, 3, "flow"], [3, 4, "flow"], [4, 5, "flow", "نعم"], [4, 6, "flow", "لا"], [5, 7, "flow"], [6, 7, "flow"]]);
    return { ...d, edges: d.edges.map(e => ({ ...e, route: "ortho" as const })) };
  }
};

export const exampleDoc = (kind: DiagramKind): DiagramDoc => EXAMPLES[kind]();
