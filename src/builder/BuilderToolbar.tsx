import type { ReactNode } from "react";
import ActionMenu from "../ui/ActionMenu";
import { IconChevronBack, IconUndo, IconRedo, IconPlus, IconEye, IconMore } from "../icons";
import "./builder-toolbar.css";

/**
 * BuilderToolbar — Phase 21E.2 (21E.0 audit T-2): the structured builder's toolbar as PRIMARY / SECONDARY / OVERFLOW.
 *   identity row  : «رجوع» · exam title · counts · status chips (save state, final, quality gates, media wait)
 *   action row    : history (تراجع / إعادة) · «إضافة أسئلة» (menu) · «معاينة الامتحان» · «المزيد» (menu) · save draft · finalize
 * At most EIGHT buttons are ever visible (exit, undo, redo, add, preview, more, draft, finalize); every other action is an
 * ordinary button inside one of the two ActionMenus (labelled trigger, Escape / outside click closes, focus returns to the
 * trigger, a dialog opened from an item captures the trigger as its opener). Icons come from icons.tsx — never emoji-only
 * labels; on narrow widths labels collapse to icons but every button keeps its accessible name. Purely presentational: the
 * builder owns every handler, every gate and every disabled state.
 */
export type ToolbarItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** A toggle (e.g. the question explorer): exposed as aria-pressed. */
  pressed?: boolean;
  /** The item opens a dialog. */
  dialog?: boolean;
  /** Short status appended to the item (e.g. «3 مشكلات»), part of its accessible name. */
  badge?: string;
  title?: string;
};

export type BuilderToolbarProps = {
  /** Visually hidden heading that names the builder dialog surface (aria-labelledby target). */
  headingId: string;
  heading: string;
  onExit?: () => void;
  exitDisabled?: boolean;
  history?: { onUndo?: () => void; onRedo?: () => void; canUndo: boolean; canRedo: boolean; disabled: boolean };
  titleField: ReactNode;
  stats: ReactNode;
  status?: ReactNode;
  addItems: ToolbarItem[];
  preview?: ToolbarItem;
  moreItems: ToolbarItem[];
  /** The save draft / finalize buttons (owned by the builder: their gating rules live there). */
  save?: ReactNode;
};

function MenuItems({ items }: { items: ToolbarItem[] }) {
  return <>{items.map(item => (
    <button key={item.key} type="button" className="eb-menu-item sb-menu-item" data-action={item.key} onClick={item.onSelect} disabled={item.disabled}
      aria-pressed={item.pressed === undefined ? undefined : item.pressed} aria-haspopup={item.dialog ? "dialog" : undefined} title={item.title}>
      {item.icon && <span className="sb-menu-icon" aria-hidden="true">{item.icon}</span>}
      <span className="sb-menu-label">{item.label}</span>
      {item.badge && <span className="sb-menu-badge">{item.badge}</span>}
    </button>
  ))}</>;
}

export default function BuilderToolbar({ headingId, heading, onExit, exitDisabled, history, titleField, stats, status, addItems, preview, moreItems, save }: BuilderToolbarProps) {
  return (
    <header className="sb-toolbar sb-toolbar-21e2" data-toolbar="structured-builder">
      <h2 id={headingId} className="eb-visually-hidden">{heading}</h2>
      <div className="sb-tb-identity">
        {onExit && <button type="button" className="sb-tb-btn sb-tb-exit" onClick={onExit} disabled={exitDisabled}><IconChevronBack size={18} aria-hidden="true" /><span className="sb-tb-label">رجوع</span></button>}
        <div className="sb-tb-title">{titleField}</div>
        <div className="sb-tb-stats">{stats}</div>
        {status && <div className="sb-tb-status">{status}</div>}
      </div>
      <div className="sb-tb-actions" role="group" aria-label="أدوات الامتحان">
        <div className="sb-tb-group">
          {history && (history.onUndo || history.onRedo) && (
            <span className="sb-history" role="group" aria-label="سجل التعديلات">
              <button type="button" className="sb-tb-btn is-icon" onClick={history.onUndo} disabled={!history.canUndo || history.disabled} title="تراجع (Ctrl+Z)" aria-label="تراجع"><IconUndo size={18} aria-hidden="true" /></button>
              <button type="button" className="sb-tb-btn is-icon" onClick={history.onRedo} disabled={!history.canRedo || history.disabled} title="إعادة (Ctrl+Y أو Ctrl+Shift+Z)" aria-label="إعادة"><IconRedo size={18} aria-hidden="true" /></button>
            </span>
          )}
          {addItems.length > 0 && (
            <ActionMenu label="إضافة أسئلة" text="إضافة أسئلة" icon={<IconPlus size={18} aria-hidden="true" />} className="sb-tb-menu">
              <MenuItems items={addItems} />
            </ActionMenu>
          )}
          {preview && <button type="button" className="sb-tb-btn" onClick={preview.onSelect} disabled={preview.disabled} aria-haspopup="dialog"><IconEye size={18} aria-hidden="true" /><span className="sb-tb-label">{preview.label}</span></button>}
          {moreItems.length > 0 && (
            <ActionMenu label="المزيد من أدوات الامتحان" text="المزيد" icon={<IconMore size={18} aria-hidden="true" />} className="sb-tb-menu">
              <MenuItems items={moreItems} />
            </ActionMenu>
          )}
        </div>
        {save && <div className="sb-tb-save">{save}</div>}
      </div>
    </header>
  );
}
