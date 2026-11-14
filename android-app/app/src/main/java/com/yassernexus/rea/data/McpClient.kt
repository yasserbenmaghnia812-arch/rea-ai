package com.yassernexus.rea.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class McpTool(val name: String, val description: String, val inputSchema: JSONObject)

class McpClient {
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
    private val jsonType = "application/json".toMediaType()

    suspend fun listTools(endpoint: String, token: String): List<McpTool> = withContext(Dispatchers.IO) {
        val session = initialize(endpoint, token)
        val response = post(endpoint, token, session, JSONObject()
            .put("jsonrpc", "2.0").put("id", 2).put("method", "tools/list").put("params", JSONObject()))
        val result = response.optJSONObject("result") ?: error(response.optJSONObject("error")?.toString() ?: "Invalid MCP tools/list response")
        val array = result.optJSONArray("tools") ?: JSONArray()
        buildList {
            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                add(McpTool(item.optString("name"), item.optString("description"), item.optJSONObject("inputSchema") ?: JSONObject()))
            }
        }
    }

    suspend fun callTool(endpoint: String, token: String, name: String): String = withContext(Dispatchers.IO) {
        val session = initialize(endpoint, token)
        val response = post(endpoint, token, session, JSONObject()
            .put("jsonrpc", "2.0").put("id", 3).put("method", "tools/call")
            .put("params", JSONObject().put("name", name).put("arguments", JSONObject())))
        response.optJSONObject("result")?.toString() ?: response.optJSONObject("error")?.toString() ?: response.toString()
    }

    private fun initialize(endpoint: String, token: String): String? {
        val body = JSONObject()
            .put("jsonrpc", "2.0").put("id", 1).put("method", "initialize")
            .put("params", JSONObject()
                .put("protocolVersion", "2025-03-26")
                .put("capabilities", JSONObject())
                .put("clientInfo", JSONObject().put("name", "REA-Console-Android").put("version", "0.1.0")))
        val response = post(endpoint, token, null, body)
        if (response.has("error")) error(response.getJSONObject("error").toString())
        return response.optJSONObject("result")?.optString("protocolVersion")
    }

    private fun post(endpoint: String, token: String, session: String?, payload: JSONObject): JSONObject {
        val builder = Request.Builder().url(endpoint).post(payload.toString().toRequestBody(jsonType))
            .header("Accept", "application/json, text/event-stream")
            .header("MCP-Protocol-Version", "2025-03-26")
        if (token.isNotBlank()) builder.header("Authorization", "Bearer $token")
        if (!session.isNullOrBlank()) builder.header("MCP-Session-Id", session)
        http.newCall(builder.build()).execute().use { response ->
            if (!response.isSuccessful) error("HTTP ${response.code}: ${response.body?.string().orEmpty()}")
            val raw = response.body?.string().orEmpty()
            val dataLine = raw.lineSequence().firstOrNull { it.startsWith("data:") }?.removePrefix("data:")?.trim()
            return JSONObject(dataLine ?: raw)
        }
    }
}
