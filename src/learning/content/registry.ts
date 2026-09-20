// Learning Materials — Phase 2: content registry / lazy loader.
//
// Chunking strategy (§16/§17): MODULE-LEVEL. The course MANIFEST (small TOC identities) is one lazy chunk per
// course; each MODULE BODY (its pages + blocks) is its own lazy chunk. The main app bundle imports NONE of this
// eagerly — everything is reached through statically-analyzable `import()` thunks that Vite can code-split. This
// keeps the 264+ page book (and future books 794589 / 899373 / …) out of the initial bundle, and lets the future
// Reader load only the manifest for a table of contents, then a single module body when the student opens it.
//
// Registering a new course/module is a data edit here — the Reader never changes.

import type { LearningCourseManifest, ContentModule } from "./types";

/** Thrown only for a genuinely unknown course/module id; normal content problems use the validator instead. */
export class LearningContentError extends Error {
  readonly code: "unknown-course" | "unknown-module";
  constructor(code: "unknown-course" | "unknown-module", message: string) {
    super(message);
    this.name = "LearningContentError";
    this.code = code;
  }
}

// Static `import()` thunks — Vite analyzes these at build time and emits one chunk each. Nothing is imported
// until the thunk is called, so listing a course here does NOT pull its manifest (or any page body) into memory.
type ManifestLoader = () => Promise<{ default: LearningCourseManifest }>;
type ModuleLoader = () => Promise<{ default: ContentModule }>;

const COURSE_MANIFESTS: Record<string, ManifestLoader> = {
  "791381": () => import("./791381/manifest"),
};

// Module BODY loaders per course. Each converted module body is registered here as its own
// `import("./791381/modules/<id>")` chunk (m01, m02, m07, m08, m09, m10, m11, m12, m13, m14, m15, m16, m17, m18, m03, m19, m04, m20, m21 and m22 today); manifest modules without an entry are still
// skeleton-only and the Reader shows them as «قيد الإعداد».
const COURSE_MODULE_LOADERS: Record<string, Record<string, ModuleLoader>> = {
  // REAL module bodies, each its own lazy chunk; the main bundle imports none of these eagerly.
  //   m01 — Unit 1 (PDF 7–13), complete (Phase 3B)
  //   m02 — Unit 2 (PDF 14–23), complete (Phase 3B–3D)
  //   m07 — Unit 3 «عناوين IP» (PDF 24–33), complete (Phase 3E). It is `m07` (the next free stable module id), NOT
  //         `m03`: the historical m03 skeleton (CLI/VLAN, PDF 123+) keeps its id; reading position comes from `order`.
  //   m08 — Unit 4 «Class و Subnet و CIDR» (PDF 34–46), m09 — Unit 5 «أجهزة الشبكات» (PDF 48–56; PDF 47 is the batch
  //         divider), m10 — Unit 6 «أنواع شبكات الاتصال» (PDF 57–60): complete (Units 4–6 phase), orders 4–6.
  //   m11 — Unit 7 «الكوابل وعنوان MAC» (PDF 61–65), m12 — Unit 8 «أنواع الرسائل» + the batch-2 summary (PDF 66–75):
  //         complete (Units 7–8 phase), orders 7–8.
  //   m13 — Batch 3 «نماذج الاتصال · OSI و TCP/IP» (PDF 77–86; PDF 76 is the batch divider): complete, order 9.
  //   m14 — Batch 4 «البروتوكولات» (PDF 87–92): complete, order 10.
  //   m15 — Batch 4 «أوامر فحص الشبكة» (PDF 93–97): complete, order 11.
  //   m16 — Batch 4 «المجالات والمفاهيم» (PDF 98–106): complete, order 12.
  //   m17 — Batch 5 «أمان الشبكات» (PDF 108–115; PDF 107 is the part cover): complete, order 13.
  //   m18 — Batch 5 «تجزئة البيانات» (PDF 116–119): complete, order 14.
  //   m03 — Batch 6 «برمجة السويتش CLI و VLAN» (PDF 121–138; PDF 120 is the batch cover): the historical Phase-2
  //         skeleton COMPLETED IN PLACE (same id, title, lesson l01 and historical page ids p01/p02), order 15.
  //   m19 — Batch 7 «إدارة VLAN: VTP» (PDF 140–144; PDF 139 is the section cover): NEW stable id, order 16.
  //   m04 — Batch 7 «Trunk و Router on a Stick» (PDF 146–157; PDF 145 is the section cover): the historical Phase-2
  //         skeleton COMPLETED IN PLACE (same id, title, lesson l01 and historical page id p01), order 17.
  //   m20 — Batch 8 «Wi-Fi والشبكات اللاسلكية» (PDF 159–165; PDF 158 is the fifth-batch cover): NEW stable id, order 18.
  //   m21 — Batch 8 «IPv6 والمنافذ» (PDF 166–168): NEW stable id, order 19.
  //   m22 — Batch 8 «بروتوكول DHCP» (PDF 169–179; the first module with interactive CLI exercises): NEW stable id, order 20.
  //         PDF 180+ (Port Security, passwords, the command reference m05, ACL m06) is not converted.
  // The remaining skeleton modules (m05–m06) have no body yet, so the Reader shows them as «قيد الإعداد».
  "791381": {
    "791381-m01": () => import("./791381/modules/m01"),
    "791381-m02": () => import("./791381/modules/m02"),
    "791381-m07": () => import("./791381/modules/m07"),
    "791381-m08": () => import("./791381/modules/m08"),
    "791381-m09": () => import("./791381/modules/m09"),
    "791381-m10": () => import("./791381/modules/m10"),
    "791381-m11": () => import("./791381/modules/m11"),
    "791381-m12": () => import("./791381/modules/m12"),
    "791381-m13": () => import("./791381/modules/m13"),
    "791381-m14": () => import("./791381/modules/m14"),
    "791381-m15": () => import("./791381/modules/m15"),
    "791381-m16": () => import("./791381/modules/m16"),
    "791381-m17": () => import("./791381/modules/m17"),
    "791381-m18": () => import("./791381/modules/m18"),
    "791381-m03": () => import("./791381/modules/m03"),
    "791381-m19": () => import("./791381/modules/m19"),
    "791381-m04": () => import("./791381/modules/m04"),
    "791381-m20": () => import("./791381/modules/m20"),
    "791381-m21": () => import("./791381/modules/m21"),
    "791381-m22": () => import("./791381/modules/m22"),
  },
};

