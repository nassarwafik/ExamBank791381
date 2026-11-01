# Tadris+ P2-A1 — فحص جلسة المعلم الموحّد (Teacher Session Seam)

| البند | القيمة |
|---|---|
| المرحلة | P2-A1. جاءت بقرار المالك «إيقاف المعلم فورًا»، `docs/enterprise-three-tier-p0-blueprint.md` §19.3 |
| Baseline | `origin/main` = `70af5f40b6f7c497384904aea245cb2b44e2c337` (دمج PR #500) |
| نوع التغيير | إعادة هيكلة (refactor). **لا تغيير في السلوك**: من يدخل، وما تفعله الجلسة، والردود، كلها كما هي |

---

## 1. لماذا هذه المرحلة

**المشكلة:** `requireBuilderAuth` دالة متزامنة، لا تستطيع القراءة من التخزين. تتحقق من توقيع التوكن ودوره وصلاحيته وارتباطه بإعدادات الحسابات، لكنها لا تعرف إن كان المالك قد أوقف الحساب بعد إصدار التوكن.

**قرار المالك:** المعلم الموقوف يفقد الوصول **من الطلب التالي**. لذلك يجب أن يمر كل مسار للمعلم بفحص واحد غير متزامن يقدر على قراءة حساب المعلم.

**الحل:** دالة واحدة في `api/src/lib/teacher-session.js`:

```js
async function requireTeacherSession(request, deps = {}) {
  return (deps.requireBuilderAuth || requireBuilderAuth)(request);
}
```

| المرحلة | ما تفعله هذه الدالة |
|---|---|
| P2-A1 | تساوي `requireBuilderAuth` حرفيًا |
| P2-A2 | تعيد فحص حساب المعلم المُدار من التخزين في كل طلب: الحالة، و`authVersion`، ومعرّف الجلسة. تعيد 401 فورًا عند الإيقاف أو إعادة التعيين، و503 إذا تعذر الوصول إلى التخزين |

## 2. ما تغيّر

- **ملفات المسارات:** 57 ملفًا في `api/src/functions/` تنتظر الآن `requireTeacherSession` بدل استدعاء `requireBuilderAuth` مباشرة. التحويل:

  | قبل | بعد |
  |---|---|
  | `(deps.requireBuilderAuth \|\| requireBuilderAuth)(request)` | `(await requireTeacherSession(request, deps))` |
  | `authFn = deps.requireBuilderAuth \|\| requireBuilderAuth` … `authFn(request)` | `authFn = requireTeacherSession` … `await authFn(request, deps)` |
  | `requireBuilderAuth(request)` و`deps.requireBuilderAuth(request)` | الصيغة المقابلة مع `await` |

- **أداتا الأصول (`simulators` و`mesh-assets`):** تحتفظان بـ `requireBuilderAuth` داخل `DEFAULT_DEPS` كقيمة حقن (injection)، لا كاستدعاء.
- **`teacher-profile.js`:** صارت `resolveTeacher` غير متزامنة.
- **حذف الاستيرادات:** حُذف كل استيراد لـ `requireBuilderAuth` لم يعد مستخدمًا.
- **أدوات التشغيل السبع:** تبقى خلف `requireOperator` (من P1-B).
- **سجل الـ Tenancy:** صار يفرض القاعدة:
  - كل مسار معلم ينتظر `requireTeacherSession`، وأدوات التشغيل تنتظر `requireOperator`؛
  - ولا يستدعي أي مسار `requireBuilderAuth` بنفسه.
  - مسار جديد ينسى ذلك يُسقط CI.
- **الاختبارات القائمة:** التي تحقن `deps.requireBuilderAuth` تعمل كما هي.

## 3. ما لم يتغير

- محدد طلبات الذكاء الاصطناعي (`withAiRateLimit`) ما زال يستخدم `requireBuilderAuth` المتزامن، لكن **لتحديد هوية من يُحتسب عليه الطلب فقط**، لا للتفويض. التفويض يبقى داخل المسار.
- `platform-session` و`platform-login` لا تتغيران في P2-A1. يُعدَّلان في P2-A2 مع التوكن الجديد.

## 4. الأدلة

### 4.1 Fail-first

لا ينطبق، لأن هذه إعادة هيكلة بلا تغيير في السلوك. الدليل على عدم التغيير: الحزمة الكاملة كلها ناجحة، ومنها اختبار جرد المسارات الذي يستدعي كل مسار مجهولًا ويتوقع 401.

### 4.2 حملة Mutation

السكربت `scripts/mutate-p2a1.mjs`، على اختبارَي سجل الـ Tenancy وجرد المسارات.

| المعرّف | الخلل المزروع |
|---|---|
| M1 | الفحص يقبل أي طلب |
| M2 | مسار ينسى `await` على الفحص (`manage-students`) |
| M3 | مسار ينسى `await` على `authFn` (`manage-assignments`) |
| M4 | مسار يعود إلى استدعاء `requireBuilderAuth` مباشرة (`messages`) |
| M5 | مسار مشترك بين الطالب والمعلم يتخطى فحص المعلم (`learning-content`) |

النتائج في وصف الـ PR وفي تقرير المرحلة.
