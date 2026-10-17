import ProfileAvatar from "../ui/ProfileAvatar";
import { useProfilePhoto } from "../ui/useProfilePhoto";
import type { ProfilePhotoMeta } from "./types";

/**
 * The roster row avatar: the student's photo when one exists (one authenticated request per photo VERSION, only for
 * students who have a photo), else their preset avatar, else the first letter of their name. Decorative here: the
 * student's name is the next cell text, so the figure is hidden from assistive technology.
 */
export default function StudentAvatar({ token, studentId, name, avatarId, profilePhoto, size = 32 }: {
  token?: string; studentId: string; name: string; avatarId?: string; profilePhoto?: ProfilePhotoMeta | null; size?: number;
}) {
  const headers: Record<string, string> = token ? { "x-builder-token": token, Authorization: "Bearer " + token } : {};
  const photoUrl = useProfilePhoto(token ? "/api/student-profile-photo?studentId=" + encodeURIComponent(studentId) : null, headers, token ? profilePhoto?.version ?? null : null);
  return <span className="eb-row-avatar" aria-hidden="true"><ProfileAvatar photoUrl={photoUrl} avatarId={avatarId} name={name} size={size} /></span>;
}
