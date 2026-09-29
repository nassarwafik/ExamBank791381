// Phase 13C-A — SUBJECT-NEUTRAL BLUEPRINT FIXTURES (test/doc data only; imported by *.test.ts(x) and the docs).
//
// Five materially different subjects share ONE model (`AssessmentBlueprintV1`) and ONE validator. Nothing here is
// production content, and nothing in the engine knows any of these ids: subject identity and taxonomy are DATA.
import type { AssessmentBlueprintV1, BuilderQuestionLike } from "./assessmentTypes";

export const networkingBlueprint: AssessmentBlueprintV1 = {
  schemaVersion: 1,
  subject: { id: "networking", label: "شبكات الحاسوب" },
  curriculum: { id: "il-vocational", label: "المسار المهني" },
  course: { id: "791381", label: "أنظمة محوسبة" },
  level: { id: "grade-12", label: "الثاني عشر" },
  topics: [
    { id: "NETWORK_BASICS", label: "أساسيات الشبكات", order: 1 },
    { id: "OSI_TCPIP", label: "OSI و TCP/IP", parentId: "NETWORK_BASICS", order: 1 },
    { id: "IP_ADDRESSING", label: "عنونة IPv4", order: 2 },
    { id: "SUBNET_CIDR", label: "Subnet و CIDR", parentId: "IP_ADDRESSING", order: 1 }
  ],
  objectives: [
    { id: "obj-subnet", label: "يحسب قناع الشبكة وعدد المضيفين", topicId: "SUBNET_CIDR", order: 1 },
    { id: "obj-layers", label: "يميّز طبقات OSI", topicId: "OSI_TCPIP", order: 2 }
  ],
  targets: { totalQuestions: 20, totalMarks: 100 },
  constraints: [
    { id: "c-ip-marks", dimension: "topic", ref: "IP_ADDRESSING", metric: "marks", unit: "percent", target: 40 },
    { id: "c-d3", dimension: "difficulty", ref: "3", metric: "count", unit: "absolute", min: 2, max: 6 },
    { id: "c-mcq", dimension: "questionType", ref: "multipleChoice", metric: "count", unit: "percent", max: 60 },
    { id: "c-cli", dimension: "capability", ref: "cli", metric: "count", unit: "absolute", min: 1 }
  ]
};

export const computerScienceBlueprint: AssessmentBlueprintV1 = {
  schemaVersion: 1,
  subject: { id: "computer-science", label: "علوم الحاسوب" },
  topics: [
    { id: "ALG", label: "Algorithms" },
    { id: "SORT", label: "Sorting", parentId: "ALG" },
    { id: "MERGE", label: "Merge Sort", parentId: "SORT" },
    { id: "DS", label: "Data Structures" },
    { id: "TREES", label: "Trees", parentId: "DS" }
  ],
  objectives: [
    { id: "o-complexity", label: "يحلل التعقيد الزمني لخوارزمية", topicId: "ALG" },
    { id: "o-merge", label: "يطبّق خطوات Merge Sort على مدخل", topicId: "MERGE" },
    { id: "o-trace", label: "يتتبّع تنفيذ برنامج قصير" }
  ],
  targets: { totalQuestions: 12 },
  constraints: [
    { id: "c-sort", dimension: "topic", ref: "SORT", metric: "count", unit: "absolute", target: 4, tolerance: 1 },
    { id: "c-apply", dimension: "cognitiveLevel", ref: "apply", metric: "marks", unit: "percent", min: 30 },
    { id: "c-o-merge", dimension: "objective", ref: "o-merge", metric: "count", unit: "absolute", target: 3 }
  ]
};

