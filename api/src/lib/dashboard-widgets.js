// Tadris+ P7-A1 — the teacher dashboard's widgets (blueprint §9.2): ONE list of what the dashboard can show, the capabilities each
// widget needs (ALL of them) and the page that serves it. The server decides from it which sections it computes and sends; the UI
// shows a card only when the answer's `widgets` names it. P7-A2 builds on the same ids (the owner's per-teacher choice of widgets
// and the teacher's own order), so an id never changes meaning once published.
//
//   page "today"     — GET /api/teacher-today («ما الذي يحتاج انتباهي الآن؟»)
//   page "analytics" — GET /api/teacher-analytics (the dashboard's analysis sections)
//
// A widget whose capabilities the session does not hold is not computed and its source is not read (assignments index, submission
// folders, messages, project progress): withholding is never a client-side hiding of data that was sent.

const ASSIGNMENTS = "assignments.assignment.view";
const REPORTS = "reports.widget.view";

const w = (id, page, label, capabilities) => Object.freeze({ id, page, label, capabilities: Object.freeze(capabilities) });
const WIDGETS = Object.freeze([
  w("students.count", "today", "الصفوف والطلاب", ["classes.class.view"]),
  w("grading.pending", "today", "بانتظار التصحيح", [ASSIGNMENTS]),
  w("assignments.deadlines", "today", "مواعيد الإغلاق والفتح القريبة", [ASSIGNMENTS]),
  w("assignments.notStarted", "today", "لم يبدؤوا بعد", [ASSIGNMENTS]),
  w("results.unreleased", "today", "نتائج بانتظار النشر", [ASSIGNMENTS]),
  w("attempts.live", "today", "المحاولات الجارية والمتروكة", [ASSIGNMENTS]),
  w("activity.recent", "today", "آخر نشاط في الواجبات", [ASSIGNMENTS]),
  w("messages.unread", "today", "رسائل غير مقروءة", ["messages.inbox.read"]),
  w("projects.evaluation", "today", "تقييم المشاريع", ["projects.tracker.view"]),
  w("scores.overview", "analytics", "ملخص العلامات والتسليمات", [REPORTS, ASSIGNMENTS]),
  w("scores.trend", "analytics", "اتجاه الأداء عبر الواجبات", [REPORTS, ASSIGNMENTS]),
  w("classes.comparison", "analytics", "مقارنة الصفوف", [REPORTS, ASSIGNMENTS]),
  w("topics.performance", "analytics", "أداء الموضوعات", [REPORTS, ASSIGNMENTS]),
  w("students.improvers", "analytics", "الأكثر تحسنًا", [REPORTS, ASSIGNMENTS]),
  // Follow-up and insights stay for a teacher without assignments: they are then computed from the class / student figures only
  // (e.g. «لم يسجل الدخول بعد»), because the assignment sources are not read at all.
  w("students.followUp", "analytics", "طلاب يحتاجون متابعة", [REPORTS]),
  w("insights", "analytics", "ملاحظات تلقائية", [REPORTS])
]);
const BY_ID = new Map(WIDGETS.map(x => [x.id, x]));

/** The widget, or null. */
const widget = id => BY_ID.get(String(id)) || null;

/** The ids of a page's widgets the session may see (`has` = sessionGrants(...).has), in registry order. */
function visibleWidgets(page, has) {
  return WIDGETS.filter(x => x.page === page && x.capabilities.every(c => has(c))).map(x => x.id);
}

module.exports = { WIDGETS, widget, visibleWidgets, ASSIGNMENTS_CAPABILITY: ASSIGNMENTS };
