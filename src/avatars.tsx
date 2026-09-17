// Preset student avatars — self-contained (emoji + background color), no external images/network
// requests. Ids are mirrored in api/src/functions/student-profile.js's allow-list; keep both in
// sync if this list ever changes.
import type { CSSProperties } from "react";

export type AvatarOption = { id: string; emoji: string; bg: string; label: string };

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "a1", emoji: "🦊", bg: "#fde68a", label: "ثعلب" },
  { id: "a2", emoji: "🐱", bg: "#fbcfe8", label: "قطة" },
  { id: "a3", emoji: "🐶", bg: "#bfdbfe", label: "كلب" },
  { id: "a4", emoji: "🦁", bg: "#fed7aa", label: "أسد" },
  { id: "a5", emoji: "🐼", bg: "#e5e7eb", label: "باندا" },
  { id: "a6", emoji: "🐨", bg: "#ddd6fe", label: "كوالا" },
  { id: "a7", emoji: "🐸", bg: "#bbf7d0", label: "ضفدع" },
  { id: "a8", emoji: "🦉", bg: "#fef3c7", label: "بومة" },
  { id: "a9", emoji: "🐵", bg: "#fdba74", label: "قرد" },
  { id: "a10", emoji: "🐰", bg: "#f5d0fe", label: "أرنب" },
  { id: "a11", emoji: "🐢", bg: "#a7f3d0", label: "سلحفاة" },
  { id: "a12", emoji: "🦄", bg: "#c7d2fe", label: "يونيكورن" },
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
      aria-label={"تغيير الأيقونة" + (option ? " (الحالية: " + option.label + ")" : "")}
    >
      {option ? option.emoji : (fallbackLetter || "؟")}
    </button>
  );
}
