import { useEffect, useMemo, useRef, useState } from 'react'
import ReaMcpPanel from './ReaMcpPanel'
import AgentChat from './AgentChat'
import { type AiProvider } from './ai'
import { supabase } from './supabase'
import { useAuth } from './AuthGate'
import {
  Activity, ArrowDownLeft, ArrowUpLeft, Bell, Binary, Box, Check,
  ChevronDown, ChevronLeft, CircleHelp, Clock3, Code2, Command,
  Cpu, Database, FileArchive, FileCode2, FileSearch, FileUp, Folder,
  FolderOpen, GitBranch, HardDrive, LayoutDashboard, ListFilter,
  LockKeyhole, Menu, MoreHorizontal, Plus, Search, Settings2,
  ShieldCheck, Sparkles, Bot, UploadCloud, WandSparkles, X,
  Zap, type LucideIcon
} from 'lucide-react'

type Page = 'overview' | 'projects' | 'analysis' | 'rebuild' | 'files' | 'activity' | 'settings' | 'assistant'
type Project = { id: string | number; name: string; kind: string; updated: string; status: 'جاهز' | 'قيد التحليل' | 'مسودة' | 'تم الرفع'; files: number }

const navGroups: { label: string; items: { id: Page; label: string; icon: LucideIcon }[] }[] = [
  { label: 'مساحة العمل', items: [
    { id: 'overview', label: 'نظرة عامة', icon: LayoutDashboard },
    { id: 'projects', label: 'المشاريع', icon: Folder },
    { id: 'analysis', label: 'التحليل العكسي', icon: FileSearch },
    { id: 'assistant', label: 'مساعد الذكاء الاصطناعي', icon: Bot },
    { id: 'rebuild', label: 'إعادة البناء', icon: WandSparkles },
    { id: 'files', label: 'الملفات والنتائج', icon: FileArchive },
  ]},
  { label: 'النظام', items: [
    { id: 'activity', label: 'سجل العمليات', icon: Activity },
    { id: 'settings', label: 'الإعدادات', icon: Settings2 },
  ]},
]

const pageTitles: Record<Page, { title: string; subtitle: string }> = {
  overview: { title: 'مساحة العمل', subtitle: 'كل ما تحتاجه لفهم التطبيقات وإعادة بنائها في مكان واحد.' },
  projects: { title: 'المشاريع', subtitle: 'نظّم ملفاتك وتحليلاتك وعمليات إعادة البناء.' },
  analysis: { title: 'التحليل العكسي', subtitle: 'ابدأ بفحص ملف أو تطبيق واعرض الأدلة والنتائج.' },
  rebuild: { title: 'إعادة البناء', subtitle: 'حوّل نتائج التحليل إلى مشروع قابل للتطوير.' },
  files: { title: 'الملفات والنتائج', subtitle: 'ملفات المصدر والمخرجات والتقارير المحفوظة.' },
  activity: { title: 'سجل العمليات', subtitle: 'تابع ما نفّذه النظام وما ينتظر المعالجة.' },
  settings: { title: 'الإعدادات', subtitle: 'إدارة مزوّد الذكاء الاصطناعي والاتصال والتفضيلات.' },
  assistant: { title: 'مساعد الذكاء الاصطناعي', subtitle: 'ناقش نتائجك واطلب شرحاً أو خطة لإعادة بناء مشروعك.' },
}

