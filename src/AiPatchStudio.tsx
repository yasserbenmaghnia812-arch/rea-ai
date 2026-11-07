import { useState } from 'react'
import { AlertTriangle, CheckCircle2, FileCode2, LoaderCircle, Play, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react'
import { requestAiReply, type AiProvider } from './ai'
import { supabase } from './supabase'
import './ai-patch.css'

type Props = { userId: string; projectId: string; filename: string; sourceUrl: string; provider: AiProvider; apiKey: string; model: string }
type Proposal = { summary: string; content: string }
const owner = 'yasserbenmaghnia812-arch'
const repo = 'rea-ai'
const workflow = 'apply-ai-patches.yml'

async function hashText(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('')
}

export default function AiPatchStudio(props: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('')
  const [path, setPath] = useState('')
  const [instruction, setInstruction] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [expectedHash, setExpectedHash] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [runUrl, setRunUrl] = useState('')

  async function selectFile(selected?: File) {
    setError(''); setProposal(null); setFile(selected || null); setSource('')
    if (!selected) return
    if (!/\.(xml|smali)$/i.test(selected.name) || selected.size > 120000) {
      setError('اختر ملف XML أو SMALI من apktool/ بحجم لا يتجاوز 120KB.')
      setFile(null); return
    }
    setSource(await selected.text())
    setPath(selected.name)
  }

  async function propose() {
    if (!props.apiKey.trim()) { setError('أدخل مفتاح AI من الإعدادات.'); return }
    if (!file || !instruction.trim() || !path.trim()) { setError('اختر الملف واكتب مساره والطلب.'); return }
    const normalized = path.trim().replace(/\\/g, '/')
    const parts = normalized.split('/')
    if (normalized.startsWith('/') || parts.some(p => !p || p === '.' || p === '..') ||
      !/^(AndroidManifest\.xml|res\/.+\.xml|smali[^/]*\/.+\.smali)$/i.test(normalized) ||
      parts[parts.length - 1] !== file.name) {
      setError('المسار يجب أن يكون AndroidManifest.xml أو res/...xml أو smali*/...smali، مع تطابق اسم الملف.')
      return
    }
    setBusy(true); setError(''); setMessage(''); setProposal(null)
    try {
      const digest = await hashText(source)
      const raw = await requestAiReply({ provider: props.provider, apiKey: props.apiKey, model: props.model, messages: [
        { role: 'system', content: 'أعد JSON فقط بالشكل {"summary":"شرح عربي","content":"المحتوى الكامل الجديد للملف"}. عدّل الملف المحدد فقط وحافظ على بقية محتواه. لا تضف صلاحيات خطيرة أو سلوكاً خفياً أو جمع بيانات. إذا تعذر التنفيذ بأمان أعد المحتوى الأصلي واشرح في summary.' },
        { role: 'user', content: 'مسار الملف: ' + normalized + '\nSHA-256: ' + digest + '\nالطلب: ' + instruction.trim() + '\nالمحتوى الكامل الحالي:\n' + source },
      ] })
      const clean = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '')
      const value = JSON.parse(clean) as Record<string, unknown>
      if (typeof value.summary !== 'string' || typeof value.content !== 'string' || !value.content.trim() || value.content.length > 180000) throw new Error('صيغة الاقتراح غير صحيحة أو حجمه كبير.')
      if (value.content === source) throw new Error('لم ينتج تعديل فعلي: ' + value.summary)
      setExpectedHash(digest)
      setProposal({ summary: value.summary, content: value.content })
      setMessage('الاقتراح جاهز للمراجعة ولم يطبق على APK.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر توليد الاقتراح.') }
    finally { setBusy(false) }
  }

  async function approve() {
    if (!proposal || !file || !supabase || !githubToken.trim()) { setError('تحقق من الاقتراح وSupabase وGitHub Token بصلاحية Actions: Read and write.'); return }
    setBusy(true); setError(''); setMessage(''); setRunUrl('')
    try {
      const manifest = { version: 1, project_id: props.projectId, patches: [{ path: path.trim().replace(/\\/g, '/'), expected_sha256: expectedHash, content: proposal.content }] }
      const objectPath = props.userId + '/' + props.projectId + '/patches/' + crypto.randomUUID() + '.json'
      const uploaded = await supabase.storage.from('apk-temp').upload(objectPath, new Blob([JSON.stringify(manifest)], { type: 'application/json' }), { contentType: 'application/json', upsert: false })
      if (uploaded.error) throw uploaded.error
      const signed = await supabase.storage.from('apk-temp').createSignedUrl(objectPath, 3600)
      if (signed.error) throw signed.error
      const response = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/actions/workflows/' + workflow + '/dispatches', {
        method: 'POST',
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + githubToken.trim(), 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: { source_url: props.sourceUrl, patch_url: signed.data.signedUrl, project_id: props.projectId, original_filename: props.filename } }),
      })
      if (!response.ok) throw new Error('GitHub Actions HTTP ' + response.status + '. تحقق من Token وصلاحية Actions.')
      setMessage('تمت الموافقة وبدء تطبيق التعديل على نسخة مؤقتة. الملف الأصلي لم يتغير.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تشغيل البناء.') }
    finally { setBusy(false) }
  }

  async function checkRun() {
    if (!githubToken.trim()) return
    setBusy(true); setError('')
    try {
      const response = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/actions/workflows/' + workflow + '/runs?branch=main&event=workflow_dispatch&per_page=5', {
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + githubToken.trim(), 'X-GitHub-Api-Version': '2022-11-28' },
      })
      if (!response.ok) throw new Error('GitHub API ' + response.status)
      const data = await response.json()
      const latest = data.workflow_runs && data.workflow_runs[0]
      if (latest) { setRunUrl(latest.html_url); setMessage('حالة آخر تشغيل: ' + latest.status + (latest.conclusion ? ' — ' + latest.conclusion : '')) }
      else setMessage('لم يظهر تشغيل بعد.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث الحالة.') }
    finally { setBusy(false) }
  }

  return <section className="panel ai-patch-panel">
    <div className="panel-heading"><div><h3><WandSparkles size={16}/> التعديل الذكي الفعلي لملفات APK</h3><p>اقتراح AI، مراجعة، موافقة صريحة، تطبيق Patch وإعادة البناء.</p></div><span className="status-pill status-running">موافقتك مطلوبة</span></div>
    <div className="ai-patch-guide"><strong>طريقة الاستخدام</strong><span>شغّل تحليل APK ثم نزّل Artifact التحليل من GitHub Actions. استخرج ملفاً من مجلد apktool/ واختر XML أو SMALI. ملفات JADX Java لا يمكن حقنها مباشرة في APK المفكوك.</span></div>
    <label className="setting-label">ملف XML أو SMALI<input type="file" accept=".xml,.smali,text/xml,text/plain" onChange={e => void selectFile(e.target.files?.[0])}/></label>
    {file && <div className="ai-patch-file"><FileCode2 size={15}/><span>{file.name}</span><small>{source.length.toLocaleString()} حرف</small></div>}
    <label className="setting-label">المسار داخل apktool/<input value={path} onChange={e => { setPath(e.target.value); setProposal(null) }} placeholder="res/values/strings.xml" dir="ltr"/></label>
    <label className="setting-label">التعديل المطلوب<textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={3} placeholder="مثال: غيّر اسم التطبيق مع الحفاظ على بقية الموارد."/></label>
    <button className="button-primary" onClick={() => void propose()} disabled={busy || !file || !instruction.trim()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} توليد اقتراح AI</button>
    {proposal && <div className="ai-patch-proposal"><div className="ai-patch-proposal-title"><CheckCircle2 size={16}/><strong>اقتراح — لم يُطبّق بعد</strong></div><p>{proposal.summary}</p><textarea className="ai-patch-code" readOnly value={proposal.content} rows={10} spellCheck={false} dir="ltr"/><label className="setting-label">GitHub Fine-grained Token<input type="password" value={githubToken} onChange={e => setGithubToken(e.target.value)} placeholder="Actions: Read and write" autoComplete="off" dir="ltr"/></label><div className="notice-box"><ShieldCheck size={15}/><span>الموافقة تطبق هذا النص فقط. يتحقق الخادم من SHA-256 ويرفض أي مسار خارج XML/SMALI. الأصل لا يُعدّل.</span></div><div className="ai-patch-actions"><button className="button-primary" onClick={() => void approve()} disabled={busy || !githubToken.trim()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Play size={15}/>} موافقة وتطبيق التعديل</button><button className="button-secondary" onClick={() => setProposal(null)} disabled={busy}>رفض</button></div></div>}
    {message && <div className="mcp-idle"><CheckCircle2 size={15}/>{message}</div>}
    {error && <div className="mcp-error"><AlertTriangle size={15}/>{error}</div>}
    <button className="button-secondary" onClick={() => void checkRun()} disabled={busy || !githubToken.trim()}>تحديث حالة البناء</button>
    {runUrl && <p><a href={runUrl} target="_blank" rel="noreferrer">فتح GitHub Actions وتنزيل APK الناتج</a></p>}
    <p className="form-note"><ShieldCheck size={14}/> مفتاح AI وGitHub Token لا يُحفظان. توقيع الناتج Debug مؤقت.</p>
  </section>
}
