#!/usr/bin/env node
// 899371 P2 (docs/enterprise-899371-learning-plan.md §14) — generates the course «أسس علم الحاسوب» (899371) from the owner's Word
// source, so every book block is TRACEABLE to its source paragraph and the conversion is repeatable:
//   node scripts/convert-899371.mjs            → src/learning/content/899371/modules/mNN.ts + manifest.ts
//
// What the converter does (and only this; src/learning/content/899371/fidelity.p2.test.ts proves it against the source):
//   • reads the body with scripts/lib/docx-source.mjs (exact text, line breaks, bold / monospace runs, list formats, tables, images);
//   • walks the paragraph ranges of the STRUCTURE map below (module → lesson → page); every non-empty source line inside a range
//     becomes exactly one block (or one line of a code / list block) of origin "book", in source order;
//   • classifies each LINE: C# code (monospace, or code-shaped with no Arabic outside its strings / comments) → one `code` block per
//     run of code lines (language csharp, common indentation removed, nothing else changed); a numbered paragraph or a «• » / «* »
//     line → a `list` item; a bold line → a heading (summaries) or a strong text line (questions); anything else → a `text` line;
//   • reads the Markdown left in the source as the formatting it was meant to be (decision P2-a): **…** → strong, `…` → code span,
//     «C\#» → «C#», a stray «**» is dropped. Every such place is listed in the generated MARKERS log;
//   • applies ONLY the owner-approved corrections (§12.4) of the CORRECTIONS list — each must match its paragraph exactly once;
//   • replaces the two question FIGURES of chapter 4 (images) by the tables they show (decision P2-c), transcribed in FIGURES;
//     keeps the seven matrix figures of chapter 10 as the book's own drawings (protected PNG, exact bytes, full alt; P3-c).
// The table of contents (¶5) is the Reader's own; the cover picture (¶2) and the decorative rule ¶1174 are not content (P2-b, P3-b).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readDocxBody, readZipEntry } from "./lib/docx-source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_FILE = join(ROOT, "أسس علم الحاسوب 899371.docx");
const OUT = join(ROOT, "src", "learning", "content", "899371");
const CID = "899371";
const UNIT_LABEL = "أسس علم الحاسوب · نموذج 899371";   // the running header printed on every page of the book

