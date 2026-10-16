import type { ReactNode } from "react";
import type { StructuredExam } from "../examTypes";
import type { ToolbarItem } from "../builder/BuilderToolbar";
import { IconChevronBack, IconFile } from "../icons";
import type { StudioStepKey } from "./studioSteps";

// Phase 21F.7 — the Studio's setup step: the exam's identity (title), its cover and general instructions (the EXISTING cover editor,
// passed in by the builder) and the design tools a teacher sets up before writing questions (blueprint, quality policies, academic
// presets, presentation). Every tool is the builder's own menu item: the same handler, dialog and gate as the «أدوات» menu.

type Props = {
  exam: StructuredExam;
  onTitle: (title: string) => void;
  coverEditor: ReactNode;
  tools: readonly ToolbarItem[];
  disabled: boolean;
  onStep: (step: StudioStepKey) => void;
};

/** The setup tools, in the order a teacher meets them, each with what it is for. */
const SETUP_TOOLS: readonly { key: string; note: string }[] = [
  { key: "blueprint", note: "المادة والمواضيع والأهداف والقيود العددية للامتحان." },
  { key: "policy", note: "القواعد التي تمنع الاعتماد أو تنبّه قبل النشر." },
  { key: "presets", note: "ابدأ من تصميم أكاديمي محفوظ، أو احفظ هذا التصميم كقالب." },
  { key: "studio", note: "السمة والخطوط وشكل الصفحة كما يراها الطالب." }
];
const titleId = "st-setup-title";

export default function StudioSetup({ exam, onTitle, coverEditor, tools, disabled, onStep }: Props) {
  const questions = exam.sections.reduce((n, s) => n + s.questions.length, 0);
  const available = SETUP_TOOLS.map(t => ({ ...t, item: tools.find(i => i.key === t.key) })).filter((t): t is { key: string; note: string; item: ToolbarItem } => !!t.item);
  return (
    <div className="st-step-view st-setup" data-studio-step="setup">
      <div className="st-step-grid">
        <header className="st-step-head">
          <div>
            <h2>إعداد الامتحان</h2>
            <p>العنوان والغلاف والتعليمات العامة، وأدوات التصميم قبل كتابة الأسئلة.</p>
          </div>
          <div className="st-row-actions">
            <button type="button" className="st-btn is-primary" onClick={() => onStep("content")}>متابعة إلى المحتوى<IconChevronBack size={16} aria-hidden="true" /></button>
          </div>
        </header>
        <div className="st-cols is-two">
          <section className="st-panel" aria-labelledby="st-setup-identity">
            <h3 id="st-setup-identity">هوية الامتحان</h3>
            <label className="st-field" htmlFor={titleId}>
              <span>عنوان الامتحان</span>
              <input id={titleId} className="st-input is-large" value={exam.title ?? ""} placeholder="امتحان بلا عنوان" onChange={e => onTitle(e.target.value)} disabled={disabled} />
            </label>
            <dl className="st-kv">
              <dt>الأقسام</dt><dd>{exam.sections.length}</dd>
              <dt>الأسئلة</dt><dd>{questions}</dd>
              <dt>الحالة</dt><dd>{exam.status === "final" ? "معتمد نهائيًا" : "مسودة"}</dd>
            </dl>
          </section>
          <section className="st-panel" aria-labelledby="st-setup-tools">
            <h3 id="st-setup-tools">أدوات التصميم</h3>
            {available.length
              ? <ul className="st-tool-list">{available.map(({ key, note, item }) => (
                  <li key={key} className="st-tool" data-setup-tool={key}>
                    <span className="st-tool-ic" aria-hidden="true">{item.icon ?? <IconFile size={18} />}</span>
                    <div><b>{item.label}</b><span>{note}</span></div>
                    <button type="button" className="st-btn is-small" onClick={item.onSelect} disabled={item.disabled} aria-haspopup={item.dialog ? "dialog" : undefined} aria-label={"فتح " + item.label}>فتح</button>
                  </li>
                ))}</ul>
              : <p className="st-sub">لا توجد أدوات تصميم متاحة.</p>}
          </section>
        </div>
        <section className="st-panel st-setup-cover" aria-label="الغلاف والتعليمات العامة">
          {coverEditor}
        </section>
      </div>
    </div>
  );
}
