import { Suspense, useContext, useMemo } from "react";
import type { StudentRendererProps } from "../registryTypes";
import { projectSmartSimForStudent } from "../../trustedSimPlugins";
import { resolveSmartSimUi } from "../../trustedSim/smartSimUiRegistry";
import { TeacherPreviewContext } from "../studentAttemptContext";
import type { Answer } from "../../answerState";
import type { JsonValue } from "../../smartsimState";

// Phase 20A — the smartSim@1 student renderer (lazy). ONE component for the student exam AND the teacher preview. It reads ONLY the strict
// public projection of `q.smartSim` (a teacher-side question handed to it can never put a private check into the DOM), resolves the
// repository's workspace for the EXACT plugin identity (unknown identity ⇒ an explicit unavailable state, never another plugin) and emits
// the canonical Answer {kind:"smartSim", pluginKey, pluginVersion, actions, state} through the generic onAnswer seam — the existing
// autosave / restore / submit pipeline persists it. The server never trusts `state`: it replays `actions`.
export default function SmartSimResponse({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const env = useMemo(() => projectSmartSimForStudent((q as { smartSim?: unknown }).smartSim), [q]);
  const preview = useContext(TeacherPreviewContext);
  const ui = env ? resolveSmartSimUi(env.pluginKey, env.pluginVersion) : undefined;
  const stored = answer?.kind === "smartSim" && env && answer.pluginKey === env.pluginKey && answer.pluginVersion === env.pluginVersion && Array.isArray(answer.actions) ? answer.actions : [];
  if (!env || !ui) return <p className="ncli-unavailable" role="note" data-testid="smartsim-unavailable">هذه المحاكاة غير متوفرة في هذا الإصدار من التطبيق؛ لا يمكن عرضها.</p>;
  const { Workspace } = ui;
  return (
    <div className="iex-smartsim" data-testid="smartsim-response" data-plugin={env.pluginKey + "@" + env.pluginVersion}>
      <Suspense fallback={<p role="status">جارٍ تحميل المحاكاة...</p>}>
        <Workspace config={env.config} actions={stored} disabled={disabled} label={labelPrefix} preview={preview}
          onChange={(actions, state) => onAnswer({ kind: "smartSim", pluginKey: env.pluginKey, pluginVersion: env.pluginVersion, actions: actions as JsonValue[], state: state as JsonValue } as Answer)} />
      </Suspense>
    </div>
  );
}