// ── the structure map (paragraph indices of the Word body; `to` inclusive) ─────────────────────────────────────────────────────
// Lesson titles are the book's own table-of-contents entries; page titles are the book's own heading at that point (an emoji or a
// numbering mark in front of it is kept in the block, not in the title).
export const STRUCTURE = [
  { n: 0, title: "افتتاحية", batch: "intro", toc: 3, lessons: [
    { order: 1, title: "افتتاحية", kind: "front", pages: [
      { from: 0, to: 4, title: "مجمع أسئلة في أسس علم الحاسوب", skip: [2] },
      { from: 6, to: 29, title: "كلمة افتتاحية", asText: [28] },   // ¶28 is the bold signature, not a heading
    ] },
  ] },
  { n: 1, title: "الطباعة والمتغيرات", batch: "b1", chapterTitle: 30, lessons: [
    { order: 1, title: "الطباعة والمتغيرات", kind: "summary", toc: 4, pages: [
      { from: 31, to: 32, title: "ما هو البرنامج في الحاسوب؟" },
      { from: 33, to: 67, title: "الأدوات الأساسية للبرمجة" },
      { from: 68, to: 72, title: "تحديات برمجية بسيطة" },
    ] },
    { order: 2, title: "الوظيفة الأولى بيتية", kind: "assignment", toc: 6, from: 73, to: 115 },
    { order: 3, title: "الوظيفة الأولى برمجة", kind: "assignment", toc: 8, from: 116, to: 128 },
  ] },
  { n: 2, title: "العوامل والتعابير المنطقية", batch: "b1", chapterTitle: 129, lessons: [
    { order: 1, title: "العوامل والتعابير المنطقية", kind: "summary", toc: 9, pages: [
      { from: 130, to: 135, title: "ما الهدف من هذا الفصل؟" },
      { from: 136, to: 149, title: "أنواع العوامل (الأوبيراتورات)" },
      { from: 150, to: 172, title: "أمثلة توضيحية" },
    ] },
    { order: 2, title: "الوظيفة الثانية بيتية", kind: "assignment", toc: 12, from: 173, to: 266, bareNumbers: true },   // questions printed «1.» … «15.»
    { order: 3, title: "الوظيفة الثانية برمجة", kind: "assignment", toc: 15, from: 267, to: 356 },
  ] },
  { n: 3, title: "المكتبة الرياضية", batch: "b1", chapterTitle: 357, lessons: [
    { order: 1, title: "المكتبة الرياضية", kind: "summary", toc: 18, pages: [
      { from: 358, to: 359, title: "مقدمة" },
      { from: 360, to: 382, title: "الدوال في المكتبة Math" },
      { from: 383, to: 396, title: "توليد أعداد عشوائية باستخدام Random" },
    ] },
    { order: 2, title: "الوظيفة الثالثة بيتية", kind: "assignment", toc: 21, from: 397, to: 458 },
    { order: 3, title: "الوظيفة الثالثة برمجة", kind: "assignment", toc: 23, from: 459, to: 533 },
  ] },
  { n: 4, title: "جملة الشرط", batch: "b2", chapterTitle: 534, lessons: [
    { order: 1, title: "جملة الشرط", kind: "summary", toc: 26, pages: [
      { from: 535, to: 543, title: "ما هي جمل الشرط؟ (if statements)" },
      { from: 544, to: 566, title: "أنواع الشروط" },
      { from: 567, to: 576, title: "الشروط المركّبة" },
      { from: 577, to: 587, title: "جداول منطقية" },
      { from: 588, to: 620, title: "مثال مفصل مع جدول متابعة" },
    ] },
    { order: 2, title: "الوظيفة الرابعة بيتية", kind: "assignment", toc: 31, from: 621, to: 747 },
    { order: 3, title: "الوظيفة الرابعة برمجة", kind: "assignment", toc: 37, from: 748, to: 830 },
  ] },
  // ── P3: chapters 5–11 and the closing word ──
  { n: 5, title: "جملة التكرار for", batch: "b2", chapterTitle: 831, lessons: [
    { order: 1, title: "جملة التكرار for", kind: "summary", toc: 41, pages: [
      { from: 832, to: 842, title: "ما هي حلقة التكرار for؟", forceCode: [[835, 838]] },   // the bold general form: one code block
      { from: 843, to: 925, title: "أمثلة" },
      { from: 926, to: 931, title: "تمارين تدريبية" },
    ] },
    { order: 2, title: "الوظيفة الخامسة بيتية", kind: "assignment", toc: 45, from: 932, to: 1060, maxGroupLines: 14 },
    { order: 3, title: "الوظيفة الخامسة برمجة", kind: "assignment", toc: 49, from: 1061, to: 1079, maxGroupLines: 14 },
  ] },
  { n: 6, title: "جملة التكرار while", batch: "b2", chapterTitle: 1080, lessons: [
    { order: 1, title: "جملة التكرار while", kind: "summary", toc: 52, pages: [
      { from: 1081, to: 1087, title: "ما هي حلقة while؟" },
      { from: 1088, to: 1124, title: "أمثلة توضيحية" },
      { from: 1125, to: 1127, title: "الفرق بين while و do-while" },
      { from: 1128, to: 1174, title: "تمارين محلولة", skip: [1174] },   // ¶1174 «~~****~~» is a decorative rule (P3-b)
    ] },
    { order: 2, title: "الوظيفة السادسة بيتية", kind: "assignment", toc: 57, from: 1175, to: 1298, maxGroupLines: 14 },
    { order: 3, title: "الوظيفة السادسة برمجة", kind: "assignment", toc: 61, from: 1299, to: 1316, maxGroupLines: 14 },
  ] },
  { n: 7, title: "العمليات", batch: "b3", chapterTitle: 1317, lessons: [
    { order: 1, title: "العمليات", kind: "summary", toc: 63, pages: [
      { from: 1318, to: 1325, title: "ما هي العملية (الدالة)؟" },
      { from: 1326, to: 1358, title: "كيف نكتب عملية؟", forceCode: [[1328, 1332]] },   // the general form of a method: one code block
      { from: 1359, to: 1373, title: "أنواع إرسال القيم" },
      { from: 1374, to: 1397, title: "مثال 1: حساب عدد الأعداد فوق 90" },
      { from: 1398, to: 1452, title: "أسئلة تتبع بسيطة للطلاب" },
      { from: 1453, to: 1461, title: "نصائح للطلاب" },
    ] },
    { order: 2, title: "الوظيفة السابعة بيتية", kind: "assignment", toc: 68, from: 1462, to: 1612, maxGroupLines: 14 },
    { order: 3, title: "الوظيفة السابعة برمجة", kind: "assignment", toc: 73, from: 1613, to: 1845, maxGroupLines: 14 },
  ] },
  { n: 8, title: "النصوص", batch: "b3", chapterTitle: 1846, lessons: [
    { order: 1, title: "النصوص", kind: "summary", toc: 84, pages: [
      { from: 1847, to: 1848, title: "ما هو النص؟" },
      { from: 1849, to: 1888, title: "أهم العمليات والخصائص على النصوص" },
      { from: 1889, to: 1915, title: "عمليات تُعيد نصوص جديدة" },
      { from: 1916, to: 1935, title: "تمارين وأمثلة تطبيقية مهمة" },
      { from: 1936, to: 1941, title: "ملخص سريع" },
    ] },
    { order: 2, title: "الوظيفة الثامنة بيتية", kind: "assignment", toc: 88, from: 1942, to: 2071, maxGroupLines: 14 },
    { order: 3, title: "الوظيفة الثامنة برمجة", kind: "assignment", toc: 92, from: 2072, to: 2131, maxGroupLines: 14 },
  ] },
  // chapter 9 prints no title line: its opener carries the book's table-of-contents entry «المصفوفات» (¶5)
  { n: 9, title: "المصفوفات", batch: "b4", openerTitle: "المصفوفات", lessons: [
    { order: 1, title: "المصفوفات", kind: "summary", toc: 95, pages: [
      { from: 2132, to: 2145, title: "ما هي المصفوفة؟" },
      { from: 2146, to: 2156, title: "كيفية تخزين المصفوفة في ذاكرة الحاسوب" },
      { from: 2157, to: 2183, title: "الوصول لعناصر المصفوفة" },
      { from: 2184, to: 2220, title: "عمليات شائعة على المصفوفات" },
      { from: 2221, to: 2244, title: "تمارين وأمثلة تطبيقية" },
      { from: 2245, to: 2249, title: "نصائح وأخطاء شائعة" },
    ] },
    { order: 2, title: "الوظيفة التاسعة بيتية", kind: "assignment", toc: 100, from: 2250, to: 2368, maxGroupLines: 14 },
    { order: 3, title: "الوظيفة التاسعة برمجة", kind: "assignment", toc: 104, from: 2369, to: 2451, maxGroupLines: 14 },
  ] },
  { n: 10, title: "مصفوفة ثنائية الابعاد", batch: "b4", chapterTitle: 2452, lessons: [
    { order: 1, title: "مصفوفة ثنائية الابعاد", kind: "summary", toc: 108, pages: [
      { from: 2453, to: 2476, title: "ما هي المصفوفة الثنائية الأبعاد؟" },
      { from: 2477, to: 2500, title: "أمثلة تعليمية مفيدة", asText: [2484, 2485] },   // ¶2484–2485: a printed output, not headings
      { from: 2501, to: 2525, title: "تمارين تطبيقية مقترحة" },
    ] },
    { order: 2, title: "الوظيفة العاشرة بيتية", kind: "assignment", toc: 111, from: 2526, to: 2641, maxGroupLines: 14 },
    { order: 3, title: "الوظيفة العاشرة برمجة", kind: "assignment", toc: 115, from: 2642, to: 2723, maxGroupLines: 14 },
  ] },
  { n: 11, title: "الكائنات", batch: "b5", chapterTitle: 2724, lessons: [
    { order: 1, title: "الكائنات", kind: "summary", toc: 126, pages: [
      { from: 2725, to: 2739, title: "الأساسيات: الفئة والكائن والتغليف" },
      { from: 2740, to: 2788, title: "مثال أساسي (Get/Set يدوي بدون خصائص تلقائية)" },
      { from: 2789, to: 2882, title: "كائنات مُركّبة" },
      { from: 2883, to: 2896, title: "نقاط يجب تذكّرها" },
    ] },
    { order: 2, title: "الوظيفة الحادية عشرة بيتية", kind: "assignment", toc: 131, from: 2897, to: 2961, maxGroupLines: 14 },
    { order: 3, title: "الوظيفة الحادية عشرة برمجة", kind: "assignment", toc: 138, from: 2962, to: 3031, maxGroupLines: 14 },
  ] },
  { n: 12, title: "الكلمة الختامية", batch: "b5", toc: 140, lessons: [
    { order: 1, title: "الكلمة الختامية", kind: "front", pages: [
      { from: 3032, to: 3046, title: "الكلمة الختامية" },
    ] },
  ] },
];

