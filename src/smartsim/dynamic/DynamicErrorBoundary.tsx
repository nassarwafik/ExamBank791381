import { Component, type ReactNode } from "react";

// Phase 20E — a dynamic renderer failure never takes the exam down: the boundary swaps the animated view for the caller's STATIC fallback
// (numeric readout / static graph / static topology). It wraps presentation only — the academic forms live outside it — and it resets
// when `resetKey` changes (for example a new configuration).
type Props = { fallback: ReactNode; resetKey?: unknown; children?: ReactNode };
type State = { failed: boolean; key: unknown };

export default class DynamicErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { failed: false, key: props.resetKey } : null;
  }
  componentDidCatch(): void { /* presentation failure contained; the academic forms outside this boundary keep working */ }
  render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}
