# REA AI Studio

واجهة عربية مستقلة للتحليل العكسي وإعادة بناء التطبيقات، مبنية باستخدام React وVite وTypeScript.

## المنجز
- واجهة عربية RTL متجاوبة بتصميم داكن بالأسود والأبيض والأزرق.
- لوحة مشاريع وإحصاءات وصفحات التحليل وإعادة البناء والملفات وسجل النشاط.
- لوحة اتصال فعلية بخادم REA Cloud عبر MCP Streamable HTTP، مع اكتشاف الأدوات واستدعائها.
- مسار Vercel `/api/rea` يمرّر MCP إلى خادم REA Cloud.
- مساحة دردشة AI تفاعلية تدعم Gemini وGroq وOpenRouter باستخدام مفتاح المستخدم (BYOK).
- وضع وكيل REA: يقرأ قائمة أدوات MCP، ويقترح الأداة ومدخلاتها، ثم ينتظر موافقة المستخدم قبل التنفيذ.
- إعدادات مزوّد الذكاء الاصطناعي واسم النموذج تُحفظ محلياً؛ مفتاح API يبقى في الذاكرة فقط.
- مفاتيح AI تبقى في ذاكرة الصفحة ولا تحفظ في المستودع أو قاعدة بيانات.
- GitHub Actions للتحقق من TypeScript وبناء نسخة الويب.
- REA الرسمي مربوط كمكوّن Git Submodule في `vendor/rea` مع تهيئة recursive في CI.

## تشغيل محلي
يتطلب Node.js 22 أو أحدث.

```bash
npm install
npm run dev
```

## البناء
```bash
npm run build
```

## خادم REA
- المصدر الرسمي: https://github.com/morluto/rea
- الحزمة: https://www.npmjs.com/package/rea-agents
- نقطة MCP: `/api/rea` (تُمرر إلى خادم REA Cloud).
- النقل: Streamable HTTP.

الخادم السحابي الحالي عام وبدون مصادقة. لا تستخدمه مع ملفات حساسة قبل إضافة حماية ومصادقة.

## حدود النسخة الحالية
- اختيار الملفات في الواجهة محلي في المتصفح؛ لم يُنفّذ بعد رفع مجزأ إلى تخزين دائم أو تمرير الملف مباشرة إلى أدوات REA التي تتطلب مساراً على الخادم.
- وكيل المحادثة يستطيع اقتراح استدعاء أدوات MCP وتنفيذها بعد الموافقة، لكنه لا يرفع ملفات APK تلقائياً ولا يمررها إلى أدوات REA التي تتطلب مساراً على الخادم.
- محرر إعادة البناء، تنفيذ pipeline تلقائي، تخزين المشاريع والملفات على قاعدة بيانات، وتصدير APK/ZIP لم تُنفذ بعد.
- لا توجد سعة ملفات غير محدودة عملياً؛ ستعتمد الحدود على التخزين والاستضافة والوقت المتاح للتنفيذ.

## الأمان
- لا ترفع مفاتيح API أو GitHub tokens إلى المستودع.
- مفاتيح المزوّد المدخلة في المساعد تستخدم مباشرة من المتصفح وتبقى في الذاكرة حتى إعادة تحميل الصفحة.
- لا تضع بيانات حساسة في خادم MCP العام الحالي.

## الترخيص
واجهة REA AI Studio مستقلة. محرك REA الأصلي مرخّص وفق MIT؛ راجع مستودعه الرسمي وملفات الترخيص والإشعارات الخاصة به.


## Supabase connection

REA AI Studio uses the existing Supabase project for email/password authentication, project metadata, and private APK/ZIP uploads.

Set these Vite variables in Vercel (Production, Preview, and Development), or copy `.env.example` to `.env.local` for local development:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Only the Supabase publishable key is used in the browser. Do not add a `service_role` or secret key to Vite variables. Database and Storage access are restricted by Supabase RLS policies to the signed-in user's own records and files. The private `apk-temp` bucket currently limits each file to 100 MB.

Uploaded files are stored securely and project metadata is persisted. This connection does not yet start APK decompilation or rebuild jobs; those execution workflows remain a separate implementation step.


## Android APK analysis workflow

A free GitHub Actions workflow is prepared at `.github/workflows/analyze-apk.yml`. It accepts a one-hour signed download URL from the private Supabase `apk-temp` bucket, a project UUID, and the original APK filename. It downloads the APK, verifies the pinned REA JADX bridge JAR, decodes Android resources with Apktool, decompiles Java/Kotlin sources with JADX, runs REA Android package/class analysis, and publishes the results as a one-day GitHub Actions artifact.

To prepare an input, upload one APK from the Analysis page; the app creates a one-hour signed URL and displays the project ID and filename. The Analysis page can now dispatch the workflow directly using a fine-grained GitHub token with Actions read/write permission, then query the latest run status. The token is held only in component memory and is not persisted. Treat the signed URL as a temporary password and do not share it. This workflow currently accepts APK files only; ZIP source projects and AAB inputs need separate workflows.

The `workflow_dispatch` workflow is active on the default branch. The in-app runner starts the GitHub Actions job and links to its run page, where the one-day artifact can be downloaded. This stage analyzes and decompiles APKs only; it does not yet apply AI edits, rebuild/sign a modified APK, or write result artifacts back into Supabase.