/** The course's overview sections (the book's chapter groups); every module is converted since P3. */
export const BATCHES = [
  { id: "intro", label: "المقدمة" },
  { id: "b1", label: "الأساسيات: الطباعة والمتغيرات والعوامل و Math" },
  { id: "b2", label: "الشرط والتكرار" },
  { id: "b3", label: "العمليات والنصوص" },
  { id: "b4", label: "المصفوفات" },
  { id: "b5", label: "الكائنات" },
];

/** The owner-approved corrections (plan §12.4, 2026-11-09) that fall in the converted range. Each must match exactly once. */
export const CORRECTIONS = [
  { finding: "F1", index: 397, find: "في شبكات الاتصال", replace: "في أسس علم الحاسوب" },
  { finding: "F2", index: 138, cell: [5, 2], find: "5 / 2", replace: "5.0 / 2" },
  { finding: "F6", index: 639, find: "int b;", replace: "int b = int.Parse(Console.ReadLine());" },
  { finding: "F6", index: 705, find: "int x, y;", replace: "int x = int.Parse(Console.ReadLine());\nint y = int.Parse(Console.ReadLine());" },
  // P3 — chapters 5–11
  { finding: "F10", index: 1580, find: "inc(3095): ", replace: "inc(3005): " },
  { finding: "F10", index: 1581, find: "dec(1090): ", replace: "dec(1000): " },
  { finding: "F12", index: 1875, find: " 0 إذا كان النص الأول أكبر أبجديًا", replace: " > 0 إذا كان النص الأول أكبر أبجديًا" },
  { finding: "F14", index: 2001, find: "ملاحظة تربوية: إذا رغبت، يمكنك إضافة حالة اختبار أخرى للطالب مثل: ما ناتج sod(\"abba\", 2)؟", replace: "" },
  { finding: "F14", index: 2054, find: "\nمثال مطلوب من الطالب يراعي أن الدالة تحوّل الحروف إلى صغيرة وتستبدل غير الحروف بنجوم", replace: "" },
  { finding: "F14", index: 2888, find: "بهذا الترتيب: Class → Object → Get/Set يدوي → Access Modifiers → مصفوفة كائنات/كائن يحوي مصفوفة، تحصل على ملخّص واضح ومباشر جاهز للنسخ إلى ملف وورد.", replace: "" },
  { finding: "F14", index: 2940, find: "الجواب", replace: "" },
  { finding: "F16", index: 2645, find: "العنصر الموجود في الصف 3 والعمود 2، وقيمته 10، مجموع الصف = مجموع العمود = 12", replace: "العنصر mat[1, 3] (الصف 1 والعمود 3 بفهارس C# التي تبدأ من 0)، وقيمته 9، مجموع الصف = مجموع العمود = 30" },
  { finding: "F17", index: 2657, find: "public static bool IsRightDiagonalThree(", replace: "public static int IsUnifiedRightDiagonalThree(" },
  { finding: "F17", index: 2659, find: "وتحتوي فقط على أعداد صحيحة.", replace: "وتحتوي فقط على 0 و 1." },
  { finding: "F30", index: 2107, cell: [4, 0], find: "\"9.6/3.2\"", replace: "\"7.5/2.5\"" },
  { finding: "F30", index: 2107, cell: [4, 1], find: "3.0", replace: "3" },
];

