import { Component, type ReactNode } from "react";

// Phase T2 — contains ANY failure of the student tool dock (its lazy chunk failing to load included): the exam page, its answers, its
// autosave and its render-failure accounting never see it. The student is told once, quietly, and keeps answering.
export default class ToolDockBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* contained on purpose */ }
  render() {
    return this.state.failed
      ? <p className="iex-tools-unavailable" role="status" data-testid="tools-unavailable">تعذّر تحميل أدوات الامتحان. يمكنك متابعة الإجابة بشكل طبيعي.</p>
      : this.props.children;
  }
}
