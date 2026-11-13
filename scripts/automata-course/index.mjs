// AUTO-A2 — the course «الوحدة الخامسة: الأتمتة»: its identity, its overview sections and its units in reading order.
import u01 from "./u01.mjs";
import u02 from "./u02.mjs";
import u03 from "./u03.mjs";
import u04 from "./u04.mjs";
import u05 from "./u05.mjs";

export const COURSE = {
  id: "AUTO",
  title: "الوحدة الخامسة: الأتمتة",
  batches: [
    { id: "intro", label: "الكلمات واللغات", units: [1] },
    { id: "b1", label: "الأوتومات المنتهي الحتمي", units: [2, 3, 4] },
    { id: "b2", label: "غير الحتمي واللغات المنتظمة", units: [5] },
  ],
};

export const UNITS = [u01, u02, u03, u04, u05];
