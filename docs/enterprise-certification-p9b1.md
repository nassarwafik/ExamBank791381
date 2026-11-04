# Tadris+ P9-B1 — شهادة الاختبارات الإلزامية الـ 15 (المخطط §14.2)

> **حالة الوثيقة:** سجل المرحلة P9-B1 (قرارات المالك قبل P9-B في §19.35 من المخطط). اختبارات ووثيقة فقط، ومعها إصلاح واحد صغير
> كشفه الاختبار #5 (§4). لا تغيير في سلوك المنتج ولا في العلامات ولا في البيانات. لا تشغيل على الإنتاج.

| البند | القيمة |
|---|---|
| المرحلة | P9-B1 (المخطط §14.2 الاختبارات الـ 15، و§14.1 «Sweep»، و§17 المعيار 1) |
| Baseline | `origin/main` = `29e80a3f` (دمج #542) |
| الفرع | `claude/blissful-shannon-9rv461-p9b1-certification` |
| الفهرس الآلي | `api/tests/certification-index-p9b1.test.js` — يسقط CI إذا اختفى اختبار مسمّى هنا، أو تغيّر عنوانه، أو بقي اختبار قبول بلا دليل في مستوى يطلبه المخطط |

## 1. ما الذي أُضيف في P9-B1

1. **مسح سلوكي لكل مسارات المعلم** (`certification-route-sweep-p9b1.test.js`، المخطط §14.1). اختبار التسجيل الثابت
   (`route-capabilities-p3b`) يثبت أن كل مسار **يصرّح** بقدرته **ويسألها**. المسح يثبت **الجواب**:
   - **ما يُستدعى:** كل تسجيل HTTP في كل ملف مسار مصرَّح. ذلك 55 ملفًا و58 تسجيلًا.
   - **بماذا:** كل مفتاح في خريطته، أي كل action، مع GET وPOST. أي 234 طلبًا للمعلم الواحد.
   - **المعلمان:** حساب مُدار لا يملك شيئًا، في وضع **enforce**:
     - معلم لم يُسنده المالك (default deny)؛
     - معلم Revision يرفض كل قدرات قالبه (Revision فارغ).
   - **المطلوب:** 403 `CAPABILITY_DENIED` في كل طلب، والتخزين لم يتغيّر بايتًا واحدًا. الاستثناء الوحيد عدّاد معدّل الذكاء
     الاصطناعي الخاص بالمعلم نفسه (D3)، لأن غلافه يُسجَّل قبل المعالج. هذا عدّاد وليس محتوى، ولا يصل أي طلب إلى مزوّد.
   - **الضابط (control):** الطلبات نفسها في وضع **observe** لا تُرفض أبدًا. إذن الـ 403 سببها التطبيق (enforcement)، لا طلب
     مشوّه.
   - **خارج المسح، بقائمة مغلقة ومعلَّلة:** أربعة تسجيلات ليست نقاط معلم أصلًا:
     - ردّ المشغّل الموقَّع HMAC؛
     - مسح الاسترداد الموقَّع؛
     - ملفات المحاكي والنموذج ثلاثي الأبعاد بالـ hash للطالب.

     كل منها يُختبر أنه لا يخدم المعلم الفارغ (401 أو 404) ولا يكتب شيئًا. أي تسجيل جديد لا يرفض المعلم الفارغ يُسقط
     الاختبار، إلا إذا أُضيف إلى هذه القائمة مع سببه.
2. **بوابة E2E في Chromium حقيقي** (`scripts/check-access-e2e-p9b1.mjs`، workflow جديد `access-e2e-p9b1.yml`):
   - **البيئة:**
     - البناء الإنتاجي بجانب الـ API الحقيقي داخل العملية، على تخزين الذاكرة؛
     - جلسات موقّعة بقيم عشوائية لكل تشغيل؛
     - وضع enforce، وبيانات تجريبية فقط.
   - **المعلمات:** ثلاث معلمات مُدارات، لينا (learning-only)، وسارة (full-teaching بمقرر واحد)، وهدى (learning-ready-assignments).
   - **ما يُفحص:** الاختبارات #1 و#2 و#5 و#13 في 33 فحصًا. كل سيناريو يفحص ما **تعرضه** الصفحة، وما **يجيبه** الخادم للجلسة
     نفسها من داخل الصفحة. فالطلب الذي لا ترسله الواجهة يُرفض أيضًا، والواجهة ليست هي الحماية.
3. **اختبارات الفجوات:** اختبار مسمّى للحالة #3 (صفّان). لقطة «قبل/بعد» عند **تضييق** استحقاق المعلم (#4). القالب لا يتغير
   (#5). المظهر لا يغيّر التنقل في الواجهة (#12). إعادة التحميل على مستوى التطبيق (#13).
4. **الفهرس الآلي** (الجدول §2 هو نفسه مصدر `certification-index-p9b1.test.js`).

## 2. الفهرس: كل اختبار قبول ودليله

| # | الاختبار (المخطط §14.2) | المستوى المطلوب | الدليل (الملف: الاختبار) | الحالة |
|---|---|---|---|---|
| 1 | Learning-only لا يفتح Exam Builder ولا API الخاص به | API + E2E | `enforcement-routes-p3b.test.js`: «blueprint test #1…»؛ `enforce-switch-p3b2.test.js`؛ المسح `certification-route-sweep-p9b1.test.js`؛ UI `AppShell.p3c.test.tsx`؛ E2E `check-access-e2e-p9b1.mjs` (#1 sidebar / landing / server / traffic) | ✅ مكتمل |
| 2 | معلم يرى مادة واحدة ولا يقرأ غيرها | API + E2E | `course-entitlements-p5a.test.js` (enforce, only A؛ NOT entitled؛ no list / empty list)؛ E2E `check-access-e2e-p9b1.mjs` (#2: الكتالوج، والصفحة، والمحتوى، والدراسة، والتدريب، وطالبها) | ✅ مكتمل |
| 3 | فصل منشور لصف لا يفتحه طالب من صف آخر | API | `learning-content-l6a.test.js`: «acceptance test #3…» (جديد) و«the PERSISTED class decides…»؛ `student-learning-materials.test.js`: «Case 5…»؛ `learning-study.test.js`: «MOVED STUDENT…» | ✅ مكتمل |
| 4 | سحب المادة يمنع القراءة الجديدة، والتقدم محفوظ بايتًا ببايت | API | `course-entitlements-p5a.test.js`: «acceptance test #4…» (جديد: تضييق الاستحقاق ثم توسيعه) و«history stays…» (أرشفة المقرر)؛ `class-learning-materials.test.js`: «removes only the selected learning course…» | ✅ مكتمل |
| 5 | إسناد واجب جاهز دون تعديل القالب الأصلي (ولا عبر Builder أو نسخ) | API + E2E | `library-keys-p6a.test.js`: «assign by reference, edit…» و«no API module can write the library…» (جديدان)، و«a READY-assignments-only teacher…»، و«the stored snapshot is exactly the library's…»؛ `content-asset-route-p5c.test.js`: «the window's signed copy is shared and deep-frozen…» (جديد، §4)؛ UI `libraryRef.p6.test.tsx`؛ E2E `check-access-e2e-p9b1.mjs` (#5) | ✅ مكتمل (مع إصلاح §4) |
| 6 | لا إنشاء امتحان عبر API أو import أو AI بلا قدرة | API | المسح `certification-route-sweep-p9b1.test.js` يستدعي فعلًا `generate-exam` و`import-*` و`bank-import-action` و`save-exam-artifact` و`manage-saved-exams` وكل مسارات AI؛ `route-capabilities-p3b.test.js` (التصريح والسؤال) | ✅ مكتمل (صار سلوكيًا) |
| 7 | Widget واحد: لا تُقرأ بيانات غيره | API | `dashboard-widgets-p7a2.test.js` (التقارير، والمتابعة فقط، وAI بلا «ملخص العلامات»، وبلا widget واجبات لا تُقرأ مصادرها) | ✅ مكتمل |
| 8 | بلا رسائل: كل مسارات الرسائل مرفوضة، والطالب لا يرى الخدمة | API + UI | `student-messages-p7b1.test.js`؛ المسح `certification-route-sweep-p9b1.test.js` (يستدعي فعلًا `sendDirect` و`sendAnnouncement` و`editMessage` و`deleteMessage` و`markDirectRead`)؛ UI `StudentPortal.services.p7b1.test.tsx` | ✅ مكتمل (صار سلوكيًا) |
| 9 | لا وصول لصف معلم آخر | API | `teacher-tenancy-21g0.test.js` (الصف، والطالب، ودفتر العلامات)؛ `student-scope-p5b1.test.js` | ✅ مكتمل |
| 10 | إضافة طالب، أرشفته، استعادته، والنتائج سليمة | API | `student-scope-p5b1.test.js`: «a student added to my class is archived and restored…» | ✅ مكتمل |
| 11 | الحساب الموقوف يفقد الوصول من الطلب التالي | API (Mutation) | `teacher-accounts-p2a2.test.js`؛ `legacy-import-p2b.test.js`؛ Mutation `mutate-p2a2a.mjs` | ✅ مكتمل |
| 12 | المظهر لا يغير الصلاحيات | API + UI | `teacher-appearance-p8a1.test.js`؛ UI `TeacherAppShell.p3c.test.tsx`: «every palette and density…» (جديد) | ✅ مكتمل |
| 13 | إعادة التحميل أو الرابط العميق لا يتجاوز القيود | E2E | E2E `check-access-e2e-p9b1.mjs` (#13: reload، و`/builder`، و`#builder`، وتخزين التبويب المزوَّر)؛ UI `AppShell.p3c.test.tsx`: «…after a reload…» و«the same reload when the access cannot be read…» (جديدان)؛ `TeacherAppShell.p3c.test.tsx`: «a destination reached directly…» | ✅ مكتمل |
| 14 | فشل تحميل الصلاحيات = رفض، لا وصول كامل | API + UI (Mutation) | `access-registry-p3a.test.js`؛ `enforcement-routes-p3b.test.js`؛ `owner-access-p3a.test.js`؛ `course-entitlements-p5a.test.js`؛ UI `TeacherAppShell.p3c.test.tsx` و`AppShell.p3c.test.tsx`؛ Mutation `mutate-p3a.mjs` و`mutate-p3c.mjs` | ✅ مكتمل |
| 15 | البيانات والنتائج القديمة محفوظة بعد الترحيل | API على بيانات تجريبية | `legacy-ownership-p9a1.test.js` (النتائج بايتًا ببايت، والأرشفة والتراجع)؛ `legacy-import-p2b.test.js` (end to end) | ✅ مكتمل |

## 3. المسح بالتفصيل

- **المصدر:** خريطة `ROUTE_CAPABILITIES`، ولا قائمة يدوية. كل ملف فيها يُحمَّل مع التقاط `app.http`، ثم يُستدعى كل تسجيل بالمعالج
  الذي ينشره النشر نفسه. وهذا يشمل غلاف المراقبة وغلاف معدّل الذكاء الاصطناعي.
- **التخزين:** حاوية الذاكرة المستخدمة في اختبارات الـ API. عميل الـ Blob مستبدل، فلا اتصال بأي خدمة ولا سر.
- **مفاتيح المزوّدين** محذوفة من البيئة. لا يصل أي طلب إلى مزوّد.
- **عيّنة القيم:** الطلب يحمل `action` في الجسم وفي الاستعلام وفي `params`. السبب أن المسارات تقرأ الفعل من أماكن مختلفة.
- **ما لا يغطيه المسح:** مسارات لا تحمل `requireTeacherSession` أصلًا، مثل مسارات الطالب والمالك والمشغّل. هذه تحرسها اختباراتها
  الخاصة، و`tenancy-registry-21g0`، و`route-auth-inventory-11a`.

## 4. ما كشفته الشهادة: النسخة الموقّعة المشتركة لم تكن مجمَّدة (أُصلح)

**ما وجده اختبار #5:**
- المكتبة تُقرأ مرة واحدة وتُجمَّد تجميدًا عميقًا (`exam-library-store.js`)، ونصّ رأس الملف: «لا يستطيع أي مستدعٍ تغيير ما يقرؤه
  التالي».
- لكن P5-C أضاف `deliveryCopy` (`api/src/lib/content-assets.js`). هذه الدالة تحفظ لكل نافذة توقيع نسخة فيها روابط الصور الموقّعة.
- الحفظ يعتمد نسخ المسار (path-copy)، فتنتج كائنات جديدة **غير مجمّدة**، وكل طلبات النافذة تتشاركها.
- النتيجة: لو غيّر مستدعٍ داخل العملية الردَّ، لوصل التغيير إلى المعلم أو الطالب التالي في النافذة نفسها.

**الأثر اليوم:** لا يوجد. Azure Functions يسلسل `jsonBody` ولا شيء يعدّله. هو انتهاك كامن لثابت موثّق، يكفي لظهوره أن يُضاف يومًا
كود يعدّل الرد.

**الإصلاح:**
- النسخة المحفوظة تُجمَّد تجميدًا عميقًا، والفروع غير المتغيّرة هي الأصلية المجمّدة أصلًا.
- المستدعيان الوحيدان لا يعدّلان النتيجة: `exam-library.js` و`learning-content.js`.

**Fail-first:**
- مع `content-assets.js` كما في الـ baseline `29e80a3f` يفشل الاختباران الجديدان:
  - «assign by reference, edit…»، والعنصر التالي يعود بعنوان «معدّل»؛
  - «the window's signed copy is shared and deep-frozen…».
- مع الإصلاح ينجحان.

## 5. ملاحظات (ليست عيوبًا)

- **إعادة التحميل تبقي «مكان» التبويب:**
  - بعد تسجيل دخول جديد يهبط معلم learning-only على أول وجهة مسموحة.
  - بعد إعادة التحميل يبقى التطبيق على وجهته الافتراضية (الباني)، فيُعرض «هذه الأداة غير مفعّلة لحسابك» مع زر إلى «لوحة المتابعة».
  - لا تجاوز في الحالتين: صفحة الباني لا تُعرض، وبياناته لا تُطلب، وخادمه يرفض.
  - توحيد الهبوط تحسين تجربة محتمل. يحتاج قرار المالك، وليس ضمن هذه المرحلة.
- **`student-push.js`** واجهة اشتراك المتصفح فقط، ولا تحمل محتوى رسائل. إشعار الرسالة يُرسل من `sendDirect` و`sendAnnouncement`،
  والمسح يثبت أنهما مرفوضان بلا قدرة.
- **غلاف معدّل الذكاء الاصطناعي** يأخذ رمزًا من سلة المعلم نفسه قبل فحص القدرة، فطلبات المعلم المرفوضة تستهلك من حدّه هو فقط.
  هذا سلوك D3 كما صُمّم، لأن الغلاف عند التسجيل. لا أثر أمنيًا له، ولا يصل أي طلب إلى مزوّد.

## 6. إثبات Mutation

**اختبارات Vitest** (`scripts/mutate-p9b1.mjs`): **10/10 KILLED**. الملفات أُعيدت بايتًا ببايت (sha256)، و`git status` نظيف.

| Id | العيب المزروع | قتله |
|---|---|---|
| M1 | `generate-exam` يجيب بلا قدرته. الاستدعاء باقٍ، فاختبار التسجيل الثابت لا يراه | المسح |
| M2 | `import-upload` بلا قدرته | المسح |
| M3 | `bank-import-action` بلا قدرته | المسح |
| M4 | أفعال رسائل المعلم (إرسال، وإعلان، وتعديل، وحذف) بلا قدرتها | المسح |
| M5 | حفظ الامتحان المحفوظ وحذفه بلا قدرتهما | المسح |
| M6 | النسخة الموقّعة المشتركة غير مجمّدة، أي حذف إصلاح §4 | «the window's signed copy is shared and deep-frozen…» |
| M7 | تخطّي قرار المقرر في `learning-content` | «an ARCHIVED course…»، و«acceptance test #4…» (تحقّق منفرد) |
| M8 | الطالب يفتح أي وحدة من مقرر مرفق | «a student receives a module…»، و«acceptance test #3…» (تحقّق منفرد) |
| M9 | بعد إعادة التحميل يتجاهل التطبيق صلاحيات الـ probe | «…after a reload…» |
| M10 | حارس «غير مفعّلة» في الغلاف محذوف | «…after a reload…»، و«every palette and density…» (تحقّق منفرد) |

**بوابة E2E** (العيب مزروع في الكود الحقيقي، ثم تشغيل `check-access-e2e-p9b1.mjs`، ثم الاستعادة):

| Id | العيب المزروع | النتيجة |
|---|---|---|
| E1 | حارس `generate-exam` محذوف | KILLED: «#1 server POST /api/generate-exam» |
| E2 | قرار المقرر محذوف في `learning-content` | KILLED: «#2 student content B» |
| E3 | حارس «الواجبات الجاهزة فقط» محذوف | KILLED: «#5 own snapshot refused» |
| E4 | الغلاف يعامل كل وجهة كأنها مسموحة (`navAllowed(active, null)`، مع إعادة البناء) | التشغيل الأول **SURVIVED** والثاني **KILLED** (التفصيل أدناه) |

**E4 بالتفصيل:**
- **محاولة سابقة غير صالحة:** محاولة أولى بـ `if (false)` لم تُبنَ (TypeScript)، فلم تُحتسب.
- **التشغيل الأول، SURVIVED:** صفحة الباني ظهرت فعلًا، ومع ذلك نجح الفحص. السبب أنه كان يقبل «غير مفعّلة» **أو** غياب
  `.builder-workspace`، وهذه ليست جذر الجزء الظاهر من الصفحة.
- **التقوية:** صار الفحص يطلب «غير مفعّلة» **و** غياب علامات الباني الظاهرة («ماذا تريد في الامتحان؟»، و«امتحاناتي»).
- **التشغيل الثاني، KILLED:** أسقطه خمسة فحوص (#1 landing، و#13 reload، و`/builder`، و`#builder`، والتخزين المزوَّر).
- **ما بقي ثابتًا في الحالتين:** الخادم رفض كل طلبات الباني، والواجهة ليست هي الحماية.

## 7. ما لم يُفعل

- **لا E2E بـ Playwright Test runner:** المستودع لا يعتمد عليه. اتُّبع نمط البوابات الحقيقية الموجود (`check-*-browser-*.mjs` مع
  `playwright-core` أداةَ قياس، وworkflow مستقل). المخطط §14.1 يطلب «Playwright على build محلي مع API mocks/بيانات تجريبية»،
  وهذا ما تفعله البوابة، والـ API هنا هو الحقيقي لا mock.
- **لقطة P2-B (#15)** تبقى على ETags وثائق الصفوف، ولم تُوسَّع. P9-A تقارن الواجبات والتسليمات بايتًا ببايت، وهي ترحيل الملكية
  الفعلي.
