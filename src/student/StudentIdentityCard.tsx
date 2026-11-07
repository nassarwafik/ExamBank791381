import { useState } from "react";
import ProfileAvatar from "../ui/ProfileAvatar";
import { useProfilePhoto } from "../ui/useProfilePhoto";
import type { StageGroupId } from "../studentStageVisuals";
import type { Classroom, StudentInfo } from "./types";
import { maskCode } from "./portalPresentation";

/**
 * Compact identity header (UX-7a): avatar (framed in the colour of the student's Strength journey group — the
 * SERVER's stage, mapped to its group by studentStageVisuals), greeting, class · grade · school year, and the login
 * code. Only authoritative dashboard fields; no hero, no page title (the shell owns it).
 * UX-S1 (docs/enterprise-ux-student-s1.md §2.4) — the code of a new account is the identity number, and the portal is often shown on
 * a classroom projector: it reads masked (last 4 characters) with «إظهار» / «إخفاء». Page state only (never stored); a code of 4
 * characters or fewer is shown as it is. Presentation, not protection — the code itself and the sign-in are unchanged.
 */

export default function StudentIdentityCard({ student, classroom, displayName, stageGroup, token, onChangeAvatar }: { student: StudentInfo; classroom: Classroom | null; displayName: string; stageGroup: StageGroupId | null; token?: string; onChangeAvatar: () => void }) {
  const name = student.displayName || displayName;
  const [shown, setShown] = useState(false);
  const canMask = Array.from(String(student.code || "")).length > 4;
  // The student's OWN photo (teacher-managed) — one authenticated read, only when the server reports a version.
  const photo = useProfilePhoto(token ? "/api/student-profile-photo" : null, token ? { "x-student-token": token, Authorization: "Bearer " + token } : {}, student.profilePhoto?.version ?? null);
  const context = classroom ? [classroom.name, classroom.grade, classroom.schoolYear].filter(Boolean).join(" · ") : "لم يتم ربط حسابك بصف بعد.";
  return (
    <section className="student-welcome-card eb-sp-identity" aria-labelledby="eb-sp-welcome">
      <span className={"eb-sp-avatar-frame" + (stageGroup ? " is-stage-group-" + stageGroup : "")}>
        <ProfileAvatar photoUrl={photo} avatarId={student.avatarId} name={name} fallbackLetter={(name || "؟").charAt(0)} size={56} onClick={onChangeAvatar} label="تغيير الأيقونة" />
      </span>
      <div className="eb-sp-identity-text">
        <h2 id="eb-sp-welcome">مرحبًا {name}</h2>
        <p className="eb-muted">{context}</p>
      </div>
      <span className="eb-chip is-muted eb-sp-code">الكود: <strong dir="ltr">{shown ? student.code : maskCode(student.code)}</strong>
        {canMask && <button type="button" className="eb-sp-code-toggle" aria-pressed={shown} aria-label={shown ? "إخفاء الكود" : "إظهار الكود"} onClick={() => setShown(v => !v)}>{shown ? "إخفاء" : "إظهار"}</button>}
      </span>
    </section>
  );
}