/** The question figures (images) of the converted range, transcribed as the tables they show (decision P2-c). RTL column order. */
export const FIGURES = {
  "image2.png": { index: 724, headers: ["", "3 < a", "3 > a", "a = 3"], rows: [["7 < b", "c = 4", "c = 1", "c = 5"], ["7 > b", "c = 5", "c = 4", "c = 3"], ["b = 7", "c = 1", "c = 2", "c = 1"]], columnDirs: ["ltr", "ltr", "ltr", "ltr"] },
  // P3-c — the matrices of chapter 10 stay the book's DRAWINGS (their shading is part of the question): the exact PNG bytes, served
  // protected (api/src/data/content-assets/learning/899371/<sha256-16>.png), with an alt that names every value and every shaded cell.
  "image4.png": { index: 2528, drawing: true, alt: "المصفوفة m بحجم 3 صفوف × 4 أعمدة (العمود 0 يسارًا): الصف 0: 5، 3، 7، 4؛ الصف 1: 2، 2، 2، 2؛ الصف 2: 8، 9، 8، 8." },
  "image5.png": { index: 2551, drawing: true, alt: "المصفوفة game من نوع char بحجم 3×3 (العمود 0 يسارًا): الصف 0: X، O، X؛ الصف 1: O، X، O؛ الصف 2: O، X، X." },
  "image6.png": { index: 2644, drawing: true, alt: "مصفوفة بحجم 5×5 (العمود 0 يسارًا): الصف 0: -4، 0، 7، 14، -3؛ الصف 1: 10، -2، 11، 9، 2؛ الصف 2: 1، 8، 6، 0، 10؛ الصف 3: -7، 4، 9، 2، 15؛ الصف 4: 2، 3، -1، 5، 0. الخلية المظلّلة: الصف 1، العمود 3، قيمتها 9." },
  "image7.png": { index: 2652, drawing: true, alt: "مصفوفتان بحجم 5×6 فوق كل منهما أرقام الأعمدة 0–5. «رقم 1» (يمينًا): الصف 0: 0، 3، 6، 7، 1، 0؛ الصف 1: 17، 1، 1، 2، 5، 1؛ الصف 2: 23، 8، 9، 6، 7، 1؛ الصف 3: 1، 1، 85، 9، 1، 12؛ الصف 4: 0، 43، 1، 31، 4، 1؛ المظلّل: (1،3)=2، (2،4)=7، (3،5)=12. «رقم 2» (يسارًا): الصف 0: 0، 0، 0، 0، 1، 0؛ الصف 1: 1، 1، 1، 0، 0، 1؛ الصف 2: 0، 0، 0، 1، 0، 1؛ الصف 3: 1، 1، 1، 1، 1، 0؛ الصف 4: 0، 0، 1، 0، 0، 0؛ المظلّل: (1،2)=1، (2،3)=1، (3،4)=1." },
  "image8.png": { index: 2662, drawing: true, alt: "مصفوفة بحجم 5×6 مع أرقام الصفوف 0–4 والأعمدة 0–5: الصف 0: 45، 9، 11، 65، 5، 12؛ الصف 1: 2، 4، 7، 17، 23، 67؛ الصف 2: 61، 38، 24، 89، 9، 11؛ الصف 3: 34، 2، 4، 89، 9، 11؛ الصف 4: 65، 42، 11، 9، 38، 4. المظلّل: الصف 2 من العمود 3 إلى 5 (89، 9، 11)، وهو يساوي الصف 3 في الأعمدة نفسها." },
  "image9.png": { index: 2674, drawing: true, alt: "مصفوفة بحجم 3×5 مع أرقام الصفوف 0–2 والأعمدة 0–4: الصف 0: 1، -2، 15، 4، 0؛ الصف 1: 12، 3، 28، 6، 7؛ الصف 2: 0، 5، -57، 12، -3. المظلّل: الصف 1 كاملًا (12، 3، 28، 6، 7) والعمود 3 كاملًا (4، 6، 12)." },
  "image10.png": { index: 2696, drawing: true, alt: "صورتان للمصفوفة نفسها بحجم 5×7 (العمود 0 يسارًا): الصف 0: 39، 72، 3، 8، 0، 2، 54؛ الصف 1: 18، 16، 13، 47، 41، 87، 65؛ الصف 2: 34، 78، 37، 99، 97، 46، 56؛ الصف 3: 51، 50، 12، 31، 58، 63، 18؛ الصف 4: 23، 4، 11، 26، 83، 25، 67. «صورة 1»: المظلّل 39 في (0،0) و13 في (1،2). «صورة 2»: المظلّل 46 و56 في الصف 2 (العمودان 5 و6)، والصف 3 كاملًا، و23 و4 في الصف 4 (العمودان 0 و1)." },
  "image3.png": { index: 739, headers: ["اليوم", "أكثر من 8 ساعات", "أقل أو يساوي 8 ساعات"], rows: [["السبت", "50 شاقل", "40 شاقل"], ["الإثنين.. الخميس", "30 شاقل", "25 شاقل"], ["الجمعة، الأحد", "35 شاقل", "30 شاقل"]] },
};

