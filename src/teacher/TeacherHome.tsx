import { useState, type ReactNode } from "react";
import { BRAND_NAME, BRAND_TAGLINE } from "../brand";
import {
  IconDashboard, IconBook, IconStudents, IconAssignments, IconBank, IconBuilder, IconReports, IconSparkles, IconMail, IconProjects,
  IconChevronBack
} from "../icons";
import { NAV_LABELS, type TeacherNavId } from "../shell/teacherNav";
import { navAllowed, type TeacherAccessView } from "../shell/teacherAccess";
import { DEFAULT_TEACHER_NAME } from "./teacherProfile";
import "./teacherHome.css";

// Teacher home — the welcome page a teacher lands on after signing in, and the page the top bar's «الرئيسية» opens. PRESENTATION
// ONLY: it fetches nothing and holds no state; every card is a shortcut to an existing destination, offered only when the shell
// would offer it (navAllowed — the server still decides on every route).

type Feature = { id: TeacherNavId; icon: (p: { size?: number }) => ReactNode; text: string };

const FEATURES: Feature[] = [
  { id: "dashboard", icon: IconDashboard, text: "صورة يومية لصفوفك: ما ينتظر التصحيح، والواجبات المفتوحة، ومن يحتاج متابعة." },
  { id: "learning", icon: IconBook, text: "مواد ودروس تفاعلية منظمة حسب المادة والوحدة، جاهزة للعرض في الصف." },
  { id: "students", icon: IconStudents, text: "إدارة الصفوف والطلاب وحساباتهم في مكان واحد." },
  { id: "assignments", icon: IconAssignments, text: "إسناد الواجبات والامتحانات، ومتابعة التسليم والتصحيح وسجل العلامات." },
  { id: "builder", icon: IconBuilder, text: "بناء امتحان كامل بمساعدة الذكاء الاصطناعي أو من مخزن الأسئلة، ومراجعته قبل الحفظ." },
  { id: "bank", icon: IconBank, text: "امتحاناتك المحفوظة ومكتبة الأسئلة المصنّفة، جاهزة لإعادة الاستخدام." },
  { id: "projects", icon: IconProjects, text: "متابعة مراحل مشاريع الطلاب وتقييمها خطوة بخطوة." },
  { id: "reports", icon: IconReports, text: "تقارير الأداء على مستوى الصف والطالب والسؤال لاتخاذ قرارات أدق." },
  { id: "messages", icon: IconMail, text: "تواصل مباشر مع الطلاب وإعلانات للصفوف." },
  { id: "games", icon: IconSparkles, text: "ألعاب تعليمية تنافسية تحوّل المراجعة إلى نشاط ممتع." }
];

const STEPS: { title: string; text: string }[] = [
  { title: "جهّز صفوفك", text: "أضف الصفوف والطلاب وأنشئ حساباتهم." },
  { title: "أنشئ التقييم", text: "ابنِ امتحانًا أو اختر واحدًا من البنك وأسنده كواجب." },
  { title: "تابع وحلّل", text: "راجع التسليمات والنتائج والتقارير من لوحة المتابعة." }
];

function greeting(now: Date): string {
  const h = now.getHours();
  return h >= 4 && h < 12 ? "صباح الخير" : "مساء الخير";
}

type Props = {
  displayName: string;
  schoolName?: string | null;
  access?: TeacherAccessView | null;
  onNavigate: (id: TeacherNavId) => void;
  /** Tests only — the clock the greeting reads. */
  now?: Date;
};

