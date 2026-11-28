// DG10 «مكتبة الأيقونات» (docs/enterprise-diagram-editor-design.md §22) — the icons a diagram can carry: the people, products, sales,
// management and technology of the companies students' projects are about. Original flat drawings (diagramIcons.tsx), coloured, in a
// circle. This module is the list only (ids, Arabic names, groups, search words): pure, so the diagram file's reader can check an icon's
// id without the drawings. A diagram file stores only the id.

export type IconGroup = "أشخاص" | "المبيعات والمنتجات" | "الإدارة" | "التقنية";
export type IconDef = { id: string; label: string; group: IconGroup; words: readonly string[] };

const people = (id: string, label: string, ...words: string[]): IconDef => ({ id, label, group: "أشخاص", words });
const sales = (id: string, label: string, ...words: string[]): IconDef => ({ id, label, group: "المبيعات والمنتجات", words });
const admin = (id: string, label: string, ...words: string[]): IconDef => ({ id, label, group: "الإدارة", words });
const tech = (id: string, label: string, ...words: string[]): IconDef => ({ id, label, group: "التقنية", words });

export const ICONS: readonly IconDef[] = Object.freeze([
  people("manager", "مدير", "رئيس", "مسؤول", "المدير العام", "صاحب الشركة", "boss", "manager", "head", "ceo", "director"),
  people("managerF", "مديرة", "رئيسة", "مسؤولة", "manager", "head", "director"),
  people("employee", "موظف", "عامل", "staff", "employee", "worker"),
  people("employeeF", "موظفة", "عاملة", "staff", "employee"),
  people("customer", "عميل", "زبون", "مشتري", "مستخدم", "customer", "client", "user", "buyer"),
  people("customerF", "عميلة", "زبونة", "مشترية", "مستخدمة", "customer", "client", "user"),
  people("sales", "مندوب مبيعات", "بائع", "مسوّق", "تسويق", "sales", "seller", "marketing"),
  people("support", "خدمة العملاء", "دعم", "مركز اتصال", "موظف استقبال", "support", "call center", "help desk"),
  people("accountant", "محاسب", "مالية", "حسابات", "أمين صندوق", "accountant", "finance", "cashier"),
  people("developer", "مبرمج", "مطوّر", "تقنية المعلومات", "developer", "programmer", "it"),
  people("technician", "فنّي", "مهندس", "صيانة", "عامل إنتاج", "technician", "engineer", "maintenance"),
  people("driver", "سائق توصيل", "مندوب توصيل", "سائق", "شحن", "driver", "delivery", "courier"),
  people("supplier", "مورّد", "تاجر جملة", "شريك", "supplier", "vendor", "partner"),
  people("student", "طالب", "متدرّب", "student", "trainee"),
  people("teacher", "معلّمة", "معلّم", "مدرّبة", "teacher", "trainer"),
  people("team", "فريق", "قسم", "موظفون", "مجموعة", "team", "group", "staff"),
  sales("product", "منتج", "صندوق", "سلعة", "بضاعة", "طرد", "product", "box", "item", "package"),
  sales("cart", "سلة مشتريات", "شراء", "تسوّق", "متجر إلكتروني", "cart", "shopping", "buy"),
  sales("invoice", "فاتورة", "إيصال", "حساب", "invoice", "bill", "receipt"),
  sales("order", "طلبية", "طلب", "قائمة", "order", "checklist"),
  sales("cash", "نقود", "مال", "دفع نقدي", "إيراد", "ربح", "cash", "money", "payment"),
  sales("card", "بطاقة دفع", "دفع إلكتروني", "فيزا", "بطاقة ائتمان", "card", "credit card", "payment"),
  sales("discount", "خصم", "عرض", "تخفيض", "سعر", "discount", "sale", "price", "offer"),
  sales("store", "متجر", "محل", "فرع", "store", "shop", "branch"),
  sales("warehouse", "مخزن", "مستودع", "مخزون", "warehouse", "stock", "inventory"),
  sales("truck", "شاحنة توصيل", "شحن", "توصيل", "نقل", "truck", "delivery", "shipping"),
  sales("factory", "مصنع", "إنتاج", "factory", "production"),
  admin("report", "تقرير", "ملف", "مستند", "report", "document"),
  admin("chart", "رسم بياني", "إحصائيات", "نمو", "مبيعات", "chart", "statistics", "growth"),
  admin("calendar", "تقويم", "موعد", "جدول", "تاريخ", "calendar", "date", "schedule"),
  admin("contract", "عقد", "اتفاقية", "توقيع", "contract", "agreement", "signature"),
  admin("company", "شركة", "مبنى", "مكتب", "إدارة", "company", "building", "office"),
  admin("target", "هدف", "خطة", "target", "goal", "plan"),
  admin("meeting", "اجتماع", "نقاش", "meeting", "discussion"),
  admin("idea", "فكرة", "اقتراح", "إبداع", "idea", "suggestion"),
  tech("computer", "حاسوب", "كمبيوتر", "جهاز", "computer", "pc", "desktop"),
  tech("mobile", "تطبيق جوّال", "هاتف", "جوّال", "تطبيق", "mobile", "phone", "app"),
  tech("website", "موقع إلكتروني", "موقع", "متصفّح", "إنترنت", "website", "web", "browser", "internet"),
  tech("database", "قاعدة بيانات", "بيانات", "database", "data", "sql"),
  tech("server", "خادم", "سيرفر", "server"),
  tech("cloud", "سحابة", "تخزين سحابي", "cloud"),
  tech("email", "بريد إلكتروني", "رسالة", "إيميل", "email", "mail", "message"),
  tech("security", "حماية", "قفل", "أمان", "كلمة مرور", "security", "lock", "password"),
  tech("settings", "إعدادات", "ترس", "نظام", "settings", "gear", "system"),
]);

export const ICON_GROUPS: readonly IconGroup[] = ["أشخاص", "المبيعات والمنتجات", "الإدارة", "التقنية"];
const BY_ID = new Map(ICONS.map(i => [i.id, i]));
export const isIconId = (v: unknown): v is string => typeof v === "string" && BY_ID.has(v);
export const iconOf = (id: string | undefined): IconDef | undefined => (id ? BY_ID.get(id) : undefined);

/** Arabic as typed: without its diacritics, «أ / إ / آ» as «ا», «ة» as «ه», «ى» as «ي»; Latin in lower case. */
export function plainArabic(s: string): string {
  return s.normalize("NFC").replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase().trim();
}
/** The icons a search finds (all of them for an empty search), in the library's order: by name, then by any of its words. */
export function findIcons(query: string): IconDef[] {
  const q = plainArabic(query);
  if (!q) return [...ICONS];
  return ICONS.filter(i => [i.label, ...i.words].some(w => plainArabic(w).includes(q)));
}
