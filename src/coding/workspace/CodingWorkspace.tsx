import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import CodingEditor from "../CodingEditor";
import { codingLanguage } from "../../codingQuestion";
import useBodyScrollLock from "../../ui/useBodyScrollLock";
import { EDITOR_FONT_SIZES, useEditorPreferences } from "./editorPreferences";
import "./workspace.css";

// Phase 18B — the enterprise coding WORKSPACE: one frame around the ONE CodingEditor for every coding surface (student exam, teacher
// preview, authoring starter code / reference solutions). It owns PRESENTATION only:
//   • a toolbar — the caller's language control (start slot), the selected language + its contract version (always visible), the
//     device-level editor preferences (font size, wrap, minimap, line numbers; editorPreferences.ts), the FOCUS toggle and the
//     caller's end slot (reset to starter);
//   • FOCUS MODE — an application-level expanded layout: a CSS class on this SAME element turns it into a viewport-filling panel
//     (workspace.css). Nothing remounts and nothing is re-emitted, so entering / leaving cannot change a single source character or
//     the engine instance; the editor just switches to the `fill` layout. No browser fullscreen API (nothing to lose when it is
//     refused or exited by the browser), no portal (the dialog stack and the parent's state stay exactly where they are);
//   • keyboard contract while expanded — Escape on the toolbar / panels exits (inside the editor Escape keeps its editor meaning and
//     the editor consumes it), Tab cycles inside the workspace, the rest of the page is `inert` (like the shared Dialog's covered
//     layers: hidden controls cannot be reached or submitted), the exit control is always in the tab order, and the expanded state
//     ends by itself when the attempt stops being writable so nothing the exam page needs to show is covered. Entering is never
//     automatic. Focus stays on the control the person used.
// The academic answer is the caller's: this component forwards value / onChange untouched and never persists, logs or sends source.
export type CodingWorkspaceProps = {
  value: string; onChange: (next: string) => void; language: string; label: string;
  /** The language CONTRACT version of the answer (`languageVersion`), shown next to the language. */
  languageVersion?: number;
  readOnly?: boolean; maxBytes?: number; minRows?: number;
  /** Names the workspace for assistive technology (e.g. «السؤال 3»). */
  title?: string;
  toolbarStart?: ReactNode; toolbarEnd?: ReactNode; editorFooter?: ReactNode; children?: ReactNode;
  testId?: string; className?: string;
};

const FOCUS_ON = "وضع التركيز مفعّل: محرر الكود يملأ الشاشة. زر «الخروج من وضع التركيز» أو مفتاح Escape خارج المحرر يعيد العرض العادي.";
const FOCUS_OFF = "تم الخروج من وضع التركيز.";
const CONTRACT_VERSION_WORD = "عقد";
const CONTRACT_VERSION_TITLE = "لغة البرمجة المختارة وإصدار عقد اللغة في SmartAssess (ليس إصدار بيئة التشغيل أو المترجم)";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => {
    if (el.hidden || el.getAttribute("aria-hidden") === "true" || el.closest("[inert]")) return false;
    const closed = el.closest("details:not([open])");
    return !closed || (el.tagName === "SUMMARY" && el.parentElement === closed);
  });
}
/** While `active`, every element OUTSIDE `ref` (the siblings of each ancestor up to <body>) is `inert`; restored exactly on exit —
 *  an element that was already inert stays inert. Elements added later (a confirmation dialog portal) are not touched. */
function useInertOutside(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const root = ref.current;
    if (!root) return;
    const touched: Element[] = [];
    for (let node: Element | null = root; node && node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || sibling.hasAttribute("inert") || sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
        sibling.setAttribute("inert", "");
        touched.push(sibling);
      }
    }
    return () => { for (const el of touched) el.removeAttribute("inert"); };
  }, [ref, active]);
}

