// One outline icon per printed box family (courseTheme.ts → CalloutTone), drawn in the app's icon language (20×20,
// stroke = currentColor, 1.6 px, round joins — see src/icons.tsx). Decorative: the printed label beside it carries the
// meaning, so every icon is aria-hidden and adds no text.

import type { ReactNode } from "react";
import type { CalloutTone } from "./courseTheme";

const PATHS: Readonly<Record<CalloutTone, ReactNode>> = {
  // تذكّر — a bookmark ribbon
  remember: <path d="M6 2.5h8a1 1 0 0 1 1 1V17l-5-3.2L5 17V3.5a1 1 0 0 1 1-1z" />,
  // انتبه — a warning triangle
  warning: <><path d="M10 2.9 18.2 16.6H1.8z" /><path d="M10 8v4" /><path d="M10 14.4v.1" /></>,
  // مثال — a pencil
  example: <><path d="M13.6 3.4l3 3L7 16H4v-3z" /><path d="M11.6 5.4l3 3" /></>,
  // الفكرة — a light bulb
  idea: <><path d="M10 2.6a5 5 0 0 0-3 9V14h6v-2.4a5 5 0 0 0-3-9z" /><path d="M8 17h4" /></>,
  // قاعدة — a ruler
  rule: <><rect x="2.5" y="6.5" width="15" height="7" rx="1.2" /><path d="M5.5 6.5v3M8.5 6.5v2M11.5 6.5v3M14.5 6.5v2" /></>,
  // لاحظ — an eye
  note: <><path d="M1.9 10S4.9 4.6 10 4.6 18.1 10 18.1 10 15.1 15.4 10 15.4 1.9 10 1.9 10z" /><circle cx="10" cy="10" r="2.4" /></>,
  // خطأ شائع — a crossed circle
  mistake: <><circle cx="10" cy="10" r="7.4" /><path d="M7.4 7.4l5.2 5.2M12.6 7.4l-5.2 5.2" /></>,
  // تشبيه — two linked rings
  analogy: <><path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1" /><path d="M11.4 8.6a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1" /></>,
  // الوقاية — a shield with a check
  prevention: <><path d="M10 2.5 16.5 5v5c0 4-3 6.5-6.5 7.5C6.5 16.5 3.5 14 3.5 10V5z" /><path d="M7.3 10l1.9 1.9L13 8.1" /></>,
  // الفائدة — a star
  benefit: <path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5L10 14.2l-4.5 2.4.9-5-3.6-3.5 5-.7z" />,
  // لماذا؟ — a question in a circle
  why: <><circle cx="10" cy="10" r="7.4" /><path d="M7.9 7.9a2.2 2.2 0 1 1 3.1 2c-.6.3-1 .8-1 1.5v.4" /><path d="M10 14.2v.1" /></>,
  // للامتحان — a graduation cap
  exam: <><path d="M1.6 7.6 10 3.6l8.4 4L10 11.6z" /><path d="M5 9.3v3.9c0 1.2 2.2 2.4 5 2.4s5-1.2 5-2.4V9.3" /><path d="M18.4 7.6v4.3" /></>,
};

export default function CalloutToneIcon({ tone, size = 20 }: { tone: CalloutTone; size?: number }) {
  return (
    <svg
      className="booklet-callout-icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[tone]}
    </svg>
  );
}
