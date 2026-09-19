import type { CSSProperties } from "react";
import { avatarById } from "../avatars";
import { avatarSource } from "./avatarSource";

/**
 * ONE identity avatar for students and teachers alike — display precedence only (never authorization):
 *   1. a real personal photo (an authenticated object URL the host resolved) → shown, circular, alt = the name
 *   2. else the selected preset avatar (AVATAR_OPTIONS by id)
 *   3. else the default (initial letter on the primary colour).
 * With `onClick` it is a real <button> (accessible `label`); otherwise a static figure.
 */
export type ProfileAvatarProps = {
  photoUrl?: string | null;
  avatarId?: string;
  name?: string;
  fallbackLetter?: string;
  size?: number;
  onClick?: () => void;
  /** Accessible label of the button form (defaults to «تغيير الصورة»). */
  label?: string;
  className?: string;
};

const DEFAULT_BG = "#2563eb";

export default function ProfileAvatar({ photoUrl, avatarId, name, fallbackLetter, size = 52, onClick, label, className }: ProfileAvatarProps) {
  const option = avatarById(avatarId);
  const source = avatarSource(photoUrl, avatarId);
  const style: CSSProperties = {
    width: size, height: size, fontSize: Math.round(size * 0.55),
    background: source === "photo" ? "transparent" : option ? option.bg : DEFAULT_BG,
    color: option || source === "photo" ? undefined : "white",
  };
  const content = source === "photo"
    ? <img className="eb-profile-avatar-img" src={photoUrl as string} alt={onClick ? "" : (name ? "صورة " + name : "الصورة الشخصية")} width={size} height={size} decoding="async" />
    : option ? <span aria-hidden="true">{option.emoji}</span> : <span aria-hidden="true">{(fallbackLetter || (name || "؟").charAt(0) || "؟")}</span>;
  const cls = "student-avatar-circle eb-profile-avatar is-" + source + (className ? " " + className : "");
  if (onClick) {
    const current = source === "photo" ? " (صورة شخصية)" : option ? " (الحالية: " + option.label + ")" : "";
    return <button type="button" className={cls} style={style} onClick={onClick} title={label || "تغيير الصورة"} aria-label={(label || "تغيير الصورة") + current}>{content}</button>;
  }
  // Static form: a photo already carries its alt text; the preset/default form names the figure itself.
  return source === "photo"
    ? <span className={cls} style={style}>{content}</span>
    : <span className={cls} style={style} role="img" aria-label={name ? "صورة " + name : "الصورة الشخصية"}>{content}</span>;
}
