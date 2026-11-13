// AUTO-A2 — the course «الوحدة الخامسة: الأتمتة»: its identity, its overview sections and its units in reading order.
import u01 from "./u01.mjs";
import u02 from "./u02.mjs";
import u03 from "./u03.mjs";
import u04 from "./u04.mjs";
import u05 from "./u05.mjs";
import u06 from "./u06.mjs";
import u07 from "./u07.mjs";
import u08 from "./u08.mjs";
import u09 from "./u09.mjs";
import u10 from "./u10.mjs";
import u11 from "./u11.mjs";

export const COURSE = {
  id: "899271",
  title: "الأتمتة",
  subject: "علم الحاسوب",
  batches: [
    { id: "intro", label: "الكلمات واللغات", units: [1] },
    { id: "b1", label: "الأوتومات المنتهي الحتمي", units: [2, 3, 4] },
    { id: "b2", label: "غير الحتمي واللغات المنتظمة", units: [5, 6, 7] },
    { id: "b3", label: "أوتومات المكدّس", units: [8, 9] },
    { id: "b4", label: "آلة تورنغ", units: [10] },
    { id: "summary", label: "مراجعة وأسئلة بجروت", units: [11] },
  ],
};

export const UNITS = [u01, u02, u03, u04, u05, u06, u07, u08, u09, u10, u11];
