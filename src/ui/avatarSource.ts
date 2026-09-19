import { avatarById } from "../avatars";

/** Identity display precedence (never authorization): a real photo → the selected preset avatar → the default. */
export function avatarSource(photoUrl: string | null | undefined, avatarId: string | undefined): "photo" | "avatar" | "default" {
  if (photoUrl) return "photo";
  if (avatarById(avatarId)) return "avatar";
  return "default";
}