function App() {
  const { user, signOut } = useAuth()
  const [page, setPage] = useState<Page>('overview')
  const [projects, setProjects] = useState<Project[]>([])
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [analysisName, setAnalysisName] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const [aiProvider, setAiProvider] = useState<AiProvider>(() => {
    const saved = localStorage.getItem('rea-ai-provider')
    return saved === 'groq' || saved === 'openrouter' ? saved : 'gemini'
  })
  const [aiKey, setAiKey] = useState('')
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('rea-ai-model') || 'gemini-3.8-flash')
  const fileInput = useRef<HTMLInputElement>(null)
  const current = pageTitles[page]
  const filtered = useMemo(() => projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase())), [projects, query])

  useEffect(() => {
    let active = true
    async function loadProjects() {
      if (!supabase) return
      const { data, error } = await supabase
        .from('projects')
        .select('id,name,original_filename,status,updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
      if (!active) return
      if (error) {
        setNotice(`تعذر تحميل المشاريع من Supabase: ${error.message}`)
        return
      }
      setProjects((data ?? []).map(row => {
        const hasFile = Boolean(row.original_filename)
        const extension = row.original_filename?.split('.').pop()?.toUpperCase() || ''
        const status: Project['status'] = row.status === 'completed' ? 'جاهز'
          : ['queued', 'running', 'analyzing'].includes(row.status) ? 'قيد التحليل'
          : hasFile && row.status === 'uploaded' ? 'تم الرفع' : 'مسودة'
        return {
          id: row.id,
          name: row.name,
          kind: extension ? `ملف · ${extension}` : 'مشروع جديد',
          updated: 'محفوظ في السحابة',
          status,
          files: hasFile ? 1 : 0,
        }
      }))
    }
    void loadProjects()
    return () => { active = false }
  }, [user.id])

  useEffect(() => {
    localStorage.setItem('rea-ai-provider', aiProvider)
    localStorage.setItem('rea-ai-model', aiModel)
  }, [aiProvider, aiModel])

  async function addProject() {
    if (!projectName.trim() || !supabase) return
    const { data, error } = await supabase.from('projects').insert({
      user_id: user.id,
      name: projectName.trim(),
      status: 'uploaded',
    }).select('id,name,original_filename,status,updated_at').single()
    if (error) {
      setNotice(`تعذر حفظ المشروع: ${error.message}`)
      return
    }
    setProjects(prev => [{ id: data.id, name: data.name, kind: 'مشروع جديد', updated: 'الآن', status: 'مسودة', files: 0 }, ...prev])
    setProjectName('')
    setModal(false)
    setPage('projects')
  }

  async function uploadSelectedFiles() {
    if (!supabase || files.length === 0 || isUploading) {
      if (files.length === 0) setNotice('اختر ملف APK أو ZIP أو ملفاً مدعوماً أولاً.')
      return
    }
    setIsUploading(true)
    let uploadedCount = 0
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name}: يتجاوز الحد الأقصى 100MB.`)
        const baseName = analysisName.trim() || file.name.replace(/\.[^.]+$/, '')
        const projectLabel = files.length > 1 ? `${baseName} ${index + 1}` : baseName
        const { data: project, error: projectError } = await supabase.from('projects').insert({
          user_id: user.id,
          name: projectLabel,
          original_filename: file.name,
          status: 'uploaded',
        }).select('id,name,original_filename,status,updated_at').single()
        if (projectError) throw projectError

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload.bin'
        const storagePath = `${user.id}/${project.id}/${safeName}`
        const { error: uploadError } = await supabase.storage.from('apk-temp').upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
        if (uploadError) {
          await supabase.from('projects').update({ status: 'failed' }).eq('id', project.id).eq('user_id', user.id)
          throw uploadError
        }
        const { error: updateError } = await supabase.from('projects').update({ storage_path: storagePath }).eq('id', project.id).eq('user_id', user.id)
        if (updateError) throw updateError

        const extension = file.name.split('.').pop()?.toUpperCase() || ''
        setProjects(prev => [{
          id: project.id,
          name: project.name,
          kind: extension ? `ملف · ${extension}` : 'ملف مرفوع',
          updated: 'الآن',
          status: 'تم الرفع',
          files: 1,
        }, ...prev])
        uploadedCount += 1
      }
      setFiles([])
      setAnalysisName('')
      setNotice(`تم رفع ${uploadedCount} ملفاً إلى التخزين الخاص في Supabase. لم يبدأ التحليل بعد؛ سيُربط محرك التنفيذ في المرحلة التالية.`)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'حدث خطأ أثناء رفع الملفات.'
      setNotice(`توقف الرفع: ${message}`)
    } finally {
      setIsUploading(false)
    }
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return
    setFiles(prev => [...prev, ...Array.from(list)])
    setNotice(`تمت إضافة ${list.length} ملف إلى قائمة الرفع المحلية.`)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const statusClass = (status: Project['status']) => status === 'جاهز' || status === 'تم الرفع' ? 'status-ready' : status === 'قيد التحليل' ? 'status-running' : 'status-draft'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Binary size={22} strokeWidth={2.4} /></div>
          <div><div className="brand-name">REA<span> AI</span></div><div className="brand-caption">REVERSE ENGINEERING STUDIO</div></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="إغلاق القائمة"><X size={18}/></button>
        </div>
        <button className="workspace-switch">
          <div className="workspace-avatar">Y</div>
          <div className="workspace-copy"><strong>مساحة ياسر</strong><span>الخطة الشخصية</span></div>
          <ChevronDown size={15} className="muted-icon"/>
        </button>
        <nav className="side-nav">
          {navGroups.map(group => <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map(item => {
              const Icon = item.icon
              return <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setMobileNav(false) }}>
                <Icon size={17}/><span>{item.label}</span>{item.id === 'activity' && <i className="nav-dot"/>}
              </button>
            })}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-head"><span>حالة مساحة العمل</span><span className="live-dot">متصل</span></div>
            <div className="usage-line"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
            <div className="usage-foot"><span>واجهة تجريبية</span><span>v0.1.0</span></div>
          </div>
          <button className="profile-row" onClick={() => void signOut()}>
            <div className="profile-avatar">YB</div><div className="profile-copy"><strong>{user.email || 'حساب REA'}</strong><span>تسجيل الخروج</span></div><MoreHorizontal size={18} className="muted-icon"/>
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-right">
            <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="فتح القائمة"><Menu size={19}/></button>
            <div className="breadcrumb"><span>REA AI Studio</span><ChevronLeft size={14}/><strong>{current.title}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث في مساحة العمل..." /><kbd><Command size={11}/> K</kbd></div>
            <button className="icon-button notification-button" aria-label="الإشعارات"><Bell size={18}/><i/></button>
            <div className="top-avatar">Y</div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-line"/>{page === 'overview' ? 'WORKSPACE OVERVIEW' : 'REA WORKSPACE'}</div><h1>{current.title}</h1><p>{current.subtitle}</p></div>
            <div className="heading-actions"><button className="button-secondary" onClick={() => setPage('analysis')}><FileSearch size={16}/> تحليل جديد</button><button className="button-primary" onClick={() => setModal(true)}><Plus size={17}/> مشروع جديد</button></div>
          </div>

          {page === 'overview' && <>
            <section className="welcome-banner">
              <div className="welcome-grid"/>
              <div className="welcome-content"><div className="welcome-chip"><Sparkles size={13}/> بيئة التحليل الذكي</div><h2>افهم أي تطبيق.<br/><span>أعد بناء ما تتخيله.</span></h2><p>ارفع ملفاتك، شغّل التحليل عبر REA، ثم حوّل النتائج إلى مشروع جديد بخطوات واضحة.</p><div className="welcome-actions"><button className="button-blue" onClick={() => setPage('analysis')}>ابدأ التحليل <ArrowUpLeft size={16}/></button><button className="text-button" onClick={() => setPage('projects')}>استعراض المشاريع <ArrowDownLeft size={15}/></button></div></div>
              <div className="orbital-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="core-cube"><Binary size={42}/></div><span className="orbit-node node-one"><Cpu size={16}/></span><span className="orbit-node node-two"><Code2 size={16}/></span><span className="orbit-node node-three"><Database size={16}/></span></div>
              <div className="banner-index">01 <span>/ 03</span></div>
            </section>

            <section className="metric-grid">
              <Metric icon={FolderOpen} label="إجمالي المشاريع" value={String(projects.length).padStart(2, '0')} detail="في مساحة العمل" trend="+2 هذا الأسبوع" />
              <Metric icon={FileSearch} label="عمليات التحليل" value="08" detail="عمليات محفوظة" trend="آخرها قبل 12 دقيقة" />
              <Metric icon={Box} label="ملفات ومخرجات" value="67" detail="ملفاً في المشاريع" trend="من 3 مشاريع" />
              <Metric icon={Zap} label="حالة المحرك" value="جاهز" detail="واجهة REA" trend="بانتظار ربط المحرك" />
            </section>

            <div className="section-row"><div><h3>المشاريع الأخيرة</h3><p>تابع آخر المساحات التي عملت عليها</p></div><button className="link-button" onClick={() => setPage('projects')}>عرض كل المشاريع <ChevronLeft size={15}/></button></div>
            <ProjectTable projects={projects.slice(0, 3)} statusClass={statusClass} onOpen={() => setPage('analysis')}/>
            <div className="bottom-grid">
              <section className="panel quick-panel"><div className="panel-heading"><div><h3>ابدأ بسرعة</h3><p>اختر الإجراء الذي تريد تنفيذه</p></div><div className="panel-icon"><WandSparkles size={17}/></div></div><div className="quick-actions">
                <button onClick={() => setPage('analysis')}><span className="quick-icon blue"><FileUp size={18}/></span><span><strong>تحليل ملف جديد</strong><small>APK، ZIP، ملفات تنفيذية</small></span><ChevronLeft size={16}/></button>
                <button onClick={() => setPage('rebuild')}><span className="quick-icon violet"><Code2 size={18}/></span><span><strong>إنشاء مشروع إعادة بناء</strong><small>ابدأ من نتائج تحليل محفوظة</small></span><ChevronLeft size={16}/></button>
                <button onClick={() => setPage('settings')}><span className="quick-icon gray"><LockKeyhole size={18}/></span><span><strong>إعداد مزوّد الذكاء الاصطناعي</strong><small>إدارة مفاتيح API محلياً</small></span><ChevronLeft size={16}/></button>
              </div></section>
              <section className="panel activity-panel"><div className="panel-heading"><div><h3>النشاط الأخير</h3><p>آخر التحديثات في مساحة العمل</p></div><button className="icon-button" onClick={() => setPage('activity')}><MoreHorizontal size={18}/></button></div><div className="activity-list"><ActivityItem icon={Check} tone="success" title="تم حفظ مشروع المتجر الذكي" time="منذ 12 دقيقة" desc="18 ملفاً · Android APK"/><ActivityItem icon={FileSearch} tone="blue" title="بدأ تحليل لوحة تحكم الويب" time="أمس، 21:40" desc="تحليل البنية والاعتماديات"/><ActivityItem icon={Folder} tone="neutral" title="تم إنشاء مكتبة النظام" time="منذ يومين" desc="مشروع جديد · Binary"/></div></section>
            </div>
          </>}

          {page === 'projects' && <section className="panel page-panel"><div className="panel-heading"><div><h3>كل المشاريع</h3><p>{filtered.length} مشاريع في مساحة العمل</p></div><button className="button-primary small" onClick={() => setModal(true)}><Plus size={15}/> مشروع جديد</button></div><ProjectTable projects={filtered} statusClass={statusClass} onOpen={() => setPage('analysis')}/></section>}

          {page === 'analysis' && <><ReaMcpPanel /><section className="analysis-layout"><div className="panel upload-panel"><div className="panel-heading"><div><h3>مصدر التحليل</h3><p>اختر ملف التطبيق أو اسحبه إلى المساحة أدناه</p></div><div className="panel-icon"><UploadCloud size={18}/></div></div><button className="dropzone" onClick={() => fileInput.current?.click()}><input ref={fileInput} type="file" accept=".apk,.aab,.zip,.jar,.dex,.so,.exe,application/octet-stream" multiple hidden onChange={e => addFiles(e.target.files)}/><span className="upload-icon"><UploadCloud size={25}/></span><strong>اسحب الملفات وأفلتها هنا</strong><span>أو <u>تصفح الملفات</u> من جهازك</span><small>APK · AAB · ZIP · JAR · DEX · SO · EXE · ملفات المصدر</small></button>{files.length > 0 && <div className="selected-files"><div className="file-list-title">ملفات محددة ({files.length})</div>{files.map((f, i) => <div className="selected-file" key={i}><FileCode2 size={16}/><span>{f.name}</span><small>{(f.size / 1024 / 1024).toFixed(2)} MB</small><Check size={15}/></div>)}</div>}<div className="form-row"><label>اسم التحليل<input value={analysisName} onChange={e => setAnalysisName(e.target.value)} placeholder="مثال: تحليل تطبيق المتجر" /></label><label>نوع التحليل<select defaultValue="auto"><option value="auto">تلقائي — اكتشاف نوع الملف</option><option>Android / APK</option><option>Web / JavaScript</option><option>Binary / Native</option><option>.NET Assembly</option></select></label></div><button className="button-primary full" onClick={() => void uploadSelectedFiles()} disabled={isUploading || files.length === 0}> <Zap size={16}/> {isUploading ? 'جارٍ الرفع الآمن…' : 'رفع الملفات إلى مساحة المشروع'}</button><p className="form-note"><ShieldCheck size={14}/> تُحفظ الملفات في bucket خاص، مع صلاحيات وصول تخص حسابك فقط. الحد الأقصى 100MB لكل ملف.</p></div><div className="panel pipeline-panel"><h3>مراحل التحليل</h3><p>مسار العمل المتوقع داخل REA</p><div className="pipeline"><PipelineStep n="01" title="استقبال الملف" desc="فحص النوع والحجم والبصمة" active/><PipelineStep n="02" title="استخراج البنية" desc="تحديد الوحدات والاعتماديات"/><PipelineStep n="03" title="التحليل العميق" desc="استخراج الأدلة والعلاقات"/><PipelineStep n="04" title="تقرير النتائج" desc="ملخص قابل للتصدير"/></div><div className="pipeline-note"><CircleHelp size={15}/> تظهر هنا مراحل العمل؛ ابدأ الاتصال بمحرك REA من اللوحة أعلاه.</div></div></section></>}

          {page === 'rebuild' && <section className="panel empty-workspace"><div className="empty-icon"><WandSparkles size={26}/></div><h3>مساحة إعادة البناء</h3><p>ستظهر هنا المشاريع الناتجة عن التحليل، مع محرر الملفات وسجل التعديلات وخيارات التصدير.</p><div className="feature-pills"><span><GitBranch size={14}/> إصدارات متتابعة</span><span><Code2 size={14}/> محرر المصدر</span><span><FileArchive size={14}/> تصدير الحزمة</span></div><button className="button-primary" onClick={() => setPage('analysis')}>ابدأ بتحليل مشروع <ChevronLeft size={16}/></button></section>}

          {page === 'files' && <section className="panel page-panel"><div className="panel-heading"><div><h3>مستكشف الملفات</h3><p>الملفات المضافة لهذه الجلسة تظهر هنا محلياً</p></div><button className="button-secondary small" onClick={() => fileInput.current?.click()}><Plus size={15}/> إضافة ملفات</button><input ref={fileInput} type="file" hidden multiple onChange={e => addFiles(e.target.files)}/></div>{files.length ? files.map((f, i) => <div className="selected-file file-row" key={i}><FileCode2 size={17}/><span>{f.name}</span><small>{(f.size / 1024 / 1024).toFixed(2)} MB</small><Check size={15}/></div>) : <div className="empty-inline"><HardDrive size={25}/><strong>لا توجد ملفات بعد</strong><span>ابدأ بإضافة ملفات من صفحة التحليل العكسي.</span><button className="link-button" onClick={() => setPage('analysis')}>فتح التحليل <ChevronLeft size={14}/></button></div>}</section>}

          {page === 'activity' && <section className="panel page-panel"><div className="panel-heading"><div><h3>سجل النشاط</h3><p>تسلسل زمني لأحداث مساحة العمل</p></div><button className="button-secondary small"><ListFilter size={15}/> تصفية</button></div><div className="activity-list expanded"><ActivityItem icon={Check} tone="success" title="تم حفظ مشروع المتجر الذكي" time="منذ 12 دقيقة" desc="18 ملفاً · Android APK"/><ActivityItem icon={FileSearch} tone="blue" title="بدأ تحليل لوحة تحكم الويب" time="أمس، 21:40" desc="تحليل البنية والاعتماديات"/><ActivityItem icon={Folder} tone="neutral" title="تم إنشاء مكتبة النظام" time="منذ يومين" desc="مشروع جديد · Binary"/></div></section>}

          {page === 'settings' && <section className="settings-grid"><div className="panel settings-panel"><div className="panel-heading"><div><h3>مزوّد الذكاء الاصطناعي</h3><p>أدخل مفتاحك لاستخدام المساعد مباشرة</p></div><div className="panel-icon"><Sparkles size={17}/></div></div><label className="setting-label">المزوّد<select value={aiProvider} onChange={e => { const value = e.target.value as AiProvider; setAiProvider(value); setAiModel(value === 'gemini' ? 'gemini-3.8-flash' : value === 'groq' ? 'llama-3.3-70b-versatile' : 'openrouter/auto') }}><option value="gemini">Google Gemini</option><option value="groq">Groq</option><option value="openrouter">OpenRouter</option></select></label><label className="setting-label">اسم النموذج<input value={aiModel} onChange={e => setAiModel(e.target.value)} placeholder="اسم النموذج من المزوّد" dir="ltr"/></label><label className="setting-label">مفتاح API<input type="password" value={aiKey} onChange={e => setAiKey(e.target.value)} placeholder="ألصق مفتاح API هنا" dir="ltr" autoComplete="off"/></label><div className="notice-box"><LockKeyhole size={16}/><span>المفتاح يبقى في ذاكرة الصفحة فقط ولا يُحفظ في GitHub أو قاعدة بيانات. يُرسل مباشرة إلى مزوّدك من المتصفح، لذا لا تستخدم جهازاً عاماً.</span></div><button className="button-primary" onClick={() => setPage('assistant')} disabled={!aiKey.trim() || !aiModel.trim()}><Bot size={15}/> فتح المساعد</button></div><div className="panel settings-panel"><div className="panel-heading"><div><h3>خدمة REA</h3><p>محرك التحليل العكسي الأساسي</p></div><div className="status-pill status-running">MCP متاح للاتصال</div></div><div className="connection-row"><span>حالة MCP</span><strong>اختبر الاتصال من صفحة التحليل</strong></div><div className="connection-row"><span>مسار التطبيق</span><strong dir="ltr">/api/rea</strong></div><div className="connection-row"><span>النقل</span><strong>Streamable HTTP</strong></div><button className="button-secondary full" onClick={() => setPage('analysis')}>فتح لوحة REA</button></div></section>}

          {page === 'assistant' && <AgentChat provider={aiProvider} apiKey={aiKey} model={aiModel} onOpenSettings={() => setPage('settings')} />}

          <footer className="footer"><span>REA AI STUDIO <b>·</b> BUILD 0.1.0</span><span>صُممت لتكون مساحة عملك للتحليل والبناء.</span></footer>
        </div>
      </main>

      {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="إغلاق القائمة"/>}
      {notice && <div className="toast"><Check size={16}/>{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
      {modal && <div className="modal-backdrop" onClick={() => setModal(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-top"><div className="modal-icon"><Folder size={20}/></div><button className="icon-button" onClick={() => setModal(false)}><X size={18}/></button></div><h3>إنشاء مشروع جديد</h3><p>أنشئ مساحة مستقلة لملفات التحليل وإعادة البناء.</p><label className="setting-label">اسم المشروع<input autoFocus value={projectName} onChange={e => setProjectName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addProject()} placeholder="مثال: تطبيق إدارة المهام"/></label><div className="modal-actions"><button className="button-secondary" onClick={() => setModal(false)}>إلغاء</button><button className="button-primary" onClick={addProject} disabled={!projectName.trim()}><Plus size={15}/> إنشاء المشروع</button></div></div></div>}
    </div>
  )
}

function Metric({ icon: Icon, label, value, detail, trend }: { icon: LucideIcon; label: string; value: string; detail: string; trend: string }) {
  return <div className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17}/></span></div><div className="metric-value">{value}</div><div className="metric-bottom"><span>{detail}</span><small>{trend}</small></div></div>
}
function ProjectTable({ projects, statusClass, onOpen }: { projects: Project[]; statusClass: (s: Project['status']) => string; onOpen: () => void }) {
  return <div className="table-wrap"><table><thead><tr><th>اسم المشروع</th><th>النوع</th><th>الملفات</th><th>آخر تحديث</th><th>الحالة</th><th/></tr></thead><tbody>{projects.map(p => <tr key={p.id}><td><button className="project-name" onClick={onOpen}><span className="project-file-icon"><Folder size={17}/></span><strong>{p.name}</strong></button></td><td>{p.kind}</td><td>{String(p.files).padStart(2, '0')}</td><td>{p.updated}</td><td><span className={`status-pill ${statusClass(p.status)}`}><i/>{p.status}</span></td><td><button className="icon-button row-more" onClick={onOpen}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table>{projects.length === 0 && <div className="empty-inline"><FolderOpen size={24}/><strong>لا توجد مشاريع مطابقة</strong><span>جرّب تغيير عبارة البحث.</span></div>}</div>
}
function ActivityItem({ icon: Icon, tone, title, time, desc }: { icon: LucideIcon; tone: string; title: string; time: string; desc: string }) {
  return <div className="activity-item"><div className={`activity-icon ${tone}`}><Icon size={15}/></div><div className="activity-copy"><strong>{title}</strong><span>{desc}</span></div><time><Clock3 size={12}/>{time}</time></div>
}
function PipelineStep({ n, title, desc, active = false }: { n: string; title: string; desc: string; active?: boolean }) {
  return <div className={`pipeline-step ${active ? 'current' : ''}`}><div className="step-number">{n}</div><div><strong>{title}</strong><span>{desc}</span></div>{active && <i className="step-indicator"/>}</div>
}

export default App