export default function CodingWorkspace({ value, onChange, language, languageVersion, label, readOnly = false, maxBytes, minRows, title, toolbarStart, toolbarEnd, editorFooter, children, testId = "coding-workspace", className }: CodingWorkspaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useEditorPreferences();
  const panelId = useId();
  const enter = () => { setFocus(true); setAnnounce(FOCUS_ON); };
  const exit = () => { setFocus(false); setAnnounce(FOCUS_OFF); };
  const wasReadOnly = useRef(readOnly);
  useEffect(() => {                                                                  // the attempt stopped being writable: uncover the page
    if (readOnly && !wasReadOnly.current && focus) exit();
    wasReadOnly.current = readOnly;
  }, [readOnly, focus]);
  useBodyScrollLock(focus);
  useInertOutside(rootRef, focus);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!focus) return;
    const root = rootRef.current, target = e.target;
    if (!root || !(target instanceof Element) || !root.contains(target)) return;   // a portaled dialog bubbles through React, not through this DOM
    if (e.key === "Escape") {
      if (target.closest(".cx-code-frame")) return;                                 // the editor's Escape (it consumes it itself)
      e.preventDefault(); e.stopPropagation(); exit();
      return;
    }
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return;
    const items = focusables(root);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1], current = document.activeElement;
    if (e.shiftKey && (current === first || !root.contains(current))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (current === last || !root.contains(current))) { e.preventDefault(); first.focus(); }
  };

  const def = codingLanguage(language);
  // RF1-3: `languageVersion` is the SmartAssess language CONTRACT version of the Answer, not the Python / Java / .NET toolchain version
  // (no client contract carries that yet), so the label says «عقد v1» and never a bare, runtime-looking «v1».
  const badge = (def?.label ?? language) + (languageVersion !== undefined ? " · " + CONTRACT_VERSION_WORD + " v" + languageVersion : "");
  return (
    <div ref={rootRef} className={["cx-coding", "cx-workspace", focus ? "is-focus" : "", className ?? ""].filter(Boolean).join(" ")} data-testid={testId} data-focus-mode={focus ? "true" : "false"} role="group" aria-label={"مساحة العمل البرمجية" + (title ? " — " + title : "")} onKeyDown={onKeyDown}>
      <div className="cx-ws-toolbar" data-testid="coding-workspace-toolbar">
        {toolbarStart}
        <span className="cx-lang-badge cx-ws-lang" data-testid="coding-workspace-language" title={CONTRACT_VERSION_TITLE}>{badge}</span>
        <span className="cx-ws-spacer" aria-hidden="true" />
        <div className="cx-ws-prefs">
          <button type="button" className="cx-ws-button" aria-expanded={prefsOpen} aria-controls={panelId} onClick={() => setPrefsOpen(o => !o)}>إعدادات المحرر</button>
          {prefsOpen && <div id={panelId} className="cx-ws-prefs-panel" role="group" aria-label="إعدادات المحرر">
            <label className="cx-ws-pref"><span>حجم الخط</span>
              <select aria-label="حجم الخط" value={prefs.fontSize} onChange={e => setPrefs({ fontSize: Number(e.target.value) })}>{EDITOR_FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </label>
            <label className="cx-ws-pref"><input type="checkbox" checked={prefs.wordWrap} onChange={e => setPrefs({ wordWrap: e.target.checked })} /><span>التفاف الأسطر</span></label>
            <label className="cx-ws-pref"><input type="checkbox" checked={prefs.minimap} onChange={e => setPrefs({ minimap: e.target.checked })} /><span>الخريطة المصغّرة</span></label>
            <label className="cx-ws-pref"><input type="checkbox" checked={prefs.lineNumbers} onChange={e => setPrefs({ lineNumbers: e.target.checked })} /><span>أرقام الأسطر</span></label>
            <p className="cx-ws-prefs-note">إعدادات عرض على هذا الجهاز فقط؛ لا تُحفظ مع الإجابة ولا تؤثر في التصحيح.</p>
          </div>}
        </div>
        <button type="button" className="cx-ws-button cx-ws-focus" data-testid="coding-focus-toggle" aria-pressed={focus} aria-label={focus ? "الخروج من وضع التركيز" : "وضع التركيز (توسيع محرر الكود)"} onClick={() => (focus ? exit() : enter())}>{focus ? "الخروج من التركيز" : "وضع التركيز"}</button>
        {toolbarEnd}
      </div>
      <div className="cx-ws-editor cx-editor-panel" data-testid="coding-editor-panel">
        <CodingEditor value={value} onChange={onChange} language={language} label={label} readOnly={readOnly} maxBytes={maxBytes} minRows={minRows} preferences={prefs} layout={focus ? "fill" : "auto"} />
        {editorFooter}
      </div>
      {children}
      <p className="cx-sr-only" role="status" aria-live="polite" data-testid="coding-focus-status">{announce}</p>
    </div>
  );
}
