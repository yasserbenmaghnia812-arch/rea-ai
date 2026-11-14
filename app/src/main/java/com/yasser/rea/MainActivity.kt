package com.yasser.rea

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Ink = Color(0xFF080B11)
private val Panel = Color(0xFF121925)
private val Accent = Color(0xFF56D6B0)

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
    var endpoint by remember { mutableStateOf("https://rea-ai-studio.vercel.app/api/rea") }
    var status by remember { mutableStateOf("غير متصل — لم يتم اختبار جلسة MCP بعد") }
    val messages = remember { mutableStateListOf("مرحباً. REA AI جاهز لتهيئة اتصال آمن بخدماتك.") }
    MaterialTheme(colorScheme = darkColorScheme(primary = Accent, background = Ink, surface = Panel)) {
        Scaffold(containerColor = Ink, bottomBar = {
            NavigationBar(containerColor = Panel) {
                listOf("الرئيسية", "المحادثة", "الأدوات", "الإعدادات").forEach { item ->
                    NavigationBarItem(selected = selected == item, onClick = { selected = item },
                        icon = { Icon(when(item) { "المحادثة" -> Icons.Default.Chat; "الأدوات" -> Icons.Default.Hub; "الإعدادات" -> Icons.Default.Settings; else -> Icons.Default.Dashboard }, null) },
                        label = { Text(item) })
                }
            }
        }) { pad ->
            Column(Modifier.fillMaxSize().padding(pad).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
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
                        StatusCard("حالة النظام", status)
                        StatusCard("المعمارية", "Kotlin • Jetpack Compose • Android API 26+")
                        StatusCard("الخدمات", "REA Cloud MCP • Replica MCP • ECC MCP")
                        Text("هذا تطبيق Android أصلي. لا يستخدم WebView.", color = Color.LightGray, fontSize = 13.sp)
                    }
                    "المحادثة" -> {
                        LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(messages) { msg -> Surface(color = Panel, shape = RoundedCornerShape(14.dp)) { Text(msg, Modifier.fillMaxWidth().padding(14.dp), color = Color.White) } }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            BasicTextField(value = prompt, onValueChange = { prompt = it }, modifier = Modifier.weight(1f).background(Panel, RoundedCornerShape(12.dp)).padding(14.dp), textStyle = androidx.compose.ui.text.TextStyle(color = Color.White), decorationBox = { inner -> if(prompt.isEmpty()) Text("اكتب أمرك...", color = Color.Gray); inner() })
                            Button(onClick = { if(prompt.isNotBlank()) { messages.add("أنت: $prompt"); messages.add("لم يتم ربط محرك الذكاء الاصطناعي بعد. يلزم إكمال واجهة MCP والتحقق من المصادقة."); prompt = "" } }) { Icon(Icons.Default.Send, null) }
                        }
                    }
                    "الأدوات" -> {
                        StatusCard("REA Cloud MCP", "يتطلب اختبار initialize و tools/list")
                        StatusCard("Replica MCP", "الخدمة الصحية لا تثبت اكتمال MCP")
                        StatusCard("ECC MCP", "الخدمة الصحية لا تثبت اكتمال MCP")
                        Text("لا يتم تنفيذ أي أداة أو تعديل ملفات دون موافقتك.", color = Accent)
                    }
                    else -> {
                        Text("إعداد اتصال REA", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("عنوان وسيط MCP", color = Color.LightGray)
                        OutlinedTextField(value = endpoint, onValueChange = { endpoint = it }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        Button(onClick = { status = "تم حفظ العنوان محلياً. اختبار MCP الفعلي غير منفذ بعد." }) { Text("حفظ الإعداد") }
                        Text("لا تضع رموز Bearer السرية داخل التطبيق.", color = Color(0xFFFFC66D), fontSize = 12.sp)
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
