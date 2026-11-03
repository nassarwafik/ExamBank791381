import "./schoolBadge.css";

/**
 * Tadris+ P4-C — the school's logo and name at the top of a page (teacher shell / student portal). The logo is decorative (the
 * name is written next to it), always contained in a fixed box (never stretched or cropped), and absent until it has loaded.
 */
export default function SchoolBadge({ name, logoUrl, size = "md" }: { name: string; logoUrl: string | null; size?: "md" | "lg" }) {
  return (
    <div className={"eb-school-badge eb-school-badge--" + size} role="group" aria-label={"المدرسة: " + name}>
      {logoUrl && <img className="eb-school-logo" src={logoUrl} alt="" decoding="async" />}
      <span className="eb-school-name"><bdi>{name}</bdi></span>
    </div>
  );
}
