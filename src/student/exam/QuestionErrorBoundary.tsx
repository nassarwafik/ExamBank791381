import { Component, createRef, type ContextType, type ReactNode } from "react";
import { isChunkLoadError } from "../../lazyWithRetry";
import { retryFailedLoads, recoveryHandleOf, type RecoveryHandle } from "../../recoverableLazy";
import { IconRefresh, IconWarning } from "../../icons";
import { QuestionRecoveryContext } from "./questionRecovery";

/**
 * QuestionErrorBoundary (Phase 21E.3) — keeps ONE failing part of a page from taking down the rest.
 *
 * A render error or a lazy chunk that failed to load below this boundary shows a calm recovery affordance IN PLACE of that part
 * only; everything else (in the exam: top bar, timer, save status, navigation, every other question) stays usable, and the
 * answers (held above every boundary) are never touched — a failure or a retry schedules no save and no submit.
 *
 * Review fix 1:
 *  - «إعادة المحاولة» loads the failed pieces FIRST while the card stays (its button keeps focus and ignores repeats); only
 *    when they loaded does the part render again. A retry that fails leaves the card and focus exactly where they are — focus
 *    is never pulled from wherever the student moved meanwhile. After a recovery, focus moves to the recovered part only if it
 *    was on the card and nothing else took it.
 *  - Nothing is replaced silently: a failing rich stem keeps the plain question text WITH a notice and a retry ("stem"); a
 *    failing formula keeps its source text with a retry ("inline"); a failing content block shows a compact card ("block").
 *  - After a failed retry the follow-up guidance (in a strict attempt: do not leave the page) is announced and describes the
 *    retry button.
 *  - Outside the exam (scope "general": teacher previews, live sessions, the reader) the wording is neutral and a page reload
 *    is offered after a failed retry; inside the exam a reload is offered only when the page says it is safe.
 * Nothing about the failure reaches the user or a production log beyond a fixed code: no message, URL, stack or answer.
 */
export type RecoveryVariant = "question" | "part" | "page" | "section" | "exam" | "review" | "block" | "stem" | "inline";
type Props = {
  children: ReactNode;
  resetKey?: string;
  variant?: RecoveryVariant;
  /** stem / inline: the content still shown in place of what failed (the plain question text, a formula's source text). */
  fallback?: ReactNode;
  /** An extra safe action on the card (e.g. the review screen's «العودة إلى الأسئلة»). */
  secondaryAction?: { label: string; onClick: () => void };
};
type State = { failed: boolean; retries: number; retrying: boolean; resetKey?: string };

const EXAM_TITLE: Record<RecoveryVariant, string> = {
  question: "تعذّر عرض هذا السؤال الآن",
  part: "تعذّر عرض هذا البند الآن",
  page: "تعذّر عرض هذه الصفحة من الامتحان الآن",
  section: "تعذّر عرض ترويسة القسم الآن",
  exam: "تعذّر عرض الامتحان الآن",
  review: "تعذّر عرض شاشة المراجعة الآن",
  block: "تعذّر عرض هذا الجزء من السؤال الآن",
  stem: "يظهر نص السؤال بصيغة مبسّطة",
  inline: "تعذّر عرض صيغة رياضية",
};
const EXAM_BODY: Record<RecoveryVariant, string> = {
  question: "لم يكتمل تحميل هذا السؤال. إجاباتك كما هي، ويمكنك متابعة الأسئلة الأخرى.",
  part: "لم يكتمل تحميل هذا البند. إجاباتك كما هي، ويمكنك متابعة بقية البنود والأسئلة.",
  page: "لم يكتمل تحميل هذه الصفحة. إجاباتك كما هي، ويمكنك الانتقال إلى سؤال آخر.",
  section: "يمكنك متابعة حل الأسئلة؛ إجاباتك كما هي.",
  exam: "إجاباتك ما زالت في هذه الصفحة، ويستمر الحفظ التلقائي.",
  review: "إجاباتك كما هي. يمكنك العودة إلى الأسئلة أو إعادة المحاولة.",
  block: "باقي نص السؤال معروض، وإجاباتك كما هي.",
  stem: "لم يكتمل تحميل تنسيق نص السؤال (الصيغ أو الرسوم)، فيظهر نصه الأساسي.",
  inline: "يظهر نص الصيغة كما كُتب.",
};
const GENERAL_TITLE = "تعذّر عرض هذا الجزء الآن";
const GENERAL_BODY = "لم يكتمل تحميل هذا الجزء. يمكنك إعادة المحاولة.";
const GENERAL_NOTE: Partial<Record<RecoveryVariant, string>> = {
  stem: "يظهر النص الأساسي لأن تنسيقه لم يكتمل تحميله.",
  inline: "يظهر نص الصيغة كما كُتب.",
};
/** What a recovered part may receive focus on (in document order). */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
let uid = 0;

