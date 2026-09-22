import ProfileAvatar from "../ui/ProfileAvatar";
import { useProfilePhoto } from "../ui/useProfilePhoto";
import { stageBand } from "./strengthStages";
import type { Classroom, StudentInfo, StudentStrength } from "./types";

/**
 * Compact identity header (UX-7a): avatar (with the personal STRENGTH-STAGE frame once the student has any strength),
 * greeting, class · grade · school year, and the login code. Only authoritative dashboard fields; no hero, no page
 * title (the shell owns it). The frame's accent band (1..5) is a coarse map of the server's stage (1..25) — the
 * client never decides the stage, only its restrained frame colour.
 */
export default function StudentIdentityCard({ student, classroom, displayName, strength, token, onChangeAvatar }: { student: StudentInfo; classroom: Classroom | null; displayName: string; strength: StudentStrength | null; token?: string; onChangeAvatar: () => void }) {
  const name = student.displayName || displayName;
  // The student's OWN photo (teacher-managed) — one authenticated read, only when the server reports a version.
  const photo = useProfilePhoto(token ? "/api/student-profile-photo" : null, token ? { "x-student-token": token, Authorization: "Bearer " + token } : {}, student.profilePhoto?.version ?? null);
  const context = classroom ? [classroom.name, classroom.grade, classroom.schoolYear].filter(Boolean).join(" · ") : "لم يتم ربط حسابك بصف بعد.";
  // Show the stage frame only once the student has earned strength (a brand-new 0-point student gets the plain frame).
  const banded = !!strength && strength.totalPoints > 0;
  return (
    <section className="student-welcome-card eb-sp-identity" aria-labelledby="eb-sp-welcome">
      <span className={"eb-sp-avatar-frame" + (banded ? " is-stage-band-" + stageBand(strength!.stage) : "")}>
        <ProfileAvatar photoUrl={photo} avatarId={student.avatarId} name={name} fallbackLetter={(name || "؟").charAt(0)} size={56} onClick={onChangeAvatar} label="تغيير الأيقونة" />
      </span>
      <div className="eb-sp-identity-text">
        <h2 id="eb-sp-welcome">مرحبًا {name}</h2>
        <p className="eb-muted">{context}</p>
      </div>
      <span className="eb-chip is-muted eb-sp-code">الكود: <strong>{student.code}</strong></span>
    </section>
  );
}
