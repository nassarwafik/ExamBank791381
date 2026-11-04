// Tadris+ P3-A/P3-B2 — the Arabic wording of an access refusal, shared by every owner route that saves a revision.
const ACCESS_REFUSAL = Object.freeze({
  PRESET_UNKNOWN: "الحزمة المختارة غير موجودة.",
  PRESET_REQUIRED: "التطبيق الفعلي للصلاحيات مفعّل: اختر حزمة صلاحيات للمعلم الجديد.",
  CAPABILITY_UNKNOWN: "صلاحية غير معروفة.",
  CAPABILITY_DUPLICATE: "صلاحية مكررة في القائمة.",
  CAPABILITY_CONFLICT: "لا يمكن منح صلاحية ومنعها في الوقت نفسه.",
  PLATFORM_CAPABILITY_FORBIDDEN: "صلاحيات المنصة للمالك وحده، ولا تُمنح لمعلم.",
  DEPENDENCY_UNMET: "صلاحية تحتاج صلاحية أخرى غير ممنوحة.",
  RESOURCES_NOT_SUPPORTED: "تخصيص هذا النوع من الموارد يأتي في مرحلة لاحقة.",
  COURSE_UNKNOWN: "مقرر غير معروف.",
  COURSE_DUPLICATE: "مقرر مكرر في القائمة.",
  WIDGET_UNKNOWN: "بطاقة لوحة غير معروفة.",                      // Tadris+ P7-A2
  WIDGET_DUPLICATE: "بطاقة لوحة مكررة في القائمة.",
  GAME_UNKNOWN: "لعبة غير معروفة.",                              // Tadris+ P7-B2
  GAME_DUPLICATE: "لعبة مكررة في القائمة.",
  APPEARANCE_RESOURCE_INVALID: "خيارات المظهر غير صالحة.",          // Tadris+ P8-A2
  REVISION_MALFORMED: "طلب غير صالح.",
  ACCESS_PRESET_MISSING: "الإضافات والحجب تحتاج حزمة أساسية."
});
module.exports = { ACCESS_REFUSAL };
