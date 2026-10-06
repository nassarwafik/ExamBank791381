import { Suspense, useMemo } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import type { QuestionBody } from "../../examTypes";
import { listSmartSimPlugins, validateSmartSimQuestion } from "../../trustedSimPlugins";
import { resolveSmartSimUi } from "../../trustedSim/smartSimUiRegistry";
import { smartSimStarterConfig } from "../../trustedSim/smartSimStarters";

// Phase 20A — smartSim@1 authoring host (lazy). It edits the canonical node only: the PUBLIC envelope under `smartSim` (the plugin identity
// is fixed by the repository's plugin set; the plugin's own editor edits `config`) and the PRIVATE key under `answer` (weighted checks +
// scoring mode). Inline validation runs the ONE canonical validator (validateSmartSimQuestion — the same rules finalization and the server
// apply). An identity without a registered editor shows an explicit unsupported state; nothing is ever loaded from data.
// Phase 20A.2 — a code-owned plugin PICKER lists exactly the repository's registered identities (listSmartSimPlugins); choosing one replaces
// the envelope with that plugin's starter config and restarts the private key empty (checks are plugin-specific, never carried over).
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export default function SmartSimEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const n = node as unknown as Record<string, unknown>;
  const env = isObj(n.smartSim) ? n.smartSim : {};
  const key = isObj(n.answer) ? n.answer : {};
  const ui = resolveSmartSimUi(env.pluginKey, env.pluginVersion);
  const issues = useMemo(() => validateSmartSimQuestion(n), [n]);
  const plugin = listSmartSimPlugins().find(p => p.key === env.pluginKey && p.version === env.pluginVersion);
  const patch = (next: { config?: unknown; checks?: unknown[]; scoring?: unknown }) => onChange({
    smartSim: { schemaVersion: 1, pluginKey: env.pluginKey, pluginVersion: env.pluginVersion, config: next.config !== undefined ? next.config : env.config },
    answer: { scoring: next.scoring !== undefined ? next.scoring : key.scoring ?? "proportional", checks: next.checks !== undefined ? next.checks : Array.isArray(key.checks) ? key.checks : [] }
  } as unknown as Partial<QuestionBody>);
  const plugins = listSmartSimPlugins();
  const current = String(env.pluginKey) + "@" + String(env.pluginVersion);
  const pick = (id: string) => {
    const p = plugins.find(x => x.key + "@" + x.version === id);
    if (!p || id === current) return;
    onChange({ smartSim: { schemaVersion: 1, pluginKey: p.key, pluginVersion: p.version, config: smartSimStarterConfig(p.key, p.version) }, answer: { scoring: "proportional", checks: [] } } as unknown as Partial<QuestionBody>);
  };
  return (
    <div className="qt-editor qt-editor-smartSim" data-testid="qt-editor-smartSim">
      <label className="smartsim-plugin-picker"><span>نوع المحاكاة الموثوقة</span>
        <select data-testid="smartsim-plugin-select" value={current} disabled={disabled} onChange={e => pick(e.target.value)}>
          {!plugin && <option value={current}>غير معروفة ({current})</option>}
          {plugins.map(p => <option key={p.key + "@" + p.version} value={p.key + "@" + p.version}>{p.label}</option>)}
        </select>
      </label>
      <p className="nettopo-note">المحاكاة الموثوقة: <strong>{plugin?.label ?? "غير معروفة"}</strong> <code className="nettopo-ltr">{String(env.pluginKey)}@{String(env.pluginVersion)}</code> — كود المحاكاة جزء من المنصة نفسها، ولا يُرفع ملف تنفيذي.</p>
      {issues.length > 0 && <ul className="ncli-issues" data-testid="smartsim-issues" aria-label="مشكلات تمنع اعتماد السؤال">{issues.slice(0, 30).map((i, k) => <li key={k}>{i.message}</li>)}</ul>}
      {ui
        ? <Suspense fallback={<p role="status">جارٍ تحميل محرّر المحاكاة...</p>}><ui.Editor config={env.config} checks={Array.isArray(key.checks) ? key.checks : []} scoring={key.scoring} onChange={patch} disabled={disabled} /></Suspense>
        : <p className="ncli-unavailable" role="note" data-testid="smartsim-editor-unsupported">هذه المحاكاة أو إصدارها غير مدعوم في هذا الإصدار من التطبيق؛ لا يمكن تحريرها.</p>}
    </div>
  );
}
