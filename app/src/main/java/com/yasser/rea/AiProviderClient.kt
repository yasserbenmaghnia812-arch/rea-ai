package com.yasser.rea

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class ReaChatTurn(val role: String, val content: String)

object AiProviderClient {
    private val client = OkHttpClient.Builder()
        .connectTimeout(25, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .callTimeout(100, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private const val SYSTEM_PROMPT =
        "You are REA AI, a precise technical assistant. Answer in Arabic unless the user requests another language. Never claim an action was completed unless it was actually completed."

    suspend fun generate(
        provider: String,
        apiKey: String,
        model: String,
        history: List<ReaChatTurn>
    ): String = withContext(Dispatchers.IO) {
        require(apiKey.isNotBlank()) { "أدخل مفتاح API أولاً." }
        require(model.isNotBlank()) { "أدخل اسم النموذج أولاً." }
        require(history.isNotEmpty()) { "لا توجد رسالة لإرسالها." }

        val request = when (provider) {
            "Gemini" -> geminiRequest(apiKey, model, history)
            "Groq" -> openAiCompatibleRequest(
                "https://api.groq.com/openai/v1/chat/completions", apiKey, model, history
            )
            "OpenRouter" -> openAiCompatibleRequest(
                "https://openrouter.ai/api/v1/chat/completions", apiKey, model, history
            )
            else -> error("مزود غير مدعوم: $provider")
        }

        client.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val detail = runCatching {
                    JSONObject(raw).optJSONObject("error")?.optString("message")
                }.getOrNull().orEmpty()
                throw IllegalStateException(
                    "HTTP ${response.code}: ${detail.ifBlank { raw.take(500) }}"
                )
            }
            when (provider) {
                "Gemini" -> {
                    val root = JSONObject(raw)
                    root.optJSONArray("candidates")
                        ?.optJSONObject(0)
                        ?.optJSONObject("content")
                        ?.optJSONArray("parts")
                        ?.optJSONObject(0)
                        ?.optString("text")
                        ?.takeIf { it.isNotBlank() }
                        ?: error("استجابة Gemini لا تحتوي على نص.")
                }
                else -> {
                    val root = JSONObject(raw)
                    root.optJSONArray("choices")
                        ?.optJSONObject(0)
                        ?.optJSONObject("message")
                        ?.optString("content")
                        ?.takeIf { it.isNotBlank() }
                        ?: error("استجابة المزود لا تحتوي على نص.")
                }
            }
        }
    }

    private fun geminiRequest(
        apiKey: String,
        model: String,
        history: List<ReaChatTurn>
    ): Request {
        val contents = JSONArray()
        history.forEach { turn ->
            if (turn.role == "user" || turn.role == "assistant") {
                contents.put(
                    JSONObject()
                        .put("role", if (turn.role == "assistant") "model" else "user")
                        .put("parts", JSONArray().put(JSONObject().put("text", turn.content)))
                )
            }
        }
        val payload = JSONObject()
            .put("systemInstruction", JSONObject().put(
                "parts", JSONArray().put(JSONObject().put("text", SYSTEM_PROMPT))
            ))
            .put("contents", contents)
            .put("generationConfig", JSONObject()
                .put("temperature", 0.6)
                .put("maxOutputTokens", 512))
        return Request.Builder()
            .url("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent")
            .header("x-goog-api-key", apiKey)
            .post(payload.toString().toRequestBody(jsonType))
            .build()
    }

    private fun openAiCompatibleRequest(
        endpoint: String,
        apiKey: String,
        model: String,
        history: List<ReaChatTurn>
    ): Request {
        val messages = JSONArray()
            .put(JSONObject().put("role", "system").put("content", SYSTEM_PROMPT))
        history.forEach { turn ->
            val role = if (turn.role == "assistant") "assistant" else "user"
            messages.put(JSONObject().put("role", role).put("content", turn.content))
        }
        val payload = JSONObject()
            .put("model", model)
            .put("messages", messages)
            .put("temperature", 0.6)
            .put("max_tokens", 512)
            .put("stream", false)
        val builder = Request.Builder()
            .url(endpoint)
            .header("Authorization", "Bearer $apiKey")
            .post(payload.toString().toRequestBody(jsonType))
        if (endpoint.contains("openrouter.ai")) {
            builder.header("HTTP-Referer", "https://github.com/yasserbenmaghnia812-arch/rea-ai")
            builder.header("X-Title", "REA AI Android")
        }
        return builder.build()
    }
}
