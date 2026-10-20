// Phase UX-R0 — real-browser COMPONENT GALLERY (certification only; never shipped) for the UX-R redesign programme. It renders
// every shared presentation primitive of src/ui (page / section headers, stat cards, badges, progress bar and ring, buttons,
// icon buttons, the action menu, fields, empty state, breadcrumb, chart card, dialog surface) with the app's own stylesheets
// in the app's own order, so scripts/capture-visual-baseline-ux-r.mjs (PART=gallery) can screenshot the whole kit before and
// after each UX-R phase. Static demo props only: no app state, no network.
import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "../src/design-tokens.css";
import "../src/fonts.css";
import "../src/index.css";
import "../src/App.css";
import "../src/platform.css";
import "../src/page-parts.css";
import "../src/shell.css";
import "../src/ui/ui.css";
import "../src/ui/field.css";
import "../src/ui/kit.css";
import ActionMenu from "../src/ui/ActionMenu";
import Breadcrumb from "../src/ui/Breadcrumb";
import ChartCard from "../src/ui/ChartCard";
import EmptyState from "../src/ui/EmptyState";
import Field from "../src/ui/Field";
import IconButton from "../src/ui/IconButton";
import PageHeader from "../src/ui/PageHeader";
import ProgressBar from "../src/ui/ProgressBar";
import ProgressRing from "../src/ui/ProgressRing";
import SectionHeader from "../src/ui/SectionHeader";
import StatCard from "../src/ui/StatCard";
import StatusBadge from "../src/ui/StatusBadge";
import Card from "../src/ui/Card";
import { ListRows, ListRow, RowAction } from "../src/ui/ListRows";
import SubNav from "../src/ui/SubNav";
import KpiStrip from "../src/ui/KpiStrip";
import Segmented from "../src/ui/Segmented";
import Tooltip from "../src/ui/Tooltip";
import { IconAssignments, IconDashboard, IconDownload, IconEdit, IconMore, IconPlus, IconRefresh, IconStudents, IconTrash } from "../src/icons";

// UX-R3 — the kit's interactive pieces keep local demo state.
function KitDemo() {
  const [cls, setCls] = useState("c2");
  const [period, setPeriod] = useState("30");
  return (
    <>
      <S id="kit-subnav-card" title="UX-R3 SubNav + Card + ListRows + RowAction">
        <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr)", gap: "24px", alignItems: "start" }}>
          <SubNav label="الصفوف" currentId={cls} onSelect={setCls} groups={[{ label: "الصفوف النشطة", items: [{ id: "c1", label: "العاشر – أ", count: 26 }, { id: "c2", label: "العاشر – ب", count: 25 }, { id: "c3", label: "الحادي عشر – أ", count: 23 }] }, { label: "إدارة", items: [{ id: "new", label: "إنشاء صف" }, { id: "archive", label: "الأرشيف" }] }]} />
          <Card title="الطلاب" aside={<span>ترتيب حسب: الاسم</span>} flush>
            <ListRows label="الطلاب">
              <ListRow icon={<IconStudents size={18} />} title="أحمد خالد الحسن" context="ID 20261045" meta="آخر دخول: اليوم" status={<StatusBadge tone="success">نشط</StatusBadge>} action={<RowAction onClick={() => {}} />} />
              <ListRow icon={<IconStudents size={18} />} title="جود سامر النجار" context="ID 20261047" meta="آخر دخول: قبل ٥ أيام" status={<StatusBadge tone="warn">يحتاج متابعة</StatusBadge>} action={<RowAction onClick={() => {}} />} />
              <ListRow icon={<IconAssignments size={18} />} title="اختبار الدوال التربيعية" context="العاشر – أ" meta="اختبار قصير" action={<RowAction label="فتح" onClick={() => {}} />} />
            </ListRows>
          </Card>
        </div>
      </S>
      <S id="kit-kpis" title="UX-R3 KpiStrip + Segmented + Tooltip">
        <div style={{ display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <Segmented label="الفترة" value={period} onChange={setPeriod} options={[{ value: "7", label: "٧ أيام" }, { value: "30", label: "٣٠ يومًا" }, { value: "90", label: "٩٠ يومًا" }]} />
            <Tooltip text="ألصق قائمة أسماء دفعة واحدة"><button type="button" className="eb-button">إضافة جماعية</button></Tooltip>
          </div>
          <KpiStrip label="المؤشرات الرئيسية" items={[{ label: "الطلاب النشطون", value: "146", hint: "في ٦ صفوف فعّالة" }, { label: "متوسط الصفوف", value: "78.4%", hint: "▲ 3.2% مقارنة بالسابق", trend: "up" }, { label: "نسبة التسليم", value: "91%", hint: "▲ 5% عن الشهر الماضي", trend: "up" }, { label: "بانتظار التصحيح", value: "23", hint: "8 متأخرة", trend: "down" }]} />
        </div>
      </S>
    </>
  );
}

const S = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section id={id} data-gallery={id} style={{ margin: "16px", padding: "16px", border: "1px dashed var(--eb-line-2)", borderRadius: "8px", background: "var(--eb-surface)" }}>
    <h2 style={{ fontSize: "12px", margin: "0 0 12px", color: "var(--eb-muted)", fontWeight: 600 }}>{title}</h2>
    {children}
  </section>
);
const Row = ({ children }: { children: ReactNode }) => <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>{children}</div>;

