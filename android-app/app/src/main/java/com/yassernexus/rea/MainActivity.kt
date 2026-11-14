package com.yassernexus.rea

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import com.yassernexus.rea.data.McpClient
import com.yassernexus.rea.data.McpTool
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                MaterialTheme(colorScheme = darkColorScheme()) {
                    REAConsoleApp()
                }
            }
        }
    }
}

private data class ServerConfig(val name: String, val description: String, val endpoint: String = "", val token: String = "")
private data class ChatLine(val text: String, val fromUser: Boolean)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun REAConsoleApp() {
    val servers = remember {
        mutableStateListOf(
            ServerConfig("REA", "وكيل تنفيذ وتحليل المهام"),
            ServerConfig("Replica", "أدوات ومهارات MCP"),
            ServerConfig("ECC", "قواعد ومهارات البرمجة")
        )
    }
    val messages = remember { mutableStateListOf(ChatLine("مرحباً. هذه نسخة Android أصلية قيد البناء. اربط خادم MCP من الإعدادات ثم افحص أدواته.", false)) }
    var prompt by remember { mutableStateOf("") }
    var selectedServer by remember { mutableIntStateOf(0) }
    var showSettings by remember { mutableStateOf(false) }
    var showApproval by remember { mutableStateOf(false) }
    var pendingTool by remember { mutableStateOf<McpTool?>(null) }
    var tools by remember { mutableStateOf<List<McpTool>>(emptyList()) }
    var status by remember { mutableStateOf("غير متصل") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val client = remember { McpClient() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Column { Text("REA CONSOLE", fontSize = 18.sp); Text("مساعد Android أصلي", style = MaterialTheme.typography.labelSmall) } },
                actions = { TextButton(onClick = { showSettings = true }) { Text("الإعدادات") } }
            )
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("مركز التحكم", style = MaterialTheme.typography.titleLarge)
                    Text("الاتصال بالأدوات لا يعني تنفيذها. كل استدعاء أداة يمر بموافقتك.")
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Cloud, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("حالة MCP: $status")
                        Spacer(Modifier.weight(1f))
                        TextButton(enabled = !busy, onClick = {
                            val server = servers[selectedServer]
                            if (server.endpoint.isBlank()) { error = "أدخل رابط خادم MCP في الإعدادات أولاً"; return@TextButton }
                            busy = true; error = null
                            scope.launch {
                                runCatching { client.listTools(server.endpoint, server.token) }
                                    .onSuccess { tools = it; status = "متصل — ${it.size} أداة" }
                                    .onFailure { error = it.message ?: "فشل الاتصال"; status = "تعذر الاتصال" }
                                busy = false
                            }
                        }) { Text(if (busy) "جارٍ الفحص…" else "فحص الأدوات") }
                    }
                }
            }

            Text("الخوادم", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                servers.forEachIndexed { index, server ->
                    FilterChip(selected = selectedServer == index, onClick = { selectedServer = index; tools = emptyList(); status = "غير متصل" }, label = { Text(server.name) })
                }
            }

            if (tools.isNotEmpty()) {
                Text("الأدوات المتاحة", style = MaterialTheme.typography.titleMedium)
                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(tools) { tool ->
                        Card {
                            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(tool.name, style = MaterialTheme.typography.titleSmall)
                                    Text(tool.description.ifBlank { "لا يوجد وصف" }, style = MaterialTheme.typography.bodySmall)
                                }
                                Button(onClick = { pendingTool = tool; showApproval = true }) { Text("طلب تنفيذ") }
                            }
                        }
                    }
                }
            } else {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.Code, contentDescription = null, modifier = Modifier.size(44.dp))
                    Spacer(Modifier.height(8.dp))
                    Text("REA • Replica • ECC", style = MaterialTheme.typography.titleLarge)
                    Text("أضف عناوين خوادم MCP ثم افحص الأدوات.")
                    Text("محرك الذكاء الاصطناعي المحلي سيُدمج في مرحلة مستقلة.", style = MaterialTheme.typography.bodySmall)
                }
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            HorizontalDivider()
            LazyColumn(Modifier.heightIn(max = 140.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(messages) { line ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (line.fromUser) Arrangement.Start else Arrangement.End) {
                        Surface(color = if (line.fromUser) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(14.dp)) {
                            Text(line.text, Modifier.padding(10.dp))
                        }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value = prompt, onValueChange = { prompt = it }, modifier = Modifier.weight(1f), placeholder = { Text("اكتب طلبك…") }, maxLines = 3)
                IconButton(onClick = {
                    if (prompt.isNotBlank()) {
                        messages.add(ChatLine(prompt.trim(), true))
                        messages.add(ChatLine("واجهة المحادثة جاهزة؛ ربط نموذج الذكاء المحلي لم يُفعّل بعد.", false))
                        prompt = ""
                    }
                }) { Icon(Icons.Default.Send, contentDescription = "إرسال") }
            }
        }
    }

    if (showSettings) {
        val current = servers[selectedServer]
        var endpoint by remember(selectedServer) { mutableStateOf(current.endpoint) }
        var token by remember(selectedServer) { mutableStateOf(current.token) }
        AlertDialog(
            onDismissRequest = { showSettings = false },
            title = { Text("إعداد خادم ${current.name}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(endpoint, { endpoint = it }, label = { Text("رابط MCP") }, singleLine = true)
                    OutlinedTextField(token, { token = it }, label = { Text("Bearer token (اختياري)") }, singleLine = true)
                    Text("بيانات الرمز تبقى في الذاكرة أثناء التشغيل فقط في هذه النسخة.", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    servers[selectedServer] = current.copy(endpoint = endpoint.trim(), token = token.trim())
                    showSettings = false
                }) { Text("حفظ") }
            },
            dismissButton = { TextButton(onClick = { showSettings = false }) { Text("إلغاء") } }
        )
    }

    if (showApproval && pendingTool != null) {
        val tool = pendingTool!!
        AlertDialog(
            onDismissRequest = { showApproval = false; pendingTool = null },
            title = { Text("تأكيد تنفيذ الأداة") },
            text = { Text("هل توافق على استدعاء «${tool.name}» الآن؟ لن يتم التنفيذ قبل ضغطك على موافقة.") },
            confirmButton = {
                TextButton(onClick = {
                    showApproval = false
                    val server = servers[selectedServer]
                    busy = true
                    scope.launch {
                        runCatching { client.callTool(server.endpoint, server.token, tool.name) }
                            .onSuccess { messages.add(ChatLine("نتيجة ${tool.name}: $it", false)) }
                            .onFailure { error = it.message ?: "فشل تنفيذ الأداة" }
                        busy = false
                        pendingTool = null
                    }
                }) { Text("أوافق على التنفيذ") }
            },
            dismissButton = { TextButton(onClick = { showApproval = false; pendingTool = null }) { Text("رفض") } }
        )
    }
}