// ── line classification ──────────────────────────────────────────────────────────────────────────────────────────────────────
const ARABIC = /[؀-ۿ]/;
const CODE_START = /^\s*(static|public|private|protected|class|if|else|for|foreach|while|do|switch|case|return|break|using|namespace|int|double|string|char|bool|var|Random|Console)\b/;
/** Arabic outside C# string / char literals and // comments? */
function arabicOutsideCode(line) {
  const stripped = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "").replace(/\/\/.*$/, "");
  return ARABIC.test(stripped);
}
export function isCodeLine(line, mono) {
  const t = line.trim();
  if (!t) return false;
  if (mono) return !/^(\d+(\.\d+)?\s*[-:])/.test(t) && !arabicOutsideCode(t);   // a monospace question number «1.1 -» is not code
  if (arabicOutsideCode(t)) return false;
  return /[;{}]\s*(\/\/.*)?$/.test(t) || /^[{}]/.test(t) || CODE_START.test(t) && /[(;={]/.test(t) || /^\s*(else|else if\b.*)\s*(\.{3,})?$/.test(t)
    || /^\/\/\s*\S/.test(t) || /^(public |private |protected |internal |static |abstract |sealed )*(class|struct|interface)\s+[A-Za-z_]\w*\s*$/.test(t);
}
const ORDINALS = { "الأول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9, "العاشر": 10 };
const ORDINAL = "(" + Object.keys(ORDINALS).join("|") + ")";
const QUESTION = new RegExp("^\\s*(السؤال|سؤال)\\s*(\\d+|" + ORDINAL + ")|^\\s*\\d{1,2}\\.\\s");
/** The number of a question line («السؤال 3», «سؤال 3 –», «السؤال الثالث -»). */
const questionNumber = text => { const m = new RegExp("(?:السؤال|سؤال)\\s*(\\d+|" + ORDINAL + ")").exec(text) || /^\s*(\d+)\./.exec(text); return m ? (ORDINALS[m[1]] ?? Number(m[1])) : NaN; };
const ASSIGNMENT_TITLE = /^\s*الوظيفة\s.+\sفي\s.+-\s*(بيتية|برمجية|برمجة|تتبع)\s*$/;

// ── Markdown left in the source (decision P2-a) ─────────────────────────────────────────────────────────────────────────────────
/** Spans of one prose line: bold runs → strong, monospace runs → code (ltr); then **…** / `…` / C\# read as formatting. */
export function lineSpans(runs, log, where) {
  const merged = [];
  for (const r of runs) {
    const style = r.mono ? "code" : r.bold ? "strong" : undefined;
    const last = merged[merged.length - 1];
    if (last && last.style === style) last.text += r.text; else merged.push({ text: r.text, style });
  }
  const out = [];
  for (const span of merged) {
    let text = span.text;
    if (/\\[#![\]]/.test(text)) { log.push({ where, marker: "\\#", text: text.match(/\S*\\[#![\]]\S*/)[0] }); text = text.replace(/\\([#![\]])/g, "$1"); }
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        log.push({ where, marker: "**", text: part });
        // a bold run may itself hold `code` («**بإضافة مبلغ `y` من …**», chapter 11): read it too, as code inside the bold
        for (const inner of part.slice(2, -2).split(/(`[^`]+`)/)) {
          if (!inner) continue;
          if (/^`[^`]+`$/.test(inner)) { log.push({ where, marker: "`", text: inner }); out.push({ text: inner.slice(1, -1), style: "code", dir: "ltr" }); }
          else out.push({ text: inner, style: "strong" });
        }
        continue;
      }
      if (/^`[^`]+`$/.test(part)) { log.push({ where, marker: "`", text: part }); out.push({ text: part.slice(1, -1), style: "code", dir: "ltr" }); continue; }
      let rest = part;
      if (rest.includes("**")) { log.push({ where, marker: "** (stray)", text: rest.trim() }); rest = rest.replace(/\*\*/g, ""); }
      out.push(span.style === "code" ? { text: rest, style: "code", dir: "ltr" } : span.style ? { text: rest, style: span.style } : { text: rest });
    }
  }
  // trim the line's own leading / trailing whitespace (layout indentation of the Word page), collapse nothing else
  if (out.length) { out[0].text = out[0].text.replace(/^\s+/, ""); out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, ""); }
  return out.filter(s => s.text !== "");
}

/** Split a paragraph's runs at its line breaks → [{ text, runs }]. */
function splitLines(p) {
  const lines = [{ runs: [] }];
  for (const r of p.runs) {
    const pieces = r.text.split("\n");
    pieces.forEach((piece, i) => { if (i > 0) lines.push({ runs: [] }); if (piece) lines[lines.length - 1].runs.push({ ...r, text: piece }); });
  }
  return lines.map(l => ({ runs: l.runs, text: l.runs.map(r => r.text).join(""), mono: l.runs.length > 0 && l.runs.every(r => r.mono) }));
}
const dedent = lines => {
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(Math.min(ind, l.match(/^ */)[0].length)).replace(/\s+$/, ""));
};

// ── conversion ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function convert(body) {
  const log = [], applied = [];
  const item = i => { const it = body[i]; if (!it) throw new Error("no source item " + i); return it; };
  const corrected = (it) => {
    const fixes = CORRECTIONS.filter(c => c.index === it.index);
    if (!fixes.length) return it;
    const copy = JSON.parse(JSON.stringify(it));
    for (const c of fixes) {
      if (c.cell) {
        const [r, k] = c.cell;
        if (copy.rows[r][k].split(c.find).length !== 2) throw new Error(c.finding + ": no single match in ¶" + c.index);
        copy.rows[r][k] = copy.rows[r][k].replace(c.find, c.replace);
      } else {
        // match on the paragraph's whole text (Word may split «int b;» over coloured runs); the runs the match touches are merged
        const full = copy.runs.map(r => r.text).join("");
        if (full.split(c.find).length !== 2) throw new Error(c.finding + ": no single match in ¶" + c.index);
        const at = full.indexOf(c.find), end = at + c.find.length;
        let pos = 0; const runs = [];
        let merged = null;
        for (const r of copy.runs) {
          const a = pos, b = pos + r.text.length; pos = b;
          if (b <= at || a >= end) { runs.push(r); continue; }
          if (!merged) { merged = { ...r, text: r.text.slice(0, at - a) + c.replace }; runs.push(merged); }
          if (b > end) merged.text += r.text.slice(end - a);
        }
        copy.runs = runs;
        copy.text = copy.runs.map(r => r.text).join("");
      }
      applied.push(c);
    }
    return copy;
  };

  const modules = STRUCTURE.map(mod => {
    const mid = `${CID}-m${String(mod.n).padStart(2, "0")}`;
    const lessons = [];
    if (mod.chapterTitle !== undefined || mod.openerTitle !== undefined) {
      // a chapter without a printed title line takes its table-of-contents entry (¶5) as the opener's title
      const title = (mod.openerTitle ?? item(mod.chapterTitle).text).replace(/\s+/g, " ").trim();
      const at = mod.chapterTitle ?? 5;
      lessons.push({ id: mid + "-l00", title: "افتتاحية الوحدة", order: 0, pages: [{
        id: mid + "-l00-p01", title, order: 1, layout: "opener", source: src(mod.lessons[0].toc, at, at),
        blocks: [{ id: `m${String(mod.n).padStart(2, "0")}-l00-p01-opener`, type: "unit-opener", origin: "book", unitLabel: UNIT_LABEL, unitNumber: String(mod.n).padStart(2, "0"), title }],
      }] });
    }
    for (const les of mod.lessons) {
      const lid = `${mid}-l${String(les.order).padStart(2, "0")}`;
      const ranges = les.kind === "assignment" ? questionPages(body, les) : les.pages;
      const pages = ranges.map((pg, i) => {
        const pid = `${lid}-p${String(i + 1).padStart(2, "0")}`;
        const blocks = blocksOf(body, pg, pid, les.kind, corrected, log);
        return { id: pid, title: pg.title, order: i + 1, source: src(les.toc ?? mod.toc, pg.from, pg.to), blocks };
      });
      lessons.push({ id: lid, title: les.title, order: les.order, pages });
    }
    return { id: mid, title: mod.title, order: mod.n, lessons };
  });
  if (applied.length !== CORRECTIONS.length) throw new Error("a correction did not apply: " + CORRECTIONS.filter(c => !applied.includes(c)).map(c => c.finding).join(", "));
  return { modules, log, applied };
}
const src = (printed, from, to) => ({ kind: "book", sourceId: CID, pdfPageStart: printed, printedPage: printed, sourceNote: from === to ? `¶${from}` : `¶${from}–${to}` });

/** An assignment lesson's pages: one per question that holds code / a table / a figure; question-only lines are grouped (≤ 4). */
function questionPages(body, les) {
  const starts = [];
  for (let i = les.from; i <= les.to; i++) {
    const it = body[i];
    if (it.kind !== "p") continue;
    const text = it.text.replace(/^\n+/, "");
    // «السؤال N» always starts a question; a bare «N.» only in a lesson that numbers its questions that way (chapter 2's homework,
    // «1.» … «15.» in bold) and only on a bold line — the plain «32. -» of ¶97 is sub-question 2.3 printed with a typo (F21), and
    // chapter 11's bold «1. عملية بنائية…» are items inside a question
    const bare = les.bareNumbers === true && /^\s*\d{1,2}\.\s/.test(text);
    if (new RegExp("^\\s*(السؤال|سؤال)\\s*(\\d+|" + ORDINAL + ")").test(text) || bare && it.runs.length > 0 && it.runs.every(r => r.bold)) starts.push(i);
  }
  const groups = [];
  let cursor = les.from;
  starts.forEach((s, k) => {
    // a section heading («🔹 القسم …») right before a question belongs to that question's page
    let begin = s;
    while (begin - 1 >= cursor && body[begin - 1].kind === "p" && (body[begin - 1].text.trim() === "" || /^\s*🔹/.test(body[begin - 1].text))) begin--;
    if (k === 0) begin = les.from;
    const end = (starts[k + 1] ?? les.to + 1) - 1;
    groups.push({ from: begin, to: end, number: questionNumber(body[s].text.replace(/^\n+/, "")) });
    cursor = end + 1;
  });
  // fix the boundaries: each group ends where the next begins
  for (let k = 0; k + 1 < groups.length; k++) groups[k].to = groups[k + 1].from - 1;
  const heavy = g => { for (let i = g.from; i <= g.to; i++) { const it = body[i]; if (it.kind === "table" || it.image || (it.kind === "p" && splitLines(it).some(l => isCodeLine(l.text, l.mono)))) return true; } return false; };
  // light questions are grouped ≤ 4 per page; a lesson may also cap a group's source lines (P3: 14), so a page of long word
  // problems stays a comfortable read — batch A (P2, locked) keeps its grouping
  const lineCount = g => { let n = 0; for (let i = g.from; i <= g.to; i++) if (body[i].kind === "p") n += splitLines(body[i]).filter(l => l.text.trim()).length; return n; };
  const pages = [];
  for (const g of groups) {
    const last = pages[pages.length - 1];
    if (last && !last.heavy && !heavy(g) && last.numbers.length < 4 && last.lines + lineCount(g) <= (les.maxGroupLines ?? Infinity)) { last.to = g.to; last.numbers.push(g.number); last.lines += lineCount(g); continue; }
    pages.push({ from: g.from, to: g.to, numbers: [g.number], heavy: heavy(g), lines: lineCount(g) });
  }
  // the title names every question printed on the page — also one printed inside another's line («… السؤال 10 - …», ¶125, F21)
  return pages.map(p => {
    const nums = new Set(p.numbers.map(Number));
    for (let i = p.from; i <= p.to; i++) if (body[i].kind === "p") for (const m of body[i].text.matchAll(/(?:^|\s)السؤال\s*(\d+)\s*[-:(]/g)) nums.add(Number(m[1]));
    if ([...nums].some(n => !Number.isInteger(n) || n < 1)) throw new Error("a question page without a number in ¶" + p.from + "–" + p.to);
    const sorted = [...nums].sort((a, b) => a - b);
    return { from: p.from, to: p.to, title: sorted.length === 1 ? `السؤال ${sorted[0]}` : `الأسئلة ${sorted[0]}–${sorted[sorted.length - 1]}` };
  });
}

function blocksOf(body, pg, pid, kind, corrected, log) {
  const short = pid.slice(CID.length + 1);
  const blocks = [];
  let n = 0;
  const id = () => `${short}-b${String(++n).padStart(2, "0")}`;
  let code = null, list = null;
  const flushCode = () => { if (code) { const lines = dedent(code.lines); while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); blocks.push({ id: id(), type: "code", origin: "book", language: "csharp", dir: "ltr", code: lines.join("\n") }); code = null; } };
  const flushList = () => { if (list) { blocks.push({ id: id(), type: "list", origin: "book", variant: list.variant, items: list.items.map((t, i) => ({ id: `i${i + 1}`, text: t })) }); list = null; } };
  for (let i = pg.from; i <= pg.to; i++) {
    if (pg.skip && pg.skip.includes(i)) continue;
    const it = corrected(body[i]);
    if (it.kind === "table") {
      flushCode(); flushList();
      if (i === 5) continue;   // the printed table of contents → the Reader's own
      blocks.push(tableBlock(id(), it.rows));
      continue;
    }
    if (it.image) {
      const fig = FIGURES[it.image];
      if (!fig || fig.index !== i) throw new Error("an image without a transcription in ¶" + i + ": " + it.image);
      flushCode(); flushList();
      if (fig.drawing) blocks.push({ id: id(), type: "diagram", origin: "book", src: `/learning-assets/${CID}/${drawingName(it.image)}`, alt: fig.alt });
      else blocks.push({ id: id(), type: "table", origin: "book", headers: fig.headers, rows: fig.rows, ...(fig.columnDirs ? { columnDirs: fig.columnDirs } : {}) });
    }
    const lines = splitLines(it);
    const forced = (pg.forceCode || []).some(([a, b]) => i >= a && i <= b);
    for (const line of lines) {
      if (!line.text.trim()) { if (code) code.lines.push(""); continue; }
      if (forced || isCodeLine(line.text, line.mono)) { flushList(); if (!code) code = { lines: [], ref: i }; code.lines.push(line.text.replace(/\t/g, "    ")); continue; }
      flushCode();
      const bullet = /^\s*[•*]\s+/.test(line.text);
      if (it.numbered || bullet) {
        const variant = it.numbered && it.numbered.format === "decimal" ? "ordered" : "plain";
        const runs = bullet ? stripBullet(line.runs) : line.runs;
        if (!list || list.variant !== variant || (it.numbered && list.numId !== it.numbered.numId)) { flushList(); list = { variant, items: [], numId: it.numbered?.numId }; }
        list.items.push(lineSpans(runs, log, pid));
        continue;
      }
      flushList();
      const bold = line.runs.length > 0 && line.runs.every(r => r.bold);
      const text = line.text.trim();
      if (ASSIGNMENT_TITLE.test(text)) { blocks.push({ id: id(), type: "heading", origin: "book", level: 2, text: text.replace(/\s+/g, " ") }); continue; }
      const headingInAssignment = kind === "assignment" && bold && (/^🔹/.test(text) || text === "الأسئلة" || /^الوظيفة:/.test(text));
      // a short bold label («مثال:», «الناتج:», «✅ الكود:») stays a bold line of text, not a heading
      const label = text.endsWith(":") && text.split(/\s+/).length <= 2;
      if ((kind === "summary" || kind === "front") && bold && !QUESTION.test(text) && !label && !(pg.asText || []).includes(i) || headingInAssignment) {
        const spans = lineSpans(line.runs, log, pid);
        blocks.push({ id: id(), type: "heading", origin: "book", level: 3, text: spans.map(s => s.text).join("") });
        continue;
      }
      const spans = lineSpans(line.runs, log, pid);
      if (spans.length) blocks.push({ id: id(), type: "text", origin: "book", spans });
    }
  }
  flushCode(); flushList();
  return blocks;
}
/** A drawing's protected file name: the first 16 hex of the sha256 of its exact bytes in the Word source. */
let SOURCE_ZIP = null;
export const drawingBytes = image => readZipEntry(SOURCE_ZIP ?? (SOURCE_ZIP = readFileSync(SOURCE_FILE)), "word/media/" + image);
export const drawingName = image => createHash("sha256").update(drawingBytes(image)).digest("hex").slice(0, 16) + ".png";
const stripBullet = runs => { const out = runs.map(r => ({ ...r })); out[0].text = out[0].text.replace(/^\s*[•*]\s+/, ""); return out.filter(r => r.text); };
function tableBlock(id, rows) {
  const [headers, ...body] = rows.map(r => r.map(c => c.replace(/\s+/g, " ").trim()));
  const width = headers.length;
  const cells = body.map(r => r.length === width ? r : [...r, ...Array(Math.max(0, width - r.length)).fill("")].slice(0, width));
  const columnDirs = headers.map((_, k) => (cells.length && cells.every(r => !ARABIC.test(r[k])) ? "ltr" : "rtl"));
  return { id, type: "table", origin: "book", headers, rows: cells, ...(columnDirs.some(d => d === "ltr") ? { columnDirs } : {}) };
}

// ── output ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ts = v => JSON.stringify(v, null, 2);
function moduleFile(mod) {
  const n = mod.id.slice(-3);
  return `// Learning Materials — «أسس علم الحاسوب» (899371), ${mod.order === 0 ? "the opening" : "chapter " + mod.order} «${mod.title}».
//
// GENERATED by scripts/convert-899371.mjs from the owner's Word source (do not edit by hand: change the converter and re-run it).
// Every block is origin "book", converted verbatim from the source paragraphs its page's source note names (¶); the owner-approved
// corrections (plan §12.4) and the reading of the source's Markdown residue (decision P2-a) are the only differences, and
// fidelity.p2.test.ts proves it. The page's source note (¶) names the Word paragraphs it was converted from.

import type { ContentModule } from "../../types";

const ${n}: ContentModule = ${ts(mod)};

export default ${n};
`;
}
function manifestFile(modules) {
  const manifest = {
    schemaVersion: 1, courseId: CID, title: "أسس علم الحاسوب", direction: "rtl",
    modules: modules.map(m => ({ id: m.id, title: m.title, order: m.order, lessons: m.lessons.map(l => ({ id: l.id, title: l.title, order: l.order, pages: l.pages.map(p => ({ id: p.id, title: p.title, order: p.order, source: p.source })) })) })),
    batches: BATCHES.map(b => ({ ...b, moduleIds: STRUCTURE.filter(m => m.batch === b.id).map(m => `${CID}-m${String(m.n).padStart(2, "0")}`) })),
  };
  return `// Learning Materials — content MANIFEST of «أسس علم الحاسوب» (course 899371, مجمع أسئلة نموذج 899371).
//
// GENERATED by scripts/convert-899371.mjs with the module bodies (contentData.sync and course899371.test.ts pin the two equal).
// Module mNN is chapter NN of the book (m00 = its opening); a page's source names the book page of its section (printed table of
// contents) and the Word paragraphs it was converted from. Sections without a converted module yet are shown as «قريبًا».
//
// ID policy: \`899371\` · \`899371-mNN\` · \`899371-mNN-lNN\` · \`899371-mNN-lNN-pNN\` — stable, never regenerated at runtime.

import { LEARNING_CONTENT_SCHEMA_VERSION, type LearningCourseManifest } from "../types";

const manifest: LearningCourseManifest = ${ts(manifest).replace('"schemaVersion": 1', '"schemaVersion": LEARNING_CONTENT_SCHEMA_VERSION')};

export default manifest;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { modules, log, applied } = convert(readDocxBody(readFileSync(SOURCE_FILE)));
  mkdirSync(join(OUT, "modules"), { recursive: true });
  for (const m of modules) writeFileSync(join(OUT, "modules", m.id.slice(-3) + ".ts"), moduleFile(m));
  writeFileSync(join(OUT, "manifest.ts"), manifestFile(modules));
  const assetDir = join(ROOT, "api", "src", "data", "content-assets", "learning", CID);
  const drawings = Object.entries(FIGURES).filter(([, f]) => f.drawing).map(([img]) => img);
  mkdirSync(assetDir, { recursive: true });
  for (const f of readdirSync(assetDir)) rmSync(join(assetDir, f));
  for (const img of drawings) writeFileSync(join(assetDir, drawingName(img)), drawingBytes(img));
  writeFileSync(join(OUT, "conversion-log.json"), JSON.stringify({ markers: log, corrections: applied.map(c => ({ finding: c.finding, index: c.index, find: c.find, replace: c.replace })) }, null, 2) + "\n");
  const pages = modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.pages.length, 0), 0);
  const blocks = modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.pages.reduce((b, p) => b + p.blocks.length, 0), 0), 0);
  console.log(`899371: ${modules.length} modules, ${pages} pages, ${blocks} blocks; ${applied.length} corrections; ${log.length} Markdown markers read as formatting`);
}