export default function TeacherHome({ displayName, schoolName = null, access = null, onNavigate, now }: Props) {
  const features = FEATURES.filter(f => navAllowed(f.id, access));
  const canDashboard = navAllowed("dashboard", access);
  const canBuild = navAllowed("builder", access);
  // the greeting names the teacher; the generic fallback «المعلم» is not a name, so it is left out («مساء الخير» alone)
  const name = displayName.trim() === DEFAULT_TEACHER_NAME ? "" : displayName.trim();
  const [clock] = useState(() => now || new Date());
  return (
    <div className="eb-home">
      <section className="eb-home-hero" aria-labelledby="eb-home-title">
        <div className="eb-home-hero-text">
          <p className="eb-home-greeting">{greeting(clock)}{name ? <>، <bdi>{name}</bdi></> : null}</p>
          <h2 id="eb-home-title" className="eb-home-title">
            <span>مرحبًا بك في <bdi dir="ltr">{BRAND_NAME}</bdi></span>
            <span className="eb-home-tagline">{BRAND_TAGLINE}</span>
          </h2>
          <p className="eb-home-lead">
            منصة واحدة تجمع التدريس والتقييم والمتابعة: حضّر موادك، وابنِ امتحاناتك، وأسند الواجبات، وتابع تقدّم كل طالب بتقارير
            واضحة — كل ذلك من مكان واحد.
          </p>
          {schoolName && <p className="eb-home-school">مدرستك: <bdi>{schoolName}</bdi></p>}
          {(canDashboard || canBuild) && (
            <div className="eb-home-actions">
              {canDashboard && <button type="button" className="eb-button is-primary eb-home-cta" onClick={() => onNavigate("dashboard")}>الذهاب إلى {NAV_LABELS.dashboard}</button>}
              {canBuild && <button type="button" className="eb-button eb-home-cta" onClick={() => onNavigate("builder")}>إنشاء امتحان جديد</button>}
            </div>
          )}
        </div>
        <div className="eb-home-art" aria-hidden="true"><HomeIllustration /></div>
      </section>

      {features.length > 0 && (
        <section className="eb-home-section" aria-labelledby="eb-home-features">
          <h2 id="eb-home-features" className="eb-home-section-title">ماذا تقدّم لك المنصة</h2>
          <ul className="eb-home-grid">
            {features.map(f => {
              const Icon = f.icon;
              return (
                <li key={f.id}>
                  <button type="button" className="eb-home-card" onClick={() => onNavigate(f.id)}>
                    <span className="eb-home-card-icon" aria-hidden="true"><Icon size={22} /></span>
                    <span className="eb-home-card-body">
                      <span className="eb-home-card-title">{NAV_LABELS[f.id]}</span>
                      <span className="eb-home-card-text">{f.text}</span>
                    </span>
                    <span className="eb-home-card-go" aria-hidden="true"><IconChevronBack size={16} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="eb-home-section" aria-labelledby="eb-home-steps">
        <h2 id="eb-home-steps" className="eb-home-section-title">ابدأ في ثلاث خطوات</h2>
        <ol className="eb-home-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="eb-home-step">
              <span className="eb-home-step-num" aria-hidden="true">{i + 1}</span>
              <span className="eb-home-step-title">{s.title}</span>
              <span className="eb-home-step-text">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The hero's decorative illustration: a class board with an exam sheet, a results chart, books and a graduation cap. Colours
 *  come from the theme tokens (teacherHome.css), so it follows the teacher's palette and dark mode. */
function HomeIllustration() {
  return (
    <svg viewBox="0 0 360 260" width="100%" height="100%" focusable="false">
      <ellipse className="ill-blob" cx="190" cy="138" rx="160" ry="112" />
      <circle className="ill-dot" cx="52" cy="58" r="6" />
      <circle className="ill-dot-2" cx="322" cy="44" r="9" />
      <circle className="ill-dot" cx="334" cy="214" r="5" />
      {/* board */}
      <rect className="ill-board" x="78" y="40" width="190" height="132" rx="14" />
      <rect className="ill-board-bar" x="78" y="40" width="190" height="22" rx="14" />
      <rect className="ill-board-bar" x="78" y="52" width="190" height="10" />
      <circle className="ill-surface" cx="94" cy="51" r="3.5" />
      <circle className="ill-surface" cx="106" cy="51" r="3.5" />
      <circle className="ill-surface" cx="118" cy="51" r="3.5" />
      {/* exam lines with checks */}
      <rect className="ill-check-bg" x="96" y="78" width="16" height="16" rx="4" />
      <path className="ill-check" d="m100 86 3 3 6-6" />
      <rect className="ill-line" x="120" y="81" width="86" height="8" rx="4" />
      <rect className="ill-check-bg" x="96" y="104" width="16" height="16" rx="4" />
      <path className="ill-check" d="m100 112 3 3 6-6" />
      <rect className="ill-line" x="120" y="107" width="70" height="8" rx="4" />
      <rect className="ill-check-bg is-open" x="96" y="130" width="16" height="16" rx="4" />
      <rect className="ill-line" x="120" y="133" width="80" height="8" rx="4" />
      {/* chart card */}
      <rect className="ill-card" x="206" y="96" width="120" height="96" rx="14" />
      <rect className="ill-bar" x="226" y="152" width="14" height="24" rx="3" />
      <rect className="ill-bar" x="248" y="136" width="14" height="40" rx="3" />
      <rect className="ill-bar is-strong" x="270" y="120" width="14" height="56" rx="3" />
      <rect className="ill-bar" x="292" y="140" width="14" height="36" rx="3" />
      <path className="ill-trend" d="M224 140 250 124 274 108 302 116" />
      <rect className="ill-line" x="222" y="106" width="44" height="6" rx="3" />
      {/* books */}
      <rect className="ill-book-1" x="44" y="186" width="96" height="16" rx="4" />
      <rect className="ill-book-2" x="52" y="170" width="86" height="16" rx="4" />
      <rect className="ill-book-3" x="40" y="154" width="92" height="16" rx="4" />
      <rect className="ill-surface" x="50" y="160" width="40" height="4" rx="2" />
      {/* graduation cap */}
      <path className="ill-cap" d="m150 206 34-15 34 15-34 15Z" />
      <path className="ill-cap-2" d="M164 212v12c0 5 9 9 20 9s20-4 20-9v-12l-20 9Z" />
      <path className="ill-tassel" d="M218 206v18" />
      <circle className="ill-tassel-end" cx="218" cy="226" r="3.5" />
      {/* sparkles */}
      <path className="ill-spark" d="M300 62v16M292 70h16" />
      <path className="ill-spark" d="M60 110v10M55 115h10" />
      <rect className="ill-floor" x="30" y="236" width="310" height="4" rx="2" />
    </svg>
  );
}
