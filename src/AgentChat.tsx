import { useEffect, useRef, useState } from 'react'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AlertTriangle, Bot, LoaderCircle, Plug, Send, ShieldCheck, Sparkles, Trash2, Wrench } from 'lucide-react'
import { requestAiReply, type AiProvider, type ChatMessage } from './ai'

type ToolInfo = { name: string; description?: string; inputSchema?: Record<string, unknown> }
type Props = { provider: AiProvider; apiKey: string; model: string; onOpenSettings: () => void }
type AgentPlan = { type: 'tool'; tool: string; arguments: Record<string, unknown>; summary: string }

const SYSTEM_PROMPT = 'أنت REA AI، مساعد هندسة عكسية وتطوير برمجيات. تحدث بالعربية. إذا كان الطلب يحتاج تنفيذ أداة من الأدوات المتاحة، أخرج JSON فقط بالشكل {"type":"tool","tool":"اسم_الأداة","arguments":{},"summary":"شرح موجز لما ستنفذه"}. لا تخترع أسماء أدوات أو مدخلات؛ استخدم مخطط الأداة المرفق. إذا لم يحتج الطلب أداة، أخرج JSON فقط بالشكل {"type":"message","content":"إجابتك"}. لا تطلب تنفيذ تغييرات خطيرة أو حذف ملفات دون تنبيه واضح. لا تدّع تنفيذ شيء لم يحدث.'

function parseDecision(raw: string): { type: 'message'; content: string } | AgentPlan | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const value = JSON.parse(cleaned) as Record<string, unknown>
    if (value.type === 'message' && typeof value.content === 'string') return { type: 'message', content: value.content }
    if (value.type === 'tool' && typeof value.tool === 'string' && typeof value.summary === 'string' && value.arguments && typeof value.arguments === 'object' && !Array.isArray(value.arguments)) {
      return value as AgentPlan
    }
  } catch { /* Fall back to a normal assistant response. */ }
  return null
}

