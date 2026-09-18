import { Component, type ReactNode } from "react";

interface Props {
  /** Rendered instead of `children` after a render/runtime error is caught. */
  fallback: ReactNode;
  /** Notified once with the error message when an error is first caught (e.g. to emit an activity-error event). */
  onError?: (message: string) => void;
  children: ReactNode;
}
interface State { hasError: boolean; }

/**
 * Phase 3A engine foundation — the isolation wall around a LIVE activity renderer. Any error thrown while a
 * registered activity component renders is caught here and replaced by a safe static fallback, so one broken
 * activity can never blank the reader page or crash the app. It is a class component because React error
 * boundaries must be (getDerivedStateFromError / componentDidCatch); state is a declared field (no TS
 * parameter-properties, per `erasableSyntaxOnly`).
 */
export default class LearningActivityBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error?.message ?? "activity error");
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
