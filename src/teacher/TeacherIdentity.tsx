import { useState } from "react";
import ProfileAvatar from "../ui/ProfileAvatar";
import { useProfilePhoto } from "../ui/useProfilePhoto";
import TeacherProfileDialog from "./TeacherProfileDialog";
import { resolveTeacherDisplayName, teacherHeaders, type TeacherProfile } from "./teacherProfile";

/**
 * The sidebar identity block: the teacher's photo / preset icon / initial as a button («تعديل صورة وملف المعلم»)
 * beside the name (profile → session → "المعلم"). Clicking opens the self-profile dialog. The photo is one
 * authenticated read (only when the profile reports a version); nothing about the product brand changes.
 */
export default function TeacherIdentity({ token, profile, sessionDisplayName, onProfileChange, compact }: {
  token: string; profile: TeacherProfile | null; sessionDisplayName: string; onProfileChange: (p: TeacherProfile) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const name = resolveTeacherDisplayName(profile, sessionDisplayName);
  const photo = useProfilePhoto(token ? "/api/teacher-profile-photo" : null, token ? teacherHeaders(token) : {}, profile?.profilePhoto?.version ?? null);
  return (
    <div className={"eb-teacher-identity" + (compact ? " is-compact" : "")}>
      <ProfileAvatar photoUrl={photo} avatarId={profile?.avatarId} name={name} size={40} onClick={profile ? () => setOpen(true) : undefined} label="تعديل صورة وملف المعلم" className="eb-teacher-identity-avatar" />
      <span className="eb-teacher-identity-name eb-nav-label" title={name}>{name}</span>
      {profile && open && <TeacherProfileDialog open token={token} profile={profile} photoUrl={photo} onClose={() => setOpen(false)} onChange={onProfileChange} />}
    </div>
  );
}
