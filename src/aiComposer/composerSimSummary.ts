// Phase 21M — the teacher-facing summary of what the AI composer can SIMULATE, grouped by subject. Derived from the composer catalog (the
// one source of truth for the model's vocabulary) and the production SmartSim registry (each plugin's own Arabic label), so the dialog can
// never promise a simulator the composer cannot generate, and a newly catalogued simulator appears without a UI change.
import { resolveSmartSimPlugin } from "../trustedSimRegistry";
import "../trustedSimPlugins";
import type { ComposerCatalog } from "./composerCatalog";

export const COMPOSER_SUBJECT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  networking: "شبكات الاتصال", physics: "الفيزياء", chemistry: "الكيمياء", mathematics: "الرياضيات"
});
const SUBJECT_ORDER = ["networking", "physics", "chemistry", "mathematics"];
export type ComposerSimulatorGroup = { subject: string; label: string; simulators: { key: string; version: number; label: string }[] };

export function composerSimulatorsBySubject(catalog: Pick<ComposerCatalog, "smartSim">): ComposerSimulatorGroup[] {
  const groups = new Map<string, ComposerSimulatorGroup>();
  for (const s of catalog.smartSim) {
    const plugin = resolveSmartSimPlugin(s.pluginKey, s.pluginVersion);
    const g = groups.get(s.subject) ?? { subject: s.subject, label: COMPOSER_SUBJECT_LABELS[s.subject] ?? s.subject, simulators: [] };
    g.simulators.push({ key: s.pluginKey, version: s.pluginVersion, label: plugin?.label ?? s.pluginKey });
    groups.set(s.subject, g);
  }
  const rank = (subject: string) => { const i = SUBJECT_ORDER.indexOf(subject); return i < 0 ? SUBJECT_ORDER.length : i; };
  return [...groups.values()].sort((a, b) => rank(a.subject) - rank(b.subject));
}
