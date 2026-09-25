import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IconAssignments, IconBell, IconBook, IconCheck, IconHistory, IconMail, IconMedal, IconMegaphone } from "../icons";
import VisuallyHidden from "../ui/VisuallyHidden";
import { formatNotificationTime, formatUnread } from "../messages/messagesClient";
import { isMessageNotification, type BadgeCount, type NotificationItem } from "./notificationsClient";
import { presentNotification, type NotificationIconKind } from "./notificationPresentation";
import "./notifications.css";

/**
 * Phase 6C/6D — the student's UNIFIED in-app notification center: a «الإشعارات» bell in the StudentShell top bar + a
 * compact panel of recent teacher messages, class announcements AND non-message events (assignments, deadlines,
 * learning materials, reviews, teacher recognition). It is a PREVIEW / NAVIGATION surface only:
 *  • the badge is the server's UNIFIED count (`counts.bell` = messages + events) — never the ✉️ message-only count;
 *  • opening the panel, hovering or seeing an item marks NOTHING read — selecting an item hands it to the portal,
 *    which routes it (messages → the Student Messages page, which acknowledges what it shows; an event → acknowledged
 *    server-side, then routed);
 *  • data (items / counts / loading / error) belongs to StudentPortal; a failed refresh keeps the last-good items.
 * Independent of browser notification permission (Phase 6B OS push is a separate, complementary channel).
 * Closing: the bell again, Escape (focus returns to the bell), a click/tap outside, or selecting an item.
 */
export type NotificationCounts = { bell: BadgeCount; messages: BadgeCount; events: BadgeCount };
export type NotificationCenterProps = {
  items: NotificationItem[] | null;           // null = never loaded (or invalidated) yet
  counts?: NotificationCounts | null;         // the server's unified counts (null/absent = none yet → no badge)
  loading: boolean;
  error: string;
  onOpenChange?: (open: boolean) => void;
  onSelect: (item: NotificationItem) => void;
  onOpenMessages: () => void;
  onRetry?: () => void;
};

const ICONS: Record<NotificationIconKind, ReactNode> = {
  message: <IconMail size={18} />,
  announcement: <IconMegaphone size={18} />,
  assignment: <IconAssignments size={18} />,
  deadline: <IconHistory size={18} />,
  material: <IconBook size={18} />,
  review: <IconCheck size={18} />,
  recognition: <IconMedal size={18} />
};

