import { useEffect, useId, useRef, useState } from "react";
import { IconBell, IconMail, IconMegaphone } from "../icons";
import VisuallyHidden from "../ui/VisuallyHidden";
import { formatNotificationTime, formatUnread, type NotificationItem } from "../messages/messagesClient";
import "./notifications.css";

/**
 * Phase 6C — the student's in-app notification center: a «الإشعارات» bell in the StudentShell top bar + a compact
 * panel of recent teacher messages and class announcements. It is a PREVIEW / NAVIGATION surface only:
 *  • the badge is the portal's existing `messagesUnread` (Phase 5D server state) — this component owns no count;
 *  • opening the panel, hovering or seeing an item marks NOTHING read — selecting an item only navigates to the
 *    Student Messages page (direct conversation / «إعلانات الصف»), whose existing logic acknowledges what it shows;
 *  • data (items / loading / error) belongs to StudentPortal; a failed refresh keeps the last-good items.
 * Independent of browser notification permission (Phase 6B OS push is a separate, complementary channel).
 * Closing: the bell again, Escape (focus returns to the bell), a click/tap outside, or selecting an item.
 */
export type NotificationCenterProps = {
  items: NotificationItem[] | null;           // null = never loaded (or invalidated) yet
  loading: boolean;
  error: string;
  onOpenChange?: (open: boolean) => void;
  onSelect: (item: NotificationItem) => void;
  onOpenMessages: () => void;
  onRetry?: () => void;
};

const TITLES = {
  direct: { unread: "رسالة جديدة من المعلم", read: "رسالة من المعلم" },
  announcement: { unread: "إعلان جديد للصف", read: "إعلان للصف" }
} as const;

export default function NotificationBell({ unread, items, loading, error, onOpenChange, onSelect, onOpenMessages, onRetry }: NotificationCenterProps & { unread?: { total: number; capped: boolean } }) {
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

            {loading && <p className="eb-notif-status" role="status">{items ? "جارٍ تحديث الإشعارات..." : "جارٍ تحميل الإشعارات..."}</p>}
            {error && (
              <p className="eb-notif-error" role="status">
                {error}{items && items.length > 0 ? " تظهر آخر إشعارات تم تحميلها." : ""}
                {onRetry && !loading && <button type="button" className="eb-notif-retry" onClick={onRetry}>إعادة المحاولة</button>}
              </p>
            )}

            {items && list.length === 0 && !loading && !error && (
              <div className="eb-notif-empty" role="status">
                <IconBell size={22} aria-hidden="true" />
                <p>لا توجد إشعارات جديدة.</p>
              </div>
            )}

            {list.length > 0 && (
              <ul className="eb-notif-list" aria-label={unreadInList ? "أحدث الإشعارات، " + unreadInList + " غير مقروءة" : "أحدث الإشعارات"}>
                {list.map(item => {
                  const title = TITLES[item.type][item.unread ? "unread" : "read"];
                  const sender = item.senderDisplayName && item.senderDisplayName !== "المعلم" ? item.senderDisplayName : "";
                  const time = formatNotificationTime(item.createdAt, now);
                  return (
                    <li key={item.type + ":" + item.id}>
                      <button
                        type="button"
                        className={"eb-notif-item" + (item.unread ? " is-unread" : "")}
                        data-unread={item.unread ? "true" : "false"}
                        onClick={() => { setOpenState(false); onSelect(item); }}
                      >
                        <span className={"eb-notif-icon is-" + item.type} aria-hidden="true">
                          {item.type === "announcement" ? <IconMegaphone size={18} /> : <IconMail size={18} />}
                        </span>
                        <span className="eb-notif-text">
                          <span className="eb-notif-row">
                            <strong className="eb-notif-item-title">{title}</strong>
                            {item.unread ? <span className="eb-notif-new">جديد</span> : <VisuallyHidden>، مقروء</VisuallyHidden>}
                          </span>
                          {sender && <span className="eb-notif-sender">{sender}</span>}
                          {item.preview && <span className="eb-notif-preview">{item.preview}</span>}
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
