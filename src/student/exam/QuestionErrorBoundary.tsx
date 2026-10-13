import { Component, createRef, type ContextType, type ReactNode, type RefObject } from "react";
import { isChunkLoadError } from "../../lazyWithRetry";
import { retryFailedLoads, recoveryHandleOf, type RecoveryHandle } from "../../recoverableLazy";
import { IconRefresh, IconWarning } from "../../icons";
import { QuestionRecoveryContext, RECOVERY_LINE_ATTRIBUTE } from "./questionRecovery";
import { trackPointer, pointerReleased, lastPointerDown, pointerIsDown, guardPresses } from "./pointerHold";

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
 * Review fix 2: after a recovery focus never lands on an answer control (a radio, a hotspot, a text field — the student's next
 *  ordinary key would record an answer they never chose). It lands on a short, non-interactive line the boundary itself renders
 *  just before the recovered part («تم تحميل هذا الجزء.», tabindex -1); the next Tab enters the part. The line stays until
 *  another question is shown (removing it on blur would move the content between a pointer press and its release). A
 *  page-level card (page / exam / review) puts focus on the page's heading instead.
 *  - Nothing is replaced silently: a failing rich stem keeps the plain question text WITH a notice and a retry ("stem"); a
 *    failing formula keeps its source text with a retry ("inline"); a failing content block shows a compact card ("block").
 *  - After a failed retry the follow-up guidance (in a strict attempt: do not leave the page) is announced and describes the
 *    retry button.
 *  - Outside the exam (scope "general": teacher previews, live sessions, the reader) the wording is neutral and a page reload
 *    is offered after a failed retry; inside the exam a reload is offered only when the page says it is safe.
 * Review fix 3: nothing scrolls after a recovery — focus moves with preventScroll and the page's keyboard reveal skips the
 *  line and the headings (a jump after the student scrolled away moved the options under a pointer about to press). Once
 *  focus leaves the line it is hidden from assistive technology (it sits inside the stem that names the answer controls) but
 *  keeps its place, so nothing moves.
 *  The card never changes the layout or moves focus while a pointer or finger is down: it waits for the release, so a press
 *  in progress ends on the layout it started on. A press outside the card since «إعادة المحاولة» means the student moved on,
 *  and focus is not taken (a mouse press on an option leaves focus on <body>). The one exception to "nothing scrolls": after a
 *  retry activated with the KEYBOARD, during which the page did not scroll and nothing was pressed, the focused line or heading
 *  is brought clear of the sticky bars (WCAG 2.4.11) — the student is still where they pressed Enter, as after a Tab.
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
type State = { failed: boolean; retries: number; retrying: boolean; resetKey?: string; landed: boolean; quiet: boolean };

const EXAM_TITLE: Record<RecoveryVariant, string> = {
  question: "تعذّر عرض هذا السؤال الآن",
  part: "تعذّر عرض هذا البند الآن",
  page: "تعذّر عرض هذه الصفحة من الامتحان الآن",
  section: "تعذّر عرض ترويسة القسم الآن",
  exam: "تعذّر عرض الامتحان الآن",
  review: "تعذّر عرض شاشة المراجعة الآن",
  block: "تعذّر عرض هذا الجزء من المحتوى الآن",
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
  block: "باقي النص معروض، وإجاباتك كما هي.",
  stem: "لم يكتمل تحميل تنسيق نص السؤال (الصيغ أو الرسوم)، فيظهر نصه الأساسي.",
  inline: "يظهر نص الصيغة كما كُتب.",
};
const GENERAL_TITLE = "تعذّر عرض هذا الجزء الآن";
const GENERAL_BODY = "لم يكتمل تحميل هذا الجزء. يمكنك إعادة المحاولة.";
const GENERAL_NOTE: Partial<Record<RecoveryVariant, string>> = {
  stem: "يظهر النص الأساسي لأن تنسيقه لم يكتمل تحميله.",
  inline: "يظهر نص الصيغة كما كُتب.",
};
/** The line focus lands on after a recovery (review fix 2): never an answer control. */
const LANDED = "تم تحميل هذا الجزء.";
const FOLLOW_MS = 3000;
/** After the layout changed in view, a press that starts within this window was aimed at the old layout (`guardPresses`). */
const SHIFT_GUARD_MS = 400;
let uid = 0;

