import { AvatarCircle } from "../avatars";
import type { StudentRank } from "../studentRank";
import type { Classroom, StudentInfo } from "./types";

/**
 * Compact identity header (UX-7a): avatar (with the personal rank frame once a rank exists), greeting, class ·
 * grade · school year, and the login code. Only authoritative dashboard fields; no hero, no page title (the
 * shell owns it).
 */
export default function StudentIdentityCard({ student, classroom, displayName, rank, onChangeAvatar }: { student: StudentInfo; classroom: Classroom | null; displayName: string; rank: StudentRank | null; onChangeAvatar: () => void }) {
  const name = student.displayName || displayName;
  const context = classroom ? [classroom.name, classroom.grade, classroom.schoolYear].filter(Boolean).join(" · ") : "لم يتم ربط حسابك بصف بعد.";
  return (
    <section className="student-welcome-card eb-sp-identity" aria-labelledby="eb-sp-welcome">
      <span className={"eb-sp-avatar-frame" + (rank ? " is-rank-" + rank.tier : "")}>
        <AvatarCircle avatarId={student.avatarId} fallbackLetter={(name || "؟").charAt(0)} size={56} onClick={onChangeAvatar} />
      </span>
      <div className="eb-sp-identity-text">
        <h2 id="eb-sp-welcome">مرحبًا {name}</h2>
        <p className="eb-muted">{context}</p>
      </div>
      <span className="eb-chip is-muted eb-sp-code">الكود: <strong>{student.code}</strong></span>
    </section>
  );
}
