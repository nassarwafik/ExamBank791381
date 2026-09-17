// UX-7b-1 — deterministic Western-digit date/time for the student exam runtime. The surrounding language stays
// Arabic; only the digits are Latin (the previous toLocaleString("ar") calls could emit Arabic-Indic digits).
const two = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD HH:MM" in the viewer's local time; the existing "بدون موعد" wording for an absent/invalid value. */
export function formatDateTimeLatn(value: string | null | undefined): string {
  if (!value) return "بدون موعد";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "بدون موعد";
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes());
}

/** "YYYY-MM-DD" or "" for an absent/invalid value (the cover shows nothing rather than a fake date). */
export function formatDateLatn(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
}
