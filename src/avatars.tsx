// Preset student avatars — self-contained (emoji + background color), no external images/network
// requests. Ids are mirrored in api/src/functions/student-profile.js's allow-list; keep both in
// sync if this list ever changes.
import type { CSSProperties } from "react";

export type AvatarOption = { id: string; emoji: string; bg: string };

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "a1", emoji: "🦊", bg: "#fde68a" },
  { id: "a2", emoji: "🐱", bg: "#fbcfe8" },
  { id: "a3", emoji: "🐶", bg: "#bfdbfe" },
  { id: "a4", emoji: "🦁", bg: "#fed7aa" },
  { id: "a5", emoji: "🐼", bg: "#e5e7eb" },
  { id: "a6", emoji: "🐨", bg: "#ddd6fe" },
  { id: "a7", emoji: "🐸", bg: "#bbf7d0" },
  { id: "a8", emoji: "🦉", bg: "#fef3c7" },
  { id: "a9", emoji: "🐵", bg: "#fdba74" },
  { id: "a10", emoji: "🐰", bg: "#f5d0fe" },
  { id: "a11", emoji: "🐢", bg: "#a7f3d0" },
  { id: "a12", emoji: "🦄", bg: "#c7d2fe" },
];

const DEFAULT_BG = "#2563eb";

export function avatarById(id: string | undefined): AvatarOption | null {
  return AVATAR_OPTIONS.find(a => a.id === id) || null;
}

type Props = {
  avatarId?: string;
  fallbackLetter?: string;
  size?: number;
  onClick?: () => void;
};

export function AvatarCircle({ avatarId, fallbackLetter, size = 52, onClick }: Props) {
  const option = avatarById(avatarId);
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.55),
    background: option ? option.bg : DEFAULT_BG,
    color: option ? undefined : "white",
  };
  return (
    <button
      type="button"
      className="student-avatar-circle"
      style={style}
      onClick={onClick}
      title="تغيير الأيقونة"
    >
      {option ? option.emoji : (fallbackLetter || "؟")}
    </button>
  );
}