export default class QuestionErrorBoundary extends Component<Props, State> {
  static contextType = QuestionRecoveryContext;
  declare context: ContextType<typeof QuestionRecoveryContext>;
  state: State = { failed: false, retries: 0, retrying: false, resetKey: this.props.resetKey };
  private id = "qeb-" + (++uid);
  private retryRef = createRef<HTMLButtonElement>();
  private failedRef = createRef<HTMLElement>();
  /** Where the failed rendering sat, to find the recovered part after a successful retry. */
  private region: { parent: Node; prev: Node | null } | null = null;
  /** Focus was on the card when the student pressed «إعادة المحاولة» (only then may focus follow the recovered part). */
  private restoreFocus = false;
  private titleAnnounced = false;
  /** The failed loaders whose errors this boundary caught: «إعادة المحاولة» retries exactly these (never another question's). */
  private handles = new Set<RecoveryHandle>();
  private token = 0;
  private frame = 0;
  private mounted = false;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  /** Another question / page is shown (a new resetKey): start clean for it. */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { failed: false, retries: 0, retrying: false, resetKey: props.resetKey } : null;
  }

  componentDidMount() { this.mounted = true; }
  componentWillUnmount() { this.mounted = false; this.token += 1; if (this.frame) cancelAnimationFrame(this.frame); }

  componentDidCatch(error: unknown) {
    const handle = recoveryHandleOf(error);
    if (handle) this.handles.add(handle);
    const msg = String((error as { message?: unknown } | null)?.message ?? "");
    const chunk = isChunkLoadError(error) || /^Unable to preload CSS/.test(msg) || /^recovery-/.test(msg);
    // Sanitized: the fixed classification only (the root ErrorBoundary's rule) — never the message, stack or component tree.
    // eslint-disable-next-line no-console
    console.error("[QuestionErrorBoundary]", { code: chunk ? "chunk-load" : "runtime" });
    if (!this.titleAnnounced) { this.titleAnnounced = true; this.context.announce?.(this.title()); }
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (prevProps.resetKey !== this.props.resetKey) { this.titleAnnounced = false; this.restoreFocus = false; this.handles.clear(); this.token += 1; return; }
    if (prevState.failed && !this.state.failed) {
      // Recovered: the next failure is a new episode; focus follows the part only if the student was on the card.
      this.titleAnnounced = false;
      this.handles.clear();
      if (this.restoreFocus) { this.restoreFocus = false; this.followRecoveredPart(this.token); }
    } else if (this.state.failed && this.state.retries > prevState.retries) {
      // A retry failed: say what to do now (the guidance also describes the retry button). Focus is left where it is — except
      // that a render error remounts the card (React rebuilds a boundary's children after an error), so a focus that was on the
      // card and is now nowhere returns to the new retry button. Focus elsewhere is never taken.
      const wasOnCard = this.restoreFocus;
      this.restoreFocus = false;
      const active = document.activeElement;
      if (wasOnCard && (!active || active === document.body || active === document.documentElement)) this.retryRef.current?.focus();
      this.context.announce?.(this.title() + ". " + this.afterRetryText());
    }
  }

  private exam() { return this.context.scope === "exam"; }
  private variant(): RecoveryVariant { return this.props.variant ?? "question"; }
  private title() { const v = this.variant(); return this.exam() ? EXAM_TITLE[v] : v === "stem" || v === "inline" ? EXAM_TITLE[v] : GENERAL_TITLE; }
  private body() { const v = this.variant(); return this.exam() ? EXAM_BODY[v] : GENERAL_NOTE[v] ?? GENERAL_BODY; }
  private reloadOffered() {
    if (this.state.retries === 0) return false;
    const v = this.variant();
    if (v === "stem" || v === "inline") return false;
    return this.exam() ? this.context.reloadAllowed : true;
  }
  private afterRetryText() {
    if (this.reloadOffered()) return this.exam()
      ? "ما زال التحميل متعذّرًا. جميع إجاباتك محفوظة على الخادم، ويمكنك إعادة تحميل الصفحة للعودة إلى المحاولة نفسها."
      : "ما زال التحميل متعذّرًا. يمكنك إعادة تحميل الصفحة بعد حفظ أي تغييرات.";
    if (this.exam() && this.context.strict) return "ما زال التحميل متعذّرًا. لا تغادر صفحة الامتحان في هذا الوضع؛ تابع الأسئلة الأخرى، وأبلغ معلمك إذا استمرت المشكلة.";
    return this.exam() ? "ما زال التحميل متعذّرًا. تابع الأسئلة الأخرى وعُد إلى هذا السؤال لاحقًا." : "ما زال التحميل متعذّرًا. حاول مرة أخرى لاحقًا.";
  }

  private retry = async () => {
    if (this.state.retrying) return;                                      // a repeated Enter / click while loading does nothing
    const el = this.failedRef.current, active = typeof document !== "undefined" ? document.activeElement : null;
    this.restoreFocus = !!(el && active && el.contains(active));
    this.region = el && el.parentNode ? { parent: el.parentNode, prev: el.previousSibling } : null;
    const token = ++this.token;
    this.setState({ retrying: true });
    // Only the loaders that failed below THIS boundary (a render error has none: the part simply renders again).
    const ok = await retryFailedLoads([...this.handles]);
    if (!this.mounted || token !== this.token) return;                    // another question meanwhile: nothing to do
    this.setState(s => ({ failed: !ok, retrying: false, retries: s.retries + 1 }));
  };

  /** After a successful retry: put focus on the recovered part (its first control, else the part itself), once it rendered —
   *  but only while focus is still nowhere (the card's button disappeared). Bounded; never steals focus. */
  private followRecoveredPart(token: number) {
    const v = this.variant(), started = typeof performance !== "undefined" ? performance.now() : 0;
    const step = () => {
      this.frame = 0;
      if (!this.mounted || token !== this.token) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;   // the student moved on
      let target: HTMLElement | null = null;
      if ((v === "page" || v === "exam" || v === "review") && this.context.focusAnchor) { this.context.focusAnchor(); return; }
      const r = this.region, node = r ? (r.prev ? r.prev.nextSibling : r.parent.firstChild) : null;
      if (node instanceof HTMLElement && !node.classList.contains("iex-loading") && node.getAttribute("aria-busy") !== "true") {
        target = node.matches(FOCUSABLE) ? node : node.querySelector<HTMLElement>(FOCUSABLE);
        if (!target) { target = node; if (!target.hasAttribute("tabindex")) { target.setAttribute("tabindex", "-1"); target.addEventListener("blur", () => target?.removeAttribute("tabindex"), { once: true }); } }
      }
      if (target) {
        target.focus({ preventScroll: true });
        if (this.context.reveal) this.context.reveal(target);
        else { const b = target.getBoundingClientRect(); if (b.top < 0 || b.bottom > window.innerHeight) target.scrollIntoView?.({ block: "nearest" }); }
        return;
      }
      if (typeof performance !== "undefined" && performance.now() - started > 3000) { this.context.focusAnchor?.(); return; }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const v = this.variant(), afterRetry = this.state.retries > 0, guidanceId = this.id + "-guidance", noteId = this.id + "-note";
    const busy = this.state.retrying;
    const retryButton = (label: string, extra?: string) => (
      <button type="button" ref={this.retryRef} className={"eb-button iex-q-recovery-retry" + (extra ? " " + extra : "")} onClick={() => { void this.retry(); }}
        aria-disabled={busy || undefined} aria-describedby={afterRetry ? guidanceId : v === "stem" || v === "inline" ? noteId : undefined}>
        <IconRefresh size={16} aria-hidden="true" />{busy ? "جارٍ إعادة المحاولة…" : label}
      </button>
    );
    if (v === "stem" || v === "inline") {
      // The content stays visible; a compact notice says why it is simplified and offers the retry (never silent).
      const Tag = v === "inline" ? "span" : "div";
      return (
        <Tag className={"iex-q-recovery-compact is-" + v} data-testid="question-recovery-compact" ref={this.failedRef as never}>
          {this.props.fallback}
          <span className="iex-q-recovery-note"><IconWarning size={14} aria-hidden="true" /><span id={noteId}>{afterRetry ? this.afterRetryText() : this.body()}</span>{" "}
            {retryButton(v === "inline" ? "إعادة تحميل الصيغة" : "إعادة تحميل التنسيق", "is-small")}
          </span>
          {afterRetry && <span hidden id={guidanceId}>{this.afterRetryText()}</span>}
        </Tag>
      );
    }
    const statusRole = this.context.announce ? undefined : "status";
    return (
      <section className={"iex-q-recovery is-" + v} data-testid="question-recovery" ref={this.failedRef as never}>
        <div role={statusRole} className="iex-q-recovery-text">
          <p className="iex-q-recovery-title"><IconWarning size={16} aria-hidden="true" />{this.title()}</p>
          <p className="iex-q-recovery-body">{this.body()}</p>
          {afterRetry && <p className="iex-q-recovery-body" id={guidanceId}>{this.afterRetryText()}</p>}
        </div>
        <div className="iex-q-recovery-actions">
          {retryButton("إعادة المحاولة")}
          {this.props.secondaryAction && <button type="button" className="eb-button is-quiet iex-q-recovery-secondary" onClick={this.props.secondaryAction.onClick}>{this.props.secondaryAction.label}</button>}
          {this.reloadOffered() && (
            <button type="button" className="eb-button is-quiet iex-q-recovery-reload" onClick={() => window.location.reload()}>إعادة تحميل الصفحة</button>
          )}
        </div>
      </section>
    );
  }
}