function Page() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 0 40px", fontFamily: "var(--eb-font)", background: "var(--eb-bg)" }}>
      <KitDemo />
      <S id="page-header" title="PageHeader + Breadcrumb">
        <PageHeader title="الصفوف والطلاب" icon={<IconStudents size={22} />} breadcrumb={[{ label: "لوحة المتابعة", onSelect: () => {} }, { label: "الصفوف والطلاب" }]} />
        <Breadcrumb items={[{ label: "بنك الامتحانات", onSelect: () => {} }, { label: "باني الامتحان" }]} />
      </S>
      <S id="section-header" title="SectionHeader">
        <SectionHeader title="الواجبات الحالية" count={8} description="الواجبات المفتوحة في كل الصفوف" actions={<button type="button" className="eb-button is-primary"><IconPlus size={16} />إنشاء واجب</button>} />
      </S>
      <S id="stat-cards" title="StatCard (neutral · attention · success · danger · info · primary)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
          <StatCard label="الطلاب النشطون" value="146" hint="في ٦ صفوف فعّالة" icon={<IconStudents size={18} />} />
          <StatCard label="بانتظار التصحيح" value="23" hint="٨ متأخرة" tone="attention" />
          <StatCard label="نسبة التسليم" value="91%" hint="▲ ٥٪ عن الشهر الماضي" tone="success" />
          <StatCard label="تسليمات ناقصة" value="7" hint="في واجب الشبكات ٣" tone="danger" />
          <StatCard label="رسائل جديدة" value="4" tone="info" />
          <StatCard label="متوسط الصفوف" value="78.4%" primary icon={<IconDashboard size={18} />} />
        </div>
      </S>
      <S id="badges" title="StatusBadge">
        <Row>
          <StatusBadge tone="success">نشط</StatusBadge><StatusBadge tone="neutral">مسودة</StatusBadge><StatusBadge tone="warn">يحتاج متابعة</StatusBadge>
          <StatusBadge tone="danger">متأخر</StatusBadge><StatusBadge tone="info">مجدول</StatusBadge>
        </Row>
      </S>
      <S id="buttons" title="Buttons · IconButton · ActionMenu">
        <Row>
          <button type="button" className="eb-button is-primary"><IconPlus size={16} />إنشاء</button>
          <button type="button" className="eb-button"><IconDownload size={16} />تصدير CSV</button>
          <button type="button" className="eb-button is-quiet"><IconEdit size={16} />تعديل</button>
          <button type="button" className="eb-button is-danger"><IconTrash size={16} />حذف</button>
          <button type="button" className="eb-button" disabled>معطّل</button>
          <IconButton label="تحديث" icon={<IconRefresh size={18} />} />
          <ActionMenu label="المزيد من الإجراءات" icon={<IconMore size={18} />}>
            <button type="button" className="eb-menu-item"><IconRefresh size={16} />تحديث</button>
            <button type="button" className="eb-menu-item"><IconDownload size={16} />تصدير CSV</button>
            <button type="button" className="eb-menu-item"><IconTrash size={16} />حذف</button>
          </ActionMenu>
          <ActionMenu label="تغيير الحالة" text="الحالة"><button type="button" className="eb-menu-item">منشور</button><button type="button" className="eb-menu-item">مؤرشف</button></ActionMenu>
        </Row>
      </S>
      <S id="progress" title="ProgressBar · ProgressRing">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "center" }}>
          <div style={{ display: "grid", gap: "12px" }}>
            <ProgressBar value={92} label="نسبة التسليم" />
            <ProgressBar value={61} label="سلسلة ١" tone="series-1" />
            <ProgressBar value={38} label="سلسلة ٢" tone="series-2" size="sm" />
            <ProgressBar value={84} label="نجاح" tone="success" />
          </div>
          <Row><ProgressRing value={78} label="متوسط الصف" /><ProgressRing value={NaN} label="بدون قيمة" size={72} /></Row>
        </div>
      </S>
      <S id="fields" title="Field (help · error)">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Field label="اسم الصف" help="مثال: العاشر – أ">{a11y => <input {...a11y} defaultValue="العاشر – ب" />}</Field>
          <Field label="رقم الهوية" error="رقم الهوية مستخدم لطالب آخر." showError="always">{a11y => <input {...a11y} defaultValue="400001111" />}</Field>
          <Field label="الصف">{a11y => <select {...a11y}><option>كل الصفوف</option></select>}</Field>
          <Field label="ملاحظات">{a11y => <textarea {...a11y} rows={2} placeholder="اكتب ملاحظة للطالب…" />}</Field>
        </div>
      </S>
      <S id="chart-card" title="ChartCard (with data-table disclosure)">
        <ChartCard title="اتجاه الأداء" description="آخر ٨ أسابيع" ariaLabel="متوسط الصف أسبوعيًا" table={{ columns: ["الأسبوع", "المتوسط"], rows: [["١", "72%"], ["٢", "75%"], ["٣", "79%"]] }} defaultTableOpen>
          <div style={{ height: 120, background: "var(--eb-surface-2)", borderRadius: "6px" }} />
        </ChartCard>
      </S>
      <S id="empty" title="EmptyState">
        <EmptyState title="لا توجد واجبات بعد" description="أنشئ واجبًا لصفوفك ليظهر هنا." action={<button type="button" className="eb-button is-primary"><IconPlus size={16} />إنشاء واجب</button>} />
      </S>
      <S id="dialog" title="Dialog surface (static markup of the shared dialog classes)">
        <div className="eb-dialog" role="group" aria-label="معاينة نافذة" style={{ position: "relative", inset: "auto", transform: "none", maxWidth: 480 }}>
          <div className="eb-dialog-head"><h2 className="eb-dialog-title">تعديل بيانات الصف</h2></div>
          <div className="eb-dialog-body"><p className="eb-confirm-message">سيتم حفظ التغييرات لكل طلاب الصف.</p></div>
          <div className="eb-dialog-foot"><button type="button" className="eb-button">إلغاء</button><button type="button" className="eb-button is-primary">حفظ</button></div>
        </div>
      </S>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Page /></StrictMode>);
