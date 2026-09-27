// Phase 10B — the official ExamBank 791381 app icon (the approved artwork: graduation cap in a network hub, three exam
// lines and a rising arrow on the blue tile). ONE raster source ships under public/pwa in every size the platform needs
// (tab, installed app, home screen, Apple) and this component shows the same file inside the app, so the sidebar, the
// student top bar and the login hero always match the installed icon. Decorative wherever it is rendered (empty alt +
// aria-hidden); the accessible name stays on the surrounding text.
export const BRAND_ICON_SRC = "/pwa/icon-192.png";
type Props = { size?: number; rounded?: boolean; className?: string };

export default function BrandMark({ size = 36, rounded = true, className }: Props) {
  return (
    <img
      src={BRAND_ICON_SRC} alt="" aria-hidden="true" width={size} height={size} decoding="async" draggable={false}
      className={"eb-brand-icon" + (rounded ? "" : " is-square") + (className ? " " + className : "")}
    />
  );
}
