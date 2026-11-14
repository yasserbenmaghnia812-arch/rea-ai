package com.yasser.rea

import android.content.Context
import android.os.StatFs
import com.arm.aichat.gguf.GgufMetadataReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

object LocalModelManager {
    const val MODEL_NAME = "Qwen2.5-0.5B-Instruct-Q4_0.gguf"
    private const val MODEL_URL =
        "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf"
    private const val MIN_MODEL_BYTES = 300L * 1024L * 1024L
    private const val MIN_FREE_BYTES = 550L * 1024L * 1024L

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .callTimeout(20, TimeUnit.MINUTES)
        .build()

    fun modelFile(context: Context): File =
        File(File(context.filesDir, "models"), MODEL_NAME)

    suspend fun ensureModel(
        context: Context,
        onProgress: suspend (String) -> Unit
    ): File = withContext(Dispatchers.IO) {
        val directory = File(context.filesDir, "models").apply { mkdirs() }
        val target = File(directory, MODEL_NAME)
        if (target.exists() && target.length() >= MIN_MODEL_BYTES &&
            GgufMetadataReader.create().ensureSourceFileFormat(target)
        ) {
            onProgress("النموذج موجود محلياً (${target.length() / (1024 * 1024)} MB).")
            return@withContext target
        }
        if (target.exists()) target.delete()

        val free = StatFs(context.filesDir.absolutePath).availableBytes
        require(free >= MIN_FREE_BYTES) {
            "المساحة الحرة غير كافية لتنزيل النموذج؛ يلزم نحو 550 MB على الأقل."
        }

        val partial = File(directory, "$MODEL_NAME.part")
        partial.delete()
        onProgress("بدء تنزيل Qwen2.5-0.5B؛ الحجم يقارب 429 MB.")
        val request = Request.Builder()
            .url(MODEL_URL)
            .header("User-Agent", "REA-Android/1.0")
            .build()

        client.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "فشل تنزيل النموذج: HTTP ${response.code}" }
            val body = response.body ?: error("استجابة التنزيل فارغة.")
            val expected = body.contentLength()
            check(expected < 0 || expected >= MIN_MODEL_BYTES) {
                "حجم ملف النموذج غير متوقع: ${expected} bytes"
            }

            var written = 0L
            var lastReported = 0L
            body.byteStream().use { input ->
                FileOutputStream(partial).use { output ->
                    val buffer = ByteArray(256 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        written += count
                        if (written - lastReported >= 4L * 1024L * 1024L) {
                            lastReported = written
                            val percent = if (expected > 0) (written * 100 / expected).toInt() else -1
                            onProgress(
                                if (percent >= 0) "تنزيل النموذج: $percent% (${written / (1024 * 1024)} MB)"
                                else "تنزيل النموذج: ${written / (1024 * 1024)} MB"
                            )
                        }
                    }
                    output.fd.sync()
                }
            }
            check(written >= MIN_MODEL_BYTES && (expected <= 0 || written == expected)) {
                "ملف النموذج غير مكتمل؛ استلمنا $written من $expected bytes."
            }
        }

        check(GgufMetadataReader.create().ensureSourceFileFormat(partial)) {
            "الملف الذي تم تنزيله ليس نموذج GGUF صالحاً."
        }
        check(partial.renameTo(target)) { "تعذر تثبيت ملف النموذج في مساحة التطبيق." }
        onProgress("اكتمل تنزيل النموذج والتحقق من صيغة GGUF.")
        target
    }
}
