// Learning Materials — Phase 3B PILOT: REAL body for Book 791381, module m02 (الأعداد والموازين).
//
// PARTIAL conversion: only the Unit-2 OPENER (source PDF 14) is authored in this pilot. The module's manifest also
// lists later pages (PDF 16/18/20) that are NOT converted yet — so this body sets `partial: true`, and the Reader
// shows those later pages as the professional "قيد الإعداد" state (not a "missing content" integrity error). The
// opener does NOT teach binary conversion; the next batch continues the number-system content. NOTHING beyond PDF 14.

import type { ContentModule, ContentSource } from "../../types";

const src = (pdf: number): ContentSource => ({ kind: "book", sourceId: "791381", pdfPageStart: pdf });

const m02: ContentModule = {
  id: "791381-m02",
  title: "الأعداد والموازين",
  shortTitle: "الأعداد",
  order: 2,
  // This batch converts only the opener; the rest of m02 (PDF 16/18/20) is authored later.
  partial: true,
  lessons: [
    {
      id: "791381-m02-l00",
      title: "افتتاحية الوحدة",
      order: 0,
      pages: [
        {
          id: "791381-m02-l00-p01",
          title: "الأعداد والموازين",
          order: 1,
          layout: "opener",
          source: src(14),
          blocks: [
            {
              id: "m02-l00-p01-opener", type: "unit-opener", origin: "book",
              unitLabel: "الوحدة الثانية", unitNumber: "02", title: "الأعداد والموازين",
              subtitle: "العشري، الثنائي، السادس عشر، والتحويل بينها.",
              goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
            },
          ],
        },
      ],
    },
  ],
};

export default m02;
