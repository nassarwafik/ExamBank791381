// Phase 16A / Review Fix 1 — the SAFE student state for a stored question whose exact (type, version) has no implementation
// in this build: nothing is rendered that could be answered or scored, nothing crashes, nothing is reinterpreted.
export default function StudentUnsupported() {
  return <p className="iex-unsupported" data-testid="qt-student-unsupported" role="note">هذا السؤال بصيغة لا يدعمها هذا الإصدار من التطبيق. لا يمكن الإجابة عنه هنا؛ أخبر معلّمك.</p>;
}
