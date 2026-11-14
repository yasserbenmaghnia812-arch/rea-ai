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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first
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
    val context = LocalContext.current.applicationContext
    val scope = rememberCoroutineScope()
    var selected by remember { mutableStateOf("الرئيسية") }
    var prompt by remember { mutableStateOf("") }
    var cloudUrl by remember { mutableStateOf("https://rea-cloud-mcp-unified.onrender.com") }
    var replicaUrl by remember { mutableStateOf("https://replica-mcp-server-dfj0.onrender.com") }
    var eccUrl by remember { mutableStateOf("https://yasser-ecc-mcp-m8ia.onrender.com") }
    var bearer by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("لم يتم اختبار اتصال MCP بعد") }
    var mcpTestOutput by remember { mutableStateOf("لم يتم تنفيذ اختبار أداة MCP بعد") }
    var selectedServer by remember { mutableStateOf("REA Cloud MCP") }
    var busy by remember { mutableStateOf(false) }
    var tools by remember { mutableStateOf(emptyList<String>()) }
    var serverInfo by remember { mutableStateOf("") }
    var localEngine by remember { mutableStateOf<InferenceEngine?>(null) }
    var localReady by remember { mutableStateOf(false) }
    var modelBusy by remember { mutableStateOf(false) }
    var localStatus by remember { mutableStateOf("النموذج المحلي لم يتم تحميله بعد") }
    var chatMode by remember { mutableStateOf("محلي") }
    var aiProvider by remember { mutableStateOf("Gemini") }
    var aiModel by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }
    var providerBusy by remember { mutableStateOf(false) }
    var providerStatus by remember { mutableStateOf("لم يتم اختبار مزود الذكاء الاصطناعي بعد") }
    val remoteHistory = remember { mutableStateListOf<ReaChatTurn>() }
    val messages = remember {
        mutableStateListOf("واجهة REA الأصلية جاهزة. حمّل النموذج المحلي لتفعيل المحادثة دون اتصال.")
    }

    LaunchedEffect(context) {
        try {
            val engine = withContext(Dispatchers.IO) { AiChat.getInferenceEngine(context) }
            localEngine = engine
            val initialState = engine.state.first {
                it == InferenceEngine.State.Initialized || it is InferenceEngine.State.Error
            }
            if (initialState is InferenceEngine.State.Error) {
                localStatus = "تعذر تهيئة محرك النموذج: ${initialState.exception.message}"
            } else {
                localStatus = "محرك llama.cpp الأصلي جاهز؛ النموذج يحتاج إلى تنزيل وتحميل."
            }
        } catch (e: Exception) {
            localStatus = "فشل تهيئة المحرك المحلي: ${e.message ?: "خطأ غير معروف"}"
        } catch (e: UnsatisfiedLinkError) {
            localStatus = "تعذر تحميل مكتبة الاستدلال الأصلية: ${e.message}"
        }
    }

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
                        StatusCard("حالة النموذج المحلي", localStatus)
                        StatusCard("حالة MCP", status)
                        StatusCard("الخادم المختار", selectedServer)
                        StatusCard("نتيجة الفحص", serverInfo.ifBlank { "لم يتم إجراء handshake بعد" })
                        StatusCard("نتيجة tools/call", mcpTestOutput)
                        Text("استدلال محلي داخل Android عبر llama.cpp؛ لا يعتمد على WebView أو API عند تشغيل النموذج.", color = Color.LightGray, fontSize = 13.sp)
                        Button(
                            onClick = {
                                if (!modelBusy && !localReady) {
                                    modelBusy = true
                                    scope.launch {
                                        try {
                                            localStatus = "جارٍ التحقق من مساحة التخزين..."
                                            val modelFile = LocalModelManager.ensureModel(context) { progress ->
                                                withContext(Dispatchers.Main) { localStatus = progress }
                                            }
                                            val engine = localEngine ?: withContext(Dispatchers.IO) {
                                                AiChat.getInferenceEngine(context)
                                            }.also { localEngine = it }
                                            val state = engine.state.first {
                                                it == InferenceEngine.State.Initialized || it is InferenceEngine.State.Error
                                            }
                                            if (state is InferenceEngine.State.Error) throw state.exception
                                            localStatus = "جارٍ تحميل النموذج في الذاكرة..."
                                            withContext(Dispatchers.IO) {
                                                engine.loadModel(modelFile.absolutePath)
                                                engine.setSystemPrompt(
                                                    "أنت REA AI، مساعد تقني دقيق. أجب باللغة العربية ما لم يطلب المستخدم لغة أخرى. كن واضحاً ولا تدّع تنفيذ شيء لم تنفذه."
                                                )
                                            }
                                            localReady = true
                                            localStatus = "النموذج Qwen2.5-0.5B محمّل وجاهز للاستدلال المحلي."
                                        } catch (e: Exception) {
                                            localStatus = "فشل تشغيل النموذج: ${e.message ?: "خطأ غير معروف"}"
                                        } catch (e: UnsatisfiedLinkError) {
                                            localStatus = "مكتبة llama.cpp غير متاحة: ${e.message}"
                                        } finally {
                                            modelBusy = false
                                        }
                                    }
                                }
                            },
                            enabled = !modelBusy && !localReady,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (modelBusy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            else Text(if (localReady) "النموذج يعمل" else "تنزيل وتشغيل النموذج المحلي")
                        }
                    }
                    "المحادثة" -> {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = chatMode == "محلي", onClick = { chatMode = "محلي" }, label = { Text("النموذج المحلي") })
                            FilterChip(selected = chatMode == "مزود خارجي", onClick = { chatMode = "مزود خارجي" }, label = { Text(aiProvider) })
                        }
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
                        Text(
                            if (chatMode == "محلي") {
                                if (localReady) "المحادثة تعمل محلياً على الجهاز." else "حمّل النموذج من الصفحة الرئيسية قبل بدء المحادثة."
                            } else {
                                "المحادثة عبر $aiProvider؛ أدخل مفتاح API واسم النموذج من الإعدادات."
                            },
                            color = if ((chatMode == "محلي" && localReady) ||
                                (chatMode == "مزود خارجي" && apiKey.isNotBlank() && aiModel.isNotBlank())
                            ) Accent else Color(0xFFFFC66D),
                            fontSize = 12.sp
                        )
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
                            Button(
                                enabled = prompt.isNotBlank() && (
                                    chatMode == "محلي" && localReady ||
                                    chatMode == "مزود خارجي" && apiKey.isNotBlank() && aiModel.isNotBlank() && !providerBusy
                                ),
                                onClick = {
                                    val userPrompt = prompt.trim()
                                    prompt = ""
                                    messages.add("أنت: $userPrompt")
                                    messages.add("REA: ")
                                    val answerIndex = messages.lastIndex
                                    scope.launch {
                                        try {
                                            if (chatMode == "محلي") {
                                                localEngine?.sendUserPrompt(userPrompt, 128)?.collect { token ->
                                                    messages[answerIndex] = messages[answerIndex] + token
                                                } ?: error("محرك النموذج غير متاح.")
                                            } else {
                                                remoteHistory.add(ReaChatTurn("user", userPrompt))
                                                val answer = AiProviderClient.generate(
                                                    aiProvider, apiKey, aiModel, remoteHistory.toList()
                                                )
                                                remoteHistory.add(ReaChatTurn("assistant", answer))
                                                messages[answerIndex] = "REA ($aiProvider): $answer"
                                            }
                                        } catch (e: Exception) {
                                            messages[answerIndex] = "تعذر توليد الرد: ${e.message ?: "خطأ غير معروف"}"
                                        }
                                    }
                                }
                            ) { Icon(Icons.Default.Send, null) }
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
                                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
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
                                    status = "جارٍ تنفيذ initialize و tools/list واختبار أداة قراءة آمنة..."
                                    mcpTestOutput = "الاختبار قيد التنفيذ..."
                                    tools = emptyList()
                                    scope.launch {
                                        try {
                                            val result = withContext(Dispatchers.IO) {
                                                McpClient().connect(activeUrl, bearer)
                                            }
                                            status = if (result.testToolName.isNotBlank()) "نجح handshake و tools/list و tools/call" else "نجح handshake و tools/list فقط"
                                            serverInfo = "${result.serverName} • protocol ${result.protocolVersion} • session ${if(result.sessionCreated) "موجودة" else "stateless"}"
                                            mcpTestOutput = if (result.testToolName.isNotBlank()) "${result.testToolName}\n${result.testToolOutput}" else "لم تُنفذ أداة اختبار لهذا الخادم."
                                            tools = result.tools
                                        } catch (e: Exception) {
                                            status = "فشل اختبار MCP: ${e.message ?: "خطأ غير معروف"}"
                                            mcpTestOutput = "لم يكتمل اختبار الأداة الآمنة."
                                            serverInfo = "لم يكتمل handshake / tools/call"
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
                        Text("Replica وECC: ينفذ الاختبار أداة معلومات read-only فقط؛ لا يكتب ملفات ولا يشغّل أوامر.", color = Color(0xFFFFC66D), fontSize = 12.sp)
                    }
                    else -> {
                        Text("مزود الذكاء الاصطناعي", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("Gemini", "Groq", "OpenRouter").forEach { provider ->
                                FilterChip(selected = aiProvider == provider, onClick = {
                                    aiProvider = provider
                                    providerStatus = "لم يتم اختبار $provider بعد"
                                }, label = { Text(provider) })
                            }
                        }
                        OutlinedTextField(
                            value = aiModel,
                            onValueChange = { aiModel = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("اسم النموذج لدى $aiProvider") },
                            placeholder = { Text("أدخل Model ID من لوحة المزود") },
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = apiKey,
                            onValueChange = { apiKey = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("مفتاح API — لا يُحفظ") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true
                        )
                        Button(
                            enabled = !providerBusy && apiKey.isNotBlank() && aiModel.isNotBlank(),
                            onClick = {
                                providerBusy = true
                                providerStatus = "جارٍ اختبار $aiProvider..."
                                scope.launch {
                                    try {
                                        val answer = AiProviderClient.generate(
                                            aiProvider, apiKey, aiModel,
                                            listOf(ReaChatTurn("user", "Reply with exactly REA_PROVIDER_OK"))
                                        )
                                        providerStatus = "نجح الاختبار؛ رد المزود: $answer"
                                    } catch (e: Exception) {
                                        providerStatus = "فشل الاختبار: ${e.message ?: "خطأ غير معروف"}"
                                    } finally {
                                        providerBusy = false
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (providerBusy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            else Text("اختبار اتصال مزود AI")
                        }
                        StatusCard("نتيجة اختبار المزود", providerStatus)
                        Text("المفتاح يبقى في ذاكرة التطبيق فقط ويُرسل مباشرة إلى المزود عبر HTTPS؛ لا يُحفظ في ملفات REA.", color = Color(0xFFFFC66D), fontSize = 12.sp)
                        Divider(color = Color.DarkGray)
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
                        StatusCard("النموذج المحلي", "Qwen2.5-0.5B-Instruct Q4_0 • GGUF • تنزيل أول مرة نحو 429 MB")
                        Button(onClick = { selected = "الرئيسية" }, modifier = Modifier.fillMaxWidth()) {
                            Text("إعداد النموذج المحلي")
                        }
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