export default class QuestionErrorBoundary extends Component<Props, State> {
  static contextType = QuestionRecoveryContext;
  declare context: ContextType<typeof QuestionRecoveryContext>;
  state: State = { failed: false, retries: 0, retrying: false, resetKey: this.props.resetKey, landed: false, quiet: false };
  private id = "qeb-" + (++uid);
  private retryRef = createRef<HTMLButtonElement>();
  private failedRef = createRef<HTMLElement>();
  private landedRef = createRef<HTMLElement>();
  /** Focus was on the card when the student pressed «إعادة المحاولة» (only then may focus follow the recovered part). */
  private restoreFocus = false;
  /** The recovery may bring the focused line / heading clear of the bars: keyboard retry, no scroll and no press meanwhile. */
  private revealAllowed = false;
  private retryStarted = 0;
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
    return props.resetKey !== state.resetKey ? { failed: false, retries: 0, retrying: false, resetKey: props.resetKey, landed: false, quiet: false } : null;
  }

  componentDidMount() { this.mounted = true; }
  componentWillUnmount() { this.mounted = false; this.token += 1; if (this.frame) cancelAnimationFrame(this.frame); }

  componentDidCatch(error: unknown) {
    trackPointer();                                                       // a press that starts before the first retry is seen too
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
      if (this.restoreFocus) { this.restoreFocus = false; this.placeFocusAfterRecovery(this.token); }
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

  private retry = async (viaKeyboard = false) => {
    if (this.state.retrying) return;                                      // a repeated Enter / click while loading does nothing
    const el = this.failedRef.current, active = typeof document !== "undefined" ? document.activeElement : null;
    this.restoreFocus = !!(el && active && el.contains(active));
    const token = ++this.token;
    trackPointer();
    const started = typeof performance !== "undefined" ? performance.now() : Date.now(), scrolledAt = window.scrollY, downAtStart = pointerIsDown();
    this.revealAllowed = false;
    this.retryStarted = started;
    this.setState({ retrying: true });
    // Only the loaders that failed below THIS boundary (a render error has none: the part simply renders again).
    const ok = await retryFailedLoads([...this.handles]);
    if (!this.mounted || token !== this.token) return;                    // another question meanwhile: nothing to do
    // Review fix 3: a press in progress ends on the layout it started on (the card, or the recovered part, changes height).
    await pointerReleased();
    if (!this.mounted || token !== this.token) return;
    const press = lastPointerDown(), cardNow = this.failedRef.current;
    if (press.t >= started && !(cardNow && press.target instanceof Node && cardNow.contains(press.target))) this.restoreFocus = false;
    this.revealAllowed = viaKeyboard && !downAtStart && press.t < started && Math.abs(window.scrollY - scrolledAt) < 1;
    // The line is shown only when focus is still on the card (or nowhere): it will receive focus; otherwise nothing is added.
    const a = document.activeElement, card = this.failedRef.current;
    const onCard = !a || a === document.body || a === document.documentElement || !!(card && card.contains(a));
    // A card in view is replaced by a part of another height: the content after it moves where the student may be about to press.
    const r = card?.getBoundingClientRect(), inView = !!r && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    this.setState(s => ({ failed: !ok, retrying: false, retries: s.retries + 1, landed: ok && this.restoreFocus && onCard && !this.anchored(), quiet: false }),
      () => { if (ok && inView) guardPresses(SHIFT_GUARD_MS); });
  };

  /** A page-level card recovers onto the page's heading (it exists again once the surface rendered). */
  private anchored() { const v = this.variant(); return (v === "page" || v === "exam" || v === "review") && !!this.context.focusAnchor; }

  /** After a successful retry, only while focus is still nowhere (the card's button disappeared): a page-level card puts focus on
   *  the page heading once it rendered (bounded); any other card on its own «تم تحميل هذا الجزء.» line — never on an answer
   *  control. Focus that the student moved meanwhile is never taken, and nothing is scrolled (review fix 3): the student may
   *  have scrolled away while the retry loaded, and a jump would move the content under a pointer about to press — except
   *  after a keyboard retry during which nothing moved (`revealFocused`). */
  private placeFocusAfterRecovery(token: number) {
    const idle = () => { const a = document.activeElement; return !a || a === document.body || a === document.documentElement; };
    if (!this.anchored()) {
      const line = this.landedRef.current;
      if (!line || !idle()) { if (this.state.landed) this.setState({ landed: false }); return; }
      line.focus({ preventScroll: true });
      this.revealFocused(line);
      return;
    }
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()), started = now();
    const step = () => {
      this.frame = 0;
      if (!this.mounted || token !== this.token || !idle()) return;
      // Never while a pointer or finger is down (the heading appears a frame or more after the swap): wait for the release.
      if (!pointerIsDown() && this.context.focusAnchor?.()) { this.revealFocused(document.activeElement); return; }
      if (now() - started < FOLLOW_MS) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Only after a keyboard retry during which nothing moved (see `revealAllowed`), and never while a pointer is down. */
  private revealFocused(el: Element | null) {
    const allowed = this.revealAllowed;
    this.revealAllowed = false;
    if (!allowed || !(el instanceof HTMLElement) || pointerIsDown() || lastPointerDown().t >= this.retryStarted) return;
    const y = window.scrollY;
    if (this.context.reveal) this.context.reveal(el);
    else {
      const b = el.getBoundingClientRect();
      if (b.top < 0 || b.bottom > window.innerHeight) el.scrollIntoView?.({ block: "nearest" });
    }
    if (window.scrollY !== y) guardPresses(SHIFT_GUARD_MS);              // the page moved under a hovering pointer (RR3-7)
  }

  render() {
    if (!this.state.failed) {
      // A stable shape (line slot, then the children) so that showing or hiding the line never remounts the recovered part. After
      // focus left it the line is hidden from assistive technology (no longer part of the stem's name) and keeps its place.
      const quiet = this.state.quiet;
      const lineProps = { tabIndex: -1, "aria-hidden": quiet || undefined, "data-testid": "recovery-landed", [RECOVERY_LINE_ATTRIBUTE]: "",
        onBlur: () => { if (!this.state.quiet) this.setState({ quiet: true }); }, onFocus: () => { if (this.state.quiet) this.setState({ quiet: false }); } };
      const line = !this.state.landed ? null : this.variant() === "inline"
        ? <span ref={this.landedRef as RefObject<HTMLSpanElement>} className="eb-visually-hidden" {...lineProps}>{LANDED}</span>
        : <p ref={this.landedRef as RefObject<HTMLParagraphElement>} className="iex-q-recovered" {...lineProps}>{LANDED}</p>;
      return <>{line}{this.props.children}</>;
    }
    const v = this.variant(), afterRetry = this.state.retries > 0, guidanceId = this.id + "-guidance", noteId = this.id + "-note";
    const busy = this.state.retrying;
    const retryButton = (label: string, extra?: string) => (
      <button type="button" ref={this.retryRef} className={"eb-button iex-q-recovery-retry" + (extra ? " " + extra : "")} onClick={e => { void this.retry(e.detail === 0); }}
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
