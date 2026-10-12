import { Component, createRef, type ContextType, type ReactNode } from "react";
import { isChunkLoadError } from "../../lazyWithRetry";
import { rearmFailedLoads } from "../../recoverableLazy";
import { IconRefresh, IconWarning } from "../../icons";
import { QuestionRecoveryContext } from "./questionRecovery";

/**
 * QuestionErrorBoundary (Phase 21E.3) — keeps ONE failing part of the exam from taking down the whole exam.
 *
 * A render error or a lazy chunk that failed to load below this boundary shows a calm recovery card IN PLACE of that part
 * only: the top bar, timer, save status, navigation and every other question stay usable, and the answers (which live in
 * StudentExamPage, above every boundary) are never touched — a failure or a retry schedules no save and no submit.
 * «إعادة المحاولة» re-arms the failed recoverable loaders (recoverableLazy) and renders the part again. The card never
 * reloads the page; after a retry that failed it may OFFER a reload, only when the exam says that is safe.
 *
 * Nothing about the failure reaches the student or a production log beyond a fixed code: no message, URL, stack or answer.
 */
type Variant = "question" | "part" | "page" | "section" | "exam";
type Props = {
  children: ReactNode;
  resetKey?: string;
  variant?: Variant;
  /** Shown instead of the recovery card (e.g. the plain question text when only the rich stem failed). */
  fallback?: ReactNode;
};
type State = { failed: boolean; retries: number; resetKey?: string };

const TITLE: Record<Variant, string> = {
  question: "تعذّر عرض هذا السؤال الآن",
  part: "تعذّر عرض هذا البند الآن",
  page: "تعذّر عرض هذه الصفحة من الامتحان الآن",
  section: "تعذّر عرض ترويسة القسم الآن",
  exam: "تعذّر عرض الامتحان الآن",
};
const BODY: Record<Variant, string> = {
  question: "لم يكتمل تحميل هذا السؤال. إجاباتك كما هي، ويمكنك متابعة الأسئلة الأخرى.",
  part: "لم يكتمل تحميل هذا البند. إجاباتك كما هي، ويمكنك متابعة بقية البنود والأسئلة.",
  page: "لم يكتمل تحميل هذه الصفحة. إجاباتك كما هي، ويمكنك الانتقال إلى سؤال آخر.",
  section: "يمكنك متابعة حل الأسئلة؛ إجاباتك كما هي.",
  exam: "إجاباتك ما زالت في هذه الصفحة، ويستمر الحفظ التلقائي.",
};

export default class QuestionErrorBoundary extends Component<Props, State> {
  static contextType = QuestionRecoveryContext;
  declare context: ContextType<typeof QuestionRecoveryContext>;
  state: State = { failed: false, retries: 0, resetKey: this.props.resetKey };
  private retryRef = createRef<HTMLButtonElement>();
  /** Set by «إعادة المحاولة»: if the part fails again soon (a render error at once, a chunk load a little later), focus goes
   *  back to the action instead of falling to <body>. Time-bounded, so a much later failure never steals focus. */
  private focusRetryUntil = 0;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  /** Another question / page is shown (a new resetKey): start clean for it. */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { failed: false, retries: 0, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    // Sanitized: the fixed classification only (the root ErrorBoundary's rule) — never the message, stack or component tree.
    // eslint-disable-next-line no-console
    console.error("[QuestionErrorBoundary]", { code: isChunkLoadError(error) ? "chunk-load" : "runtime" });
    this.context.announce?.(TITLE[this.props.variant ?? "question"]);
  }

  componentDidUpdate() {
    // A retry that failed again: keep keyboard focus on the action instead of letting it fall to <body>.
    if (this.state.failed && Date.now() < this.focusRetryUntil) {
      this.focusRetryUntil = 0;
      this.retryRef.current?.focus();
    }
  }

  private retry = () => {
    this.focusRetryUntil = Date.now() + 15000;
    rearmFailedLoads();
    this.context.focusAnchor?.();
    this.setState(s => ({ failed: false, retries: s.retries + 1 }));
  };

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    const variant = this.props.variant ?? "question";
    const { reloadAllowed, strict } = this.context;
    const afterRetry = this.state.retries > 0;
    return (
      <section className={"iex-q-recovery is-" + variant} data-testid="question-recovery">
        <div role={this.context.announce ? undefined : "status"} className="iex-q-recovery-text">
          <p className="iex-q-recovery-title"><IconWarning size={16} aria-hidden="true" />{TITLE[variant]}</p>
          <p className="iex-q-recovery-body">{BODY[variant]}</p>
          {afterRetry && <p className="iex-q-recovery-body">
            {"ما زال التحميل متعذّرًا. "}
            {reloadAllowed
              ? "جميع إجاباتك محفوظة على الخادم، ويمكنك إعادة تحميل الصفحة للعودة إلى المحاولة نفسها."
              : strict
                ? "لا تغادر صفحة الامتحان في هذا الوضع؛ تابع الأسئلة الأخرى، وأبلغ معلمك إذا استمرت المشكلة."
                : "تابع الأسئلة الأخرى وعُد إلى هذا السؤال لاحقًا."}
          </p>}
        </div>
        <div className="iex-q-recovery-actions">
          <button type="button" ref={this.retryRef} className="eb-button iex-q-recovery-retry" onClick={this.retry}>
            <IconRefresh size={16} aria-hidden="true" />إعادة المحاولة
          </button>
          {afterRetry && reloadAllowed && (
            <button type="button" className="eb-button is-quiet iex-q-recovery-reload" onClick={() => window.location.reload()}>إعادة تحميل الصفحة</button>
          )}
        </div>
      </section>
    );
  }
}
