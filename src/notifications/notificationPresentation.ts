// Phase 6D — how each unified notification reads in the bell panel (Arabic title + one-line preview + icon kind).
// Pure presentation of server data; routing lives in StudentPortal.
import type { NotificationItem, ReactionId } from "./notificationsClient";

export type NotificationIconKind = "message" | "announcement" | "assignment" | "deadline" | "material" | "review" | "recognition";

const REACTION_TEXT: Record<ReactionId, { emoji: string; label: string }> = {
  heart: { emoji: "❤️", label: "أحببته" },
  clap: { emoji: "👏", label: "أحسنت" },
  cheer: { emoji: "🎉", label: "مبروك" },
  fire: { emoji: "🔥", label: "رائع" }
};

function formatDue(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try { return d.toLocaleString("ar", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
  catch { return d.toISOString().slice(0, 16).replace("T", " "); }
}
const quoted = (title: string) => (title ? "«" + title + "»" : "");

export type NotificationPresentation = { title: string; preview: string; icon: NotificationIconKind; sender?: string };

export function presentNotification(item: NotificationItem): NotificationPresentation {
  switch (item.type) {
    case "direct":
      return { title: item.unread ? "رسالة جديدة من المعلم" : "رسالة من المعلم", preview: item.preview, icon: "message", sender: item.senderDisplayName };
    case "announcement":
      return { title: item.unread ? "إعلان جديد للصف" : "إعلان للصف", preview: item.preview, icon: "announcement", sender: item.senderDisplayName };
    case "assignment_published":
      return { title: "واجب جديد", preview: item.assignmentTitle, icon: "assignment" };
    case "assignment_deadline_extended": {
      const due = formatDue(item.dueAt);
      return { title: "تم تمديد موعد الواجب", preview: quoted(item.assignmentTitle) + (due ? " · حتى " + due : ""), icon: "deadline" };
    }
    case "assignment_reopened":
      return { title: "تمت إعادة فتح الواجب", preview: "أعاد المعلم فتح " + (quoted(item.assignmentTitle) || "الواجب") + " لك", icon: "assignment" };
    case "assignment_retry_granted":
      return { title: "محاولة إضافية", preview: "منحك المعلم محاولة إضافية في " + (quoted(item.assignmentTitle) || "الواجب"), icon: "assignment" };
    case "attempt_time_extended":
      return { title: "تم تمديد وقت محاولتك", preview: quoted(item.assignmentTitle), icon: "deadline" };
    case "learning_module_published":
      return { title: "مادة تعليمية جديدة", preview: item.moduleTitle + (item.courseTitle ? " — " + item.courseTitle : ""), icon: "material" };
    case "assignment_reviewed": {
      const graded = item.becameFinal || item.scoreChanged;
      const title = graded ? "تم تصحيح واجبك" : "لديك ملاحظة جديدة من المعلم";
      const parts = [quoted(item.assignmentTitle)];
      if (graded && item.finalized && typeof item.percentage === "number") parts.push("النتيجة " + item.percentage + "%");
      if (graded && item.feedbackChanged) parts.push("مع ملاحظة جديدة من المعلم");
      return { title, preview: parts.filter(Boolean).join(" · "), icon: "review" };
    }
    case "teacher_reaction": {
      const r = REACTION_TEXT[item.reaction];
      return { title: "تفاعل المعلم مع إنجازك " + r.emoji, preview: r.label, icon: "recognition" };
    }
    case "teacher_note":
      return { title: "ملاحظة من المعلم", preview: item.notePreview, icon: "recognition" };
  }
}
