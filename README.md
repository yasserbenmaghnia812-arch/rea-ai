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


## APK rebuild and debug signing

The Analysis page now offers a second GitHub Actions operation, **Rebuild and debug-sign APK**. It downloads the same private Supabase APK, decodes it with Apktool 3.0.2, rebuilds the decoded package, aligns it with Android build-tools, signs it with an ephemeral debug keystore, verifies the signature, and publishes the APK plus SHA-256 checksum as a seven-day GitHub Actions artifact.

This is a pipeline validation and debug build, not an AI-modified release. No AI patch is applied yet. The debug keystore is generated for each run and is not retained; therefore this APK cannot update an installed app signed with another key and is not suitable for Play Store release. Production signing requires a user-owned release keystore kept in protected GitHub Actions secrets. The source APK is not modified.


## AI-approved APK file patches

The Analysis page includes an AI patch review flow for APKs:
1. Run APK analysis and download the GitHub Actions artifact.
2. Extract a text XML or SMALI file from the artifact's `apktool/` directory.
3. Select that file in AI Patch Studio, enter its exact path relative to the decoded APK root, and describe the requested change.
4. The configured Gemini, Groq, or OpenRouter model proposes a complete replacement file. The user reviews the proposal and must explicitly approve it before anything is applied.
5. After approval, the app uploads a small patch manifest to the user's private Supabase `apk-temp` bucket and dispatches `.github/workflows/apply-ai-patches.yml`.
6. The workflow decodes a fresh copy of the original APK, validates the target path and original file SHA-256, applies only the approved replacement, rebuilds with Apktool, zipaligns, debug-signs, verifies, and publishes a seven-day artifact.

Security and scope:
- Only existing `AndroidManifest.xml`, `res/**/*.xml`, and `smali*/**/*.smali` files can be replaced; no file creation or deletion is allowed.
- The workflow rejects path traversal, unexpected file types, stale source hashes, and patch manifests for a different project.
- The original uploaded APK is never modified. AI keys remain in browser memory; the GitHub token is held in component memory and requires Actions write permission.
- JADX Java output is for reading/reference only; it is not compiled back into DEX by this workflow. Select XML/SMALI from Apktool output.
- The result uses an ephemeral debug signing key and is not a Play Store release. A production signing flow requires a user-owned release keystore.
