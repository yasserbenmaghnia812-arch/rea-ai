package com.yassernexus.rea.data

import android.content.Context
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

object LocalModelManager {
    const val MODEL_FILE = "qwen2.5-0.5b-instruct-q4_k_m.gguf"
    const val MODEL_SIZE_LABEL = "حوالي 491 MB"
    const val MODEL_URL =
        "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"

    fun modelFile(context: Context): File =
        File(File(context.filesDir, "models").apply { mkdirs() }, MODEL_FILE)

    fun isDownloaded(context: Context): Boolean = modelFile(context).let { it.exists() && it.length() > 300_000_000L }

    suspend fun download(context: Context, onProgress: suspend (Int) -> Unit): File =
        withContext(Dispatchers.IO) {
            val destination = modelFile(context)
            if (destination.exists() && destination.length() > 300_000_000L) return@withContext destination

            val partial = File(destination.parentFile, "$MODEL_FILE.part")
            val connection = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
                connectTimeout = 30_000
                readTimeout = 60_000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", "REA-Console-Android")
            }

            try {
                connection.connect()
                check(connection.responseCode in 200..299) {
                    "فشل تنزيل النموذج: HTTP ${connection.responseCode}"
                }
                val total = connection.contentLengthLong
                var received = 0L
                var lastPercent = -1
                connection.inputStream.buffered().use { input ->
                    FileOutputStream(partial).buffered().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            currentCoroutineContext().ensureActive()
                            val count = input.read(buffer)
                            if (count < 0) break
                            output.write(buffer, 0, count)
                            received += count
                            if (total > 0) {
                                val percent = ((received * 100) / total).toInt().coerceIn(0, 100)
                                if (percent != lastPercent) {
                                    lastPercent = percent
                                    onProgress(percent)
                                }
                            }
                        }
                    }
                }
                check(partial.length() > 300_000_000L) { "ملف النموذج غير مكتمل أو غير صالح" }
                if (destination.exists()) destination.delete()
                check(partial.renameTo(destination)) { "تعذر حفظ ملف النموذج" }
                onProgress(100)
                destination
            } catch (error: Throwable) {
                partial.delete()
                throw error
            } finally {
                connection.disconnect()
            }
        }
}

class LocalModelEngine(context: Context) {
    private var instance: InferenceEngine? = null
    private val engine: InferenceEngine
        get() = instance ?: AiChat.getInferenceEngine(context.applicationContext).also { instance = it }

    suspend fun load(file: File) = withContext(Dispatchers.Default) {
        engine.loadModel(file.absolutePath)
        engine.setSystemPrompt(
            "أنت مساعد تقني محلي داخل REA Console. أجب بالعربية بوضوح واختصار. " +
                "لا تدّع تنفيذ أي إجراء خارجي. أدوات MCP لا تُستدعى إلا بعد موافقة المستخدم."
        )
    }

    fun generate(prompt: String, maxTokens: Int = 128): Flow<String> =
        engine.sendUserPrompt(prompt, predictLength = maxTokens)

    fun close() {
        instance?.destroy()
        instance = null
    }
}
