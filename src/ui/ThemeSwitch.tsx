import IconButton from "./IconButton";
import { IconMoon, IconSun } from "../icons";
import { useThemeChoice } from "./themePreference";

/**
 * UX-R18a — the dark-mode toggle (owner decisions, 2026-10-23: one button between the dark and the normal mode, a moon / sun
 * icon in the top bar). A toggle button with a fixed name, «الوضع الداكن», and aria-pressed saying whether dark mode is on; the
 * moon offers the dark mode, the sun brings the normal one back. The shells render it only once dark mode is released
 * (DARK_MODE_RELEASED, R18c).
 */
export default function ThemeSwitch({ className }: { className?: string }) {
  const [choice, setChoice] = useThemeChoice();
  const dark = choice === "dark";
  return (
    <IconButton
      label="الوضع الداكن"
      icon={dark ? <IconSun size={20} aria-hidden="true" /> : <IconMoon size={20} aria-hidden="true" />}
      aria-pressed={dark}
      onClick={() => setChoice(dark ? "light" : "dark")}
      className={"eb-theme-toggle" + (className ? " " + className : "")}
    />
  );
}
