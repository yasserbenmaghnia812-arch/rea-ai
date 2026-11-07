import { useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, Github, LoaderCircle, Play, RefreshCw, ShieldCheck, Wrench } from 'lucide-react'

type Props = {
  projectId: string
  filename: string
  sourceUrl: string
}

type WorkflowRun = {
  id: number
  html_url: string
  status: string
  conclusion: string | null
  created_at: string
  name: string
}

const OWNER = 'yasserbenmaghnia812-arch'
const REPO = 'rea-ai'
const ANALYZE_WORKFLOW = 'analyze-apk.yml'
const REBUILD_WORKFLOW = 'rebuild-apk.yml'

export default function AnalysisRunner({ projectId, filename, sourceUrl }: Props) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [startedAt, setStartedAt] = useState('')
  const [activeWorkflow, setActiveWorkflow] = useState(ANALYZE_WORKFLOW)

  async function githubRequest(path: string, init: RequestInit = {}) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(response.status === 401 ? 'رمز GitHub غير صالح.' :
        response.status === 403 ? 'ليس للرمز صلاحية Actions: Read and write، أو تجاوزت حد الطلبات.' :
        response.status === 404 ? 'لم يتم العثور على مسار workflow؛ تأكد أنه موجود في main.' :
        `GitHub API ${response.status}: ${detail.slice(0, 240)}`)
    }
    return response
  }

  async function dispatch() {
    if (!token.trim()) {
      setError('أدخل GitHub Fine-grained Personal Access Token لتشغيل المهمة من التطبيق.')
      return
    }
    if (!filename.toLowerCase().endsWith('.apk')) {
      setError('مسار التحليل الحالي يدعم APK فقط. ملفات ZIP وAAB تحتاج مسارات منفصلة.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    setRun(null)
    setActiveWorkflow(ANALYZE_WORKFLOW)
    const started = new Date().toISOString()
    setStartedAt(started)
    try {
      await githubRequest(`actions/workflows/${ANALYZE_WORKFLOW}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({
          ref: 'main',
          inputs: { source_url: sourceUrl, project_id: projectId, original_filename: filename },
        }),
      })
      setNotice('تم إرسال طلب التشغيل إلى GitHub Actions. افتح «تحديث الحالة» بعد لحظات لمتابعة التنفيذ.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تشغيل تحليل APK.')
    } finally {
      setBusy(false)
    }
  }

  async function rebuild() {
    if (!token.trim()) { setError('أدخل GitHub Token بصلاحية Actions: Read and write.'); return }
    if (!filename.toLowerCase().endsWith('.apk')) { setError('إعادة البناء تدعم ملفات APK فقط.'); return }
    setBusy(true); setError(''); setNotice(''); setRun(null)
    const started = new Date().toISOString()
    setStartedAt(started)
    setActiveWorkflow(REBUILD_WORKFLOW)
    try {
      await githubRequest(`actions/workflows/${REBUILD_WORKFLOW}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: 'main', inputs: { source_url: sourceUrl, project_id: projectId, original_filename: filename } }),
      })
      setNotice('تم إرسال APK إلى مسار إعادة البناء والتوقيع التجريبي. حدّث الحالة لمتابعة المهمة.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر بدء إعادة البناء.')
    } finally { setBusy(false) }
  }

  async function refreshRun() {
    if (!token.trim()) return
    setRefreshing(true)
    setError('')
    try {
      const response = await githubRequest(`actions/workflows/${activeWorkflow}/runs?branch=main&event=workflow_dispatch&per_page=10`)
      const data = await response.json() as { workflow_runs?: WorkflowRun[] }
      const candidates = (data.workflow_runs || []).filter(item =>
        !startedAt || new Date(item.created_at).getTime() >= new Date(startedAt).getTime() - 120000
      )
      if (candidates.length) {
        setRun(candidates[0])
        setNotice(candidates[0].status === 'completed'
          ? `اكتمل التشغيل: ${candidates[0].conclusion || 'نتيجة غير محددة'}.`
          : `حالة المهمة: ${candidates[0].status}.`)
      } else {
        setNotice('لم يظهر التشغيل بعد. انتظر قليلاً ثم حدّث الحالة مجدداً.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر جلب حالة التشغيل.')
    } finally {
      setRefreshing(false)
    }
  }

  return <section className="panel analysis-runner">
    <div className="panel-heading">
      <div><h3><Activity size={16}/> تشغيل تحليل APK الفعلي</h3><p>يشغّل JADX وApktool وREA على GitHub Actions ثم يحفظ النتائج كـ Artifact.</p></div>
      <span className="status-pill status-ready">workflow على main</span>
    </div>
    <div className="form-row">
      <label>معرّف المشروع<input readOnly value={projectId}/></label>
      <label>اسم الملف<input readOnly value={filename}/></label>
    </div>
    <label className="setting-label">رابط تنزيل Supabase المؤقت<input readOnly value={sourceUrl}/></label>
    <label className="setting-label">GitHub Fine-grained Token
      <input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="github_pat_..." autoComplete="off" dir="ltr"/>
    </label>
    <div className="notice-box"><ShieldCheck size={16}/><span>يُستخدم الرمز في هذه الجلسة فقط ولا يُحفظ. أنشئ رمزاً محدوداً لهذا المستودع بصلاحية Actions: Read and write. لا ترسله في المحادثة ولا تضفه إلى GitHub كملف.</span></div>
    <div className="analysis-runner-actions">
      <button className="button-primary" onClick={() => void dispatch()} disabled={busy || !token.trim()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>} {busy ? 'جارٍ إرسال المهمة…' : 'تشغيل التحليل الآن'}</button>
      <button className="button-primary" onClick={() => void rebuild()} disabled={busy || !token.trim()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Wrench size={15}/>} إعادة البناء والتوقيع التجريبي</button>
      <button className="button-secondary" onClick={() => void refreshRun()} disabled={refreshing || !token.trim()}>{refreshing ? <LoaderCircle className="spin" size={15}/> : <RefreshCw size={14}/>} تحديث الحالة</button>
      <a className="button-secondary runner-link" href="https://github.com/yasserbenmaghnia812-arch/rea-ai/actions/workflows/analyze-apk.yml" target="_blank" rel="noreferrer"><Github size={14}/> صفحة GitHub Actions <ExternalLink size={13}/></a>
    </div>
    {notice && <div className="mcp-idle"><CheckCircle2 size={15}/>{notice}</div>}
    {error && <div className="mcp-error"><AlertTriangle size={15}/>{error}</div>}
    {run && <div className="runner-result">
      <div><strong>{run.name || 'Analyze Android APK'}</strong><span className={run.status === 'completed' ? 'runner-complete' : 'runner-running'}>{run.status === 'completed' ? run.conclusion || 'completed' : run.status}</span></div>
      <a href={run.html_url} target="_blank" rel="noreferrer">فتح سجل التشغيل وتنزيل APK الناتج أو ملفات التحليل <ExternalLink size={13}/></a>
    </div>}
    <p className="form-note"><ShieldCheck size={14}/> الرابط المؤقت صالح لساعة واحدة. النتائج المنشورة كـ Artifact متاحة ليوم واحد. إعادة البناء تنتج توقيع Debug مؤقتاً فقط؛ لا تطبّق تعديلات AI ولا تصلح توقيع إصدار المتجر.</p>
  </section>
}
