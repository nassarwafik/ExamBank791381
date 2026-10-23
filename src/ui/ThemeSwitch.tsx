import Segmented from "./Segmented";
import { THEME_LABELS, useThemeChoice, type ThemeChoice } from "./themePreference";

/**
 * UX-R18a — «المظهر»: the device-level appearance choice (system / light / dark) as the kit's Segmented radio group. The
 * shells render it only once dark mode is released (DARK_MODE_RELEASED, R18c).
 */
const OPTIONS = (["system", "light", "dark"] as ThemeChoice[]).map(value => ({ value, label: THEME_LABELS[value] }));

export default function ThemeSwitch({ className }: { className?: string }) {
  const [choice, setChoice] = useThemeChoice();
  return <Segmented label="المظهر" options={OPTIONS} value={choice} onChange={v => setChoice(v as ThemeChoice)} className={"eb-theme-switch" + (className ? " " + className : "")} />;
}
