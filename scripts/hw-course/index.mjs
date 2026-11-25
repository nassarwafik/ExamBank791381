// HW-A2 — the course «أنظمة محوسبة» (791283): its identity, its overview sections and its units in reading order.
import u01 from "./u01.mjs";
import u02 from "./u02.mjs";
import u03 from "./u03.mjs";
import u04 from "./u04.mjs";

export const COURSE = {
  id: "791283",
  title: "أنظمة محوسبة",
  subject: "أنظمة محوسبة",
  book: "كتاب أنظمة محوسبة",
  batches: [
    { id: "b1", label: "مقدمة في مكونات الحاسوب", units: [1] },
    { id: "b2", label: "مكونات الحاسوب الشخصي", units: [2] },
    { id: "b3", label: "الأمن والأمان في المختبر", units: [3] },
    { id: "b4", label: "نظام التشغيل", units: [4] },
  ],
};

export const UNITS = [u01, u02, u03, u04];
