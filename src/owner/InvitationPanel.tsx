import { useState } from "react";
import { IconCheck, IconCopy } from "../icons";
import { invitationUrl, type ManagedTeacher, type TeacherInvitationLink } from "./ownerApi";
import OwnerQr from "./OwnerQr";
import { formatDate } from "./teacherShared";

export type Issued = { teacher: ManagedTeacher; invitation: TeacherInvitationLink };

/** Tadris+ P2-A2b — the invitation / reset link, shown ONCE (copy button + QR). Shared by the list and the teacher's page (P4-B1). */
export default function InvitationPanel({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = invitationUrl(issued.invitation.invitationPath);
  const reset = issued.invitation.purpose === "reset";
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
  }
  return (
    <div className="eb-owner-notice eb-owner-invite" role="region" aria-label={reset ? "رابط إعادة تعيين كلمة المرور" : "رابط الدعوة"}>
      <p>{reset ? "رابط إعادة تعيين كلمة المرور لـ" : "رابط الدعوة لـ"} <bdi>{issued.teacher.displayName}</bdi> (<bdi dir="ltr">{issued.teacher.username}</bdi>). أرسله للمعلم بنفسك. صالح حتى <bdi>{formatDate(issued.invitation.expiresAt)}</bdi>، ويُستخدم مرة واحدة.</p>
      <code className="eb-owner-link-text" dir="ltr">{url}</code>
      <div className="eb-owner-actions">
        <button type="button" className="eb-owner-secondary" onClick={copy}>
          {copied ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
          {copied ? "تم نسخ الرابط" : "نسخ الرابط"}
        </button>
        <button type="button" className="eb-owner-secondary" onClick={onClose}>إغلاق</button>
      </div>
      <OwnerQr value={url} label={"رمز QR لرابط " + (reset ? "إعادة التعيين" : "الدعوة")} />
      <p className="eb-owner-hint">لن يظهر هذا الرابط مرة أخرى. إذا ضاع، أصدر رابطًا جديدًا (الرابط السابق يتوقف تلقائيًا).</p>
    </div>
  );
}
