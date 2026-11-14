// DS-A2 — the course «مبنى المعطيات»: its identity, its overview sections, the book's chapters and its units in reading order.
import u00 from "./u00.mjs";
import u01 from "./u01.mjs";
import u02 from "./u02.mjs";
import u03 from "./u03.mjs";
import u04 from "./u04.mjs";
import u05 from "./u05.mjs";
import u06 from "./u06.mjs";
import u07 from "./u07.mjs";
import u08 from "./u08.mjs";

export const COURSE = {
  id: "899271d",
  title: "مبنى المعطيات",
  subject: "علم الحاسوب",
  batches: [
    { id: "intro", label: "المقدّمة", units: [0] },
    { id: "b1", label: "التراجعية والنجاعة", units: [1, 2] },
    { id: "b2", label: "سلاسل الخلايا المترابطة", units: [3] },
    { id: "b3", label: "الراصّة والدور", units: [4, 5] },
    { id: "b4", label: "الأشجار الثنائية", units: [6, 7] },
    { id: "summary", label: "مراجعة شاملة", units: [8] },
  ],
};

/** The chapters of the book «مقدّمة في مباني المعلومات بلغة C#» by their printed pages (its table of contents). */
export const CHAPTERS = [
  { n: 0, from: 1, to: 6, label: "المقدّمة" },
  { n: 1, from: 7, to: 60, label: "الفصل الأول «العمليات التراجعية»" },
  { n: 2, from: 61, to: 104, label: "الفصل الثاني «تحليل نجاعة الألغوريثمات»" },
  { n: 3, from: 105, to: 178, label: "الفصل الثالث «سلاسل الخلايا المترابطة»" },
  { n: 4, from: 179, to: 194, label: "الفصل الرابع «الراصّة»" },
  { n: 5, from: 195, to: 242, label: "الفصل الخامس «قائمة الانتظار – الدور»" },
  { n: 6, from: 243, to: 310, label: "الفصل السادس «الأشجار الثنائية»" },
];

export const UNITS = [u00, u01, u02, u03, u04, u05, u06, u07, u08];
