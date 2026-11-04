// Tadris+ P8-A — the teacher appearance presets the platform registers (blueprint §9.3, owner decisions §19.27): each part, its values,
// its default and the capability that lets a teacher choose it. Shared by the teacher's profile (P8-A1) and the owner's per-teacher
// restriction `resources.appearance` of the access revision (P8-A2). PRESENTATION ONLY — no security check reads a choice.
const APPEARANCE = Object.freeze({
  theme: Object.freeze({ values: Object.freeze(["light", "dark"]), fallback: "light", capability: "appearance.theme.choose" }),
  palette: Object.freeze({ values: Object.freeze(["default", "ocean", "forest", "sand"]), fallback: "default", capability: "appearance.palette.choose" }),
  density: Object.freeze({ values: Object.freeze(["comfortable", "compact"]), fallback: "comfortable", capability: "appearance.density.choose" })
});

/** Whether `value` of `part` is within the owner's restriction (`allowed` = sessionGrants(...).appearance; null = no restriction).
 *  The part's DEFAULT is always allowed: «استعادة الافتراضي» is never refused. */
function appearanceAllowed(part, value, allowed) {
  if (!allowed || !Array.isArray(allowed[part])) return true;
  return value === APPEARANCE[part].fallback || allowed[part].includes(value);
}

/** The values of each part a teacher may choose under `allowed` (null = every registered value). */
function allowedValues(allowed) {
  return Object.fromEntries(Object.entries(APPEARANCE).map(([k, spec]) => [k, spec.values.filter(v => appearanceAllowed(k, v, allowed))]));
}

module.exports = { APPEARANCE, appearanceAllowed, allowedValues };
