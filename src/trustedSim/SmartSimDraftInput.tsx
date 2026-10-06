import { useState, type InputHTMLAttributes } from "react";
import { parseNumberInput } from "./smartSimNumberInput";

// Phase 20A.2 — an authoring input that keeps the teacher's TEXT while it is being typed ("9.", "-", "min 0 2; ") and reports a parsed value
// on every change: the parsed value when the text parses, otherwise the raw text (so the canonical validator shows the problem — nothing is
// silently repaired or clamped). When the stored value changes from elsewhere (a preset, undo), the text is re-derived from it.
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: unknown;
  onValue: (v: unknown) => void;
  format?: (v: unknown) => string;
  parse?: (text: string) => unknown;
};
const same = (a: unknown, b: unknown) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };
const formatPlain = (v: unknown): string => (typeof v === "number" ? String(v) : typeof v === "string" ? v : "");
const parseTyped = (text: string): unknown => { const n = parseNumberInput(text); return n === undefined ? text : n; };

export default function SmartSimDraftInput({ value, onValue, format = formatPlain, parse = parseTyped, ...rest }: Props) {
  const [draft, setDraft] = useState(() => format(value));
  const [sent, setSent] = useState<unknown>(value);
  if (!same(value, sent)) { setSent(value); setDraft(format(value)); }
  return <input {...rest} value={draft} onChange={e => { const v = parse(e.target.value); setDraft(e.target.value); setSent(v); onValue(v); }} />;
}
