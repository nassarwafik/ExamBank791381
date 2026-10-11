// Phase 21E.0 — real-browser harness (certification only; never shipped) for the design-system foundation fix: the keyboard
// focus ring and the visual-question selection accents on the PRODUCTION stylesheets. The page renders the exact class
// structures the production components emit (coding editor frame / view / run button / stdin, coding template inputs,
// inline-cloze input and select, network-CLI terminal, visual-question overlay / marker / zone button / chip / SVG shapes /
// cursor / handle, AI composer tab, presentation-studio control) — static markup with the real CSS, no app state, no
// network — so scripts/check-focus-ring-browser-21e0.mjs can Tab through them and read the COMPUTED outline / stroke /
// border / background. A declaration that is invalid at computed-value time cannot be seen by happy-dom; Chromium shows it.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../src/design-tokens.css";
import "../src/index.css";
import "../src/ui/ui.css";
import "../src/coding/coding.css";
import "../src/coding/codingTemplate.css";
import "../src/inlineCloze/inlineCloze.css";
import "../src/networkCli/networkCli.css";
import "../src/visual/visual.css";
import "../src/aiComposer/ai-composer.css";
import "../src/presentation/presentation.css";
import "../src/presentation/presentation-studio.css";

const S = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} style={{ margin: "16px", padding: "12px", border: "1px solid var(--eb-line)", borderRadius: "12px" }}>
    <h2 style={{ fontSize: "14px", margin: "0 0 10px" }}>{title}</h2>
    {children}
  </section>
);

function Page() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", fontFamily: "var(--eb-font)" }}>
      <h1 style={{ fontSize: "18px", margin: "16px" }}>21E.0 — حلقة التركيز وألوان التحديد</h1>
      <S id="cloze" title="سؤال إكمال الفراغات (inline cloze)">
        <input className="cloze-input" data-probe="cloze-input" aria-label="فراغ 1" defaultValue="" />{" "}
        <select className="cloze-select" data-probe="cloze-select" aria-label="فراغ 2"><option>أ</option><option>ب</option></select>
      </S>
      <S id="coding" title="سؤال البرمجة (coding)">
        <div className="cx-code-editor">
          <div className="cx-code-frame" data-probe="cx-code-frame"><textarea className="cx-code-textarea" data-probe="cx-code-textarea" aria-label="الكود" defaultValue={"print('hi')"} dir="ltr" /></div>
        </div>
        <div className="cx-code-editor cx-code-editor--rich">
          <div className="cx-code-frame" data-probe="cx-code-frame-rich"><textarea data-probe="cx-code-textarea-rich" aria-label="الكود (محرر غني)" defaultValue={"x = 1"} dir="ltr" /></div>
        </div>
        <pre className="cx-code-view" data-probe="cx-code-view" tabIndex={0} dir="ltr">{"int main() {}"}</pre>
        <button type="button" className="cx-run-button" data-probe="cx-run-button">تشغيل</button>
        <textarea className="cx-stdin" data-probe="cx-stdin" aria-label="المدخلات" defaultValue="2 3" dir="ltr" />
        <div className="cx-tpl-locked"><pre data-probe="cx-tpl-locked-pre" tabIndex={0} dir="ltr">{"// locked"}</pre></div>
        <input className="cx-tpl-input" data-probe="cx-tpl-input" aria-label="فراغ القالب" defaultValue="" dir="ltr" />
      </S>
      <S id="ncli" title="محاكي سطر الأوامر (network CLI)">
        <div className="ncli-terminal" data-probe="ncli-terminal" dir="ltr"><div className="ncli-screen">Router&gt;</div><input className="ncli-input" data-probe="ncli-input" aria-label="أمر" defaultValue="" /></div>
      </S>
      <S id="visual" title="الأسئلة البصرية (hotspot / label)">
        <div className="vq-stage" style={{ position: "relative", width: 320, height: 160, background: "var(--eb-surface-2)" }}>
          <div className="vq-overlay" data-probe="vq-overlay" tabIndex={0} role="application" aria-label="لوحة التحديد" />
          <svg className="vq-svg" viewBox="0 0 320 160" aria-hidden="true">
            <rect className="vq-shape" data-probe="vq-shape" x="20" y="20" width="80" height="50" />
            <rect className="vq-shape" data-probe="vq-shape-selected" data-selected="true" x="120" y="20" width="80" height="50" />
            <rect className="vq-draft" data-probe="vq-draft" x="220" y="20" width="80" height="50" />
          </svg>
          <button type="button" className="vq-marker" data-probe="vq-marker" style={{ left: 60, top: 110 }}>1</button>
          <div className="vq-cursor" data-probe="vq-cursor" style={{ left: 160, top: 110 }} />
          <div className="vq-handle" data-probe="vq-handle" style={{ left: 200, top: 45 }} />
          <button type="button" className="vq-zone-btn" data-probe="vq-zone-btn" style={{ left: 260, top: 110 }}><span className="vq-zone-num">1</span>المنطقة</button>
        </div>
        <ul className="vq-bank" aria-label="بنك التسميات"><li><button type="button" className="vq-chip" data-probe="vq-chip">الراوتر</button></li></ul>
      </S>
      <S id="ai" title="المؤلف الذكي (AI composer)">
        <div className="ai-composer"><button type="button" className="ai-composer-tab" data-probe="ai-composer-tab">الإعدادات</button></div>
      </S>
      <S id="xp" title="استوديو العرض (presentation studio)">
        <div className="xp xp-studio"><button type="button" className="xp-studio-btn" data-probe="xp-studio-btn">تطبيق القالب</button></div>
      </S>
      <button type="button" className="eb-button" data-probe="eb-button">زر قياسي (المرجع)</button>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
