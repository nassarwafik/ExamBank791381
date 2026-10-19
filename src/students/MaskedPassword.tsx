import VisuallyHidden from "../ui/VisuallyHidden";
import { IconEye, IconEyeOff } from "../icons";

/* Phase S.3 — a generated or reset password is MASKED on screen until the teacher asks to see it (a projector, a shared
   screen, someone standing behind the desk). Only what the page shows is masked: copy, download and print still use the
   real value, and the mask is a fixed length so it never tells how long the password is. */

export function PasswordText({ value, shown }: { value: string; shown: boolean }) {
  if (shown) return <bdi dir="ltr">{value}</bdi>;
  return <span className="eb-secret-mask"><span aria-hidden="true">••••••••</span><VisuallyHidden>مخفية</VisuallyHidden></span>;
}

/** One toggle with a constant accessible name; its pressed state says whether the password is shown. */
export function RevealToggle({ label, shown, onToggle }: { label: string; shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="eb-button is-small" aria-pressed={shown} onClick={onToggle}>
      {shown ? <IconEyeOff size={14} /> : <IconEye size={14} />}{label}
    </button>
  );
}
