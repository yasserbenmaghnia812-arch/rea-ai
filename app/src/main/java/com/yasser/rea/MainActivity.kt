package com.yasser.rea

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val Ink = Color(0xFF080B11)
private val Panel = Color(0xFF121925)
private val Accent = Color(0xFF56D6B0)

private data class McpServer(val title: String, val url: String)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { ReaApp() }
    }
}

@Composable
private fun ReaApp() {
    var selected by remember { mutableStateOf("الرئيسية") }
    var prompt by remember { mutableStateOf("") }
    var cloudUrl by remember { mutableStateOf("https://rea-cloud-mcp-unified.onrender.com") }
    var replicaUrl by remember { mutableStateOf("https://replica-mcp-server-dfj0.onrender.com") }
    var eccUrl by remember { mutableStateOf("https://yasser-ecc-mcp-m8ia.onrender.com") }
    var bearer by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("لم يتم اختبار اتصال MCP بعد") }
    var selectedServer by remember { mutableStateOf("REA Cloud MCP") }
    var busy by remember { mutableStateOf(false) }
    var tools by remember { mutableStateOf(emptyList<String>()) }
    var serverInfo by remember { mutableStateOf("") }
    val messages = remember { mutableStateListOf("واجهة REA الأصلية جاهزة. اتصال الذكاء الاصطناعي لم يُفعّل بعد.") }
    val scope = rememberCoroutineScope()

    val servers = listOf(
        McpServer("REA Cloud MCP", cloudUrl),
        McpServer("Replica MCP", replicaUrl),
        McpServer("ECC MCP", eccUrl)
    )
    val activeUrl = servers.first { it.title == selectedServer }.url

    MaterialTheme(colorScheme = darkColorScheme(primary = Accent, background = Ink, surface = Panel)) {
        Scaffold(containerColor = Ink, bottomBar = {
            NavigationBar(containerColor = Panel) {
                listOf("الرئيسية", "المحادثة", "الأدوات", "الإعدادات").forEach { item ->
                    NavigationBarItem(
                        selected = selected == item,
                        onClick = { selected = item },
                        icon = { Icon(when(item) {
                            "المحادثة" -> Icons.Default.Chat
                            "الأدوات" -> Icons.Default.Hub
                            "الإعدادات" -> Icons.Default.Settings
                            else -> Icons.Default.Dashboard
                        }, null) },
                        label = { Text(item) }
                    )
                }
            }
        }) { pad ->
            Column(
                Modifier.fillMaxSize().padding(pad).padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("REA AI", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                        Text("ANDROID NATIVE CONSOLE", color = Accent, fontSize = 10.sp, letterSpacing = 2.sp)
                    }
                    Surface(color = Accent.copy(alpha = .12f), shape = RoundedCornerShape(50)) {
                        Text("NATIVE APK", Modifier.padding(horizontal = 12.dp, vertical = 7.dp), color = Accent, fontSize = 11.sp)
                    }
                }
                when(selected) {
                    "الرئيسية" -> {
                        StatusCard("حالة MCP", status)
                        StatusCard("الخادم المختار", selectedServer)
                        StatusCard("نتيجة الفحص", serverInfo.ifBlank { "لم يتم إجراء handshake بعد" })
                        StatusCard("المعمارية", "Kotlin • Jetpack Compose • Android API 26+")
                        Text("تطبيق Android أصلي؛ لا يستخدم WebView.", color = Color.LightGray, fontSize = 13.sp)
                    }
                    "المحادثة" -> {
                        LazyColumn(
                            Modifier.weight(1f).fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(messages) { msg ->
                                Surface(color = Panel, shape = RoundedCornerShape(14.dp)) {
                                    Text(msg, Modifier.fillMaxWidth().padding(14.dp), color = Color.White)
                                }
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            BasicTextField(
                                value = prompt,
                                onValueChange = { prompt = it },
                                modifier = Modifier.weight(1f).background(Panel, RoundedCornerShape(12.dp)).padding(14.dp),
                                textStyle = androidx.compose.ui.text.TextStyle(color = Color.White),
                                decorationBox = { inner ->
                                    if(prompt.isEmpty()) Text("اكتب أمرك...", color = Color.Gray)
                                    inner()
                                }
                            )
                            Button(onClick = {
                                if(prompt.isNotBlank()) {
                                    messages.add("أنت: $prompt")
                                    messages.add("لم يتم ربط مزود نموذج AI بعد. فحص MCP لا يعني أن المحادثة الذكية أصبحت متاحة.")
                                    prompt = ""
                                }
                            }) { Icon(Icons.Default.Send, null) }
                        }
                    }
                    "الأدوات" -> {
                        Text("اختبار خوادم MCP", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        servers.forEach { server ->
                            Surface(
                                color = Panel,
                                shape = RoundedCornerShape(14.dp),
                                modifier = Modifier.fillMaxWidth().clickable { selectedServer = server.title }
                            ) {
                                Row(
                                    Modifier.padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(server.title, color = Accent, fontWeight = FontWeight.SemiBold)
                                        Text(server.url, color = Color.LightGray, fontSize = 10.sp)
                                    }
                                    RadioButton(selected = selectedServer == server.title, onClick = { selectedServer = server.title })
                                }
                            }
                        }
                        Button(
                            onClick = {
                                if (!busy) {
                                    busy = true
                                    status = "جارٍ تنفيذ MCP initialize و tools/list..."
                                    tools = emptyList()
                                    scope.launch {
                                        try {
                                            val result = withContext(Dispatchers.IO) {
                                                McpClient().connect(activeUrl, bearer)
                                            }
                                            status = "اتصال MCP ناجح"
                                            serverInfo = "${result.serverName} • protocol ${result.protocolVersion} • session ${if(result.sessionCreated) "موجودة" else "غير موجودة"}"
                                            tools = result.tools
                                        } catch (e: Exception) {
                                            status = "فشل اتصال MCP: ${e.message ?: "خطأ غير معروف"}"
                                            serverInfo = "لم يكتمل handshake"
                                        } finally {
                                            busy = false
                                        }
                                    }
                                }
                            },
                            enabled = !busy,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            else Text("اختبار الاتصال وجلب الأدوات")
                        }
                        if (tools.isNotEmpty()) {
                            Text("الأدوات المكتشفة (${tools.size})", color = Accent, fontWeight = FontWeight.Bold)
                            LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(tools) { tool -> StatusCard(tool, "تم الإعلان عنها بواسطة خادم MCP") }
                            }
                        } else if (!busy && status.startsWith("اتصال MCP ناجح")) {
                            Text("اكتمل الاتصال، لكن الخادم لم يعلن أدوات.", color = Color.LightGray)
                        }
                        Text("هذه المرحلة تكتشف الأدوات فقط؛ لا تنفذها تلقائياً.", color = Color(0xFFFFC66D), fontSize = 12.sp)
                    }
                    else -> {
                        Text("إعداد خوادم MCP", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        OutlinedTextField(value = cloudUrl, onValueChange = { cloudUrl = it }, modifier = Modifier.fillMaxWidth(), label = { Text("REA Cloud MCP URL") }, singleLine = true)
                        OutlinedTextField(value = replicaUrl, onValueChange = { replicaUrl = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Replica MCP URL") }, singleLine = true)
                        OutlinedTextField(value = eccUrl, onValueChange = { eccUrl = it }, modifier = Modifier.fillMaxWidth(), label = { Text("ECC MCP URL") }, singleLine = true)
                        OutlinedTextField(
                            value = bearer,
                            onValueChange = { bearer = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Bearer token (اختياري، ذاكرة مؤقتة فقط)") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true
                        )
                        Text("لا يُحفظ الرمز في الملفات أو التخزين الدائم. أدخله فقط إذا كان الخادم يتطلبه.", color = Color(0xFFFFC66D), fontSize = 12.sp)
                        Button(onClick = { selected = "الأدوات" }, modifier = Modifier.fillMaxWidth()) {
                            Text("الانتقال لاختبار MCP")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusCard(title: String, detail: String) {
    Surface(color = Panel, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, color = Accent, fontWeight = FontWeight.SemiBold)
            Text(detail, color = Color.White, fontSize = 13.sp)
        }
    }
}