export default function NotificationBell({ counts, items, loading, error, onOpenChange, onSelect, onOpenMessages, onRetry }: NotificationCenterProps) {
  const unread = counts ? counts.bell : undefined;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();
  const count = unread && unread.total > 0 ? formatUnread(unread.total, unread.capped) : "";

  // The latest callback, read by the document listeners without re-subscribing them on every render.
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);

  const openRef = useRef(false);
  function setOpenState(next: boolean) {
    openRef.current = next;
    setOpen(next);
    onOpenChangeRef.current?.(next);
  }
  // Unmounted while open (e.g. the student went to another view from the keyboard): the owner learns it is closed.
  useEffect(() => () => { if (openRef.current) onOpenChangeRef.current?.(false); }, []);

  // Listeners exist only while the panel is open and are removed on close/unmount (no leak).
  useEffect(() => {
    if (!open) return;
    const close = () => { openRef.current = false; setOpen(false); onOpenChangeRef.current?.(false); };
    const onPointerDown = (e: Event) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const now = new Date();
  const list = items || [];
  const unreadInList = list.filter(i => i.unread).length;
  // The preview is BOUNDED (the newest items only); the counts are the server's full counts. Per SOURCE: when a count
  // exceeds the unread items of that source shown, more unread items exist outside the preview — older messages are
  // reachable via «فتح الرسائل». A capped count ("99+") always exceeds a preview (no number is claimed then).
  const unreadMessagesInList = list.filter(i => i.unread && isMessageNotification(i)).length;
  const unreadEventsInList = unreadInList - unreadMessagesInList;
  const msg = counts ? counts.messages : { total: 0, capped: false }, ev = counts ? counts.events : { total: 0, capped: false };
  const outsideMessages = items !== null && (msg.capped || msg.total > unreadMessagesInList);
  const outsideMessagesCount = msg.capped ? 0 : msg.total - unreadMessagesInList;
  const outsideEvents = items !== null && (ev.capped || ev.total > unreadEventsInList);
  const outside = outsideMessages || outsideEvents;
  // `items === null` = not loaded yet or dropped as stale: a fresh read is on its way — never an empty/blank box.
  const pending = items === null && !error;

  return (
    <div className="eb-notif" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="student-topbar-link eb-notif-bell"
        aria-label={count ? "الإشعارات، " + count + " غير مقروءة" : "الإشعارات"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenState(!open)}
      >
        <IconBell size={16} aria-hidden="true" />
        <span className="eb-notif-bell-label">الإشعارات</span>
        {count && <span className="eb-nav-badge eb-notif-badge" aria-hidden="true">{count}</span>}
      </button>

      <section id={panelId} className="eb-notif-panel" aria-labelledby={titleId} hidden={!open}>
        {open && (
          <>
            <header className="eb-notif-head">
              <h2 id={titleId} className="eb-notif-title">الإشعارات</h2>
              <button type="button" className="eb-notif-head-action" onClick={() => { setOpenState(false); onOpenMessages(); }}>فتح الرسائل</button>
            </header>

            {(loading || pending) && <p className="eb-notif-status" role="status">{items ? "جارٍ تحديث الإشعارات..." : "جارٍ تحميل الإشعارات..."}</p>}
            {error && (
              <p className="eb-notif-error" role="status">
                {error}{items && items.length > 0 ? " تظهر آخر إشعارات تم تحميلها." : ""}
                {onRetry && !loading && <button type="button" className="eb-notif-retry" onClick={onRetry}>إعادة المحاولة</button>}
              </p>
            )}

            {items && list.length === 0 && !outside && !loading && !error && (
              <div className="eb-notif-empty" role="status">
                <IconBell size={22} aria-hidden="true" />
                <p>لا توجد إشعارات جديدة.</p>
              </div>
            )}
            {items && list.length === 0 && outside && (
              <div className="eb-notif-empty is-outside" role="status">
                <IconMail size={22} aria-hidden="true" />
                <p>{outsideMessages ? "لديك رسائل غير مقروءة أقدم من المعاينة. افتح الرسائل لعرضها." : "لديك إشعارات غير مقروءة أقدم من المعاينة."}</p>
              </div>
            )}
            {list.length > 0 && outsideMessages && (
              <p className="eb-notif-more" role="status">
                {outsideMessagesCount > 0 ? "توجد رسائل غير مقروءة أخرى لا تظهر هنا (" + outsideMessagesCount + "). افتح الرسائل لعرضها." : "توجد رسائل غير مقروءة أخرى لا تظهر هنا. افتح الرسائل لعرضها."}
              </p>
            )}
            {list.length > 0 && outsideEvents && !outsideMessages && (
              <p className="eb-notif-more" role="status">توجد إشعارات أخرى غير مقروءة أقدم من المعاينة.</p>
            )}

            {list.length > 0 && (
              <ul className="eb-notif-list" aria-label={unreadInList ? "أحدث الإشعارات، " + unreadInList + " غير مقروءة" : "أحدث الإشعارات"}>
                {list.map(item => {
                  const view = presentNotification(item);
                  const title = view.title;
                  const sender = view.sender && view.sender !== "المعلم" ? view.sender : "";
                  const time = formatNotificationTime(item.createdAt, now);
                  return (
                    <li key={item.type + ":" + item.id}>
                      <button
                        type="button"
                        className={"eb-notif-item" + (item.unread ? " is-unread" : "")}
                        data-unread={item.unread ? "true" : "false"}
                        data-type={item.type}
                        onClick={() => { setOpenState(false); onSelect(item); }}
                      >
                        <span className={"eb-notif-icon is-" + item.type + (view.icon !== item.type ? " is-" + view.icon : "")} aria-hidden="true">
                          {ICONS[view.icon]}
                        </span>
                        <span className="eb-notif-text">
                          <span className="eb-notif-row">
                            <strong className="eb-notif-item-title">{title}</strong>
                            {item.unread ? <span className="eb-notif-new">جديد</span> : <VisuallyHidden>، مقروء</VisuallyHidden>}
                          </span>
                          {sender && <span className="eb-notif-sender">{sender}</span>}
                          {view.preview && <span className="eb-notif-preview">{view.preview}</span>}
                          {time && <time className="eb-notif-time" dateTime={item.createdAt}>{time}</time>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
