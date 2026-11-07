import { useEffect, useRef, useState } from 'react'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Activity, AlertTriangle, CheckCircle2, Circle, LoaderCircle, Play, Plug, RefreshCw, TerminalSquare, Wrench } from 'lucide-react'

type ToolInfo = { name: string; description?: string; inputSchema?: Record<string, unknown> }

export default function ReaMcpPanel() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [selected, setSelected] = useState('')
  const [args, setArgs] = useState('{}')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clientRef = useRef<Client | null>(null)
  const transportRef = useRef<StreamableHTTPClientTransport | null>(null)

  async function connect() {
    setConnecting(true)
    setError('')
    try {
      if (clientRef.current) {
        await clientRef.current.close().catch(() => undefined)
        clientRef.current = null
        transportRef.current = null
      }
      const transport = new StreamableHTTPClientTransport(new URL('/api/rea', window.location.origin))
      const client = new Client({ name: 'rea-ai-studio', version: '0.1.0' })
      await client.connect(transport)
      const result = await client.listTools()
      setTools(result.tools as ToolInfo[])
      setSelected(current => current || result.tools[0]?.name || '')
      clientRef.current = client
      transportRef.current = transport
      setConnected(true)
      setOutput(`تم الاتصال بمحرك REA بنجاح. الأدوات المتاحة: ${result.tools.length}`)
    } catch (err) {
      setConnected(false)
      setError(err instanceof Error ? err.message : 'تعذر الاتصال بخادم REA')
    } finally {
      setConnecting(false)
    }
  }

  async function runTool() {
    if (!clientRef.current || !selected) return
    setBusy(true)
    setError('')
    setOutput('')
    try {
      const parsed = JSON.parse(args || '{}') as Record<string, unknown>
      const result = await clientRef.current.callTool({ name: selected, arguments: parsed })
      setOutput(JSON.stringify(result, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تنفيذ الأداة. تحقق من JSON والمدخلات.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => () => {
    void clientRef.current?.close().catch(() => undefined)
    void transportRef.current?.close().catch(() => undefined)
  }, [])

  const activeTool = tools.find(tool => tool.name === selected)

  return (
    <section className="panel mcp-panel">
      <div className="mcp-panel-head">
        <div>
          <div className="mcp-kicker"><span className={connected ? 'mcp-light online' : 'mcp-light'} /> REA ENGINE · STREAMABLE HTTP</div>
          <h3>اتصال محرك REA الحقيقي</h3>
          <p>اتصال مباشر بخادم REA Cloud عبر بروتوكول MCP.</p>
        </div>
        <div className={`mcp-state ${connected ? 'connected' : ''}`}>{connected ? <CheckCircle2 size={14}/> : <Circle size={12}/>} {connected ? 'متصل' : 'غير متصل'}</div>
      </div>
      <div className="mcp-connect-row">
        <div className="mcp-endpoint"><span>ENDPOINT</span><code dir="ltr">/api/rea</code></div>
        <button className="button-primary" onClick={() => void connect()} disabled={connecting}>
          {connecting ? <LoaderCircle className="spin" size={15}/> : connected ? <RefreshCw size={15}/> : <Plug size={15}/>}
          {connecting ? 'جارٍ الاتصال...' : connected ? 'تحديث الأدوات' : 'اتصال بـ REA'}
        </button>
      </div>
      {error && <div className="mcp-error"><AlertTriangle size={15}/><span>{error}</span></div>}
      {connected && <>
        <div className="mcp-tools-bar"><span><Wrench size={14}/> أدوات REA المكتشفة</span><b>{tools.length}</b></div>
        <div className="mcp-run-grid">
          <label className="setting-label">اختر أداة REA
            <select value={selected} onChange={e => setSelected(e.target.value)}>
              {tools.map(tool => <option key={tool.name} value={tool.name}>{tool.name}</option>)}
            </select>
          </label>
          <div className="mcp-tool-description">{activeTool?.description || 'لا يوجد وصف لهذه الأداة.'}</div>
        </div>
        <label className="setting-label mcp-json-label">مدخلات الأداة بصيغة JSON
          <textarea value={args} onChange={e => setArgs(e.target.value)} spellCheck={false} dir="ltr" />
        </label>
        <div className="mcp-run-actions"><span>راجع المدخلات قبل التنفيذ؛ بعض الأدوات تتطلب مسارات وبيئة تحليل مناسبة.</span><button className="button-blue" onClick={() => void runTool()} disabled={busy || !selected}>{busy ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>} تنفيذ الأداة</button></div>
      </>}
      {output && <div className="mcp-output"><div><TerminalSquare size={14}/> نتيجة التنفيذ</div><pre dir="auto">{output}</pre></div>}
      {!connected && !error && <div className="mcp-idle"><Activity size={16}/> اضغط «اتصال بـ REA» لاكتشاف الأدوات المتاحة من الخادم.</div>}
      <div className="mcp-foot"><AlertTriangle size={13}/> الخادم العام الحالي بلا مصادقة؛ لا تستخدمه مع ملفات أو بيانات حساسة.</div>
    </section>
  )
}