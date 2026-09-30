import { useEffect, useRef, useState } from "react";
import { connect, type JsonValue } from "./smartsim";

type State = { steps: number };
const initial = (): State => ({ steps: 0 });
const asState = (v: JsonValue | null): State => (v && typeof v === "object" && !Array.isArray(v) && typeof v.steps === "number" ? { steps: v.steps } : initial());

export default function App() {
  const [state, setState] = useState<State>(initial);
  const [disabled, setDisabled] = useState(false);
  const sim = useRef<ReturnType<typeof connect> | null>(null);
  useEffect(() => {
    sim.current = connect({
      onInit: ctx => { setState(asState(ctx.savedState)); setDisabled(ctx.disabled); },
      onRestore: s => setState(asState(s)),
      onDisabled: setDisabled,
      onReset: () => { const next = initial(); setState(next); sim.current?.stateChanged(next); }
    });
    return () => sim.current?.disconnect();
  }, []);
  const act = () => { const next = { steps: state.steps + 1 }; setState(next); sim.current?.stateChanged(next); };
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>عنوان المحاكاة</h1>
      <p>الخطوات: <strong>{state.steps}</strong></p>
      <button type="button" onClick={act} disabled={disabled} style={{ minHeight: 44, font: "inherit" }}>إجراء</button>
    </main>
  );
}