/** Whether the registry knows a course's content (its manifest is registered). Pure, no import triggered. */
export function hasCourseContent(courseId: string): boolean {
  return Object.prototype.hasOwnProperty.call(COURSE_MANIFESTS, courseId);
}

/** The registered course ids. Pure, no import triggered. */
export function registeredCourseIds(): string[] {
  return Object.keys(COURSE_MANIFESTS);
}

/**
 * Load a course's lightweight manifest (TOC identities only). Triggers exactly ONE lazy chunk import for that
 * course's manifest and nothing else — no module bodies, no page blocks, no network.
 */
export async function loadCourseManifest(courseId: string): Promise<LearningCourseManifest> {
  const loader = COURSE_MANIFESTS[courseId];
  if (!loader) throw new LearningContentError("unknown-course", `no content registered for course "${courseId}"`);
  return (await loader()).default;
}

/** Whether a specific module BODY is registered (791381: m01, m02, m07–m18, m03, m19, m04, m20, m21, m22 today). Pure, no import triggered. */
export function hasModuleContent(courseId: string, moduleId: string): boolean {
  return Boolean(COURSE_MODULE_LOADERS[courseId] && Object.prototype.hasOwnProperty.call(COURSE_MODULE_LOADERS[courseId], moduleId));
}

/** Load a single module BODY (its pages + blocks) as its own lazy chunk. Throws for an unknown course/module. */
export async function loadModuleContent(courseId: string, moduleId: string): Promise<ContentModule> {
  const perCourse = COURSE_MODULE_LOADERS[courseId];
  if (!perCourse) throw new LearningContentError("unknown-course", `no content registered for course "${courseId}"`);
  const loader = perCourse[moduleId];
  if (!loader) throw new LearningContentError("unknown-module", `no body registered for module "${moduleId}" of course "${courseId}"`);
  return (await loader()).default;
}
