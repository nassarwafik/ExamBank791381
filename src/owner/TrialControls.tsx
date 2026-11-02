import { useState } from "react";
import { TRIAL_DAY_OPTIONS, type ManagedTeacher } from "./ownerApi";
import { formatDate } from "./teacherShared";

/**
 * Trial accounts — what the owner does with a TRIAL teacher account: extend the trial (pick a number of days; counted from its
 * end, or from now once it has ended) or make the account permanent (asks for an inline confirmation). Shared by the teacher
 * list and the teacher's own page. Nothing for a permanent account. The server validates and decides again.
 */
export default function TrialControls({ teacher, busy, onExtend, onMakePermanent }: { teacher: ManagedTeacher; busy: boolean; onExtend: (days: number) => void; onMakePermanent: () => void }) {
  const [mode, setMode] = useState<"idle" | "extend" | "permanent">("idle");
  const [days, setDays] = useState<number>(14);
  if (!teacher.trial) return null;
  const trial = teacher.trial;

  return (
    <div className="eb-owner-trial" role="group" aria-label={"الفترة التجريبية لـ" + teacher.displayName}>
      <p className={"eb-owner-hint" + (trial.ended ? " eb-owner-trial-ended" : "")}>
        {trial.endingSoon && !trial.ended && <><strong>ينتهي قريبًا.</strong> </>}
        {trial.ended
          ? <>انتهت الفترة التجريبية في <bdi>{formatDate(trial.endsAt)}</bdi>. لا يستطيع المعلم الدخول حتى تمدّدها أو تحوّل الحساب إلى دائم. بياناته محفوظة كما هي.</>
          : <>حساب تجريبي: ينتهي في <bdi>{formatDate(trial.endsAt)}</bdi>. بعدها يتوقف دخول المعلم تلقائيًا، وتبقى بياناته محفوظة.</>}
      </p>
      {mode === "extend" && (
        <div className="eb-owner-confirm">
          <label className="auth-field"><span>مدة التمديد</span>
            <div className="auth-input">
              <select value={days} onChange={e => setDays(Number(e.target.value))}>
                {TRIAL_DAY_OPTIONS.map(d => <option key={d} value={d}>{d} يومًا</option>)}
              </select>
            </div>
          </label>
          <p className="eb-owner-hint">{trial.ended ? "تُحسب المدة من الآن." : "تُضاف المدة إلى تاريخ الانتهاء الحالي."}</p>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => { onExtend(days); setMode("idle"); }}>تأكيد التمديد</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setMode("idle")}>إلغاء</button>
          </div>
        </div>
      )}
      {mode === "permanent" && (
        <div className="eb-owner-confirm" role="group" aria-label="تأكيد التحويل إلى حساب دائم">
          <p>سيصبح الحساب دائمًا بلا تاريخ انتهاء، بالصلاحيات نفسها.</p>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => { onMakePermanent(); setMode("idle"); }}>تأكيد: تحويل إلى حساب دائم</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setMode("idle")}>إلغاء</button>
          </div>
        </div>
      )}
      {mode === "idle" && (
        <div className="eb-owner-actions">
          <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setMode("extend")}>تمديد التجربة</button>
          <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setMode("permanent")}>تحويل إلى حساب دائم</button>
        </div>
      )}
    </div>
  );
}