export default function AgentChat({ provider, apiKey, model, onOpenSettings }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [sending, setSending] = useState(false)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [pending, setPending] = useState<AgentPlan | null>(null)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const clientRef = useRef<Client | null>(null)
  const transportRef = useRef<StreamableHTTPClientTransport | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, pending, sending])

  useEffect(() => () => {
    void clientRef.current?.close().catch(() => undefined)
    void transportRef.current?.close().catch(() => undefined)
  }, [])

  async function connectRea() {
    setConnecting(true)
    setStatus('')
    try {
      await clientRef.current?.close().catch(() => undefined)
      const transport = new StreamableHTTPClientTransport(new URL('/api/rea', window.location.origin))
      const client = new Client({ name: 'rea-ai-agent', version: '0.2.0' })
      await client.connect(transport)
      const result = await client.listTools()
      clientRef.current = client
      transportRef.current = transport
      setTools(result.tools as ToolInfo[])
      setConnected(true)
      setStatus(`اتصل المحرك بنجاح. تم اكتشاف ${result.tools.length} أداة.`)
    } catch (error) {
      setConnected(false)
      setStatus(error instanceof Error ? error.message : 'تعذر الاتصال بمحرك REA.')
    } finally { setConnecting(false) }
  }

  async function sendMessage() {
    const text = prompt.trim()
    if (!text || sending) return
    if (!apiKey.trim()) { onOpenSettings(); setStatus('أضف مفتاح API من الإعدادات أولاً.'); return }
    const history: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(history)
    setPrompt('')
    setPending(null)
    setSending(true)
    setStatus('')
    try {
      const toolCatalog = tools.map(tool => ({ name: tool.name, description: tool.description || '', inputSchema: tool.inputSchema || {} }))
      const system = SYSTEM_PROMPT + '\n\nأدوات REA المتاحة حالياً: ' + (connected && toolCatalog.length ? JSON.stringify(toolCatalog) : 'لا يوجد اتصال بمحرك REA. لا تقترح تنفيذ أداة، واكتفِ بالإجابة أو اطلب الاتصال.')
      const raw = await requestAiReply({ provider, apiKey, model, messages: [{ role: 'system', content: system }, ...history] })
      const decision = parseDecision(raw)
      if (decision?.type === 'tool') {
        if (!connected || !tools.some(tool => tool.name === decision.tool)) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'لم أتمكن من اعتماد خطة التنفيذ: الأداة غير متاحة أو أن اتصال REA غير نشط. اتصل بالمحرك ثم أعد الطلب.' }])
        } else {
          setPending(decision)
          setMessages(prev => [...prev, { role: 'assistant', content: decision.summary + '\n\nراجِع اسم الأداة والمدخلات، ثم اضغط «موافقة وتنفيذ» لبدء العملية.' }])
        }
      } else if (decision?.type === 'message') {
        setMessages(prev => [...prev, { role: 'assistant', content: decision.content }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: raw }])
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'تعذر إكمال الطلب: ' + (error instanceof Error ? error.message : 'خطأ غير معروف') }])
    } finally { setSending(false) }
  }

  async function executePlan() {
    if (!pending || !clientRef.current || running) return
    setRunning(true)
    setStatus('')
    try {
      const result = await clientRef.current.callTool({ name: pending.tool, arguments: pending.arguments })
      const output = JSON.stringify(result, null, 2)
      setMessages(prev => [...prev, { role: 'assistant', content: 'نتيجة تنفيذ ' + pending.tool + ':\n' + output }])
      setPending(null)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'فشل تنفيذ أداة REA.')
    } finally { setRunning(false) }
  }

  return <section className="agent-workspace">
    <div className="panel agent-chat-panel">
      <div className="panel-heading agent-heading">
        <div><h3><Bot size={17}/> محادثة REA AI</h3><p>تحدث مع المساعد واطلب منه تحليل الأدوات وتنفيذ عمليات REA بعد موافقتك.</p></div>
        <button className="button-secondary small" onClick={() => { setMessages([]); setPending(null); setStatus('تم بدء محادثة جديدة.') }}><Trash2 size={14}/> محادثة جديدة</button>
      </div>
      <div className="agent-status-row">
        <span className={connected ? 'agent-dot online' : 'agent-dot'}/><span>{connected ? `محرك REA متصل · ${tools.length} أداة` : 'محرك REA غير متصل'}</span>
        <button className="button-secondary small" onClick={() => void connectRea()} disabled={connecting}>{connecting ? <LoaderCircle className="spin" size={14}/> : <Plug size={14}/>} {connecting ? 'جارٍ الاتصال' : connected ? 'تحديث الأدوات' : 'اتصال REA'}</button>
      </div>
      <div className="agent-messages">
        {messages.length === 0 && <div className="chat-empty"><div className="empty-icon"><Sparkles size={24}/></div><strong>ما الذي تريد تنفيذه؟</strong><span>اطلب شرح كود، تحليل بنية، إصلاح خطأ، أو تنفيذ إحدى أدوات REA المتاحة. سيطلب التطبيق موافقتك قبل تشغيل الأداة.</span></div>}
        {messages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}><div className="chat-message-label">{message.role === 'user' ? 'أنت' : 'REA AI'}</div><p>{message.content}</p></div>)}
        {sending && <div className="chat-message assistant"><div className="chat-message-label">REA AI</div><p className="typing">يفكر في طلبك...</p></div>}
        <div ref={bottomRef}/>
      </div>
      {pending && <div className="agent-approval">
        <div><ShieldCheck size={17}/><strong>مراجعة عملية قبل التنفيذ</strong></div>
        <p>{pending.summary}</p>
        <code dir="ltr">{pending.tool}</code>
        <pre dir="ltr">{JSON.stringify(pending.arguments, null, 2)}</pre>
        <div className="agent-approval-actions"><button className="button-primary" onClick={() => void executePlan()} disabled={running}>{running ? <LoaderCircle className="spin" size={14}/> : <Wrench size={14}/>} {running ? 'جارٍ التنفيذ...' : 'موافقة وتنفيذ'}</button><button className="button-secondary" onClick={() => setPending(null)} disabled={running}>إلغاء</button></div>
      </div>}
      {status && <div className="agent-status-message"><AlertTriangle size={14}/>{status}</div>}
      <div className="chat-compose"><textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage() } }} placeholder="اكتب طلبك هنا... مثال: حلّل الأدوات المتاحة واقترح طريقة إعادة بناء التطبيق" rows={2}/><button className="button-primary" onClick={() => void sendMessage()} disabled={sending || !prompt.trim()}>{sending ? <LoaderCircle className="spin" size={15}/> : <Send size={15}/>} إرسال</button></div>
      <p className="agent-disclaimer"><ShieldCheck size={13}/> لا تُنفّذ أي أداة قبل موافقتك. لا ترسل ملفات خاصة إلى خادم MCP العام.</p>
    </div>
    <aside className="panel agent-side">
      <h3>إعدادات الجلسة</h3>
      <div className="connection-row"><span>المزوّد</span><strong>{provider === 'gemini' ? 'Gemini' : provider === 'groq' ? 'Groq' : 'OpenRouter'}</strong></div>
      <div className="connection-row"><span>النموذج</span><strong dir="ltr">{model}</strong></div>
      <div className="connection-row"><span>أدوات REA</span><strong>{connected ? tools.length : 'غير متصل'}</strong></div>
      <div className="agent-side-note"><ShieldCheck size={15}/> كل استدعاء أداة يتطلب موافقة صريحة. راجع المدخلات قبل التنفيذ.</div>
      <button className="button-secondary full" onClick={onOpenSettings}>إعدادات الذكاء الاصطناعي</button>
      {connected && <div className="agent-tool-list"><strong>الأدوات المكتشفة</strong>{tools.map(tool => <div key={tool.name}><Wrench size={12}/><span>{tool.name}</span></div>)}</div>}
    </aside>
  </section>
}
