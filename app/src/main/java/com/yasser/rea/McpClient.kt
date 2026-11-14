package com.yasser.rea

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class McpConnectionResult(
    val serverName: String,
    val protocolVersion: String,
    val tools: List<String>,
    val sessionCreated: Boolean,
    val testToolName: String,
    val testToolOutput: String
)

class McpClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .callTimeout(60, TimeUnit.SECONDS)
        .build()

    fun connect(endpoint: String, bearerToken: String = ""): McpConnectionResult {
        val base = endpoint.trim().trimEnd('/')
        require(base.startsWith("https://")) { "استخدم عنوان HTTPS لخادم MCP." }
        val url = if (base.endsWith("/mcp")) base else "$base/mcp"

        val initialize = JSONObject()
            .put("jsonrpc", "2.0")
            .put("id", 1)
            .put("method", "initialize")
            .put("params", JSONObject()
                .put("protocolVersion", "2024-11-05")
                .put("capabilities", JSONObject())
                .put("clientInfo", JSONObject()
                    .put("name", "REA Android")
                    .put("version", "1.0.0")))

        val first = post(url, initialize, bearerToken, null)
        val initResult = first.first.optJSONObject("result")
            ?: throw IllegalStateException(errorMessage(first.first, "لم يرجع الخادم نتيجة initialize."))
        val sessionId = first.second
        val protocol = initResult.optString("protocolVersion", "غير محدد")
        val server = initResult.optJSONObject("serverInfo")?.optString("name", "MCP Server") ?: "MCP Server"

        val notification = JSONObject()
            .put("jsonrpc", "2.0")
            .put("method", "notifications/initialized")
        post(url, notification, bearerToken, sessionId, allowEmpty = true)

        val listRequest = JSONObject()
            .put("jsonrpc", "2.0")
            .put("id", 2)
            .put("method", "tools/list")
            .put("params", JSONObject())
        val listed = post(url, listRequest, bearerToken, sessionId).first
        val result = listed.optJSONObject("result")
            ?: throw IllegalStateException(errorMessage(listed, "تعذر الحصول على tools/list."))
        val array = result.optJSONArray("tools")
        val names = buildList {
            if (array != null) for (i in 0 until array.length()) {
                val name = array.optJSONObject(i)?.optString("name").orEmpty()
                if (name.isNotBlank()) add(name)
            }
        }

        val lower = (server + " " + url).lowercase()
        val candidate = when {
            lower.contains("replica") -> "replica_server_info"
            lower.contains("ecc") -> "ecc_server_info"
            else -> ""
        }
        var testOutput = ""
        var testedTool = ""
        if (candidate.isNotBlank() && names.contains(candidate)) {
            val call = JSONObject()
                .put("jsonrpc", "2.0")
                .put("id", 3)
                .put("method", "tools/call")
                .put("params", JSONObject()
                    .put("name", candidate)
                    .put("arguments", JSONObject()))
            val called = post(url, call, bearerToken, sessionId).first
            val callResult = called.optJSONObject("result")
                ?: throw IllegalStateException(errorMessage(called, "لم يرجع الخادم نتيجة tools/call."))
            if (callResult.optBoolean("isError")) {
                throw IllegalStateException(extractToolText(callResult).ifBlank { "أداة الاختبار أعادت isError=true." })
            }
            testOutput = extractToolText(callResult)
            testedTool = candidate
        } else if (candidate.isNotBlank()) {
            throw IllegalStateException("الخادم لم يعلن أداة الاختبار الآمنة المطلوبة: $candidate")
        }

        return McpConnectionResult(server, protocol, names, !sessionId.isNullOrBlank(), testedTool, testOutput)
    }

    private fun extractToolText(result: JSONObject): String {
        result.optJSONObject("structuredContent")?.let { return it.toString() }
        val content = result.optJSONArray("content") ?: return result.toString()
        return buildList {
            for (i in 0 until content.length()) {
                val item = content.optJSONObject(i) ?: continue
                val text = item.optString("text")
                if (text.isNotBlank()) add(text)
            }
        }.joinToString("\n").ifBlank { result.toString() }
    }

    private fun post(
        url: String,
        payload: JSONObject,
        bearer: String,
        sessionId: String?,
        allowEmpty: Boolean = false
    ): Pair<JSONObject, String?> {
        val body = payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
        val builder = Request.Builder()
            .url(url)
            .post(body)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
        if (bearer.isNotBlank()) builder.header("Authorization", "Bearer $bearer")
        if (!sessionId.isNullOrBlank()) builder.header("MCP-Session-Id", sessionId)

        http.newCall(builder.build()).execute().use { response ->
            val responseText = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IllegalStateException("HTTP ${response.code}: ${responseText.take(300)}")
            }
            val nextSession = response.header("MCP-Session-Id") ?: sessionId
            if (responseText.isBlank() && allowEmpty) return JSONObject() to nextSession
            // Streamable HTTP may return JSON directly or an SSE "event: message" frame.
            val dataLines = responseText.lineSequence()
                .map { it.trim() }
                .filter { it.startsWith("data:") }
                .map { it.removePrefix("data:").trim() }
                .filter { it.isNotBlank() && it != "[DONE]" }
                .toList()
            val jsonText = if (dataLines.isNotEmpty()) dataLines.first() else responseText.trim()
            if (jsonText.isBlank() && allowEmpty) return JSONObject() to nextSession
            val json = try { JSONObject(jsonText) } catch (e: Exception) {
                throw IllegalStateException("استجابة MCP غير مفهومة: ${responseText.take(250)}")
            }
            return json to nextSession
        }
    }

    private fun errorMessage(json: JSONObject, fallback: String): String {
        val error = json.optJSONObject("error")
        return error?.optString("message")?.takeIf { it.isNotBlank() } ?: fallback
    }
}