export const mathematicsBlueprint: AssessmentBlueprintV1 = {
  schemaVersion: 1,
  subject: { id: "mathematics", label: "الرياضيات" },
  level: { id: "grade-10", label: "العاشر" },
  topics: [
    { id: "ALGEBRA", label: "الجبر" },
    { id: "LINEAR_EQ", label: "المعادلات الخطية", parentId: "ALGEBRA" },
    { id: "GEOMETRY", label: "الهندسة" },
    { id: "TRIANGLES", label: "المثلثات", parentId: "GEOMETRY" },
    { id: "PYTHAGORAS", label: "نظرية فيثاغورس", parentId: "TRIANGLES" }
  ],
  objectives: [{ id: "o-solve-linear", label: "يحل معادلة خطية بمتغير واحد", topicId: "LINEAR_EQ" }],
  // A DIFFERENT cognitive vocabulary (SOLO) and a 3-point difficulty scale: the engine must not assume Bloom / 1..5.
  cognitiveLevels: [
    { id: "unistructural", label: "أحادي البنية", order: 1 },
    { id: "multistructural", label: "متعدد البنية", order: 2 },
    { id: "relational", label: "علائقي", order: 3 },
    { id: "extended-abstract", label: "تجريدي موسّع", order: 4 }
  ],
  difficultyScale: { min: 1, max: 3, labels: { "1": "سهل", "2": "متوسط", "3": "صعب" } },
  targets: { totalMarks: 60 },
  constraints: [
    { id: "c-hard", dimension: "difficulty", ref: "3", metric: "count", unit: "absolute", max: 2 },
    { id: "c-geo", dimension: "topic", ref: "GEOMETRY", metric: "marks", unit: "percent", min: 25, max: 40 },
    { id: "c-rel", dimension: "cognitiveLevel", ref: "relational", metric: "count", unit: "absolute", min: 1 }
  ]
};

export const physicsBlueprint: AssessmentBlueprintV1 = {
  schemaVersion: 1,
  subject: { id: "physics", label: "الفيزياء" },
  topics: [
    { id: "MECHANICS", label: "الميكانيكا" },
    { id: "MOTION", label: "الحركة", parentId: "MECHANICS" },
    { id: "PROJECTILE", label: "حركة المقذوفات", parentId: "MOTION" },
    { id: "WAVES", label: "الأمواج" }
  ],
  objectives: [
    { id: "o-range", label: "يحسب مدى مقذوف", topicId: "PROJECTILE" },
    { id: "o-interpret-graph", label: "يفسّر منحنى موقع-زمن", topicId: "MOTION" }
  ],
  constraints: [
    { id: "c-lab", dimension: "section", ref: "s-lab", metric: "marks", unit: "absolute", target: 30 },
    { id: "c-calc", dimension: "capability", ref: "calculation", metric: "count", unit: "percent", min: 50 }
  ]
};

export const chemistryBlueprint: AssessmentBlueprintV1 = {
  schemaVersion: 1,
  subject: { id: "chemistry", label: "الكيمياء" },
  topics: [
    { id: "REACTIONS", label: "التفاعلات" },
    { id: "REDOX", label: "الأكسدة والاختزال", parentId: "REACTIONS" },
    { id: "ACIDS", label: "الحموض والقواعد", parentId: "REACTIONS" },
    { id: "STOICH", label: "الحسابات الكيميائية" }
  ],
  objectives: [
    { id: "o-balance", label: "يوازن معادلة أكسدة-اختزال", topicId: "REDOX" },
    { id: "o-moles", label: "يحسب عدد المولات", topicId: "STOICH" }
  ],
  targets: { totalQuestions: 15, totalMarks: 75 },
  constraints: [
    { id: "c-o-balance", dimension: "objective", ref: "o-balance", metric: "marks", unit: "percent", target: 20 },
    { id: "c-short", dimension: "questionType", ref: "shortAnswer", metric: "count", unit: "absolute", min: 2 }
  ]
};

export const ALL_SUBJECT_BLUEPRINTS: readonly { name: string; blueprint: AssessmentBlueprintV1 }[] = [
  { name: "Networking", blueprint: networkingBlueprint },
  { name: "Computer Science", blueprint: computerScienceBlueprint },
  { name: "Mathematics", blueprint: mathematicsBlueprint },
  { name: "Physics", blueprint: physicsBlueprint },
  { name: "Chemistry", blueprint: chemistryBlueprint }
];

/** A question with explicit assessment metadata (any subject). */
export const classified = (id: string, marks: number, meta: BuilderQuestionLike["assessmentMeta"], extra: Record<string, unknown> = {}): BuilderQuestionLike =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text: "س " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, assessmentMeta: meta, ...extra });
